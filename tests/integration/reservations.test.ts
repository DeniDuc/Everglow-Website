import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { downtimes, orders, products, productVariants, reservations } from "@/db/schema";
import { releaseStock, reserveStock, ShortageError, variantAvailability } from "@/lib/availability/db";
import { runMigrations } from "../../scripts/migrate";

const now = new Date("2026-06-01T12:00:00Z");
const start = new Date("2026-07-10T15:00:00Z");
const end = new Date("2026-07-12T15:00:00Z");
const opts = { now, defaultBufferAfter: 120 };

let variantId: string;

async function newOrder() {
  const [o] = await db.insert(orders).values({ startsAt: start, endsAt: end }).returning({ id: orders.id });
  return o.id;
}

async function reserve(orderId: string, quantity: number, extra: Partial<Parameters<typeof reserveStock>[1]> = {}) {
  return db.transaction((tx) =>
    reserveStock(tx, {
      orderId,
      items: [{ variantId, quantity }],
      startsAt: start,
      endsAt: end,
      status: "reserved",
      ...opts,
      ...extra,
    }),
  );
}

beforeAll(async () => {
  await runMigrations(process.env.DATABASE_URL!);
});

beforeEach(async () => {
  await db.execute(sql`truncate reservations, downtimes, order_lines, orders, product_variants, products cascade`);
  const [p] = await db.insert(products).values({ slug: "tent-20x20", name: "20x20 Marquee Tent" }).returning();
  const [v] = await db
    .insert(productVariants)
    .values({ productId: p.id, name: p.name, stockQuantity: 1, basePriceCents: 65000 })
    .returning();
  variantId = v.id;
});

describe("reserveStock", () => {
  it("refuses a second booking of the last unit for overlapping dates", async () => {
    await reserve(await newOrder(), 1);
    await expect(reserve(await newOrder(), 1)).rejects.toBeInstanceOf(ShortageError);
  });

  it("only one of two simultaneous checkouts gets the last tent", async () => {
    const [a, b] = [await newOrder(), await newOrder()];
    const results = await Promise.allSettled([reserve(a, 1), reserve(b, 1)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const rows = await db.select().from(reservations).where(eq(reservations.variantId, variantId));
    expect(rows.reduce((s, r) => s + r.quantity, 0)).toBe(1);
  });

  it("cancelling an order frees the stock", async () => {
    const a = await newOrder();
    await reserve(a, 1);
    await releaseStock(db, { orderId: a });
    await expect(reserve(await newOrder(), 1)).resolves.toBeTruthy();
  });

  it("re-reserving the same order replaces its own claim instead of double counting", async () => {
    const a = await newOrder();
    await reserve(a, 1);
    await expect(reserve(a, 1)).resolves.toBeTruthy();
  });

  it("expired checkout holds do not block stock", async () => {
    await db.transaction((tx) =>
      reserveStock(tx, {
        cartId: "cart-1",
        items: [{ variantId, quantity: 1 }],
        startsAt: start,
        endsAt: end,
        status: "hold",
        holdMinutes: 15,
        ...opts,
      }),
    );
    const during = await variantAvailability(db, [variantId], start, end, opts);
    expect(during.get(variantId)).toBe(0);
    const later = await variantAvailability(db, [variantId], start, end, {
      ...opts,
      now: new Date(now.getTime() + 16 * 60 * 1000),
    });
    expect(later.get(variantId)).toBe(1);
  });

  it("downtime makes the item unavailable", async () => {
    await db
      .insert(downtimes)
      .values({
        variantId,
        quantity: 1,
        startsAt: new Date("2026-07-11T00:00:00Z"),
        endsAt: new Date("2026-07-11T23:00:00Z"),
      });
    await expect(reserve(await newOrder(), 1)).rejects.toBeInstanceOf(ShortageError);
  });

  it("staff can overbook explicitly and the shortage is reported", async () => {
    await reserve(await newOrder(), 1);
    const res = await reserve(await newOrder(), 1, { allowOverbook: true });
    expect(res.overbooked).toEqual([{ variantId, requested: 1, available: 0 }]);
  });

  it("a booking after the turnaround buffer is fine", async () => {
    await reserve(await newOrder(), 1);
    const nextStart = new Date(end.getTime() + 2 * 60 * 60 * 1000);
    const o = await newOrder();
    await expect(
      reserve(o, 1, { startsAt: nextStart, endsAt: new Date(nextStart.getTime() + 24 * 60 * 60 * 1000) }),
    ).resolves.toBeTruthy();
  });
});
