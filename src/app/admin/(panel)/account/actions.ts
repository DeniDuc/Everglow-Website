"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import QRCode from "qrcode";
import { db } from "@/db";
import { staffSessions, staffUsers } from "@/db/schema";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";
import { audit, getSession, requireStaff } from "@/lib/auth/session";
import { newTotpSecret, totpUri, verifyTotp } from "@/lib/auth/totp";
import { rateLimit } from "@/lib/rate-limit";
import { and, ne } from "drizzle-orm";

type Result = { ok: boolean; error?: string; message?: string };

export async function setLocale(locale: "en" | "ru") {
  const user = await requireStaff("view", { skip2faSetup: true });
  await db
    .update(staffUsers)
    .set({ locale: locale === "ru" ? "ru" : "en" })
    .where(eq(staffUsers.id, user.id));
  revalidatePath("/admin", "layout");
}

export async function changePassword(_prev: Result, form: FormData): Promise<Result> {
  const user = await requireStaff("view", { skip2faSetup: true });
  if (!(await rateLimit(`pw:${user.id}`, 5, 900))) return { ok: false, error: "Too many attempts. Try again later." };
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  const [row] = await db.select().from(staffUsers).where(eq(staffUsers.id, user.id));
  if (!row || !(await verifyPassword(row.passwordHash, current)))
    return { ok: false, error: "Current password is wrong." };
  const problem = passwordProblem(next);
  if (problem) return { ok: false, error: problem };
  await db
    .update(staffUsers)
    .set({ passwordHash: await hashPassword(next) })
    .where(eq(staffUsers.id, user.id));
  // Sign out other devices.
  const session = await getSession();
  if (session)
    await db.delete(staffSessions).where(and(eq(staffSessions.userId, user.id), ne(staffSessions.id, session.id)));
  await audit(user.id, "password_changed", "staff_user", user.id);
  return { ok: true, message: "Password changed. Other devices were signed out." };
}

export async function start2fa(): Promise<{ qr: string; secret: string }> {
  const user = await requireStaff("view", { skip2faSetup: true });
  const secret = newTotpSecret();
  // Stored (encrypted) but not active until a code is confirmed.
  await db.update(staffUsers).set({ totpSecret: secret, totpEnabled: false }).where(eq(staffUsers.id, user.id));
  const qr = await QRCode.toDataURL(totpUri(secret, user.email), { margin: 1, width: 220 });
  return { qr, secret };
}

export async function confirm2fa(_prev: Result, form: FormData): Promise<Result> {
  const user = await requireStaff("view", { skip2faSetup: true });
  if (!(await rateLimit(`totp-setup:${user.id}`, 8, 600))) return { ok: false, error: "Too many attempts." };
  const [row] = await db.select().from(staffUsers).where(eq(staffUsers.id, user.id));
  if (!row?.totpSecret || !verifyTotp(row.totpSecret, String(form.get("code") ?? "")))
    return { ok: false, error: "That code didn't work. Try the newest one." };
  await db.update(staffUsers).set({ totpEnabled: true }).where(eq(staffUsers.id, user.id));
  await audit(user.id, "2fa_enabled", "staff_user", user.id);
  revalidatePath("/admin/account");
  return { ok: true, message: "Two-step verification is on." };
}

export async function disable2fa(_prev: Result, form: FormData): Promise<Result> {
  const user = await requireStaff("view", { skip2faSetup: true });
  const [row] = await db.select().from(staffUsers).where(eq(staffUsers.id, user.id));
  if (!row?.totpSecret || !verifyTotp(row.totpSecret, String(form.get("code") ?? "")))
    return { ok: false, error: "Enter a current code from your app to turn it off." };
  await db.update(staffUsers).set({ totpEnabled: false, totpSecret: null }).where(eq(staffUsers.id, user.id));
  await audit(user.id, "2fa_disabled", "staff_user", user.id);
  revalidatePath("/admin/account");
  return { ok: true, message: "Two-step verification is off." };
}
