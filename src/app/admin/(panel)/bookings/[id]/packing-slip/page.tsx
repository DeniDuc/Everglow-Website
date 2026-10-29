import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq, inArray } from "drizzle-orm";
import { PrintButton } from "@/components/admin/print-button";
import { buttonClass } from "@/components/admin/ui";
import { db } from "@/db";
import { bundleItems, customers, orderLines, orders, products, productVariants } from "@/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { addressText } from "@/lib/customers";
import { formatLocal } from "@/lib/format";
import { translator } from "@/lib/i18n/admin";
import { loadSettings } from "@/lib/settings";

// Per-user back office page: rendered on request, no instant-navigation prefetch needed.
export const instant = false;

export const metadata: Metadata = { title: "Packing slip" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Printable checklist for the warehouse: what goes out, with sign-off lines. No prices. */
export default async function PackingSlipPage({ params }: PageProps<"/admin/bookings/[id]/packing-slip">) {
  const user = await requireStaff();
  const t = translator(user.locale);
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [row] = await db
    .select({ o: orders, c: customers })
    .from(orders)
    .leftJoin(customers, eq(customers.id, orders.customerId))
    .where(eq(orders.id, id));
  if (!row) notFound();
  const { o, c } = row;
  const [settings, lines] = await Promise.all([
    loadSettings(db),
    db.select().from(orderLines).where(eq(orderLines.orderId, id)).orderBy(asc(orderLines.position)),
  ]);
  const items = lines.filter((l) => l.kind === "product" || l.kind === "bundle" || l.kind === "custom");
  const bundleIds = items.map((l) => l.productId).filter((p): p is string => Boolean(p));
  const parts = bundleIds.length
    ? await db
        .select({ bundleId: bundleItems.bundleId, quantity: bundleItems.quantity, name: productVariants.name })
        .from(bundleItems)
        .innerJoin(productVariants, eq(productVariants.id, bundleItems.variantId))
        .innerJoin(products, eq(products.id, bundleItems.bundleId))
        .where(inArray(bundleItems.bundleId, bundleIds))
    : [];

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-8 print:max-w-none print:p-0">
      <div className="mb-6 flex flex-wrap items-center gap-2 print:hidden">
        <Link href={`/admin/bookings/${o.id}`} className={buttonClass("secondary")}>
          ← #{o.number}
        </Link>
        <span className="flex-1" />
        <PrintButton label={t("order.print")} />
      </div>
      <article className="rounded-lg border border-admin-line bg-white p-8 text-[0.95rem] text-black print:border-0 print:p-0">
        <header className="flex items-start justify-between gap-6 border-b border-black/20 pb-5">
          <div>
            <Image src="/media/site/logo.png" alt="Everglow" width={566} height={222} className="h-12 w-auto" />
            <p className="mt-2 text-sm">
              {settings.business.legalName}
              <br />
              {settings.business.phone} · {settings.business.email}
            </p>
          </div>
          <div className="text-right">
            <h1 className="text-2xl font-semibold">{t("order.packingSlip")}</h1>
            <p className="text-3xl font-light">#{o.number}</p>
          </div>
        </header>

        <section className="grid gap-6 border-b border-black/20 py-5 sm:grid-cols-2 print:grid-cols-2">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-black/60">{t("order.customer")}</h2>
            <p className="mt-1 font-semibold">{c?.name ?? "—"}</p>
            {c?.phone && <p>{c.phone}</p>}
            {c?.email && <p>{c.email}</p>}
          </div>
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-black/60">
              {o.fulfillment === "delivery" ? t("order.delivery") : t("order.customerPickup")}
            </h2>
            <p className="mt-1">
              <strong>{t("order.pickup")}:</strong> {formatLocal(o.startsAt, "EEE, MMM d · h:mm a")}
              <br />
              <strong>{t("order.return")}:</strong> {formatLocal(o.endsAt, "EEE, MMM d · h:mm a")}
            </p>
            {o.fulfillment === "delivery" && (
              <p className="mt-1">{o.deliveryAddress || addressText(c?.address) || "—"}</p>
            )}
            {o.deliveryNotes && <p className="mt-1 text-sm">{o.deliveryNotes}</p>}
          </div>
        </section>

        <table className="mt-5 w-full border-collapse text-left">
          <thead>
            <tr className="border-b-2 border-black text-sm">
              <th className="py-2 pr-3">{t("order.qty")}</th>
              <th className="py-2 pr-3">{t("order.items")}</th>
              <th className="w-16 py-2 text-center">{t("status.ready")}</th>
              <th className="w-16 py-2 text-center">{t("status.out")}</th>
              <th className="w-16 py-2 text-center">{t("status.returned")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((l) => (
              <tr key={l.id} className="break-inside-avoid border-b border-black/20 align-top">
                <td className="py-3 pr-3 text-xl font-semibold">{l.quantity}</td>
                <td className="py-3 pr-3">
                  <span className="font-semibold">{l.title}</span>
                  {parts
                    .filter((p) => p.bundleId === l.productId)
                    .map((p) => (
                      <span key={p.name} className="block text-sm">
                        {p.quantity * l.quantity} × {p.name}
                      </span>
                    ))}
                </td>
                {[0, 1, 2].map((i) => (
                  <td key={i} className="py-3 text-center">
                    <span className="inline-block size-5 border-2 border-black" aria-hidden />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {o.internalNotes && (
          <section className="mt-5 rounded border border-black/30 p-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-black/60">{t("order.notes")}</h2>
            <p className="mt-1 whitespace-pre-line">{o.internalNotes}</p>
          </section>
        )}

        <section className="mt-8 grid gap-6 sm:grid-cols-2 print:grid-cols-2">
          {[t("order.packed"), t("order.checkedOut"), t("order.idChecked"), t("order.checkedIn")].map((label) => (
            <div key={label}>
              <div className="h-10 border-b border-black" />
              <p className="mt-1 text-sm">{label}</p>
            </div>
          ))}
        </section>
        <p className="mt-6 text-xs text-black/60">
          {formatLocal(new Date(), "MMM d, yyyy h:mm a")} · {settings.business.name}
        </p>
      </article>
    </div>
  );
}
