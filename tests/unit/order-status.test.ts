import { describe, expect, it } from "vitest";
import { canTransition, holdsStock, isEditable, isLate, nextStatuses, paymentState } from "@/lib/orders/status";

describe("order lifecycle", () => {
  it("follows draft → reserved → ready → out → returned → closed", () => {
    expect(canTransition("draft", "reserved")).toBe(true);
    expect(canTransition("reserved", "ready")).toBe(true);
    expect(canTransition("ready", "out")).toBe(true);
    expect(canTransition("out", "returned")).toBe(true);
    expect(canTransition("returned", "closed")).toBe(true);
  });

  it("can't skip handover or cancel items that are already out", () => {
    expect(canTransition("draft", "returned")).toBe(false);
    expect(canTransition("out", "cancelled")).toBe(false);
    expect(nextStatuses("out")).toEqual(["returned"]);
  });

  it("restores cancelled bookings only as drafts", () => {
    expect(nextStatuses("cancelled")).toEqual(["draft"]);
  });

  it("holds stock while reserved, ready or out; drafts only when the owner says so", () => {
    expect(holdsStock("reserved", false)).toBe(true);
    expect(holdsStock("out", false)).toBe(true);
    expect(holdsStock("returned", false)).toBe(false);
    expect(holdsStock("draft", false)).toBe(false);
    expect(holdsStock("quote_sent", true)).toBe(true);
    expect(holdsStock("cancelled", true)).toBe(false);
  });

  it("locks items once the order is out", () => {
    expect(isEditable("ready")).toBe(true);
    expect(isEditable("out")).toBe(false);
    expect(isEditable("cancelled")).toBe(false);
  });

  it("flags late returns", () => {
    const endsAt = new Date("2026-11-22T16:00:00Z");
    expect(isLate({ status: "out", endsAt }, new Date("2026-11-22T16:01:00Z"))).toBe(true);
    expect(isLate({ status: "returned", endsAt }, new Date("2026-11-23T00:00:00Z"))).toBe(false);
    expect(isLate({ status: "out", endsAt }, new Date("2026-11-22T15:59:00Z"))).toBe(false);
  });

  it("describes the payment state", () => {
    expect(paymentState(13200, 13200)).toBe("paid");
    expect(paymentState(13200, 6600)).toBe("partial");
    expect(paymentState(13200, 0)).toBe("unpaid");
    expect(paymentState(13200, 14000)).toBe("overpaid");
  });
});
