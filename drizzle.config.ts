import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
import { databaseUrl } from "./src/db/url";

config({ path: ".env.local" });

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: databaseUrl("migrations")! },
  strict: true,
});
