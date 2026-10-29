/**
 * Database connection string. Works with a plain DATABASE_URL and with the variables the
 * Supabase ↔ Vercel integration creates (POSTGRES_URL = pooled, POSTGRES_URL_NON_POOLING = direct).
 */
export function databaseUrl(purpose: "app" | "migrations" = "app"): string | undefined {
  const raw =
    purpose === "migrations"
      ? (process.env.DATABASE_URL_DIRECT ??
        process.env.POSTGRES_URL_NON_POOLING ??
        process.env.DATABASE_URL ??
        process.env.POSTGRES_URL)
      : (process.env.DATABASE_URL ?? process.env.POSTGRES_URL);
  if (!raw) return undefined;
  // The integration appends parameters (e.g. "supa=base-pooler.x") that Postgres would reject as settings.
  const url = new URL(raw);
  for (const key of [...url.searchParams.keys()]) {
    if (!["sslmode", "connect_timeout", "application_name", "options"].includes(key)) url.searchParams.delete(key);
  }
  return url.toString();
}
