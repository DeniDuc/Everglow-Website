import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { PageHeader } from "@/components/admin/ui";
import { db } from "@/db";
import {
  collections,
  deliveryTiers,
  downtimes,
  productCollections,
  productPhotos,
  products,
  productVariants,
} from "@/db/schema";
import { can } from "@/lib/auth/roles";
import { requireStaff } from "@/lib/auth/session";
import { labelsFor, translator } from "@/lib/i18n/admin";
import { ProductEditor } from "./product-editor";

// Per-user back office page: rendered on request, no instant-navigation prefetch needed.
export const instant = false;

export const metadata: Metadata = { title: "Edit product" };

export default async function ProductEditPage({ params }: PageProps<"/admin/inventory/[id]">) {
  const user = await requireStaff();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [p] = await db.select().from(products).where(eq(products.id, id));
  if (!p) notFound();
  const [variants, photos, links, cols, tiers] = await Promise.all([
    db
      .select()
      .from(productVariants)
      .where(and(eq(productVariants.productId, id), isNull(productVariants.archivedAt)))
      .orderBy(asc(productVariants.position)),
    db.select().from(productPhotos).where(eq(productPhotos.productId, id)).orderBy(asc(productPhotos.position)),
    db.select().from(productCollections).where(eq(productCollections.productId, id)),
    db.select().from(collections).orderBy(asc(collections.position)),
    db.select().from(deliveryTiers).orderBy(asc(deliveryTiers.position)),
  ]);
  const dts = variants.length
    ? await db
        .select()
        .from(downtimes)
        .where(
          inArray(
            downtimes.variantId,
            variants.map((v) => v.id),
          ),
        )
        .orderBy(asc(downtimes.startsAt))
    : [];
  const t = translator(user.locale);
  const plainLabels = labelsFor(user.locale, [
    "prod.general",
    "prod.description",
    "prod.photos",
    "prod.uploadPhotos",
    "prod.dragHint",
    "prod.pricing",
    "prod.priceType",
    "prod.structure",
    "prod.daily",
    "prod.fixed",
    "prod.free",
    "prod.periodDays",
    "prod.extraDay",
    "prod.variants",
    "prod.variantName",
    "prod.price",
    "prod.stockQty",
    "prod.addVariant",
    "prod.rules",
    "prod.requiresDelivery",
    "prod.minTier",
    "prod.points",
    "prod.bufferBefore",
    "prod.bufferAfter",
    "prod.allowShortage",
    "prod.damageProtection",
    "prod.visibility",
    "prod.showInStore",
    "prod.featured",
    "prod.collections",
    "prod.seo",
    "prod.seoTitle",
    "prod.seoDescription",
    "prod.slug",
    "prod.downtime",
    "prod.archive",
    "common.name",
    "common.save",
    "common.saved",
    "inv.rental",
    "inv.service",
  ]);
  const byId = new Map(cols.map((c) => [c.id, c]));

  return (
    <>
      <PageHeader title={p.name} back={{ href: "/admin/inventory", label: t("inv.title") }} />
      <ProductEditor
        canEdit={can(user.role, "editCatalog")}
        labels={plainLabels}
        initial={{
          id: p.id,
          name: p.name,
          slug: p.slug,
          descriptionHtml: p.descriptionHtml,
          productType: p.productType,
          trackingType: p.trackingType,
          priceType: p.priceType,
          periodDays: p.periodDays,
          extraDayPriceCents: p.extraDayPriceCents,
          securityDepositCents: p.securityDepositCents,
          requiresDelivery: p.requiresDelivery,
          minDeliveryTier: p.minDeliveryTier,
          deliveryPoints: p.deliveryPoints,
          damageProtection: p.damageProtection,
          bufferBeforeMinutes: p.bufferBeforeMinutes,
          bufferAfterMinutes: p.bufferAfterMinutes,
          allowShortage: p.allowShortage,
          showInStore: p.showInStore,
          featured: p.featured,
          sortingWeight: p.sortingWeight,
          tags: p.tags,
          seoTitle: p.seoTitle,
          seoDescription: p.seoDescription,
          collectionIds: links.map((l) => l.collectionId),
          photoOrder: photos.map((ph) => ph.id),
          stockConfirmed: false,
          stockToConfirm: Boolean(p.custom?.stockToConfirm),
          variants: variants.map((v) => ({
            id: v.id,
            name: v.name,
            options: v.options,
            sku: v.sku,
            basePriceCents: v.basePriceCents,
            stockQuantity: v.stockQuantity,
          })),
        }}
        photos={photos.map((ph) => ({ id: ph.id, src: ph.src, alt: ph.alt }))}
        collections={cols.map((c) => ({
          id: c.id,
          name: c.name,
          parentName: c.parentId ? (byId.get(c.parentId)?.name ?? null) : null,
        }))}
        tiers={tiers.map((tier) => ({ code: tier.code, name: tier.name }))}
        downtimes={dts.map((d) => ({
          id: d.id,
          variantId: d.variantId,
          quantity: d.quantity,
          startsAt: d.startsAt.toISOString(),
          endsAt: d.endsAt.toISOString(),
          reason: d.reason,
        }))}
      />
    </>
  );
}
