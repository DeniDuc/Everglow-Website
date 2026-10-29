import "server-only";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomToken } from "@/lib/crypto";

/**
 * File storage for uploaded media. `local` writes to public/uploads (development only —
 * serverless hosts have a read-only disk). `supabase` uses Supabase Storage (public bucket for
 * product photos). Configure with STORAGE_DRIVER, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_BUCKET.
 */

export type StoredFile = { url: string; key: string };

function supabaseUrl(): string | undefined {
  return (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)?.replace(/\/$/, "");
}

function driver(): "local" | "supabase" {
  if (process.env.STORAGE_DRIVER) return process.env.STORAGE_DRIVER === "supabase" ? "supabase" : "local";
  return supabaseUrl() && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)
    ? "supabase"
    : "local";
}

/**
 * Auth headers for Supabase Storage. Accepts the legacy `service_role` JWT and the newer
 * `sb_secret_…` secret key (which is only valid in the `apikey` header).
 */
function authHeaders(): Record<string, string> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? "";
  return key.startsWith("eyJ") ? { apikey: key, Authorization: `Bearer ${key}` } : { apikey: key };
}

/** Create the public media bucket the first time it is needed. */
async function ensureBucket(base: string, bucket: string) {
  await fetch(`${base}/storage/v1/bucket`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ id: bucket, name: bucket, public: true, file_size_limit: 20 * 1024 * 1024 }),
  });
}

export async function putFile(folder: string, ext: string, body: Buffer, contentType: string): Promise<StoredFile> {
  const key = `${folder}/${new Date().toISOString().slice(0, 7)}/${randomToken(12)}.${ext}`;
  if (driver() === "local") {
    const full = path.join(process.cwd(), "public", "uploads", key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
    return { key, url: `/uploads/${key}` };
  }
  const base = supabaseUrl()!;
  const bucket = process.env.SUPABASE_BUCKET ?? "media";
  const upload = () =>
    fetch(`${base}/storage/v1/object/${bucket}/${key}`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
      body: new Uint8Array(body),
    });
  let res = await upload();
  if (!res.ok && (res.status === 404 || res.status === 400)) {
    await ensureBucket(base, bucket);
    res = await upload();
  }
  if (!res.ok) throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
  return { key, url: `${base}/storage/v1/object/public/${bucket}/${key}` };
}

export async function deleteFile(url: string): Promise<void> {
  if (url.startsWith("/uploads/")) {
    await unlink(path.join(process.cwd(), "public", url)).catch(() => {});
    return;
  }
  const base = supabaseUrl();
  const bucket = process.env.SUPABASE_BUCKET ?? "media";
  const prefix = `${base}/storage/v1/object/public/${bucket}/`;
  if (base && url.startsWith(prefix)) {
    await fetch(`${base}/storage/v1/object/${bucket}/${url.slice(prefix.length)}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
  }
}
