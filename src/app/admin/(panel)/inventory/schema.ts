import { z } from "zod";

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and dashes");

const money = z.number().int().min(0).max(100_000_000);

export const productInput = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  slug: slugSchema,
  descriptionHtml: z.string().max(100_000),
  productType: z.enum(["rental", "service", "bundle"]),
  trackingType: z.enum(["bulk", "trackable", "none"]),
  priceType: z.enum(["structure", "daily", "fixed", "free"]),
  periodDays: z.number().int().min(1).max(365),
  extraDayPriceCents: money.nullable(),
  securityDepositCents: money,
  requiresDelivery: z.boolean(),
  minDeliveryTier: z.string().nullable(),
  deliveryPoints: z.number().int().min(0).max(100_000),
  damageProtection: z.boolean(),
  bufferBeforeMinutes: z
    .number()
    .int()
    .min(0)
    .max(60 * 24 * 14),
  bufferAfterMinutes: z
    .number()
    .int()
    .min(0)
    .max(60 * 24 * 14),
  allowShortage: z.boolean(),
  showInStore: z.boolean(),
  featured: z.boolean(),
  sortingWeight: z.number().int(),
  tags: z.array(z.string().trim().min(1).max(40)).max(30),
  seoTitle: z.string().trim().max(120).nullable(),
  seoDescription: z.string().trim().max(320).nullable(),
  collectionIds: z.array(z.string().uuid()),
  photoOrder: z.array(z.string().uuid()),
  stockConfirmed: z.boolean(),
  variants: z
    .array(
      z.object({
        id: z.string().uuid().nullable(),
        name: z.string().trim().min(1).max(200),
        options: z.array(z.string().trim().min(1).max(60)).max(5),
        sku: z.string().trim().max(80).nullable(),
        basePriceCents: money,
        stockQuantity: z.number().int().min(0).max(1_000_000),
      }),
    )
    .min(1),
});
export type ProductInput = z.infer<typeof productInput>;
