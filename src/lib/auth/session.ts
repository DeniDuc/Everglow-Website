import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { and, eq, gt, lt } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { auditLog, staffSessions, staffUsers } from "@/db/schema";
import { randomToken, sha256 } from "@/lib/crypto";
import { loadSettings } from "@/lib/settings";
import { can, type Permission, type Role } from "./roles";

export const SESSION_COOKIE = "eg_admin";

export type StaffUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  locale: "en" | "ru";
  totpEnabled: boolean;
};

export async function createSession(userId: string, mfaPassed: boolean, userAgent: string | null) {
  const settings = await loadSettings(db);
  const token = randomToken();
  const expiresAt = new Date(Date.now() + settings.security.sessionIdleHours * 3600_000);
  await db
    .insert(staffSessions)
    .values({ id: sha256(token), userId, mfaPassed, expiresAt, userAgent: userAgent?.slice(0, 300) ?? null });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  // Housekeeping: drop expired sessions.
  await db.delete(staffSessions).where(lt(staffSessions.expiresAt, new Date()));
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(staffSessions).where(eq(staffSessions.id, sha256(token)));
  jar.delete(SESSION_COOKIE);
}

/** Current session (deduplicated per request). Slides the idle timeout forward. */
export const getSession = cache(async () => {
  // Session checks compare against the current time: always run at request time.
  await connection();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const id = sha256(token);
  const [row] = await db
    .select({ session: staffSessions, user: staffUsers })
    .from(staffSessions)
    .innerJoin(staffUsers, eq(staffUsers.id, staffSessions.userId))
    .where(and(eq(staffSessions.id, id), gt(staffSessions.expiresAt, new Date())));
  if (!row || row.user.disabled) return null;
  const now = Date.now();
  if (now - row.session.lastSeenAt.getTime() > 5 * 60_000) {
    const settings = await loadSettings(db);
    await db
      .update(staffSessions)
      .set({ lastSeenAt: new Date(now), expiresAt: new Date(now + settings.security.sessionIdleHours * 3600_000) })
      .where(eq(staffSessions.id, id));
  }
  const user: StaffUser = {
    id: row.user.id,
    email: row.user.email,
    name: row.user.name,
    role: row.user.role,
    locale: row.user.locale === "ru" ? "ru" : "en",
    totpEnabled: row.user.totpEnabled,
  };
  return { id, mfaPassed: row.session.mfaPassed, user };
});

/** Use at the top of every admin page and server action. */
export async function requireStaff(
  permission: Permission = "view",
  opts: { skip2faSetup?: boolean } = {},
): Promise<StaffUser> {
  const session = await getSession();
  if (!session) redirect("/admin/login");
  if (!session.mfaPassed) redirect("/admin/login/verify");
  if (!session.user.totpEnabled && !opts.skip2faSetup) {
    const settings = await loadSettings(db);
    if (settings.security.require2fa) redirect("/admin/account?setup2fa=required");
  }
  if (!can(session.user.role, permission)) redirect("/admin?denied=1");
  return session.user;
}

export async function markMfaPassed(sessionId: string) {
  await db.update(staffSessions).set({ mfaPassed: true }).where(eq(staffSessions.id, sessionId));
}

export async function audit(
  actorId: string | null,
  action: string,
  entity: string,
  entityId?: string | null,
  data?: unknown,
) {
  await db.insert(auditLog).values({ actorId, action, entity, entityId: entityId ?? null, data: data ?? null });
}
