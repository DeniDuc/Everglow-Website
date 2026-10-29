"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { z } from "zod";
import { db } from "@/db";
import { collections } from "@/db/schema";
import { audit, requireStaff } from "@/lib/auth/session";
import { sanitizeRichText } from "@/lib/sanitize";
import { putFile } from "@/lib/storage";

const input = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  descriptionHtml: z.string().max(50_000),
  parentId: z.string().uuid().nullable(),
  position: z.number().int(),
  featured: z.boolean(),
  visible: z.boolean(),
  seoTitle: z.string().trim().max(120).nullable(),
  seoDescription: z.string().trim().max(320).nullable(),
});
export type CollectionInput = z.infer<typeof input>;

export async function saveCollection(data: CollectionInput): Promise<{ ok: boolean; error?: string }> {
  const user = await requireStaff("editCatalog");
  const parsed = input.safeParse(data);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const c = parsed.data;
  if (c.parentId === c.id) return { ok: false, error: "A collection can't be its own parent." };
  const [clash] = await db
    .select({ id: collections.id })
    .from(collections)
    .where(and(eq(collections.slug, c.slug), sql`${collections.id} <> ${c.id}`));
  if (clash) return { ok: false, error: "Another collection already uses this URL." };
  await db
    .update(collections)
    .set({
      ...c,
      descriptionHtml: sanitizeRichText(c.descriptionHtml),
      seoTitle: c.seoTitle || null,
      seoDescription: c.seoDescription || null,
    })
    .where(eq(collections.id, c.id));
  await audit(user.id, "collection_updated", "collection", c.id, { name: c.name });
  updateTag("catalog");
  return { ok: true };
}

export async function uploadCollectionImage(
  id: string,
  form: FormData,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  await requireStaff("editCatalog");
  const file = form.get("file");
  if (!(file instanceof File) || !file.type.startsWith("image/") || file.size > 15 * 1024 * 1024)
    return { ok: false, error: "Choose an image up to 15 MB." };
  const webp = await sharp(Buffer.from(await file.arrayBuffer()))
    .rotate()
    .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
  const stored = await putFile("collections", "webp", webp, "image/webp");
  await db.update(collections).set({ image: stored.url }).where(eq(collections.id, id));
  updateTag("catalog");
  return { ok: true, url: stored.url };
}

export async function createCollection(form: FormData) {
  const user = await requireStaff("editCatalog");
  const name = String(form.get("name") ?? "").trim() || "New collection";
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "collection";
  const [row] = await db
    .insert(collections)
    .values({ name, slug: `${slug}-${Date.now().toString(36)}`, visible: false })
    .returning({ id: collections.id });
  await audit(user.id, "collection_created", "collection", row.id, { name });
  updateTag("catalog");
  redirect(`/admin/collections/${row.id}`);
}
