"use server";

import { revalidatePath, updateTag } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { blackoutDates, deliveryTiers, faqItems, pages, staffSessions, staffUsers, taxRates } from "@/db/schema";
import { hashPassword, passwordProblem } from "@/lib/auth/password";
import { audit, requireStaff } from "@/lib/auth/session";
import { sanitizeRichText } from "@/lib/sanitize";
import { saveSetting, type Settings, type SettingsKey } from "@/lib/settings";
import { settingsSchemas } from "@/lib/settings-schema";

type Result = { ok: boolean; error?: string };

function done(tag: "settings" | "content" | "catalog"): Result {
  updateTag(tag);
  revalidatePath("/admin/settings");
  return { ok: true };
}

export async function saveSettings<K extends SettingsKey>(key: K, value: Settings[K]): Promise<Result> {
  const user = await requireStaff("editSettings");
  const parsed = settingsSchemas[key].safeParse(value);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  await saveSetting(db, key, parsed.data as Settings[K]);
  await audit(user.id, "settings_updated", "settings", key, parsed.data);
  return done("settings");
}

const tierSchema = z.object({
  id: z.string().uuid().nullable(),
  code: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).nullable(),
  priceCents: z.number().int().min(0),
  maxPoints: z.number().int().min(0).nullable(),
  position: z.number().int(),
  active: z.boolean(),
});

export async function saveDeliveryTiers(tiers: z.infer<typeof tierSchema>[]): Promise<Result> {
  const user = await requireStaff("editSettings");
  const parsed = z.array(tierSchema).safeParse(tiers);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  await db.transaction(async (tx) => {
    for (const t of parsed.data) {
      const { id, ...values } = t;
      if (id) await tx.update(deliveryTiers).set(values).where(eq(deliveryTiers.id, id));
      else await tx.insert(deliveryTiers).values(values);
    }
  });
  await audit(user.id, "delivery_tiers_updated", "settings", "delivery_tiers", parsed.data);
  return done("settings");
}

const taxSchema = z.object({
  id: z.string().uuid().nullable(),
  name: z.string().trim().min(1).max(40),
  rateBp: z.number().int().min(0).max(5000),
  active: z.boolean(),
  position: z.number().int(),
});

export async function saveTaxRates(rates: z.infer<typeof taxSchema>[]): Promise<Result> {
  const user = await requireStaff("editSettings");
  const parsed = z.array(taxSchema).safeParse(rates);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  await db.transaction(async (tx) => {
    for (const t of parsed.data) {
      const { id, ...values } = t;
      if (id) await tx.update(taxRates).set(values).where(eq(taxRates.id, id));
      else await tx.insert(taxRates).values(values);
    }
  });
  await audit(user.id, "tax_rates_updated", "settings", "tax_rates", parsed.data);
  return done("settings");
}

export async function addBlackout(form: FormData) {
  const user = await requireStaff("editSettings");
  const date = String(form.get("date") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  await db
    .insert(blackoutDates)
    .values({ date, reason: String(form.get("reason") ?? "").slice(0, 200) || null })
    .onConflictDoNothing();
  await audit(user.id, "blackout_added", "settings", date);
  done("settings");
}

export async function removeBlackout(id: string) {
  const user = await requireStaff("editSettings");
  await db.delete(blackoutDates).where(eq(blackoutDates.id, id));
  await audit(user.id, "blackout_removed", "settings", id);
  done("settings");
}

export async function savePage(input: {
  slug: string;
  title: string;
  bodyHtml: string;
  seoTitle: string | null;
  seoDescription: string | null;
}): Promise<Result> {
  const user = await requireStaff("editSettings");
  const parsed = z
    .object({
      slug: z.string().min(1).max(60),
      title: z.string().trim().min(1).max(120),
      bodyHtml: z.string().max(200_000),
      seoTitle: z.string().max(120).nullable(),
      seoDescription: z.string().max(320).nullable(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const [current] = await db.select().from(pages).where(eq(pages.slug, parsed.data.slug));
  const body = sanitizeRichText(parsed.data.bodyHtml);
  const values = {
    ...parsed.data,
    bodyHtml: body,
    version: current && current.bodyHtml !== body ? current.version + 1 : (current?.version ?? 1),
  };
  await db.insert(pages).values(values).onConflictDoUpdate({ target: pages.slug, set: values });
  await audit(user.id, "page_updated", "page", parsed.data.slug, { version: values.version });
  return done("content");
}

const faqSchema = z.object({
  id: z.string().uuid().nullable(),
  question: z.string().trim().min(1).max(300),
  answerHtml: z.string().max(20_000),
  visible: z.boolean(),
});

export async function saveFaq(items: z.infer<typeof faqSchema>[], removedIds: string[]): Promise<Result> {
  const user = await requireStaff("editSettings");
  const parsed = z.array(faqSchema).safeParse(items);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  await db.transaction(async (tx) => {
    for (const id of removedIds) await tx.delete(faqItems).where(eq(faqItems.id, id));
    for (const [position, f] of parsed.data.entries()) {
      const values = { question: f.question, answerHtml: sanitizeRichText(f.answerHtml), visible: f.visible, position };
      if (f.id) await tx.update(faqItems).set(values).where(eq(faqItems.id, f.id));
      else await tx.insert(faqItems).values(values);
    }
  });
  await audit(user.id, "faq_updated", "faq", null, { count: parsed.data.length });
  return done("content");
}

export async function addStaff(_prev: Result, form: FormData): Promise<Result> {
  const user = await requireStaff("manageStaff");
  const parsed = z
    .object({
      name: z.string().trim().min(1).max(80),
      email: z.string().trim().toLowerCase().email(),
      role: z.enum(["owner", "staff", "readonly"]),
      password: z.string(),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const problem = passwordProblem(parsed.data.password);
  if (problem) return { ok: false, error: problem };
  const [exists] = await db
    .select({ id: staffUsers.id })
    .from(staffUsers)
    .where(eq(staffUsers.email, parsed.data.email));
  if (exists) return { ok: false, error: "This email already has an account." };
  const [created] = await db
    .insert(staffUsers)
    .values({
      name: parsed.data.name,
      email: parsed.data.email,
      role: parsed.data.role,
      passwordHash: await hashPassword(parsed.data.password),
    })
    .returning({ id: staffUsers.id });
  await audit(user.id, "staff_added", "staff_user", created.id, { email: parsed.data.email, role: parsed.data.role });
  revalidatePath("/admin/settings");
  return { ok: true };
}

export async function updateStaff(
  id: string,
  patch: { role?: "owner" | "staff" | "readonly"; disabled?: boolean },
): Promise<Result> {
  const user = await requireStaff("manageStaff");
  if (id === user.id) return { ok: false, error: "You can't change your own role or disable yourself." };
  await db.update(staffUsers).set(patch).where(eq(staffUsers.id, id));
  if (patch.disabled) await db.delete(staffSessions).where(eq(staffSessions.userId, id));
  await audit(user.id, "staff_updated", "staff_user", id, patch);
  revalidatePath("/admin/settings");
  return { ok: true };
}
