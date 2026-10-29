import { hash, verify } from "@node-rs/argon2";

// Argon2id with OWASP-recommended parameters (19 MiB, 2 iterations).
const options = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, options);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/** Minimum bar for staff passwords; the UI explains it in plain words. */
export function passwordProblem(password: string): string | null {
  if (password.length < 12) return "Use at least 12 characters.";
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) return "Mix letters and numbers.";
  return null;
}
