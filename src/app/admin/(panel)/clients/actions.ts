"use server";

import { refresh } from "next/cache";
import { db } from "@/db";
import { audit, requireStaff } from "@/lib/auth/session";
import { createCustomer, updateCustomer } from "@/lib/customers";
import { issuesText, newCustomerInput, type NewCustomerInput } from "@/lib/orders/schema";

export type ClientResult = { ok: true; id: string; existed: boolean } | { ok: false; error: string };

export async function saveClient(id: string | null, input: NewCustomerInput): Promise<ClientResult> {
  const user = await requireStaff("editOrders");
  const parsed = newCustomerInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: issuesText(parsed.error) };
  try {
    if (id) {
      await updateCustomer(db, id, parsed.data);
      // Field names only: the audit log never stores personal data.
      await audit(user.id, "customer.update", "customer", id);
      refresh();
      return { ok: true, id, existed: true };
    }
    const res = await createCustomer(db, parsed.data);
    if (!res.existed) await audit(user.id, "customer.create", "customer", res.id);
    return { ok: true, ...res };
  } catch (e) {
    // Unique blind index on the email.
    if ((e as { cause?: { code?: string } }).cause?.code === "23505" || (e as { code?: string }).code === "23505")
      return { ok: false, error: "Another client already uses this email." };
    throw e;
  }
}
