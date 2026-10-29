"use server";

import { refresh } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, payments } from "@/db/schema";
import { audit, requireStaff } from "@/lib/auth/session";
import { ShortageError } from "@/lib/availability/db";
import { createCustomer } from "@/lib/customers";
import {
  issuesText,
  newCustomerInput,
  orderDraft,
  paymentInput,
  type NewCustomerInput,
  type OrderDraft,
  type PaymentInput,
} from "@/lib/orders/schema";
import {
  changeOrderStatus,
  deletePayment,
  OrderError,
  priceDraft,
  recordPayment,
  saveOrder,
} from "@/lib/orders/service";
import { orderStatuses, type OrderStatus } from "@/lib/orders/status";
import { loadSettings } from "@/lib/settings";

export type Shortage = { variantId: string; requested: number; available: number };
export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string; shortages?: Shortage[] };

export type Preview = {
  quote: {
    days: number;
    lines: { key: string; unitCents: number; totalCents: number; overridden: boolean }[];
    subtotalCents: number;
    discountCents: number;
    damageProtectionCents: number;
    deliveryCents: number;
    deliveryKmCents: number;
    taxes: { name: string; cents: number }[];
    totalCents: number;
    rush: boolean;
    depositCents: number;
    balanceCents: number;
    balanceDueAt: string | null;
  };
  tier: { id: string; name: string; priceCents: number } | null;
  suggestedTierId: string | null;
  requiresDelivery: boolean;
  available: Record<string, number | null>;
  shortages: Shortage[];
  periodWarnings: string[];
};

function fail(e: unknown): { ok: false; error: string; shortages?: Shortage[] } {
  if (e instanceof ShortageError)
    return { ok: false, error: "Not enough stock for these dates.", shortages: e.shortages };
  if (e instanceof OrderError) return { ok: false, error: e.message };
  throw e;
}

/** Live price + availability while staff edit (nothing is written). */
export async function previewOrder(
  draft: OrderDraft,
  orderId: string | null,
): Promise<ActionResult<{ preview: Preview }>> {
  await requireStaff("editOrders");
  const parsed = orderDraft.safeParse(draft);
  if (!parsed.success) return { ok: false, error: issuesText(parsed.error) };
  const now = new Date();
  let bookedAt = now;
  if (orderId) {
    const [o] = await db.select({ createdAt: orders.createdAt }).from(orders).where(eq(orders.id, orderId));
    if (o) bookedAt = o.createdAt;
  }
  const p = await priceDraft(db, parsed.data, { now, bookedAt, orderId: orderId ?? undefined });
  const q = p.quote;
  return {
    ok: true,
    preview: {
      quote: {
        days: q.days,
        lines: q.lines.map((l) => ({
          key: l.key,
          unitCents: l.unitCents,
          totalCents: l.totalCents,
          overridden: l.overridden,
        })),
        subtotalCents: q.subtotalCents,
        discountCents: q.discountCents,
        damageProtectionCents: q.damageProtectionCents,
        deliveryCents: q.deliveryCents,
        deliveryKmCents: q.deliveryKmCents,
        taxes: q.taxes,
        totalCents: q.totalCents,
        rush: q.rush,
        depositCents: q.depositCents,
        balanceCents: q.balanceCents,
        balanceDueAt: q.balanceDueAt?.toISOString() ?? null,
      },
      tier: p.tier,
      suggestedTierId: p.suggestedTierId,
      requiresDelivery: p.requiresDelivery,
      available: p.available,
      shortages: p.shortages,
      periodWarnings: p.periodWarnings,
    },
  };
}

export async function createOrder(input: {
  draft: OrderDraft;
  status: "draft" | "reserved";
  allowOverbook: boolean;
  newCustomer: NewCustomerInput | null;
}): Promise<ActionResult<{ id: string; number: number }>> {
  const user = await requireStaff("editOrders");
  const parsed = orderDraft.safeParse(input.draft);
  if (!parsed.success) return { ok: false, error: issuesText(parsed.error) };
  let customer: NewCustomerInput | null = null;
  if (input.newCustomer) {
    const c = newCustomerInput.safeParse(input.newCustomer);
    if (!c.success) return { ok: false, error: issuesText(c.error) };
    customer = c.data;
  }
  try {
    const res = await db.transaction(async (tx) => {
      const draft = { ...parsed.data };
      if (customer) draft.customerId = (await createCustomer(tx, customer)).id;
      return saveOrder(tx, {
        draft,
        status: input.status,
        actorId: user.id,
        allowOverbook: input.allowOverbook,
        source: customer?.source ?? "phone",
      });
    });
    await audit(user.id, "order.create", "order", res.id, {
      number: res.number,
      status: input.status,
      overbooked: res.overbooked,
    });
    refresh();
    return { ok: true, id: res.id, number: res.number };
  } catch (e) {
    return fail(e);
  }
}

export async function updateOrder(input: {
  orderId: string;
  draft: OrderDraft;
  allowOverbook: boolean;
}): Promise<ActionResult> {
  const user = await requireStaff("editOrders");
  const parsed = orderDraft.safeParse(input.draft);
  if (!parsed.success) return { ok: false, error: issuesText(parsed.error) };
  try {
    const res = await db.transaction((tx) =>
      saveOrder(tx, {
        orderId: input.orderId,
        draft: parsed.data,
        actorId: user.id,
        allowOverbook: input.allowOverbook,
      }),
    );
    const overrides = parsed.data.lines
      .filter((l) => l.kind !== "custom" && l.unitCents != null)
      .map((l) => ({ variantId: l.variantId, unitCents: l.unitCents, reason: l.overrideReason }));
    await audit(user.id, "order.update", "order", input.orderId, {
      overbooked: res.overbooked,
      ...(overrides.length ? { priceOverrides: overrides } : {}),
    });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setOrderStatus(input: {
  orderId: string;
  to: OrderStatus;
  idChecked?: boolean;
  allowOverbook?: boolean;
}): Promise<ActionResult> {
  const user = await requireStaff("editOrders");
  if (!orderStatuses.includes(input.to)) return { ok: false, error: "Unknown status" };
  try {
    const res = await db.transaction((tx) =>
      changeOrderStatus(tx, {
        orderId: input.orderId,
        to: input.to,
        actorId: user.id,
        idChecked: input.idChecked,
        allowOverbook: input.allowOverbook,
      }),
    );
    await audit(user.id, "order.status", "order", input.orderId, {
      from: res.from,
      to: res.to,
      ...(input.idChecked ? { idChecked: true } : {}),
      ...(res.overbooked ? { overbooked: true } : {}),
    });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function addPayment(orderId: string, input: PaymentInput): Promise<ActionResult> {
  const user = await requireStaff("editOrders");
  const parsed = paymentInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: issuesText(parsed.error) };
  const settings = await loadSettings(db);
  const { payment } = await db.transaction((tx) =>
    recordPayment(tx, {
      orderId,
      payment: parsed.data,
      actorId: user.id,
      timezone: settings.business.timezone,
    }),
  );
  await audit(user.id, `payment.${payment.kind}`, "order", orderId, {
    amountCents: payment.amountCents,
    method: payment.method,
  });
  refresh();
  return { ok: true };
}

export async function removePayment(paymentId: string): Promise<ActionResult> {
  const user = await requireStaff("editOrders");
  const [p] = await db.select().from(payments).where(eq(payments.id, paymentId));
  if (!p) return { ok: false, error: "Payment not found" };
  if (p.method === "booqable") return { ok: false, error: "Imported Booqable payments can't be deleted." };
  await db.transaction((tx) => deletePayment(tx, paymentId));
  await audit(user.id, "payment.delete", "order", p.orderId, {
    kind: p.kind,
    amountCents: p.amountCents,
    method: p.method,
  });
  refresh();
  return { ok: true };
}
