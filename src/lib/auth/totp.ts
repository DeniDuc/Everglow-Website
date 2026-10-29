import { Secret, TOTP } from "otpauth";

/** Authenticator-app codes (Google Authenticator, 1Password, Authy…). */

export function newTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

export function totpUri(secret: string, email: string): string {
  return new TOTP({ issuer: "Everglow Admin", label: email, secret: Secret.fromBase32(secret) }).toString();
}

export function verifyTotp(secret: string, code: string): boolean {
  const token = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(token)) return false;
  const delta = new TOTP({ secret: Secret.fromBase32(secret) }).validate({ token, window: 1 });
  return delta !== null;
}
