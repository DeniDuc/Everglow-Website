import { z } from "zod";

/** What staff edit on an order. Shared by the admin editor (client) and the server actions. */

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Pick a time");
const money = z.number().int().min(-10_000_000).max(10_000_000);

export const orderLineInput = z
  .object({
    /** product/service: priced from the catalogue; custom: free text with its own price (negative = discount). */
    kind: z.enum(["product", "service", "custom"]),
    variantId: z.string().uuid().nullable(),
    title: z.string().trim().max(200),
    quantity: z.number().int().min(1).max(100_000),
    /** Custom lines: the unit price. Catalogue lines: a manual override (null = catalogue price). */
    unitCents: money.nullable(),
    overrideReason: z.string().trim().max(300).default(""),
  })
  .superRefine((l, ctx) => {
    if (l.kind === "custom") {
      if (!l.title) ctx.addIssue({ code: "custom", path: ["title"], message: "Enter a description" });
      if (l.unitCents == null) ctx.addIssue({ code: "custom", path: ["unitCents"], message: "Enter a price" });
    } else if (!l.variantId) {
      ctx.addIssue({ code: "custom", path: ["variantId"], message: "Pick a product" });
    }
  });
export type OrderLineInput = z.infer<typeof orderLineInput>;

export const orderDraft = z.object({
  customerId: z.string().uuid().nullable(),
  startDate: ymd,
  startTime: hhmm,
  endDate: ymd,
  endTime: hhmm,
  fulfillment: z.enum(["pickup", "delivery"]),
  /** null = use the suggested tier. */
  deliveryTierId: z.string().uuid().nullable(),
  outOfTownKm: z.number().int().min(0).max(2000),
  deliveryAddress: z.string().trim().max(500),
  deliveryNotes: z.string().trim().max(2000),
  damageProtection: z.boolean(),
  discountBp: z.number().int().min(0).max(10000),
  internalNotes: z.string().trim().max(5000),
  lines: z.array(orderLineInput).max(200),
});
export type OrderDraft = z.infer<typeof orderDraft>;

export const newCustomerInput = z.object({
  name: z.string().trim().min(1, "Enter a name").max(200),
  email: z.union([z.literal(""), z.string().trim().toLowerCase().email("Check the email")]),
  phone: z.string().trim().max(50),
  company: z.string().trim().max(200),
  address: z.string().trim().max(500),
  notes: z.string().trim().max(5000),
  source: z.enum(["website", "facebook_marketplace", "phone", "referral", "walk_in", "other"]),
});
export type NewCustomerInput = z.infer<typeof newCustomerInput>;

export const paymentInput = z.object({
  kind: z.enum(["payment", "refund"]),
  method: z.enum(["card", "etransfer", "cash", "cheque", "credit", "other"]),
  amountCents: z.number().int().min(1, "Enter an amount").max(10_000_000),
  reference: z.string().trim().max(200),
  receivedDate: ymd,
});
export type PaymentInput = z.infer<typeof paymentInput>;

export function issuesText(error: z.ZodError): string {
  return error.issues.map((i) => i.message).join("; ");
}
