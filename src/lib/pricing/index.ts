/**
 * Pricing engine: pure functions, no I/O. The same breakdown is used by the product page,
 * cart, checkout, admin orders, quotes, invoices and emails.
 *
 * Rounding: all amounts are integer cents. Percentages are basis points (bp, 10000 = 100%)
 * and are rounded half-up to the cent once per computed amount (never per unit).
 */
import { TZDate } from "@date-fns/tz";
import { subDays } from "date-fns";

export const DAY_MS = 24 * 60 * 60 * 1000;

export type PriceType = "structure" | "daily" | "fixed" | "free";

export type PriceRule = {
  priceType: PriceType;
  basePriceCents: number;
  /** "Up to N days at one price" for structure pricing. */
  periodDays: number;
  /** Price per day beyond `periodDays`; null = use the global extra-day %. */
  extraDayPriceCents: number | null;
};

/** Half-up rounding of `amount * bp / 10000` for non-negative integers. */
export function applyBp(amountCents: number, bp: number): number {
  if (amountCents < 0) return -applyBp(-amountCents, bp);
  return Math.floor((amountCents * bp + 5000) / 10000);
}

/** Started 24h periods between pickup and return, at least 1. Three hours = 1 day. */
export function rentalDays(startsAt: Date, endsAt: Date): number {
  const ms = endsAt.getTime() - startsAt.getTime();
  if (ms <= 0) return 1;
  return Math.max(1, Math.ceil(ms / DAY_MS));
}

export function extraDayPrice(rule: PriceRule, extraDayBp: number): number {
  return rule.extraDayPriceCents ?? applyBp(rule.basePriceCents, extraDayBp);
}

/** Price of one unit for the given rental length. */
export function unitPrice(rule: PriceRule, days: number, extraDayBp: number): number {
  switch (rule.priceType) {
    case "free":
      return 0;
    case "fixed":
      return rule.basePriceCents;
    case "daily":
      return rule.basePriceCents * days;
    case "structure": {
      const extraDays = Math.max(0, days - Math.max(1, rule.periodDays));
      return rule.basePriceCents + extraDays * extraDayPrice(rule, extraDayBp);
    }
  }
}

/** Short label shown next to a price, e.g. "Up to 3 days" or "per day". */
export function priceLabel(rule: Pick<PriceRule, "priceType" | "periodDays">): string {
  switch (rule.priceType) {
    case "structure":
      return rule.periodDays === 1 ? "per day" : `up to ${rule.periodDays} days`;
    case "daily":
      return "per day";
    case "fixed":
      return "each";
    case "free":
      return "free";
  }
}

export type QuoteLineInput = {
  key: string;
  title: string;
  kind: "product" | "service" | "custom" | "fee";
  quantity: number;
  rule: PriceRule;
  /** Staff override of the unit price (already validated and audited by the caller). */
  overrideUnitCents?: number | null;
  /** Rental items count toward the damage protection base. */
  damageProtection: boolean;
  /** Line is affected by order-level discounts. */
  discountable?: boolean;
};

export type TaxRate = { name: string; rateBp: number };

export type QuoteInput = {
  lines: QuoteLineInput[];
  startsAt: Date;
  endsAt: Date;
  /** Booking moment (for the rush rule). */
  now: Date;
  timezone: string;
  delivery: { method: "pickup" } | { method: "delivery"; tierPriceCents: number; outOfTownKm: number };
  damageProtection: boolean;
  discountBp: number;
  taxRates: TaxRate[];
  pricesIncludeTax: boolean;
  rules: {
    extraDayBp: number;
    damageProtectionBp: number;
    perKmCents: number;
    depositBp: number;
    nonRefundableBp: number;
    rushThresholdDays: number;
    balanceDueDaysBefore: number;
  };
};

export type QuoteLine = {
  key: string;
  title: string;
  kind: QuoteLineInput["kind"];
  quantity: number;
  unitCents: number;
  totalCents: number;
  overridden: boolean;
};

export type Quote = {
  days: number;
  lines: QuoteLine[];
  /** Sum of all item lines before discount. */
  subtotalCents: number;
  discountCents: number;
  damageProtectionBaseCents: number;
  damageProtectionCents: number;
  deliveryCents: number;
  deliveryKmCents: number;
  taxes: { name: string; cents: number }[];
  taxCents: number;
  totalCents: number;
  /** True when the event is inside the rush window: full prepayment. */
  rush: boolean;
  depositBp: number;
  depositCents: number;
  balanceCents: number;
  /** When the remaining balance is due (null when nothing remains). */
  balanceDueAt: Date | null;
  nonRefundableCents: number;
};

export function computeQuote(input: QuoteInput): Quote {
  const { rules } = input;
  const days = rentalDays(input.startsAt, input.endsAt);

  const lines: QuoteLine[] = input.lines.map((l) => {
    const quantity = Math.max(0, Math.trunc(l.quantity));
    const overridden = l.overrideUnitCents != null;
    const unitCents = overridden ? l.overrideUnitCents! : unitPrice(l.rule, days, rules.extraDayBp);
    return {
      key: l.key,
      title: l.title,
      kind: l.kind,
      quantity,
      unitCents,
      totalCents: unitCents * quantity,
      overridden,
    };
  });

  const subtotalCents = sum(lines.map((l) => l.totalCents));
  const discountableCents = sum(lines.filter((_, i) => input.lines[i].discountable !== false).map((l) => l.totalCents));
  const discountCents = applyBp(discountableCents, input.discountBp);

  // Damage protection: % of the rental items, after the order discount (owner: rentals only, not delivery).
  const dpEligible = sum(lines.filter((_, i) => input.lines[i].damageProtection).map((l) => l.totalCents));
  const dpEligibleDiscount = discountableCents > 0 ? Math.round((discountCents * dpEligible) / discountableCents) : 0;
  const damageProtectionBaseCents = Math.max(0, dpEligible - dpEligibleDiscount);
  const damageProtectionCents = input.damageProtection
    ? applyBp(damageProtectionBaseCents, rules.damageProtectionBp)
    : 0;

  let deliveryCents = 0;
  let deliveryKmCents = 0;
  if (input.delivery.method === "delivery") {
    deliveryKmCents = Math.max(0, Math.round(input.delivery.outOfTownKm)) * rules.perKmCents;
    deliveryCents = input.delivery.tierPriceCents + deliveryKmCents;
  }

  const taxableCents = subtotalCents - discountCents + damageProtectionCents + deliveryCents;
  const taxes = input.taxRates.map((t) => ({
    name: t.name,
    cents: input.pricesIncludeTax
      ? taxableCents - Math.round((taxableCents * 10000) / (10000 + t.rateBp))
      : applyBp(taxableCents, t.rateBp),
  }));
  const taxCents = sum(taxes.map((t) => t.cents));
  const totalCents = input.pricesIncludeTax ? taxableCents : taxableCents + taxCents;

  const msToStart = input.startsAt.getTime() - input.now.getTime();
  const rush = msToStart < rules.rushThresholdDays * DAY_MS;
  const depositBp = rush ? 10000 : rules.depositBp;
  const depositCents = applyBp(totalCents, depositBp);
  const balanceCents = totalCents - depositCents;
  const balanceDueAt =
    balanceCents > 0 ? subDays(new TZDate(input.startsAt.getTime(), input.timezone), rules.balanceDueDaysBefore) : null;

  return {
    days,
    lines,
    subtotalCents,
    discountCents,
    damageProtectionBaseCents,
    damageProtectionCents,
    deliveryCents,
    deliveryKmCents,
    taxes,
    taxCents,
    totalCents,
    rush,
    depositBp,
    depositCents,
    balanceCents,
    balanceDueAt: balanceDueAt ? new Date(balanceDueAt.getTime()) : null,
    nonRefundableCents: applyBp(totalCents, rules.nonRefundableBp),
  };
}

export type CancellationTier = {
  /** Applies when the customer cancels at least this many hours before delivery/pickup. */
  minHoursBefore: number;
  /** Share of the payments beyond the non-refundable part that is refunded to the card. */
  refundBp: number;
  /** Share of the payments beyond the non-refundable part given as credit for a future rental. */
  creditBp: number;
  /** How long the credit can be used; 0 = no limit. */
  creditValidMonths: number;
  /** The customer still owes the full order total (e.g. cancellation under 72 hours). */
  fullBalanceDue: boolean;
  label: string;
};

export type CancellationOutcome = {
  tier: CancellationTier | null;
  hoursBefore: number;
  /** Kept by the business: the non-refundable part (capped at what was paid). */
  keptCents: number;
  refundCents: number;
  creditCents: number;
  /** Still owed by the customer after cancelling (only for "full balance due" tiers). */
  balanceDueCents: number;
};

/**
 * What happens to the money when a customer cancels (Terms & Conditions, section 13).
 * The tier is picked by whole hours between the cancellation and the start of the rental.
 * The non-refundable part of the order total is always kept; the rest of what was paid is
 * refunded and/or credited according to the tier. Staff confirm before anything is processed.
 */
export function cancellationOutcome(input: {
  paidCents: number;
  totalCents: number;
  startsAt: Date;
  cancelledAt: Date;
  tiers: CancellationTier[];
  nonRefundableBp: number;
}): CancellationOutcome {
  const hoursBefore = Math.floor((input.startsAt.getTime() - input.cancelledAt.getTime()) / (60 * 60 * 1000));
  const tier =
    [...input.tiers].sort((a, b) => b.minHoursBefore - a.minHoursBefore).find((t) => hoursBefore >= t.minHoursBefore) ??
    null;
  const paid = Math.max(0, input.paidCents);
  const keptCents = Math.min(paid, applyBp(input.totalCents, input.nonRefundableBp));
  const beyond = paid - keptCents;
  if (!tier) return { tier, hoursBefore, keptCents: paid, refundCents: 0, creditCents: 0, balanceDueCents: 0 };
  const refundCents = applyBp(beyond, tier.refundBp);
  const creditCents = Math.min(beyond - refundCents, applyBp(beyond, tier.creditBp));
  return {
    tier,
    hoursBefore,
    keptCents: paid - refundCents - creditCents,
    refundCents,
    creditCents,
    balanceDueCents: tier.fullBalanceDue ? Math.max(0, input.totalCents - paid) : 0,
  };
}

export type DeliveryTierOption = {
  id: string;
  code: string;
  priceCents: number;
  maxPoints: number | null;
  position: number;
};

/**
 * Suggest the delivery tier from the cart: the smallest tier whose point limit fits
 * the cart and that is at least as large as every item's minimum tier. Staff can override.
 */
export function suggestDeliveryTier(
  items: { points: number; quantity: number; minTierCode: string | null }[],
  tiers: DeliveryTierOption[],
): DeliveryTierOption | null {
  const sorted = [...tiers].sort((a, b) => a.position - b.position);
  if (sorted.length === 0) return null;
  const points = sum(items.map((i) => i.points * i.quantity));
  const minIndex = Math.max(
    0,
    ...items.map((i) => (i.minTierCode ? sorted.findIndex((t) => t.code === i.minTierCode) : 0)),
  );
  for (let i = minIndex; i < sorted.length; i++) {
    const t = sorted[i];
    if (t.maxPoints == null || points <= t.maxPoints) return t;
  }
  return sorted[sorted.length - 1];
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
