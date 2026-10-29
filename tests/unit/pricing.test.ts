import { describe, expect, it } from "vitest";
import { localParts, zonedDateTime } from "@/lib/availability/engine";
import { defaultSettings } from "@/lib/settings-schema";
import {
  applyBp,
  cancellationOutcome,
  computeQuote,
  rentalDays,
  suggestDeliveryTier,
  unitPrice,
  type PriceRule,
  type QuoteInput,
  type QuoteLineInput,
} from "@/lib/pricing";

const TZ = "America/Winnipeg";
const rules: QuoteInput["rules"] = {
  extraDayBp: 3333,
  damageProtectionBp: 1000,
  perKmCents: 400,
  depositBp: 5000,
  nonRefundableBp: 2500,
  rushThresholdDays: 14,
  balanceDueDaysBefore: 14,
};
const structure = (cents: number, extra: number | null = null): PriceRule => ({
  priceType: "structure",
  basePriceCents: cents,
  periodDays: 3,
  extraDayPriceCents: extra,
});
const rental = (key: string, cents: number, quantity: number): QuoteLineInput => ({
  key,
  title: key,
  kind: "product",
  quantity,
  rule: structure(cents),
  damageProtection: true,
});

function quote(partial: Partial<QuoteInput> & Pick<QuoteInput, "lines">) {
  return computeQuote({
    startsAt: zonedDateTime("2026-11-20", "19:00", TZ),
    endsAt: zonedDateTime("2026-11-22", "19:00", TZ),
    now: zonedDateTime("2026-10-14", "13:09", TZ),
    timezone: TZ,
    delivery: { method: "pickup" },
    damageProtection: true,
    discountBp: 0,
    taxRates: [],
    pricesIncludeTax: false,
    rules,
    ...partial,
  });
}

describe("money helpers", () => {
  it("rounds basis points half-up to the cent", () => {
    expect(applyBp(12000, 1000)).toBe(1200);
    expect(applyBp(105, 5000)).toBe(53); // 52.5 → 53
    expect(applyBp(1, 3333)).toBe(0);
    expect(applyBp(-105, 5000)).toBe(-53);
  });

  it("counts started 24h periods, minimum one", () => {
    const s = new Date("2026-06-01T15:00:00Z");
    expect(rentalDays(s, new Date("2026-06-01T18:00:00Z"))).toBe(1); // 3 hours
    expect(rentalDays(s, new Date("2026-06-04T15:00:00Z"))).toBe(3); // exactly 72h
    expect(rentalDays(s, new Date("2026-06-04T15:01:00Z"))).toBe(4);
  });

  it("prices by rule", () => {
    expect(unitPrice(structure(20000), 1, 3333)).toBe(20000);
    expect(unitPrice(structure(20000), 3, 3333)).toBe(20000);
    // 2 extra days at 33.33% of $200 = $66.66 each
    expect(unitPrice(structure(20000), 5, 3333)).toBe(20000 + 2 * 6666);
    expect(unitPrice(structure(20000, 5000), 5, 3333)).toBe(30000);
    expect(unitPrice({ ...structure(1500), priceType: "daily" }, 4, 3333)).toBe(6000);
    expect(unitPrice({ ...structure(3000), priceType: "fixed" }, 9, 3333)).toBe(3000);
    expect(unitPrice({ ...structure(3000), priceType: "free" }, 9, 3333)).toBe(0);
  });
});

describe("computeQuote", () => {
  it("matches Booqable order #139: 10 round tables, damage protection 10%", () => {
    const q = quote({ lines: [rental("round-table-5ft", 1200, 10)] });
    expect(q.days).toBe(2);
    expect(q.subtotalCents).toBe(12000);
    expect(q.damageProtectionCents).toBe(1200);
    expect(q.totalCents).toBe(13200);
    expect(q.rush).toBe(false);
    expect(q.depositCents).toBe(6600);
    expect(q.balanceCents).toBe(6600);
  });

  it("20x20 tent + 5 tables + 50 chairs with medium delivery: protection only on rentals", () => {
    const q = quote({
      lines: [rental("tent", 65000, 1), rental("table6", 1000, 5), rental("chair", 190, 50)],
      delivery: { method: "delivery", tierPriceCents: 12000, outOfTownKm: 0 },
    });
    expect(q.subtotalCents).toBe(79500);
    expect(q.damageProtectionCents).toBe(7950);
    expect(q.deliveryCents).toBe(12000);
    expect(q.totalCents).toBe(99450);
    expect(q.depositCents).toBe(49725);
    expect(q.balanceCents).toBe(49725);
  });

  it("customer declines damage protection", () => {
    const q = quote({ lines: [rental("tent", 65000, 1)], damageProtection: false });
    expect(q.damageProtectionCents).toBe(0);
    expect(q.totalCents).toBe(65000);
  });

  it("charges out-of-town km on top of the tier", () => {
    const q = quote({
      lines: [rental("chair", 190, 10)],
      delivery: { method: "delivery", tierPriceCents: 8000, outOfTownKm: 25 },
    });
    expect(q.deliveryKmCents).toBe(10000);
    expect(q.deliveryCents).toBe(18000);
  });

  it("applies the discount before damage protection", () => {
    const q = quote({ lines: [rental("x", 10000, 1)], discountBp: 1000 });
    expect(q.discountCents).toBe(1000);
    expect(q.damageProtectionCents).toBe(900);
    expect(q.totalCents).toBe(9900);
  });

  it("services are not part of the damage protection base", () => {
    const q = quote({
      lines: [
        rental("x", 10000, 1),
        {
          key: "setup",
          title: "Setup",
          kind: "service",
          quantity: 1,
          rule: { ...structure(3000), priceType: "fixed" },
          damageProtection: false,
        },
      ],
    });
    expect(q.subtotalCents).toBe(13000);
    expect(q.damageProtectionCents).toBe(1000);
    expect(q.totalCents).toBe(14000);
  });

  it("uses manual unit price overrides", () => {
    const q = quote({ lines: [{ ...rental("x", 10000, 2), overrideUnitCents: 7500 }] });
    expect(q.lines[0]).toMatchObject({ unitCents: 7500, totalCents: 15000, overridden: true });
  });

  it("adds taxes when enabled (excluded) and extracts them when prices include tax", () => {
    const excl = quote({ lines: [rental("x", 10000, 1)], taxRates: [{ name: "GST", rateBp: 500 }] });
    expect(excl.taxCents).toBe(550);
    expect(excl.totalCents).toBe(11550);
    const incl = quote({
      lines: [rental("x", 10000, 1)],
      taxRates: [{ name: "GST", rateBp: 500 }],
      pricesIncludeTax: true,
    });
    expect(incl.totalCents).toBe(11000);
    expect(incl.taxCents).toBe(524); // 11000 - 11000/1.05
  });

  it("requires 100% prepayment inside the rush window, 50% outside", () => {
    const startsAt = zonedDateTime("2026-11-20", "10:00", TZ);
    const rush = quote({
      lines: [rental("x", 10000, 1)],
      startsAt,
      endsAt: zonedDateTime("2026-11-21", "10:00", TZ),
      now: zonedDateTime("2026-11-07", "10:01", TZ),
    });
    expect(rush.rush).toBe(true);
    expect(rush.depositCents).toBe(rush.totalCents);
    expect(rush.balanceDueAt).toBeNull();
    const edge = quote({
      lines: [rental("x", 10000, 1)],
      startsAt,
      endsAt: zonedDateTime("2026-11-21", "10:00", TZ),
      now: zonedDateTime("2026-11-06", "10:00", TZ),
    });
    expect(edge.rush).toBe(false);
    expect(edge.depositCents).toBe(5500);
  });

  it("sets the balance due date 14 local days before, across the DST change", () => {
    // Across the 2025-11-02 fall-back the due date stays at 10:00 local time.
    const q = quote({
      lines: [rental("x", 10000, 1)],
      startsAt: zonedDateTime("2025-11-10", "10:00", TZ),
      endsAt: zonedDateTime("2025-11-11", "10:00", TZ),
      now: zonedDateTime("2025-09-01", "12:00", TZ),
    });
    expect(localParts(q.balanceDueAt!, TZ)).toEqual({ date: "2025-10-27", minutes: 600 });
  });

  it("reports the non-refundable 25%", () => {
    const q = quote({ lines: [rental("x", 10000, 1)] });
    expect(q.nonRefundableCents).toBe(2750);
  });
});

describe("cancellationOutcome (Terms section 13)", () => {
  const tiers = defaultSettings.cancellation.tiers;
  const startsAt = new Date("2026-12-31T16:00:00Z");
  const run = (paidCents: number, cancelledAt: string) =>
    cancellationOutcome({
      paidCents,
      totalCents: 100000,
      startsAt,
      cancelledAt: new Date(cancelledAt),
      tiers,
      nonRefundableBp: 2500,
    });

  it("more than 14 days before: 25% kept, the rest of the deposit becomes credit, no cash refund", () => {
    const r = run(50000, "2026-12-01T16:00:00Z");
    expect(r.keptCents).toBe(25000);
    expect(r.creditCents).toBe(25000);
    expect(r.refundCents).toBe(0);
    expect(r.balanceDueCents).toBe(0);
  });
  it("between 72 hours and 14 days: 50% credit of payments beyond the 25%", () => {
    const r = run(100000, "2026-12-20T16:00:00Z");
    expect(r.creditCents).toBe(37500);
    expect(r.keptCents).toBe(62500);
    expect(r.tier?.creditValidMonths).toBe(6);
  });
  it("less than 72 hours: no credit and the full balance is still owed", () => {
    const r = run(50000, "2026-12-30T16:00:00Z");
    expect(r.creditCents).toBe(0);
    expect(r.keptCents).toBe(50000);
    expect(r.balanceDueCents).toBe(50000);
  });
  it("exactly 72 hours before still counts as the 72h–14d tier", () => {
    expect(run(50000, "2026-12-28T16:00:00Z").creditCents).toBe(12500);
  });
  it("never credits more than was paid above the non-refundable part", () => {
    const r = run(10000, "2026-10-01T16:00:00Z");
    expect(r.keptCents).toBe(10000);
    expect(r.creditCents).toBe(0);
  });
});

describe("suggestDeliveryTier", () => {
  const tiers = [
    { id: "s", code: "small", priceCents: 8000, maxPoints: 60, position: 1 },
    { id: "m", code: "medium", priceCents: 12000, maxPoints: 200, position: 2 },
    { id: "l", code: "large", priceCents: 20000, maxPoints: null, position: 3 },
  ];
  it("fits small orders into small", () => {
    expect(suggestDeliveryTier([{ points: 1, quantity: 50, minTierCode: null }], tiers)?.code).toBe("small");
  });
  it("respects an item's minimum tier", () => {
    expect(suggestDeliveryTier([{ points: 40, quantity: 1, minTierCode: "medium" }], tiers)?.code).toBe("medium");
  });
  it("moves up when the cart is bigger", () => {
    expect(suggestDeliveryTier([{ points: 1, quantity: 250, minTierCode: null }], tiers)?.code).toBe("large");
  });
});
