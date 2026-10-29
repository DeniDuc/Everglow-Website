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

function driver(): "local" | "supabase" {
  return process.env.STORAGE_DRIVER === "supabase" ? "supabase" : "local";
}

export async function putFile(folder: string, ext: string, body: Buffer, contentType: string): Promise<StoredFile> {
  const key = `${folder}/${new Date().toISOString().slice(0, 7)}/${randomToken(12)}.${ext}`;
  if (driver() === "local") {
    const full = path.join(process.cwd(), "public", "uploads", key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
    return { key, url: `/uploads/${key}` };
  }
  const base = process.env.SUPABASE_URL!.replace(/\/$/, "");
  const bucket = process.env.SUPABASE_BUCKET ?? "media";
  const res = await fetch(`${base}/storage/v1/object/${bucket}/${key}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
    body: new Uint8Array(body),
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
  return { key, url: `${base}/storage/v1/object/public/${bucket}/${key}` };
}

export async function deleteFile(url: string): Promise<void> {
  if (url.startsWith("/uploads/")) {
    await unlink(path.join(process.cwd(), "public", url)).catch(() => {});
    return;
  }
  const base = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const bucket = process.env.SUPABASE_BUCKET ?? "media";
  const prefix = `${base}/storage/v1/object/public/${bucket}/`;
  if (base && url.startsWith(prefix)) {
    await fetch(`${base}/storage/v1/object/${bucket}/${url.slice(prefix.length)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
    });
  }
}
