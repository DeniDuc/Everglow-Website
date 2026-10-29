import "server-only";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { rateLimitHits } from "@/db/schema";

/**
 * Sliding-window limiter backed by Postgres (works across serverless instances).
 * Returns true when the action is allowed and records the hit.
 */
export async function rateLimit(bucket: string, max: number, windowSeconds: number): Promise<boolean> {
  const since = new Date(Date.now() - windowSeconds * 1000);
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(rateLimitHits)
    .where(and(eq(rateLimitHits.bucket, bucket), gt(rateLimitHits.at, since)));
  if (n >= max) return false;
  await db.insert(rateLimitHits).values({ bucket });
  // Opportunistic cleanup of old rows.
  if (Math.random() < 0.02)
    await db.delete(rateLimitHits).where(lt(rateLimitHits.at, new Date(Date.now() - 86_400_000)));
  return true;
}

/** Client IP from proxy headers (Vercel sets x-forwarded-for). Hashed before use as a key. */
export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}
