"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { staffUsers } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { audit, createSession, destroySession, getSession, markMfaPassed } from "@/lib/auth/session";
import { verifyTotp } from "@/lib/auth/totp";
import { sha256 } from "@/lib/crypto";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export type LoginState = { error?: "invalid" | "tooMany" | "badCode"; email?: string };

// Verified against when the email is unknown, so response time doesn't reveal which emails exist.
let dummyHash: Promise<string> | null = null;

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(500),
});

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(form));
  const email = String(form.get("email") ?? "").slice(0, 200);
  if (!parsed.success) return { error: "invalid", email };
  const h = await headers();
  const ip = sha256(clientIp(h));
  const okIp = await rateLimit(`login-ip:${ip}`, 20, 900);
  const okUser = await rateLimit(`login-user:${sha256(parsed.data.email)}`, 8, 900);
  if (!okIp || !okUser) return { error: "tooMany", email };

  const [user] = await db.select().from(staffUsers).where(eq(staffUsers.email, parsed.data.email));
  dummyHash ??= hashPassword("not-a-real-password-everglow");
  const valid = await verifyPassword(user?.passwordHash ?? (await dummyHash), parsed.data.password);
  if (!user || !valid || user.disabled) {
    await audit(user?.id ?? null, "login_failed", "staff_user", user?.id, { email: parsed.data.email });
    return { error: "invalid", email };
  }
  await createSession(user.id, !user.totpEnabled, h.get("user-agent"));
  await db.update(staffUsers).set({ lastLoginAt: new Date() }).where(eq(staffUsers.id, user.id));
  await audit(user.id, "login", "staff_user", user.id);
  redirect(user.totpEnabled ? "/admin/login/verify" : "/admin");
}

export async function verifyCode(_prev: LoginState, form: FormData): Promise<LoginState> {
  const session = await getSession();
  if (!session) redirect("/admin/login");
  if (!(await rateLimit(`totp:${session.user.id}`, 6, 300))) return { error: "tooMany" };
  const [user] = await db.select().from(staffUsers).where(eq(staffUsers.id, session.user.id));
  if (!user?.totpSecret || !verifyTotp(user.totpSecret, String(form.get("code") ?? ""))) {
    await audit(session.user.id, "totp_failed", "staff_user", session.user.id);
    return { error: "badCode" };
  }
  await markMfaPassed(session.id);
  redirect("/admin");
}

export async function logout() {
  await destroySession();
  redirect("/admin/login");
}
