import { and, eq, gt, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import type { Db, Tx } from "@/db";
import { bundleItems, downtimes, products, productVariants, reservations, stockItems } from "@/db/schema";
import { availableQuantity, blockRange, bundleAvailability, type Claim, type Range } from "./engine";

/**
 * Database side of the availability engine. Every write of stock claims goes through
 * `reserveStock`, which locks the variant rows (SELECT … FOR UPDATE) before checking,
 * so concurrent checkouts are serialized per item and cannot oversell the last unit.
 */

type Conn = Db | Tx;

export type VariantInfo = {
  variantId: string;
  productId: string;
  stock: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  allowShortage: boolean;
};

export async function loadVariantInfo(conn: Conn, variantIds: string[], defaultBufferAfter: number): Promise<Map<string, VariantInfo>> {
  if (variantIds.length === 0) return new Map();
  const rows = await conn
    .select({
      variantId: productVariants.id,
      productId: products.id,
      trackingType: products.trackingType,
      stockQuantity: productVariants.stockQuantity,
      bufferBefore: products.bufferBeforeMinutes,
      bufferAfter: products.bufferAfterMinutes,
      allowShortage: products.allowShortage,
      trackedUnits: sql<number>`(select count(*)::int from ${stockItems} si where si.variant_id = ${productVariants.id} and si.status <> 'retired')`,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(inArray(productVariants.id, variantIds));
  return new Map(
    rows.map((r) => [
      r.variantId,
      {
        variantId: r.variantId,
        productId: r.productId,
        stock: r.trackingType === "trackable" ? r.trackedUnits : r.stockQuantity,
        bufferBeforeMinutes: r.bufferBefore,
        bufferAfterMinutes: r.bufferAfter > 0 ? r.bufferAfter : defaultBufferAfter,
        allowShortage: r.allowShortage,
      },
    ]),
  );
}

/** Active claims (reservations, live holds) and downtimes per variant that touch `window`. */
export async function loadClaims(
  conn: Conn,
  variantIds: string[],
  window: Range,
  opts: { now: Date; excludeOrderId?: string; excludeCartId?: string },
): Promise<{ claims: Map<string, Claim[]>; downtimes: Map<string, Claim[]> }> {
  const claims = new Map<string, Claim[]>();
  const down = new Map<string, Claim[]>();
  if (variantIds.length === 0) return { claims, downtimes: down };
  const ws = new Date(window.start);
  const we = new Date(window.end);

  const rows = await conn
    .select()
    .from(reservations)
    .where(
      and(
        inArray(reservations.variantId, variantIds),
        lt(reservations.blockStartsAt, we),
        gt(reservations.blockEndsAt, ws),
        or(eq(reservations.status, "reserved"), gt(reservations.expiresAt, opts.now)),
        opts.excludeOrderId
          ? or(isNull(reservations.orderId), ne(reservations.orderId, opts.excludeOrderId))
          : undefined,
        opts.excludeCartId ? or(isNull(reservations.cartId), ne(reservations.cartId, opts.excludeCartId)) : undefined,
      ),
    );
  for (const r of rows) {
    const list = claims.get(r.variantId) ?? [];
    list.push({ start: r.blockStartsAt.getTime(), end: r.blockEndsAt.getTime(), quantity: r.quantity });
    claims.set(r.variantId, list);
  }

  const dts = await conn
    .select()
    .from(downtimes)
    .where(and(inArray(downtimes.variantId, variantIds), lt(downtimes.startsAt, we), gt(downtimes.endsAt, ws)));
  for (const d of dts) {
    const list = down.get(d.variantId) ?? [];
    list.push({ start: d.startsAt.getTime(), end: d.endsAt.getTime(), quantity: d.quantity });
    down.set(d.variantId, list);
  }
  return { claims, downtimes: down };
}

/** Free units per variant for a rental period (buffers of each product applied). */
export async function variantAvailability(
  conn: Conn,
  variantIds: string[],
  startsAt: Date,
  endsAt: Date,
  opts: { now: Date; defaultBufferAfter: number; excludeOrderId?: string; excludeCartId?: string },
): Promise<Map<string, number>> {
  const ids = [...new Set(variantIds)];
  const info = await loadVariantInfo(conn, ids, opts.defaultBufferAfter);
  const maxBefore = Math.max(0, ...[...info.values()].map((v) => v.bufferBeforeMinutes));
  const maxAfter = Math.max(0, ...[...info.values()].map((v) => v.bufferAfterMinutes));
  const outer = blockRange(startsAt, endsAt, maxBefore, maxAfter);
  const { claims, downtimes: down } = await loadClaims(conn, ids, outer, opts);
  const result = new Map<string, number>();
  for (const id of ids) {
    const v = info.get(id);
    if (!v) {
      result.set(id, 0);
      continue;
    }
    const window = blockRange(startsAt, endsAt, v.bufferBeforeMinutes, v.bufferAfterMinutes);
    result.set(
      id,
      availableQuantity({ stock: v.stock, claims: claims.get(id) ?? [], downtimes: down.get(id) ?? [], window }),
    );
  }
  return result;
}

/** Availability per product (sum over variants) and per variant, including bundles. */
export async function productAvailability(
  conn: Conn,
  productIds: string[],
  startsAt: Date,
  endsAt: Date,
  opts: { now: Date; defaultBufferAfter: number },
): Promise<Map<string, { total: number; variants: Record<string, number> }>> {
  if (productIds.length === 0) return new Map();
  const variants = await conn
    .select({ id: productVariants.id, productId: productVariants.productId })
    .from(productVariants)
    .where(and(inArray(productVariants.productId, productIds), isNull(productVariants.archivedAt)));
  const components = await conn
    .select({ bundleId: bundleItems.bundleId, variantId: bundleItems.variantId, quantity: bundleItems.quantity })
    .from(bundleItems)
    .where(inArray(bundleItems.bundleId, productIds));

  const avail = await variantAvailability(
    conn,
    [...variants.map((v) => v.id), ...components.map((c) => c.variantId)],
    startsAt,
    endsAt,
    opts,
  );

  const out = new Map<string, { total: number; variants: Record<string, number> }>();
  for (const pid of productIds) {
    const parts = components.filter((c) => c.bundleId === pid);
    if (parts.length > 0) {
      const n = bundleAvailability(parts.map((c) => ({ available: avail.get(c.variantId) ?? 0, perBundle: c.quantity })));
      out.set(pid, { total: n, variants: {} });
      continue;
    }
    const vs = variants.filter((v) => v.productId === pid);
    const per: Record<string, number> = {};
    for (const v of vs) per[v.id] = Math.max(0, avail.get(v.id) ?? 0);
    out.set(pid, { total: Object.values(per).reduce((a, b) => a + b, 0), variants: per });
  }
  return out;
}

export class ShortageError extends Error {
  constructor(public shortages: { variantId: string; requested: number; available: number }[]) {
    super("Some items are no longer available for these dates");
    this.name = "ShortageError";
  }
}

export type ReserveInput = {
  /** Exactly one owner: an order, or an anonymous cart during checkout. */
  orderId?: string;
  cartId?: string;
  items: { variantId: string; quantity: number }[];
  startsAt: Date;
  endsAt: Date;
  status: "hold" | "reserved";
  now: Date;
  holdMinutes?: number;
  defaultBufferAfter: number;
  /** Staff override: record the claim even if stock is short. */
  allowOverbook?: boolean;
};

/**
 * Replace the claims of an order/cart atomically. Must run inside a transaction.
 * Returns the shortages that were accepted (only when `allowOverbook` is set).
 */
export async function reserveStock(tx: Tx, input: ReserveInput) {
  if (!input.orderId === !input.cartId) throw new Error("reserveStock needs exactly one of orderId or cartId");

  const qty = new Map<string, number>();
  for (const i of input.items) {
    if (i.quantity > 0) qty.set(i.variantId, (qty.get(i.variantId) ?? 0) + i.quantity);
  }
  const ids = [...qty.keys()].sort();

  // Serialize every writer touching these variants until this transaction ends.
  if (ids.length > 0) {
    await tx.execute(
      sql`select id from ${productVariants} where id in (${sql.join(
        ids.map((id) => sql`${id}::uuid`),
        sql`, `,
      )}) order by id for update`,
    );
  }

  const owner = input.orderId ? eq(reservations.orderId, input.orderId) : eq(reservations.cartId, input.cartId!);
  await tx.delete(reservations).where(owner);

  const avail = await variantAvailability(tx, ids, input.startsAt, input.endsAt, {
    now: input.now,
    defaultBufferAfter: input.defaultBufferAfter,
  });
  const info = await loadVariantInfo(tx, ids, input.defaultBufferAfter);

  const shortages = ids
    .map((id) => ({ variantId: id, requested: qty.get(id)!, available: avail.get(id) ?? 0 }))
    .filter((s) => s.requested > s.available);
  // Items flagged "allow shortage" (can be sub-rented) never block; everything else needs a staff override.
  const blocking = shortages.filter((s) => !info.get(s.variantId)?.allowShortage);
  if (blocking.length > 0 && !input.allowOverbook) throw new ShortageError(blocking);

  const expiresAt =
    input.status === "hold" ? new Date(input.now.getTime() + (input.holdMinutes ?? 15) * 60 * 1000) : null;
  if (ids.length > 0) {
    await tx.insert(reservations).values(
      ids.map((id) => {
        const v = info.get(id)!;
        const block = blockRange(input.startsAt, input.endsAt, v.bufferBeforeMinutes, v.bufferAfterMinutes);
        return {
          variantId: id,
          orderId: input.orderId ?? null,
          cartId: input.cartId ?? null,
          quantity: qty.get(id)!,
          status: input.status,
          blockStartsAt: new Date(block.start),
          blockEndsAt: new Date(block.end),
          expiresAt,
        };
      }),
    );
  }
  return { overbooked: shortages };
}

/** Free the stock of a cancelled order or abandoned cart. */
export async function releaseStock(conn: Conn, owner: { orderId?: string; cartId?: string }) {
  if (owner.orderId) await conn.delete(reservations).where(eq(reservations.orderId, owner.orderId));
  if (owner.cartId) await conn.delete(reservations).where(eq(reservations.cartId, owner.cartId));
}

/** Cron cleanup: drop expired checkout holds. */
export async function purgeExpiredHolds(conn: Conn, now: Date) {
  await conn.delete(reservations).where(and(eq(reservations.status, "hold"), lt(reservations.expiresAt, now)));
}
