"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, notInArray, sql } from "drizzle-orm";
import sharp from "sharp";
import { z } from "zod";
import { db } from "@/db";
import {
  downtimes,
  orderLines,
  productCollections,
  productPhotos,
  products,
  productVariants,
  reservations,
} from "@/db/schema";
import { audit, requireStaff } from "@/lib/auth/session";
import { sanitizeRichText } from "@/lib/sanitize";
import { deleteFile, putFile } from "@/lib/storage";
import { productInput, type ProductInput } from "./schema";

export type SaveResult = { ok: true; savedAt: number } | { ok: false; error: string };

export async function saveProduct(input: ProductInput): Promise<SaveResult> {
  const user = await requireStaff("editCatalog");
  const parsed = productInput.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  const p = parsed.data;

  const [clash] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.slug, p.slug), sql`${products.id} <> ${p.id}`));
  if (clash) return { ok: false, error: "Another product already uses this URL." };

  const [before] = await db.select().from(products).where(eq(products.id, p.id));
  if (!before) return { ok: false, error: "Product not found" };
  const oldVariants = new Map(
    (
      await db
        .select({ id: productVariants.id, price: productVariants.basePriceCents })
        .from(productVariants)
        .where(eq(productVariants.productId, p.id))
    ).map((v) => [v.id, v.price]),
  );

  await db.transaction(async (tx) => {
    const custom = { ...(before.custom ?? {}) };
    if (p.stockConfirmed) delete custom.stockToConfirm;
    await tx
      .update(products)
      .set({
        name: p.name,
        slug: p.slug,
        descriptionHtml: sanitizeRichText(p.descriptionHtml),
        excerpt: excerptFrom(p.descriptionHtml),
        productType: p.productType,
        trackingType: p.trackingType,
        priceType: p.priceType,
        periodDays: p.periodDays,
        extraDayPriceCents: p.extraDayPriceCents,
        securityDepositCents: p.securityDepositCents,
        requiresDelivery: p.requiresDelivery,
        minDeliveryTier: p.minDeliveryTier || null,
        deliveryPoints: p.deliveryPoints,
        damageProtection: p.damageProtection,
        bufferBeforeMinutes: p.bufferBeforeMinutes,
        bufferAfterMinutes: p.bufferAfterMinutes,
        allowShortage: p.allowShortage,
        showInStore: p.showInStore,
        featured: p.featured,
        sortingWeight: p.sortingWeight,
        tags: p.tags,
        seoTitle: p.seoTitle || null,
        seoDescription: p.seoDescription || null,
        custom,
      })
      .where(eq(products.id, p.id));

    // Variants: update, insert new, archive removed ones that are referenced, delete the rest.
    const keepIds = p.variants.map((v) => v.id).filter((id): id is string => !!id);
    const removed = await tx
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(
        and(eq(productVariants.productId, p.id), keepIds.length ? notInArray(productVariants.id, keepIds) : undefined),
      );
    for (const r of removed) {
      const [used] = await tx
        .select({
          n: sql<number>`(select count(*) from ${orderLines} where variant_id = ${r.id}) + (select count(*) from ${reservations} where variant_id = ${r.id})`,
        })
        .from(sql`(select 1) as one`);
      if (Number(used.n) > 0)
        await tx.update(productVariants).set({ archivedAt: new Date() }).where(eq(productVariants.id, r.id));
      else {
        await tx.delete(downtimes).where(eq(downtimes.variantId, r.id));
        await tx.delete(productVariants).where(eq(productVariants.id, r.id));
      }
    }
    for (const [position, v] of p.variants.entries()) {
      const values = {
        name: v.name,
        options: v.options,
        sku: v.sku || null,
        basePriceCents: v.basePriceCents,
        stockQuantity: v.stockQuantity,
        position,
        archivedAt: null,
      };
      if (v.id)
        await tx
          .update(productVariants)
          .set(values)
          .where(and(eq(productVariants.id, v.id), eq(productVariants.productId, p.id)));
      else await tx.insert(productVariants).values({ ...values, productId: p.id });
    }

    await tx.delete(productCollections).where(eq(productCollections.productId, p.id));
    if (p.collectionIds.length) {
      await tx
        .insert(productCollections)
        .values(p.collectionIds.map((collectionId) => ({ productId: p.id, collectionId, position: p.sortingWeight })));
    }
    for (const [position, id] of p.photoOrder.entries()) {
      await tx
        .update(productPhotos)
        .set({ position })
        .where(and(eq(productPhotos.id, id), eq(productPhotos.productId, p.id)));
    }
  });

  const priceChanges = p.variants
    .filter((v) => v.id && oldVariants.get(v.id) !== undefined && oldVariants.get(v.id) !== v.basePriceCents)
    .map((v) => ({ variant: v.name, from: oldVariants.get(v.id!), to: v.basePriceCents }));
  await audit(user.id, "product_updated", "product", p.id, { name: p.name, slug: p.slug, priceChanges });
  updateTag("catalog");
  return { ok: true, savedAt: Date.now() };
}

export async function createProduct(form: FormData) {
  const user = await requireStaff("editCatalog");
  const name = String(form.get("name") ?? "").trim() || "New product";
  let slug = slugify(name);
  const existing = await db
    .select({ slug: products.slug })
    .from(products)
    .where(sql`${products.slug} like ${slug + "%"}`);
  if (existing.some((e) => e.slug === slug)) slug = `${slug}-${existing.length + 1}`;
  const [p] = await db.insert(products).values({ name, slug, showInStore: false }).returning({ id: products.id });
  await db.insert(productVariants).values({ productId: p.id, name, basePriceCents: 0, stockQuantity: 0 });
  await audit(user.id, "product_created", "product", p.id, { name });
  updateTag("catalog");
  redirect(`/admin/inventory/${p.id}`);
}

export async function archiveProduct(id: string) {
  const user = await requireStaff("editCatalog");
  await db.update(products).set({ archivedAt: new Date(), showInStore: false }).where(eq(products.id, id));
  await audit(user.id, "product_archived", "product", id);
  updateTag("catalog");
  redirect("/admin/inventory");
}

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/heic", "image/heif"]);
const MAX_BYTES = 15 * 1024 * 1024;

export async function uploadPhotos(
  productId: string,
  form: FormData,
): Promise<{ ok: boolean; error?: string; photos?: { id: string; src: string; alt: string | null }[] }> {
  await requireStaff("editCatalog");
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { ok: false, error: "No files" };
  const [{ maxPos }] = await db
    .select({ maxPos: sql<number>`coalesce(max(position), -1)::int` })
    .from(productPhotos)
    .where(eq(productPhotos.productId, productId));
  const [product] = await db.select({ name: products.name }).from(products).where(eq(products.id, productId));
  if (!product) return { ok: false, error: "Product not found" };
  const created = [];
  for (const [i, file] of files.entries()) {
    if (!ALLOWED.has(file.type)) return { ok: false, error: `${file.name}: unsupported file type` };
    if (file.size > MAX_BYTES) return { ok: false, error: `${file.name}: larger than 15 MB` };
    // Re-encode: strips metadata (GPS etc.), fixes rotation, limits size.
    const webp = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    const stored = await putFile("products", "webp", webp, "image/webp");
    const [row] = await db
      .insert(productPhotos)
      .values({ productId, src: stored.url, alt: product.name, position: maxPos + 1 + i })
      .returning({ id: productPhotos.id, src: productPhotos.src, alt: productPhotos.alt });
    created.push(row);
  }
  updateTag("catalog");
  return { ok: true, photos: created };
}

export async function deletePhoto(photoId: string) {
  await requireStaff("editCatalog");
  const [photo] = await db.delete(productPhotos).where(eq(productPhotos.id, photoId)).returning();
  if (photo && !photo.src.startsWith("/media/")) await deleteFile(photo.src);
  updateTag("catalog");
  return { ok: true };
}

export async function addDowntime(input: {
  variantId: string;
  quantity: number;
  startsAt: string;
  endsAt: string;
  reason: string;
}) {
  const user = await requireStaff("editCatalog");
  const parsed = z
    .object({
      variantId: z.string().uuid(),
      quantity: z.number().int().min(1),
      startsAt: z.coerce.date(),
      endsAt: z.coerce.date(),
      reason: z.string().max(300),
    })
    .refine((d) => d.endsAt > d.startsAt, "End must be after start")
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const [row] = await db
    .insert(downtimes)
    .values({ ...parsed.data, reason: parsed.data.reason || null })
    .returning();
  await audit(user.id, "downtime_added", "variant", parsed.data.variantId, parsed.data);
  return { ok: true, id: row.id };
}

export async function removeDowntime(id: string) {
  const user = await requireStaff("editCatalog");
  await db.delete(downtimes).where(eq(downtimes.id, id));
  await audit(user.id, "downtime_removed", "downtime", id);
  return { ok: true };
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "product"
  );
}

function excerptFrom(html: string): string | null {
  const text = html
    .replace(/<br\s*\/?>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  return text.length <= 160 ? text : text.slice(0, 157).replace(/\s+\S*$/, "") + "…";
}
