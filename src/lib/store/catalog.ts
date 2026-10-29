import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  blackoutDates,
  collections,
  deliveryTiers,
  faqItems,
  pages,
  productCollections,
  productPhotos,
  products,
  productVariants,
} from "@/db/schema";
import { loadSettings } from "@/lib/settings";
import { priceLabel, type PriceType } from "@/lib/pricing";

/**
 * Cached reads for the public storefront. Everything here is tagged "catalog" (or "content")
 * and refreshed by admin mutations via revalidateTag/updateTag.
 */

export type ProductCardData = {
  id: string;
  slug: string;
  name: string;
  excerpt: string | null;
  image: { src: string; alt: string } | null;
  fromPriceCents: number;
  priceLabel: string;
  requiresDelivery: boolean;
  collectionSlugs: string[];
  sortingWeight: number;
  featured: boolean;
};

export type CollectionData = {
  id: string;
  slug: string;
  name: string;
  descriptionHtml: string | null;
  image: string | null;
  parentId: string | null;
  featured: boolean;
  position: number;
  seoTitle: string | null;
  seoDescription: string | null;
};

export async function getStoreSettings() {
  "use cache";
  cacheLife("hours");
  cacheTag("settings");
  const s = await loadSettings(db);
  const blackouts = await db.select({ date: blackoutDates.date }).from(blackoutDates);
  const tiers = await db
    .select()
    .from(deliveryTiers)
    .where(eq(deliveryTiers.active, true))
    .orderBy(asc(deliveryTiers.position));
  return { ...s, blackoutDates: blackouts.map((b) => b.date), deliveryTiers: tiers };
}

export async function getCollections(): Promise<CollectionData[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("catalog");
  return db
    .select({
      id: collections.id,
      slug: collections.slug,
      name: collections.name,
      descriptionHtml: collections.descriptionHtml,
      image: collections.image,
      parentId: collections.parentId,
      featured: collections.featured,
      position: collections.position,
      seoTitle: collections.seoTitle,
      seoDescription: collections.seoDescription,
    })
    .from(collections)
    .where(eq(collections.visible, true))
    .orderBy(asc(collections.position), asc(collections.name));
}

export async function getStoreProducts(): Promise<ProductCardData[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("catalog");
  const rows = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.showInStore, true),
        isNull(products.archivedAt),
        inArray(products.productType, ["rental", "bundle"]),
      ),
    )
    .orderBy(asc(products.sortingWeight), asc(products.name));
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return [];
  const [variants, photos, links, cols] = await Promise.all([
    db
      .select()
      .from(productVariants)
      .where(and(inArray(productVariants.productId, ids), isNull(productVariants.archivedAt))),
    db.select().from(productPhotos).where(inArray(productPhotos.productId, ids)).orderBy(asc(productPhotos.position)),
    db.select().from(productCollections).where(inArray(productCollections.productId, ids)),
    db.select({ id: collections.id, slug: collections.slug }).from(collections),
  ]);
  const colSlug = new Map(cols.map((c) => [c.id, c.slug]));
  return rows.map((p) => {
    const vs = variants.filter((v) => v.productId === p.id);
    const photo = photos.find((ph) => ph.productId === p.id);
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      excerpt: p.excerpt,
      image: photo ? { src: photo.src, alt: photo.alt ?? p.name } : null,
      fromPriceCents: vs.length ? Math.min(...vs.map((v) => v.basePriceCents)) : 0,
      priceLabel: priceLabel({ priceType: p.priceType as PriceType, periodDays: p.periodDays }),
      requiresDelivery: p.requiresDelivery,
      collectionSlugs: links
        .filter((l) => l.productId === p.id)
        .map((l) => colSlug.get(l.collectionId)!)
        .filter(Boolean),
      sortingWeight: p.sortingWeight,
      featured: p.featured,
    };
  });
}

export type ProductDetail = Awaited<ReturnType<typeof getProductBySlug>>;

export async function getProductBySlug(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("catalog");
  const [p] = await db
    .select()
    .from(products)
    .where(and(eq(products.slug, slug), eq(products.showInStore, true), isNull(products.archivedAt)));
  if (!p) return null;
  const [variants, photos, links] = await Promise.all([
    db
      .select()
      .from(productVariants)
      .where(and(eq(productVariants.productId, p.id), isNull(productVariants.archivedAt)))
      .orderBy(asc(productVariants.position)),
    db.select().from(productPhotos).where(eq(productPhotos.productId, p.id)).orderBy(asc(productPhotos.position)),
    db
      .select({ slug: collections.slug, name: collections.name, parentId: collections.parentId })
      .from(productCollections)
      .innerJoin(collections, eq(collections.id, productCollections.collectionId))
      .where(eq(productCollections.productId, p.id)),
  ]);
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    descriptionHtml: p.descriptionHtml,
    excerpt: p.excerpt,
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
    priceType: p.priceType as PriceType,
    periodDays: p.periodDays,
    priceLabel: priceLabel({ priceType: p.priceType as PriceType, periodDays: p.periodDays }),
    requiresDelivery: p.requiresDelivery,
    updatedAt: p.updatedAt.toISOString(),
    variants: variants.map((v) => ({
      id: v.id,
      name: v.name,
      options: v.options,
      priceCents: v.basePriceCents,
      sku: v.sku,
    })),
    photos: photos.map((ph) => ({ src: ph.src, alt: ph.alt ?? p.name })),
    collections: links,
  };
}

export async function getFaq() {
  "use cache";
  cacheLife("hours");
  cacheTag("content");
  return db
    .select({ id: faqItems.id, question: faqItems.question, answerHtml: faqItems.answerHtml })
    .from(faqItems)
    .where(eq(faqItems.visible, true))
    .orderBy(asc(faqItems.position));
}

export async function getPage(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("content");
  const [page] = await db.select().from(pages).where(eq(pages.slug, slug));
  return page ? { ...page, updatedAt: page.updatedAt.toISOString(), createdAt: page.createdAt.toISOString() } : null;
}
