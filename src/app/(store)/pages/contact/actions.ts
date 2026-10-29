"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import { customers, inquiries } from "@/db/schema";
import { blindIndex, sha256 } from "@/lib/crypto";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { eq } from "drizzle-orm";

const schema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(120),
  email: z.string().trim().email("Please enter a valid email").max(200),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  message: z.string().trim().min(10, "Tell us a little more (10+ characters)").max(5000),
  // Honeypot: real people never fill this hidden field.
  company: z.string().max(0).optional().or(z.literal("")),
});

export type ContactState = { ok: boolean; errors?: Partial<Record<keyof z.infer<typeof schema>, string>>; message?: string };

export async function sendInquiry(_prev: ContactState, form: FormData): Promise<ContactState> {
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const errors: ContactState["errors"] = {};
    for (const issue of parsed.error.issues) errors[issue.path[0] as keyof typeof errors] ??= issue.message;
    if (errors.company) return { ok: true }; // bot: pretend success
    return { ok: false, errors };
  }
  const ip = sha256(clientIp(await headers()));
  if (!(await rateLimit(`contact:${ip}`, 5, 3600))) {
    return { ok: false, message: "Too many messages. Please call us instead." };
  }
  const { name, email, phone, message } = parsed.data;
  const emailHash = blindIndex(email);
  await db.transaction(async (tx) => {
    let [customer] = await tx.select({ id: customers.id }).from(customers).where(eq(customers.emailHash, emailHash));
    if (!customer) {
      [customer] = await tx
        .insert(customers)
        .values({ name, email, emailHash, phone: phone || null, source: "website", tags: ["inquiry"] })
        .returning({ id: customers.id });
    }
    await tx.insert(inquiries).values({ customerId: customer.id, name, email, phone: phone || null, message });
  });
  // Staff email alert is sent once email delivery is configured (phase 6).
  return { ok: true };
}
