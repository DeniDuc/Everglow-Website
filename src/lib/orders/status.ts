/**
 * Order lifecycle (pure, shared by server and client).
 *
 * draft → quote_sent → reserved → ready → out → returned → closed
 * Cancelled is reachable until the items go out; cancelled orders can be restored as drafts.
 * "Late" is not a status: an order that is still out after its return time.
 */
export const orderStatuses = [
  "draft",
  "quote_sent",
  "reserved",
  "ready",
  "out",
  "returned",
  "closed",
  "cancelled",
] as const;
export type OrderStatus = (typeof orderStatuses)[number];

const transitions: Record<OrderStatus, OrderStatus[]> = {
  draft: ["quote_sent", "reserved", "cancelled"],
  quote_sent: ["reserved", "draft", "cancelled"],
  reserved: ["ready", "out", "cancelled"],
  ready: ["out", "reserved", "cancelled"],
  out: ["returned"],
  returned: ["closed", "out"],
  closed: ["returned"],
  cancelled: ["draft"],
};

export function nextStatuses(from: OrderStatus): OrderStatus[] {
  return transitions[from];
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return transitions[from].includes(to);
}

/** Statuses whose items block stock. Drafts and quotes only when the owner turned that on. */
export function holdsStock(status: OrderStatus, quotesHoldStock: boolean): boolean {
  if (status === "reserved" || status === "ready" || status === "out") return true;
  return quotesHoldStock && (status === "draft" || status === "quote_sent");
}

/** Items, dates and prices can change until the order goes out. */
export function isEditable(status: OrderStatus): boolean {
  return status === "draft" || status === "quote_sent" || status === "reserved" || status === "ready";
}

export function isLate(order: { status: OrderStatus; endsAt: Date }, now: Date): boolean {
  return order.status === "out" && order.endsAt.getTime() < now.getTime();
}

export const statusTone: Record<OrderStatus, "grey" | "green" | "blue" | "amber" | "red"> = {
  draft: "grey",
  quote_sent: "amber",
  reserved: "blue",
  ready: "blue",
  out: "green",
  returned: "grey",
  closed: "grey",
  cancelled: "red",
};

/** Customer balance state for list badges. */
export function paymentState(totalCents: number, paidCents: number): "paid" | "partial" | "unpaid" | "overpaid" {
  if (totalCents <= 0 && paidCents <= 0) return "paid";
  if (paidCents > totalCents) return "overpaid";
  if (paidCents === totalCents) return "paid";
  return paidCents > 0 ? "partial" : "unpaid";
}
