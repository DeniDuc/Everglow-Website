import { eq } from "drizzle-orm";
import type { Db, Tx } from "@/db";
import { customers } from "@/db/schema";
import { blindIndex } from "@/lib/crypto";
import type { NewCustomerInput } from "@/lib/orders/schema";

/** Addresses are stored as encrypted JSON `{ lines: string[] }`. */
export function addressText(json: string | null | undefined, separator = ", "): string {
  if (!json) return "";
  try {
    const parsed = JSON.parse(json) as { lines?: string[] };
    return (parsed.lines ?? []).filter((l) => l && l !== "Email").join(separator);
  } catch {
    return json;
  }
}

export function addressJson(text: string): string | null {
  const lines = text
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.length ? JSON.stringify({ lines }) : null;
}

/** Create a client, or return the existing one with the same email. */
export async function createCustomer(
  conn: Db | Tx,
  input: NewCustomerInput,
): Promise<{ id: string; existed: boolean }> {
  const email = input.email || null;
  if (email) {
    const [found] = await conn
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.emailHash, blindIndex(email)));
    if (found) return { id: found.id, existed: true };
  }
  const [row] = await conn
    .insert(customers)
    .values({
      name: input.name,
      email,
      emailHash: email ? blindIndex(email) : null,
      phone: input.phone || null,
      company: input.company || null,
      address: addressJson(input.address),
      notes: input.notes || null,
      source: input.source,
    })
    .returning({ id: customers.id });
  return { id: row.id, existed: false };
}

export async function updateCustomer(conn: Db | Tx, id: string, input: NewCustomerInput) {
  const email = input.email || null;
  await conn
    .update(customers)
    .set({
      name: input.name,
      email,
      emailHash: email ? blindIndex(email) : null,
      phone: input.phone || null,
      company: input.company || null,
      address: addressJson(input.address),
      notes: input.notes || null,
      source: input.source,
    })
    .where(eq(customers.id, id));
}
