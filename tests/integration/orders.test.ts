import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, deliveryTiers, orderLines, orders, products, productVariants, reservations } from "@/db/schema";
import { ShortageError } from "@/lib/availability/db";
import type { OrderDraft } from "@/lib/orders/schema";
import {
  changeOrderStatus,
  deletePayment,
  draftFromOrder,
  OrderError,
  recordPayment,
  saveOrder,
} from "@/lib/orders/service";
import { runMigrations } from "../../scripts/migrate";

const now = new Date("2027-05-01T17:00:00Z");
const TZ = "America/Winnipeg";
let tent: string;
let chair: string;
let setupFee: string;
let customerId: string;

function draft(partial: Partial<OrderDraft> = {}): OrderDraft {
  return {
    customerId,
    startDate: "2027-07-09",
    startTime: "10:00",
    endDate: "2027-07-11",
    endTime: "10:00",
    fulfillment: "delivery",
    deliveryTierId: null,
    outOfTownKm: 0,
    deliveryAddress: "43 Jim Smith Drive",
    deliveryNotes: "",
    damageProtection: true,
    discountBp: 0,
    internalNotes: "Gate code 1234",
    lines: [
      { kind: "product", variantId: tent, title: "20x20 Tent", quantity: 1, unitCents: null, overrideReason: "" },
      { kind: "product", variantId: chair, title: "Chair", quantity: 50, unitCents: null, overrideReason: "" },
    ],
    ...partial,
  };
}

const save = (input: Omit<Parameters<typeof saveOrder>[1], "actorId" | "now">) =>
  db.transaction((tx) => saveOrder(tx, { actorId: null, now, ...input }));

const claimsOf = (orderId: string) => db.select().from(reservations).where(eq(reservations.orderId, orderId));

beforeAll(async () => {
  await runMigrations(process.env.DATABASE_URL!);
});

beforeEach(async () => {
  await db.execute(
    sql`truncate payments, reservations, downtimes, order_lines, orders, customers, product_variants, products, delivery_tiers, settings cascade`,
  );
  const mk = async (p: typeof products.$inferInsert, price: number, stock: number) => {
    const [row] = await db.insert(products).values(p).returning();
    const [v] = await db
      .insert(productVariants)
      .values({ productId: row.id, name: p.name, basePriceCents: price, stockQuantity: stock })
      .returning();
    return v.id;
  };
  tent = await mk({ slug: "tent", name: "20x20 Tent", deliveryPoints: 80, minDeliveryTier: "medium" }, 65000, 1);
  chair = await mk({ slug: "chair", name: "Chair", deliveryPoints: 1 }, 190, 100);
  setupFee = await mk(
    { slug: "setup", name: "Setup fee", productType: "service", trackingType: "none", priceType: "fixed" },
    3000,
    0,
  );
  await db.insert(deliveryTiers).values([
    { code: "small", name: "Small Delivery & Pickup", priceCents: 8000, maxPoints: 60, position: 1 },
    { code: "medium", name: "Medium Delivery & Pickup", priceCents: 12000, maxPoints: 200, position: 2 },
    { code: "large", name: "Large Delivery & Pickup", priceCents: 20000, maxPoints: null, position: 3 },
  ]);
  const [c] = await db.insert(customers).values({ name: "Test Client", phone: "+12045550000" }).returning();
  customerId = c.id;
});

describe("saveOrder", () => {
  it("prices like the cart, stores computed lines, and reserves stock for a reserved order", async () => {
    const { id } = await save({ draft: draft(), status: "reserved" });
    const [o] = await db.select().from(orders).where(eq(orders.id, id));
    // 650 + 50 × 1.90 = 745; protection 10% = 74.50; medium delivery 120 (tent needs medium).
    expect(o.subtotalCents).toBe(74500);
    expect(o.totalCents).toBe(74500 + 7450 + 12000);
    expect(o.depositDueCents).toBe(Math.round(o.totalCents / 2));
    expect(o.internalNotes).toBe("Gate code 1234");
    const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, id));
    expect(lines.map((l) => [l.kind, l.title, l.totalCents]).sort()).toEqual(
      [
        ["product", "20x20 Tent", 65000],
        ["product", "Chair", 9500],
        ["delivery", "Medium Delivery & Pickup", 12000],
        ["fee", "Damage Protection Plan 10%", 7450],
      ].sort(),
    );
    expect(lines.every((l) => l.kind !== "product" || l.productId)).toBe(true);
    const claims = await claimsOf(id);
    expect(claims.map((c) => c.quantity).sort((a, b) => a - b)).toEqual([1, 50]);
  });

  it("drafts don't hold stock; custom and service lines never reserve", async () => {
    const { id } = await save({
      draft: draft({
        lines: [
          {
            kind: "product",
            variantId: setupFee,
            title: "Setup fee",
            quantity: 1,
            unitCents: null,
            overrideReason: "",
          },
          {
            kind: "custom",
            variantId: null,
            title: "Arrange chairs",
            quantity: 1,
            unitCents: 4500,
            overrideReason: "",
          },
        ],
        fulfillment: "pickup",
      }),
      status: "draft",
    });
    expect(await claimsOf(id)).toHaveLength(0);
    await db.transaction((tx) => changeOrderStatus(tx, { orderId: id, to: "reserved", actorId: null, now }));
    expect(await claimsOf(id)).toHaveLength(0);
    const [o] = await db.select().from(orders).where(eq(orders.id, id));
    // Services and custom lines are outside damage protection.
    expect(o.totalCents).toBe(3000 + 4500);
  });

  it("refuses to double-book the last tent unless staff overbook", async () => {
    await save({ draft: draft(), status: "reserved" });
    await expect(save({ draft: draft(), status: "reserved" })).rejects.toBeInstanceOf(ShortageError);
    const { id, overbooked } = await save({ draft: draft(), status: "reserved", allowOverbook: true });
    expect(overbooked).toBe(true);
    expect((await db.select().from(orders).where(eq(orders.id, id)))[0].overbooked).toBe(true);
  });

  it("editing an order doesn't count its own reservation against itself", async () => {
    const { id } = await save({ draft: draft(), status: "reserved" });
    await expect(save({ orderId: id, draft: draft({ discountBp: 1000 }) })).resolves.toMatchObject({
      overbooked: false,
    });
    const [o] = await db.select().from(orders).where(eq(orders.id, id));
    expect(o.discountBp).toBe(1000);
  });

  it("applies price overrides and keeps the deposit rule of the booking date on edits", async () => {
    const { id } = await save({ draft: draft(), status: "reserved" });
    const later = new Date("2027-07-01T17:00:00Z"); // inside the 14-day rush window
    await db.transaction((tx) =>
      saveOrder(tx, {
        orderId: id,
        actorId: null,
        now: later,
        draft: draft({
          lines: [
            {
              kind: "product",
              variantId: tent,
              title: "20x20 Tent",
              quantity: 1,
              unitCents: 60000,
              overrideReason: "Repeat client",
            },
          ],
        }),
      }),
    );
    const [o] = await db.select().from(orders).where(eq(orders.id, id));
    const [line] = await db.select().from(orderLines).where(eq(orderLines.orderId, id)).limit(1);
    expect(line.overrideUnitPriceCents).toBe(60000);
    expect(line.overrideReason).toBe("Repeat client");
    expect(o.depositDueCents).toBe(Math.round(o.totalCents / 2)); // booked 10 weeks ahead: still 50%
  });

  it("round-trips through draftFromOrder", async () => {
    const d = draft({ discountBp: 500, outOfTownKm: 12 });
    const { id } = await save({ draft: d, status: "draft" });
    const [o] = await db.select().from(orders).where(eq(orders.id, id));
    const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, id));
    expect(draftFromOrder(o, lines, TZ)).toEqual(d);
  });

  it("locks items once the order is out", async () => {
    const { id } = await save({ draft: draft(), status: "reserved" });
    await db.transaction((tx) =>
      changeOrderStatus(tx, { orderId: id, to: "out", actorId: null, idChecked: true, now }),
    );
    await expect(save({ orderId: id, draft: draft() })).rejects.toBeInstanceOf(OrderError);
    const [o] = await db.select().from(orders).where(eq(orders.id, id));
    expect(o.idCheckedAt).not.toBeNull();
  });
});

describe("changeOrderStatus", () => {
  it("cancelling releases stock, restoring as a draft clears the cancellation", async () => {
    const { id } = await save({ draft: draft(), status: "reserved" });
    await db.transaction((tx) => changeOrderStatus(tx, { orderId: id, to: "cancelled", actorId: null, now }));
    expect(await claimsOf(id)).toHaveLength(0);
    expect((await db.select().from(orders).where(eq(orders.id, id)))[0].cancelledAt).not.toBeNull();
    await expect(save({ draft: draft(), status: "reserved" })).resolves.toBeTruthy();
    await db.transaction((tx) => changeOrderStatus(tx, { orderId: id, to: "draft", actorId: null, now }));
    expect((await db.select().from(orders).where(eq(orders.id, id)))[0].cancelledAt).toBeNull();
  });

  it("rejects transitions that skip the lifecycle", async () => {
    const { id } = await save({ draft: draft(), status: "draft" });
    await expect(
      db.transaction((tx) => changeOrderStatus(tx, { orderId: id, to: "returned", actorId: null, now })),
    ).rejects.toBeInstanceOf(OrderError);
  });

  it("reserving a draft whose tent is taken needs an overbook", async () => {
    await save({ draft: draft(), status: "reserved" });
    const { id } = await save({ draft: draft(), status: "draft" });
    await expect(
      db.transaction((tx) => changeOrderStatus(tx, { orderId: id, to: "reserved", actorId: null, now })),
    ).rejects.toBeInstanceOf(ShortageError);
    expect((await db.select().from(orders).where(eq(orders.id, id)))[0].status).toBe("draft");
  });

  it("returned orders free the stock for the next rental", async () => {
    const { id } = await save({ draft: draft(), status: "reserved" });
    for (const to of ["out", "returned"] as const)
      await db.transaction((tx) => changeOrderStatus(tx, { orderId: id, to, actorId: null, now }));
    expect(await claimsOf(id)).toHaveLength(0);
  });
});

describe("payments", () => {
  it("keeps paid_cents equal to payments minus refunds", async () => {
    const { id } = await save({ draft: draft(), status: "reserved" });
    const pay = (kind: "payment" | "refund", amountCents: number) =>
      db.transaction((tx) =>
        recordPayment(tx, {
          orderId: id,
          actorId: null,
          timezone: TZ,
          payment: { kind, method: "etransfer", amountCents, reference: "", receivedDate: "2027-05-01" },
        }),
      );
    await pay("payment", 50000);
    const { payment, paidCents } = await pay("refund", 10000);
    expect(paidCents).toBe(40000);
    await db.transaction((tx) => deletePayment(tx, payment.id));
    expect((await db.select().from(orders).where(eq(orders.id, id)))[0].paidCents).toBe(50000);
  });
});
