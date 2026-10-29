import { z } from "zod";

/**
 * Every business rule the owner can change lives here, stored in the `settings` table
 * (one row per top-level key). Defaults come from the live site FAQ and the owner's answers
 * (see DECISIONS.md). Pure module: safe to import from tests and client code.
 */

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const businessSchema = z.object({
  name: z.string(),
  legalName: z.string(),
  tagline: z.string(),
  street: z.string(),
  city: z.string(),
  province: z.string(),
  postalCode: z.string(),
  country: z.string(),
  phone: z.string(),
  email: z.string(),
  facebookUrl: z.string(),
  instagramUrl: z.string(),
  timezone: z.string(),
  currency: z.string(),
});

export const bookingSchema = z.object({
  /** Earliest bookable start, in hours from now. */
  minNoticeHours: z.number().int().min(0),
  maxAdvanceDays: z.number().int().min(1),
  /** Pickup / return times customers can choose (local time). */
  openTime: hhmm,
  closeTime: hhmm,
  slotMinutes: z.number().int().min(15),
  defaultPickupTime: hhmm,
  defaultReturnTime: hhmm,
  /** Turnaround between rentals added after each booking unless the product sets its own. */
  defaultBufferAfterMinutes: z.number().int().min(0),
  /** How long items stay held while a customer is in checkout. */
  cartHoldMinutes: z.number().int().min(1),
  /** Whether draft/quote orders block stock. */
  quotesHoldStock: z.boolean(),
});

export const paymentsSchema = z.object({
  depositBp: z.number().int().min(0).max(10000),
  /** Part of the order total that is never refunded once the deposit is paid. */
  nonRefundableBp: z.number().int().min(0).max(10000),
  /** Event closer than this many days: 100% prepayment. */
  rushThresholdDays: z.number().int().min(0),
  balanceDueDaysBefore: z.number().int().min(0),
  reminderDaysBefore: z.array(z.number().int().min(0)),
  /** Days before the event when the saved card may be charged automatically. */
  autoChargeDaysBefore: z.array(z.number().int().min(0)),
  autoChargeEnabled: z.boolean(),
});

export const pricingSchema = z.object({
  defaultPeriodDays: z.number().int().min(1),
  /** Extra-day price when a product has none set: % of the base price per extra day. */
  extraDayBp: z.number().int().min(0),
  damageProtectionBp: z.number().int().min(0).max(10000),
  damageProtectionDefaultOn: z.boolean(),
  taxesEnabled: z.boolean(),
  pricesIncludeTax: z.boolean(),
});

export const deliverySchema = z.object({
  perKmCents: z.number().int().min(0),
  originAddress: z.string(),
  /** Text shown with delivery orders. */
  deliveryNote: z.string(),
});

export const cancellationTierSchema = z.object({
  /** Applies when the cancellation happens at least this many days before the event. */
  minDaysBefore: z.number().int().min(0),
  /** Share of the amount paid that is refunded (before the non-refundable part). */
  refundBp: z.number().int().min(0).max(10000),
  label: z.string(),
});
export const cancellationSchema = z.object({ tiers: z.array(cancellationTierSchema) });

export const settingsSchemas = {
  business: businessSchema,
  booking: bookingSchema,
  payments: paymentsSchema,
  pricing: pricingSchema,
  delivery: deliverySchema,
  cancellation: cancellationSchema,
} as const;

export type SettingsKey = keyof typeof settingsSchemas;
export type Settings = { [K in SettingsKey]: z.infer<(typeof settingsSchemas)[K]> };

export const defaultSettings: Settings = {
  business: {
    name: "Everglow Events & Tents",
    legalName: "EVERGLOW EVENTS & TENTS INC.",
    tagline: "Saving parties one chair at a time!",
    street: "43 Jim Smith Drive",
    city: "Winnipeg",
    province: "MB",
    postalCode: "R2G 3Y9",
    country: "CA",
    phone: "(431) 337-7021",
    email: "eventseverglow@gmail.com",
    facebookUrl: "https://www.facebook.com/eventseverglow/",
    instagramUrl: "https://www.instagram.com/everglow.event",
    timezone: "America/Winnipeg",
    currency: "CAD",
  },
  booking: {
    minNoticeHours: 24,
    maxAdvanceDays: 540,
    openTime: "08:00",
    closeTime: "21:00",
    slotMinutes: 30,
    defaultPickupTime: "10:00",
    defaultReturnTime: "10:00",
    defaultBufferAfterMinutes: 120,
    cartHoldMinutes: 15,
    quotesHoldStock: false,
  },
  payments: {
    depositBp: 5000,
    nonRefundableBp: 2500,
    rushThresholdDays: 14,
    balanceDueDaysBefore: 14,
    reminderDaysBefore: [21, 14, 7],
    autoChargeDaysBefore: [14, 7],
    autoChargeEnabled: false,
  },
  pricing: {
    defaultPeriodDays: 3,
    extraDayBp: 3333,
    damageProtectionBp: 1000,
    damageProtectionDefaultOn: true,
    taxesEnabled: false,
    pricesIncludeTax: false,
  },
  delivery: {
    perKmCents: 400,
    originAddress: "43 Jim Smith Drive, Winnipeg, MB R2G 3Y9",
    deliveryNote:
      "All standard deliveries are curbside. We contact you the Sunday before your event with exact delivery times.",
  },
  cancellation: {
    tiers: [
      { minDaysBefore: 30, refundBp: 10000, label: "30+ days before the event" },
      { minDaysBefore: 0, refundBp: 0, label: "Less than 30 days before the event" },
    ],
  },
};
