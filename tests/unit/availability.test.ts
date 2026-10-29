import { describe, expect, it } from "vitest";
import {
  availableQuantity,
  blockRange,
  bundleAvailability,
  peakUsage,
  validatePeriod,
  zonedDateTime,
  type PeriodRules,
} from "@/lib/availability/engine";

const H = 60 * 60 * 1000;
const at = (h: number) => Date.UTC(2026, 5, 1) + h * H;
const claim = (s: number, e: number, quantity: number) => ({ start: at(s), end: at(e), quantity });
const win = (s: number, e: number) => ({ start: at(s), end: at(e) });

describe("availability engine", () => {
  it("back-to-back bookings do not overlap (half-open ranges)", () => {
    expect(availableQuantity({ stock: 1, claims: [claim(0, 10, 1)], downtimes: [], window: win(10, 20) })).toBe(1);
    expect(availableQuantity({ stock: 1, claims: [claim(0, 10, 1)], downtimes: [], window: win(9, 20) })).toBe(0);
  });

  it("turnaround buffer blocks a pickup right after a return", () => {
    const returnAt = new Date(at(10));
    const existing = blockRange(new Date(at(0)), returnAt, 0, 120);
    const next = blockRange(new Date(at(11)), new Date(at(20)), 0, 120);
    expect(availableQuantity({ stock: 1, claims: [{ ...existing, quantity: 1 }], downtimes: [], window: next })).toBe(0);
    const later = blockRange(new Date(at(12)), new Date(at(20)), 0, 120);
    expect(availableQuantity({ stock: 1, claims: [{ ...existing, quantity: 1 }], downtimes: [], window: later })).toBe(1);
  });

  it("uses peak usage, not the sum of separate bookings", () => {
    expect(peakUsage([claim(0, 5, 1), claim(10, 15, 1)], win(0, 20))).toBe(1);
    expect(peakUsage([claim(0, 12, 1), claim(10, 15, 1)], win(0, 20))).toBe(2);
    expect(availableQuantity({ stock: 2, claims: [claim(0, 5, 1), claim(10, 15, 1)], downtimes: [], window: win(0, 20) })).toBe(1);
  });

  it("downtime removes stock", () => {
    expect(availableQuantity({ stock: 120, claims: [claim(0, 48, 50)], downtimes: [claim(10, 30, 20)], window: win(12, 24) })).toBe(50);
  });

  it("ignores partial-day claims outside the window", () => {
    expect(availableQuantity({ stock: 3, claims: [claim(0, 2, 3), claim(30, 40, 3)], downtimes: [], window: win(2, 30) })).toBe(3);
  });

  it("bundle availability is limited by the scarcest component", () => {
    expect(bundleAvailability([{ available: 3, perBundle: 1 }, { available: 50, perBundle: 8 }])).toBe(3);
    expect(bundleAvailability([{ available: 10, perBundle: 1 }, { available: 15, perBundle: 8 }])).toBe(1);
    expect(bundleAvailability([{ available: -1, perBundle: 1 }])).toBe(0);
  });
});

describe("validatePeriod", () => {
  const TZ = "America/Winnipeg";
  const rules: PeriodRules = {
    timezone: TZ,
    minNoticeHours: 24,
    maxAdvanceDays: 365,
    openTime: "08:00",
    closeTime: "21:00",
    blackoutDates: ["2026-12-25"],
  };
  const now = zonedDateTime("2026-11-01", "12:00", TZ);

  it("accepts a normal weekend", () => {
    expect(validatePeriod(zonedDateTime("2026-11-06", "10:00", TZ), zonedDateTime("2026-11-08", "18:00", TZ), now, rules)).toEqual([]);
  });
  it("flags short notice, bad order, hours and blackout days", () => {
    expect(validatePeriod(zonedDateTime("2026-11-01", "18:00", TZ), zonedDateTime("2026-11-02", "10:00", TZ), now, rules)).toContain("too_soon");
    expect(validatePeriod(zonedDateTime("2026-11-08", "10:00", TZ), zonedDateTime("2026-11-06", "10:00", TZ), now, rules)).toContain("end_before_start");
    expect(validatePeriod(zonedDateTime("2026-11-06", "06:30", TZ), zonedDateTime("2026-11-06", "22:00", TZ), now, rules)).toEqual(
      expect.arrayContaining(["outside_hours_start", "outside_hours_end"]),
    );
    expect(validatePeriod(zonedDateTime("2026-12-24", "10:00", TZ), zonedDateTime("2026-12-25", "10:00", TZ), now, rules)).toContain("blackout_end");
    expect(validatePeriod(zonedDateTime("2028-01-01", "10:00", TZ), zonedDateTime("2028-01-02", "10:00", TZ), now, rules)).toContain("too_far");
  });

  it("builds local times correctly on both sides of a DST change", () => {
    // Winnipeg: CDT (UTC-5) until 2026-11-01 02:00, then CST (UTC-6).
    expect(zonedDateTime("2026-10-31", "10:00", TZ).toISOString()).toBe("2026-10-31T15:00:00.000Z");
    expect(zonedDateTime("2026-11-02", "10:00", TZ).toISOString()).toBe("2026-11-02T16:00:00.000Z");
    // Spring forward: 2027-03-14.
    expect(zonedDateTime("2027-03-15", "10:00", TZ).toISOString()).toBe("2027-03-15T15:00:00.000Z");
  });
});
