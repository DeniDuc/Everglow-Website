/**
 * Availability engine (pure). The database layer (./db.ts) loads claims and calls these
 * functions inside a locked transaction; the storefront and admin use the same code.
 *
 * Ranges are half-open [start, end): a booking returned at 10:00 and another picked up
 * at 10:00 do not overlap (buffers are added on top of that).
 */
import { TZDate } from "@date-fns/tz";

export type Range = { start: number; end: number };
export type Claim = Range & { quantity: number };

export const MINUTE_MS = 60 * 1000;

export function toRange(start: Date, end: Date): Range {
  return { start: start.getTime(), end: end.getTime() };
}

/** The period a booking blocks stock: pickup minus prep buffer → return plus turnaround buffer. */
export function blockRange(start: Date, end: Date, bufferBeforeMinutes: number, bufferAfterMinutes: number): Range {
  return {
    start: start.getTime() - bufferBeforeMinutes * MINUTE_MS,
    end: end.getTime() + bufferAfterMinutes * MINUTE_MS,
  };
}

export function overlaps(a: Range, b: Range): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Highest number of units claimed at the same moment inside `window`.
 * Claims that do not overlap each other are not added up (sweep line).
 */
export function peakUsage(claims: Claim[], window: Range): number {
  const events: [number, number][] = [];
  for (const c of claims) {
    if (c.quantity <= 0 || !overlaps(c, window)) continue;
    events.push([Math.max(c.start, window.start), c.quantity]);
    events.push([Math.min(c.end, window.end), -c.quantity]);
  }
  // Ends before starts at the same instant (half-open ranges).
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let current = 0;
  let peak = 0;
  for (const [, delta] of events) {
    current += delta;
    if (current > peak) peak = current;
  }
  return peak;
}

/** Units of one variant still free during `window` (may be negative when overbooked). */
export function availableQuantity(input: {
  stock: number;
  claims: Claim[];
  downtimes: Claim[];
  window: Range;
}): number {
  return input.stock - peakUsage([...input.claims, ...input.downtimes], input.window);
}

/** A bundle is available as many times as its scarcest component allows. */
export function bundleAvailability(components: { available: number; perBundle: number }[]): number {
  if (components.length === 0) return 0;
  return Math.max(0, Math.min(...components.map((c) => Math.floor(c.available / Math.max(1, c.perBundle)))));
}

export type PeriodRules = {
  timezone: string;
  minNoticeHours: number;
  maxAdvanceDays: number;
  openTime: string;
  closeTime: string;
  blackoutDates: string[];
};

export type PeriodError =
  | "end_before_start"
  | "too_soon"
  | "too_far"
  | "outside_hours_start"
  | "outside_hours_end"
  | "blackout_start"
  | "blackout_end";

export const periodErrorMessages: Record<PeriodError, string> = {
  end_before_start: "Return must be after pickup.",
  too_soon: "This pickup time is too soon. Please choose a later date or call us.",
  too_far: "We can't take bookings that far ahead yet.",
  outside_hours_start: "Pickup time is outside our hours.",
  outside_hours_end: "Return time is outside our hours.",
  blackout_start: "We're closed on the pickup date.",
  blackout_end: "We're closed on the return date.",
};

/** Local calendar date (YYYY-MM-DD) and minutes after midnight in the business time zone. */
export function localParts(at: Date, timezone: string): { date: string; minutes: number } {
  const d = new TZDate(at.getTime(), timezone);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { date, minutes: d.getHours() * 60 + d.getMinutes() };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Customer-side checks on a rental period. Staff can book outside these rules. */
export function validatePeriod(start: Date, end: Date, now: Date, rules: PeriodRules): PeriodError[] {
  const errors: PeriodError[] = [];
  if (end.getTime() <= start.getTime()) errors.push("end_before_start");
  if (start.getTime() < now.getTime() + rules.minNoticeHours * 60 * MINUTE_MS) errors.push("too_soon");
  if (start.getTime() > now.getTime() + rules.maxAdvanceDays * 24 * 60 * MINUTE_MS) errors.push("too_far");
  const open = toMinutes(rules.openTime);
  const close = toMinutes(rules.closeTime);
  const s = localParts(start, rules.timezone);
  const e = localParts(end, rules.timezone);
  if (s.minutes < open || s.minutes > close) errors.push("outside_hours_start");
  if (e.minutes < open || e.minutes > close) errors.push("outside_hours_end");
  const blackout = new Set(rules.blackoutDates);
  if (blackout.has(s.date)) errors.push("blackout_start");
  if (blackout.has(e.date)) errors.push("blackout_end");
  return errors;
}

/** Build a UTC instant from a local date + time in the business time zone (DST-safe). */
export function zonedDateTime(date: string, time: string, timezone: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  return new Date(new TZDate(y, mo - 1, d, h, mi, 0, timezone).getTime());
}
