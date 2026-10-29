/**
 * Import customers and bookings from Booqable invoices (parsed from the PDF export into JSON).
 * The JSON contains customer personal data, so it lives outside the repository
 * (data/private/ is git-ignored).
 *
 * - Customers are matched by email (blind index) or by name + phone; personal data is encrypted.
 * - Orders keep their Booqable booking number; the order number sequence continues after the highest one.
 * - Past events are imported as closed/returned history; future events are "reserved" and claim stock.
 * - Safe to re-run: bookings that already exist (same Booqable number) are skipped.
 *
 * Usage: npx tsx scripts/import-booqable-invoices.ts data/private/booqable-invoices.json [--dry-run]
 *    or: npx tsx scripts/import-booqable-invoices.ts --from-env  (see below)
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

type InvoiceLine = { qty: number; title: string | null; rawTitle: string; label: string; unit: number; total: number };
type Invoice = {
  name: string | null;
  email: string | null;
  phone?: string;
  address: string[];
  booking?: number;
  from?: string;
  until?: string;
  invoiceDate?: string;
  kind?: string;
  invoiceNo?: string;
  lines: InvoiceLine[];
  subtotal?: number;
  discount?: number;
  dp?: number;
  cardFees?: number;
  total?: number;
  paid?: number;
  due?: number;
};

/** Pickup/return times known from Booqable (others default to 10:00). */
const knownTimes: Record<number, [string, string]> = { 139: ["19:00", "19:00"] };

async function main() {
  const [file, flag] = process.argv.slice(2);
  // `--from-env` (used by vercel-build): the JSON comes gzipped + base64 in BOOQABLE_IMPORT_B64,
  // a temporary Sensitive variable, because the cloud workspace cannot reach the database.
  // Without the variable this is a no-op; BOOQABLE_IMPORT_MODE=apply writes, anything else is a dry run.
  const fromEnv = file === "--from-env";
  if (fromEnv && !process.env.BOOQABLE_IMPORT_B64) return process.exit(0);
  if (!file) throw new Error("Pass the path to the parsed invoices JSON");
  const dryRun = fromEnv ? process.env.BOOQABLE_IMPORT_MODE !== "apply" : flag === "--dry-run";
  const { db } = await import("../src/db");
  const s = await import("../src/db/schema");
  const { blindIndex } = await import("../src/lib/crypto");
  const { zonedDateTime } = await import("../src/lib/availability/engine");
  const { reserveStock } = await import("../src/lib/availability/db");
  const { loadSettings } = await import("../src/lib/settings");
  const { eq, sql } = await import("drizzle-orm");

  const invoices: Invoice[] = JSON.parse(
    fromEnv
      ? gunzipSync(Buffer.from(process.env.BOOQABLE_IMPORT_B64!, "base64")).toString("utf8")
      : readFileSync(file, "utf8"),
  );
  console.log(`Booqable import: ${invoices.length} invoices, ${dryRun ? "dry run" : "APPLY"}`);
  const settings = await loadSettings(db);
  const tz = settings.business.timezone;
  const now = new Date();

  // Group by booking: the regular invoice plus any credit invoices.
  const byBooking = new Map<number, Invoice[]>();
  for (const inv of invoices) {
    if (!inv.booking) continue;
    byBooking.set(inv.booking, [...(byBooking.get(inv.booking) ?? []), inv]);
  }

  const variants = await db
    .select({
      id: s.productVariants.id,
      name: s.productVariants.name,
      productId: s.productVariants.productId,
      productName: s.products.name,
      productType: s.products.productType,
    })
    .from(s.productVariants)
    .innerJoin(s.products, eq(s.products.id, s.productVariants.productId));
  const tiers = await db.select().from(s.deliveryTiers);
  const findVariant = (title: string | null) => {
    if (!title) return null;
    const t = title.trim().toLowerCase();
    return (
      variants.find((v) => v.name.trim().toLowerCase() === t) ??
      variants.find((v) => v.productName.trim().toLowerCase() === t) ??
      // Booqable variant titles look like "20x20 Marquee Tent - With Out Wall".
      variants.find((v) => t.startsWith(`${v.productName.trim().toLowerCase()} - `)) ??
      null
    );
  };

  const report = {
    customersCreated: 0,
    customersMatched: 0,
    ordersCreated: 0,
    ordersSkipped: 0,
    reserved: 0,
    unmatchedLines: [] as string[],
  };
  const ymd = (d: string) => d.split("-").reverse().join("-"); // dd-mm-yyyy → yyyy-mm-dd

  for (const [booking, docs] of [...byBooking.entries()].sort((a, b) => a[0] - b[0])) {
    const main = docs.find((d) => d.lines.length > 0) ?? docs[0];
    const credits = docs.filter((d) => d !== main && (d.total ?? 0) < 0);
    if (!main.from || !main.until || !main.name) continue;

    const [exists] = await db
      .select({ id: s.orders.id })
      .from(s.orders)
      .where(eq(s.orders.booqableNumber, String(booking)));
    if (exists) {
      report.ordersSkipped++;
      continue;
    }

    const [startTime, endTime] = knownTimes[booking] ?? [
      settings.booking.defaultPickupTime,
      settings.booking.defaultReturnTime,
    ];
    const startsAt = zonedDateTime(ymd(main.from), startTime, tz);
    const endsAt = zonedDateTime(ymd(main.until), endTime, tz);
    const future = endsAt > now;

    const lineRows: (typeof s.orderLines.$inferInsert)[] = [];
    let deliveryTierId: string | null = null;
    for (const l of main.lines) {
      const tier = tiers.find(
        (t) =>
          l.title && l.title.toLowerCase().includes(t.name.toLowerCase().split(" ")[0]) && /delivery/i.test(l.title),
      );
      if (tier) {
        deliveryTierId = tier.id;
        lineRows.push({
          orderId: "",
          kind: "delivery",
          title: tier.name,
          quantity: l.qty,
          unitPriceCents: l.unit,
          totalCents: l.total,
        });
        continue;
      }
      const v = findVariant(l.title);
      if (!v) report.unmatchedLines.push(`#${booking}: ${l.qty} × ${l.title ?? l.rawTitle}`);
      lineRows.push({
        orderId: "",
        kind: v ? (v.productType === "service" ? "service" : "product") : "custom",
        productId: v?.productId ?? null,
        variantId: v?.id ?? null,
        title: v?.name ?? l.title ?? l.rawTitle,
        quantity: l.qty,
        unitPriceCents: l.unit,
        totalCents: l.total,
      });
    }
    // Historical totals are kept exactly as invoiced.
    if (main.discount)
      lineRows.push({
        orderId: "",
        kind: "discount",
        title: "Discount",
        quantity: 1,
        unitPriceCents: main.discount,
        totalCents: main.discount,
      });
    if (!future && main.dp)
      lineRows.push({
        orderId: "",
        kind: "fee",
        title: "Damage Protection Plan 10%",
        quantity: 1,
        unitPriceCents: main.dp,
        totalCents: main.dp,
      });
    if (main.cardFees)
      lineRows.push({
        orderId: "",
        kind: "fee",
        title: "Credit card fees (Booqable)",
        quantity: 1,
        unitPriceCents: main.cardFees,
        totalCents: main.cardFees,
      });
    for (const c of credits) {
      lineRows.push({
        orderId: "",
        kind: "discount",
        title: `Booqable credit invoice`,
        quantity: 1,
        unitPriceCents: c.total!,
        totalCents: c.total!,
      });
    }
    const totalCents = (main.total ?? 0) + credits.reduce((sum, c) => sum + (c.total ?? 0), 0);
    const paidCents = Math.min(main.paid ?? 0, totalCents);

    if (dryRun) {
      console.log(
        `#${booking} ${main.from}→${main.until} ${future ? "FUTURE" : "past"} lines=${lineRows.length} total=${totalCents} paid=${paidCents}`,
      );
      report.ordersCreated++;
      continue;
    }

    await db.transaction(async (tx) => {
      // Customer
      const email = main.email?.trim().toLowerCase() || null;
      const fallbackKey = `booqable:${main.name!.trim().toLowerCase()}|${(main.phone ?? "").replace(/\D/g, "")}`;
      let customerId: string | undefined;
      if (email) {
        [{ id: customerId } = { id: undefined }] = await tx
          .select({ id: s.customers.id })
          .from(s.customers)
          .where(eq(s.customers.emailHash, blindIndex(email)));
      } else {
        [{ id: customerId } = { id: undefined }] = await tx
          .select({ id: s.customers.id })
          .from(s.customers)
          .where(eq(s.customers.booqableId, fallbackKey));
      }
      if (customerId) report.customersMatched++;
      else {
        const [c] = await tx
          .insert(s.customers)
          .values({
            name: main.name!.trim(),
            email,
            emailHash: email ? blindIndex(email) : null,
            phone: main.phone?.trim() || null,
            address: main.address.length ? JSON.stringify({ lines: main.address }) : null,
            source: "website",
            tags: ["booqable-import"],
            booqableId: email ? null : fallbackKey,
          })
          .returning({ id: s.customers.id });
        customerId = c.id;
        report.customersCreated++;
      }

      const [order] = await tx
        .insert(s.orders)
        .values({
          number: booking,
          status: future ? "reserved" : (main.due ?? 0) <= 0 ? "closed" : "returned",
          customerId,
          startsAt,
          endsAt,
          fulfillment: deliveryTierId ? "delivery" : "pickup",
          deliveryTierId,
          deliveryTierOverridden: Boolean(deliveryTierId),
          damageProtection: future ? Boolean(main.dp) : false,
          subtotalCents: main.subtotal ?? 0,
          totalCents,
          depositDueCents: 0,
          paidCents,
          tags: ["booqable-import"],
          source: "website",
          booqableNumber: String(booking),
        })
        .returning({ id: s.orders.id });
      await tx.insert(s.orderLines).values(lineRows.map((l, position) => ({ ...l, orderId: order.id, position })));
      if (paidCents > 0)
        await tx.insert(s.payments).values({
          orderId: order.id,
          method: "booqable",
          amountCents: paidCents,
          reference: "Paid in Booqable (imported)",
          receivedAt: main.invoiceDate ? zonedDateTime(ymd(main.invoiceDate), "12:00", tz) : now,
        });

      if (future) {
        const items = lineRows
          .filter((l) => l.variantId && l.kind === "product")
          .map((l) => ({ variantId: l.variantId!, quantity: l.quantity! }));
        await reserveStock(tx, {
          orderId: order.id,
          items,
          startsAt,
          endsAt,
          status: "reserved",
          now,
          defaultBufferAfter: settings.booking.defaultBufferAfterMinutes,
          allowOverbook: true, // already promised to the customer in Booqable
        });
        report.reserved++;
      }
      report.ordersCreated++;
    });
  }

  if (!dryRun) {
    // New orders continue after the highest Booqable booking number.
    await db.execute(
      sql`select setval(pg_get_serial_sequence('orders', 'number'), greatest((select max(number) from orders), 1))`,
    );
  }
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
