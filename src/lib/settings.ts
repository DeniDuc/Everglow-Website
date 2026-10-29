import { inArray } from "drizzle-orm";
import type { Db, Tx } from "@/db";
import { settings } from "@/db/schema";
import { defaultSettings, settingsSchemas, type Settings, type SettingsKey } from "./settings-schema";

export { defaultSettings, type Settings, type SettingsKey };

/** Read all settings, filling anything missing or invalid from the defaults. */
export async function loadSettings(db: Db | Tx): Promise<Settings> {
  const keys = Object.keys(settingsSchemas) as SettingsKey[];
  const rows = await db.select().from(settings).where(inArray(settings.key, keys));
  const out = structuredClone(defaultSettings) as Settings;
  for (const row of rows) {
    const key = row.key as SettingsKey;
    const schema = settingsSchemas[key];
    const merged = { ...(defaultSettings[key] as object), ...(row.value as object) };
    const parsed = schema.safeParse(merged);
    if (parsed.success) (out as Record<SettingsKey, unknown>)[key] = parsed.data;
  }
  return out;
}

export async function saveSetting<K extends SettingsKey>(db: Db | Tx, key: K, value: Settings[K]): Promise<void> {
  const parsed = settingsSchemas[key].parse(value);
  await db
    .insert(settings)
    .values({ key, value: parsed })
    .onConflictDoUpdate({ target: settings.key, set: { value: parsed, updatedAt: new Date() } });
}
