import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");

// Reuse one pool across hot reloads in development.
const globalForDb = globalThis as unknown as { pg?: ReturnType<typeof postgres> };
const client =
  globalForDb.pg ??
  postgres(url, {
    max: process.env.NODE_ENV === "production" ? 5 : 10,
    // Supabase transaction pooler does not support prepared statements.
    prepare: !url.includes("pooler.supabase.com"),
  });
if (process.env.NODE_ENV !== "production") globalForDb.pg = client;

export const db = drizzle(client, { schema });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export { schema };
