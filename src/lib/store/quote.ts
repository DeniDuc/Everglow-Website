import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { blackoutDates, deliveryTiers, products, productVariants, taxRates } from "@/db/schema";
import { productAvailability, variantAvailability } from "@/lib/availability/db";
import { validatePeriod, type PeriodError } from "@/lib/availability/engine";
import { computeQuote, suggestDeliveryTier, type PriceType, type Quote } from "@/lib/pricing";
import { loadSettings } from "@/lib/settings";

export const cartQuoteInput = z.object({
  start: z.coerce.date(),
  end: z.coerce.date(),
  items: z.array(z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(1).max(10000) })).max(100),
  fulfillment: z.enum(["pickup", "delivery"]).default("pickup"),
  outOfTownKm: z.number().int().min(0).max(2000).default(0),
  damageProtection: z.boolean().default(true),
});
export type CartQuoteInput = z.infer<typeof cartQuoteInput>;

export type CartQuote = {
  quote: Quote;
  periodErrors: PeriodError[];
  /** Units free per variant for the period (excluding nothing: this is the public view). */
  available: Record<string, number>;
  unavailable: { variantId: string; requested: number; available: number }[];
  requiresDelivery: boolean;
  deliveryTier: { id: string; code: string; name: string; priceCents: number; description: string | null } | null;
  missingVariantIds: string[];
};

/** Authoritative cart pricing + availability for the storefront (same engines as admin). */
export async function quoteCart(input: CartQuoteInput, now = new Date()): Promise<CartQuote> {
  const settings = await loadSettings(db);
  const ids = [...new Set(input.items.map((i) => i.variantId))];
  const rows = ids.length
    ? await db
        .select({ variant: productVariants, product: products })
        .from(productVariants)
        .innerJoin(products, eq(products.id, productVariants.productId))
        .where(
          and(
            inArray(productVariants.id, ids),
            isNull(productVariants.archivedAt),
            isNull(products.archivedAt),
            eq(products.showInStore, true),
          ),
        )
    : [];
  const byId = new Map(rows.map((r) => [r.variant.id, r]));
  const items = input.items.filter((i) => byId.has(i.variantId));

  const blackouts = (await db.select({ date: blackoutDates.date }).from(blackoutDates)).map((b) => b.date);
  const periodErrors = validatePeriod(input.start, input.end, now, {
    timezone: settings.business.timezone,
    minNoticeHours: settings.booking.minNoticeHours,
    maxAdvanceDays: settings.booking.maxAdvanceDays,
    openTime: settings.booking.openTime,
    closeTime: settings.booking.closeTime,
    blackoutDates: blackouts,
  });

  const available = Object.fromEntries(
    await variantAvailability(db, ids, input.start, input.end, {
      now,
      defaultBufferAfter: settings.booking.defaultBufferAfterMinutes,
    }),
  );
  const unavailable = items
    .map((i) => ({
      variantId: i.variantId,
      requested: i.quantity,
      available: Math.max(0, available[i.variantId] ?? 0),
    }))
    .filter((u) => u.requested > u.available);

  const requiresDelivery = items.some((i) => byId.get(i.variantId)!.product.requiresDelivery);
  const fulfillment = requiresDelivery ? "delivery" : input.fulfillment;

  const tiers = await db.select().from(deliveryTiers).where(eq(deliveryTiers.active, true));
  const suggested = suggestDeliveryTier(
    items.map((i) => {
      const p = byId.get(i.variantId)!.product;
      return { points: p.deliveryPoints, quantity: i.quantity, minTierCode: p.minDeliveryTier };
    }),
    tiers,
  );
  const tier = suggested ? tiers.find((t) => t.id === suggested.id)! : null;

  const activeTaxes = settings.pricing.taxesEnabled
    ? await db.select().from(taxRates).where(eq(taxRates.active, true))
    : [];

  const quote = computeQuote({
    lines: items.map((i) => {
      const { variant, product } = byId.get(i.variantId)!;
      return {
        key: variant.id,
        title: variant.name,
        kind: product.productType === "service" ? "service" : "product",
        quantity: i.quantity,
        rule: {
          priceType: product.priceType as PriceType,
          basePriceCents: variant.basePriceCents,
          periodDays: product.periodDays,
          extraDayPriceCents: product.extraDayPriceCents,
        },
        damageProtection: product.productType !== "service" && product.damageProtection,
      };
    }),
    startsAt: input.start,
    endsAt: input.end,
    now,
    timezone: settings.business.timezone,
    delivery:
      fulfillment === "delivery" && tier
        ? { method: "delivery", tierPriceCents: tier.priceCents, outOfTownKm: input.outOfTownKm }
        : { method: "pickup" },
    damageProtection: input.damageProtection,
    discountBp: 0,
    taxRates: activeTaxes.map((t) => ({ name: t.name, rateBp: t.rateBp })),
    pricesIncludeTax: settings.pricing.pricesIncludeTax,
    rules: {
      extraDayBp: settings.pricing.extraDayBp,
      damageProtectionBp: settings.pricing.damageProtectionBp,
      perKmCents: settings.delivery.perKmCents,
      depositBp: settings.payments.depositBp,
      nonRefundableBp: settings.payments.nonRefundableBp,
      rushThresholdDays: settings.payments.rushThresholdDays,
      balanceDueDaysBefore: settings.payments.balanceDueDaysBefore,
    },
  });

  return {
    quote,
    periodErrors,
    available,
    unavailable,
    requiresDelivery,
    deliveryTier: tier
      ? { id: tier.id, code: tier.code, name: tier.name, priceCents: tier.priceCents, description: tier.description }
      : null,
    missingVariantIds: ids.filter((id) => !byId.has(id)),
  };
}

/** Public availability per product for a period (used by product cards). */
export async function storeAvailability(productIds: string[], start: Date, end: Date, now = new Date()) {
  const settings = await loadSettings(db);
  return productAvailability(db, productIds, start, end, {
    now,
    defaultBufferAfter: settings.booking.defaultBufferAfterMinutes,
  });
}
