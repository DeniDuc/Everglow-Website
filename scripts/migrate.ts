/** Apply SQL migrations from ./drizzle. Usage: npm run db:migrate */
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { databaseUrl } from "../src/db/url";

config({ path: ".env.local" });

export async function runMigrations(url: string) {
  const client = postgres(url, { max: 1, onnotice: () => {} });
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  await client.end();
}

if (typeof require !== "undefined" && require.main === module) {
  const url = databaseUrl("migrations");
  if (!url) throw new Error("DATABASE_URL (or POSTGRES_URL_NON_POOLING) is not set");
  runMigrations(url).then(() => console.log("migrations applied"));
}
