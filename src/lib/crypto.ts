import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

/**
 * Field-level encryption for customer personal data (AES-256-GCM).
 *
 * Ciphertext format: `v1.<iv b64url>.<tag b64url>.<data b64url>`.
 * The version prefix lets us rotate keys later: add `ENCRYPTION_KEY_V2`, write with v2,
 * keep reading v1 until a re-encrypt job has migrated old rows.
 *
 * Lookups on encrypted columns (e.g. "find customer by email") use a blind index:
 * an HMAC of the normalized value, stored next to the ciphertext.
 */

const VERSION = "v1";

function key(name: string): Buffer {
  const raw = process.env[name];
  if (!raw) throw new Error(`${name} is not set (see .env.example)`);
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error(`${name} must be 32 bytes, base64-encoded`);
  return buf;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key("ENCRYPTION_KEY"), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), data.toString("base64url")].join(".");
}

export function decrypt(payload: string): string {
  const [version, iv, tag, data] = payload.split(".");
  if (version !== VERSION || !iv || !tag || data === undefined) {
    throw new Error("Unsupported ciphertext format");
  }
  const decipher = createDecipheriv("aes-256-gcm", key("ENCRYPTION_KEY"), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

/** Deterministic keyed hash for equality lookups on encrypted values. */
export function blindIndex(value: string): string {
  return createHmac("sha256", key("BLIND_INDEX_KEY")).update(value.trim().toLowerCase()).digest("base64url");
}

/** SHA-256 for tokens we only need to compare (session tokens, links). */
export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
