/**
 * Seed the database from the Booqable storefront snapshot (data/booqable/catalog.json),
 * the site content (data/content) and the default settings.
 *
 * Safe to run on every deploy: it only creates what is missing. Products, collections, settings
 * and pages the owner has edited are never overwritten. Set SEED_REFRESH_CATALOG=1 to re-apply
 * the snapshot to existing products (development only).
 *
 * Usage: npm run db:seed
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync } from "node:fs";
import path from "node:path";
import { eq, sql } from "drizzle-orm";

type Snapshot = {
  collections: {
    booqableId: string;
    name: string;
    slug: string;
    descriptionHtml: string | null;
    image: string | null;
    parentBooqableId: string | null;
    position: number;
    system: boolean;
    productBooqableIds: string[];
  }[];
  products: {
    booqableId: string;
    name: string;
    slug: string;
    descriptionHtml: string | null;
    trackingType: string;
    priceType: string;
    productType: string;
    showInStore: boolean;
    sortingWeight: number;
    images: { src: string; alt: string | null }[];
    variants: { booqableId: string; name: string; basePriceCents: number | null; variationValues: string[] }[];
  }[];
};

/**
 * Operational facts the storefront data does not carry. Stock counts are placeholders until
 * the Booqable CSV export is imported (products are flagged "stock to confirm" in admin).
 */
const ops: Record<
  string,
  { stock: number; points: number; minTier?: string; requiresDelivery?: boolean; featured?: boolean }
> = {
  "20x20-marquee-tent": { stock: 1, points: 80, minTier: "medium", requiresDelivery: true, featured: true },
  "20x40-marquee-tent": { stock: 1, points: 160, minTier: "large", requiresDelivery: true, featured: true },
  "20x60-marquee-tent": { stock: 1, points: 240, minTier: "large", requiresDelivery: true, featured: true },
  "pop-up-tent-10x20": { stock: 1, points: 20, featured: true },
  "8x8-pop-up-tent": { stock: 1, points: 10 },
  "rectangular-table-6ft": { stock: 20, points: 4, featured: true },
  "rectangular-table-8ft": { stock: 20, points: 5 },
  "round-table-5ft": { stock: 10, points: 5 }, // Booqable showed 10 reserved / 0 left on #139
  "white-folding-chair": { stock: 140, points: 1 }, // 140 rented at once on #114
  "white-resin-chair": { stock: 100, points: 1 },
  "rectangular-table-cloth-60-x126": { stock: 20, points: 0, featured: true },
  "round-table-cloths-120": { stock: 20, points: 0 },
  "48ft-led": { stock: 4, points: 1, featured: true },
  "easy-set-up-badminton-set": { stock: 1, points: 3, featured: true },
  "giant-kerplunk": { stock: 1, points: 5, featured: true },
  "giant-guess-who": { stock: 1, points: 5, featured: true },
  "tetris-xl-tumble": { stock: 1, points: 5, featured: true },
  "cornhole-toss": { stock: 1, points: 5, featured: true },
  "rubbermaid-cooler": { stock: 2, points: 3 },
  "wall-20x20-tent": { stock: 4, points: 5 },
  "service-set-up-fee": { stock: 0, points: 0 },
};

/**
 * Products that were hidden from the Booqable store but appear on invoices
 * (sidewalls sold with the 20x20 tent, the custom setup fee).
 */
const hiddenProducts: Snapshot["products"] = [
  {
    booqableId: "everglow:wall-20x20-tent",
    name: "Wall 20x20 Tent",
    slug: "wall-20x20-tent",
    descriptionHtml: "<p>Sidewall panel for the 20x20 Marquee Tent. One wall covers one 20′ side.</p>",
    trackingType: "bulk",
    priceType: "structure",
    productType: "rental",
    showInStore: false,
    sortingWeight: 50,
    images: [],
    variants: [
      {
        booqableId: "everglow:wall-20x20-tent:default",
        name: "Wall 20x20 Tent",
        basePriceCents: 5000,
        variationValues: [],
      },
    ],
  },
  {
    booqableId: "everglow:service-setup-fee",
    name: "Service SET-UP Fee",
    slug: "service-set-up-fee",
    descriptionHtml:
      "<p>Custom setup service (for example arranging chairs and tables to the customer’s plan). Priced per order.</p>",
    trackingType: "none",
    priceType: "fixed",
    productType: "service",
    showInStore: false,
    sortingWeight: 99,
    images: [],
    variants: [
      {
        booqableId: "everglow:service-setup-fee:default",
        name: "Service SET-UP Fee",
        basePriceCents: 3000,
        variationValues: [],
      },
    ],
  },
];

/** Booqable used a fake product for "customer pickup"; our checkout has a real choice instead. */
const skipSlugs = new Set(["customer-pickup-free-not-aplicable-for-tents"]);

function excerpt(html: string | null): string | null {
  if (!html) return null;
  const text = html
    .replace(/<br\s*\/?>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= 160) return text;
  return text.slice(0, 157).replace(/\s+\S*$/, "") + "…";
}

async function main() {
  const { db } = await import("../src/db");
  const s = await import("../src/db/schema");
  const { defaultSettings } = await import("../src/lib/settings-schema");
  const { hashPassword } = await import("../src/lib/auth/password");
  const { decrypt } = await import("../src/lib/crypto");
  const root = path.resolve(__dirname, "..");
  const snap: Snapshot = JSON.parse(readFileSync(path.join(root, "data/booqable/catalog.json"), "utf8"));
  const faq: { question: string; answerHtml: string }[] = JSON.parse(
    readFileSync(path.join(root, "data/content/faq.json"), "utf8"),
  );
  const pages: { slug: string; title: string; bodyHtml: string; seoDescription?: string }[] = JSON.parse(
    readFileSync(path.join(root, "data/content/pages.json"), "utf8"),
  );

  await db.transaction(async (tx) => {
    // Settings: insert defaults, never overwrite the owner's values.
    for (const [key, value] of Object.entries(defaultSettings)) {
      await tx.insert(s.settings).values({ key, value }).onConflictDoNothing();
    }

    const tiers = [
      {
        code: "small",
        name: "Small Delivery & Pickup",
        priceCents: 8000,
        maxPoints: 60,
        position: 1,
        description: "For orders that fit in a standard SUV. Example: several tables or up to 50 chairs.",
      },
      {
        code: "medium",
        name: "Medium Delivery & Pickup",
        priceCents: 12000,
        maxPoints: 200,
        position: 2,
        description:
          "For medium-sized orders that require a larger vehicle. Example: one 20′ × 20′ tent with additional tables or chairs.",
      },
      {
        code: "large",
        name: "Large Delivery & Pickup",
        priceCents: 20000,
        maxPoints: null,
        position: 3,
        description:
          "For large orders requiring multiple vehicles or additional staff. Example: large tents or high-volume orders with many tables and chairs.",
      },
    ];
    for (const t of tiers) await tx.insert(s.deliveryTiers).values(t).onConflictDoNothing();
    await tx
      .insert(s.taxRates)
      .values([
        { name: "GST", rateBp: 500, active: false, position: 1 },
        { name: "PST (MB)", rateBp: 700, active: false, position: 2 },
      ])
      .onConflictDoNothing();

    if ((await tx.select({ n: sql<number>`count(*)::int` }).from(s.faqItems))[0].n === 0) {
      await tx.insert(s.faqItems).values(faq.map((f, i) => ({ ...f, position: i + 1 })));
    }
    // Pages: refresh the shipped text only while the owner hasn't edited the page.
    for (const p of pages) {
      await tx
        .insert(s.pages)
        .values(p)
        .onConflictDoUpdate({
          target: s.pages.slug,
          set: { title: p.title, bodyHtml: p.bodyHtml, seoDescription: p.seoDescription ?? null },
          setWhere: sql`${s.pages.version} = 1 and ${s.pages.updatedAt} = ${s.pages.createdAt}`,
        });
    }

    // Collections (skip Booqable's system "All products").
    const refresh = process.env.SEED_REFRESH_CATALOG === "1";
    const collectionIds = new Map<string, string>();
    for (const c of snap.collections.filter((c) => !c.system)) {
      const [existing] = await tx
        .select({ id: s.collections.id })
        .from(s.collections)
        .where(eq(s.collections.booqableId, c.booqableId));
      if (existing && !refresh) {
        collectionIds.set(c.booqableId, existing.id);
        continue;
      }
      const values = {
        slug: c.slug,
        name: c.name,
        descriptionHtml: c.descriptionHtml?.replace(/Winnipieg/g, "Winnipeg") ?? null,
        image: c.image,
        position: c.position,
        featured: ["tents", "tables", "chairs", "eventessentials"].includes(c.slug),
        booqableId: c.booqableId,
      };
      const [row] = await tx
        .insert(s.collections)
        .values(values)
        .onConflictDoUpdate({ target: s.collections.booqableId, set: values })
        .returning({ id: s.collections.id });
      collectionIds.set(c.booqableId, row.id);
    }
    for (const c of snap.collections.filter((c) => !c.system && c.parentBooqableId)) {
      if (
        !refresh &&
        (
          await tx
            .select({ p: s.collections.parentId })
            .from(s.collections)
            .where(eq(s.collections.booqableId, c.booqableId))
        )[0]?.p
      )
        continue;
      await tx
        .update(s.collections)
        .set({ parentId: collectionIds.get(c.parentBooqableId!) ?? null })
        .where(eq(s.collections.booqableId, c.booqableId));
    }

    for (const p of [...snap.products.filter((p) => !skipSlugs.has(p.slug)), ...hiddenProducts]) {
      const [existing] = await tx
        .select({ id: s.products.id })
        .from(s.products)
        .where(eq(s.products.booqableId, p.booqableId));
      if (existing && !refresh) continue;
      const o = ops[p.slug] ?? { stock: 1, points: 1 };
      const values = {
        slug: p.slug,
        name: p.name,
        productType: p.productType === "service" ? ("service" as const) : ("rental" as const),
        trackingType:
          p.trackingType === "trackable"
            ? ("trackable" as const)
            : p.trackingType === "none"
              ? ("none" as const)
              : ("bulk" as const),
        descriptionHtml: (p.descriptionHtml ?? "").replace(/Winnipieg/g, "Winnipeg"),
        excerpt: excerpt(p.descriptionHtml),
        priceType: p.priceType === "fixed" ? ("fixed" as const) : ("structure" as const),
        periodDays: 3,
        requiresDelivery: o.requiresDelivery ?? false,
        deliveryPoints: o.points,
        minDeliveryTier: o.minTier ?? null,
        showInStore: p.showInStore,
        featured: o.featured ?? false,
        sortingWeight: p.sortingWeight,
        booqableId: p.booqableId,
      };
      const [prod] = await tx
        .insert(s.products)
        .values({ ...values, custom: { stockToConfirm: "yes" } })
        .onConflictDoUpdate({ target: s.products.booqableId, set: values })
        .returning({ id: s.products.id });

      await tx.delete(s.productPhotos).where(eq(s.productPhotos.productId, prod.id));
      if (p.images.length) {
        await tx
          .insert(s.productPhotos)
          .values(
            p.images.map((img, i) => ({ productId: prod.id, src: img.src, alt: img.alt ?? p.name, position: i })),
          );
      }

      const multi = p.variants.length > 1;
      for (const [i, v] of p.variants.entries()) {
        const vValues = {
          productId: prod.id,
          name: multi ? v.name : p.name,
          options: multi ? v.variationValues : [],
          basePriceCents: v.basePriceCents ?? 0,
          position: i,
          booqableId: v.booqableId,
        };
        const [variant] = await tx
          .insert(s.productVariants)
          .values({ ...vValues, stockQuantity: o.stock })
          .onConflictDoUpdate({ target: s.productVariants.booqableId, set: vValues })
          .returning({ id: s.productVariants.id });
        // Trackable products count individual units; create placeholder units once.
        if (values.trackingType === "trackable") {
          const units = await tx.select().from(s.stockItems).where(eq(s.stockItems.variantId, variant.id));
          if (units.length === 0) {
            await tx.insert(s.stockItems).values(
              Array.from({ length: o.stock }, (_, n) => ({
                variantId: variant.id,
                identifier: `${vValues.name} #${n + 1}`,
              })),
            );
          }
        }
      }

      await tx.delete(s.productCollections).where(eq(s.productCollections.productId, prod.id));
      const memberOf = snap.collections.filter((c) => !c.system && c.productBooqableIds.includes(p.booqableId));
      if (memberOf.length) {
        await tx.insert(s.productCollections).values(
          memberOf.map((c) => ({
            productId: prod.id,
            collectionId: collectionIds.get(c.booqableId)!,
            position: p.sortingWeight,
          })),
        );
      }
    }

    const email = process.env.SEED_OWNER_EMAIL;
    const password = process.env.SEED_OWNER_PASSWORD;
    if (email && password) {
      const exists = await tx
        .select({ id: s.staffUsers.id })
        .from(s.staffUsers)
        .where(eq(s.staffUsers.email, email.toLowerCase()));
      if (exists.length === 0) {
        await tx.insert(s.staffUsers).values({
          email: email.toLowerCase(),
          name: "Owner",
          role: "owner",
          passwordHash: await hashPassword(password),
        });
        console.log(`owner account created: ${email}`);
      }
    }

    // A 2FA secret that no longer decrypts (ENCRYPTION_KEY was replaced) can never verify a code and
    // breaks every admin page that loads the user. Clear it and end their sessions: they still need
    // their password, and the 2FA requirement makes them enrol again at the next sign-in.
    const secrets = await tx
      .select({ id: s.staffUsers.id, email: s.staffUsers.email, secret: sql<string>`"totp_secret"` })
      .from(s.staffUsers)
      .where(sql`"totp_secret" is not null`);
    for (const u of secrets) {
      try {
        decrypt(u.secret);
      } catch {
        await tx.execute(
          sql`update "staff_users" set "totp_secret" = null, "totp_enabled" = false where "id" = ${u.id}`,
        );
        await tx.delete(s.staffSessions).where(eq(s.staffSessions.userId, u.id));
        await tx.insert(s.auditLog).values({
          action: "2fa.reset_unreadable_secret",
          entity: "staff_user",
          entityId: u.id,
        });
        console.warn(`2FA reset for ${u.email}: its secret was encrypted with a different ENCRYPTION_KEY`);
      }
    }
  });

  console.log("seed complete");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
