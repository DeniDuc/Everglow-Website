import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, and, eq } from "drizzle-orm";
import { Printer } from "lucide-react";
import { Badge, buttonClass, Card, PageHeader } from "@/components/admin/ui";
import { db } from "@/db";
import { auditLog, customers, orderLines, orders, payments, staffUsers } from "@/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { localParts } from "@/lib/availability/engine";
import { addressText } from "@/lib/customers";
import { formatLocal, money } from "@/lib/format";
import { labelsByPrefix, translator, type MessageKey } from "@/lib/i18n/admin";
import { cancellationPreview, draftFromOrder } from "@/lib/orders/service";
import { isEditable, isLate, statusTone, type OrderStatus } from "@/lib/orders/status";
import { loadSettings } from "@/lib/settings";
import { loadEditorData } from "../editor-data";
import { OrderEditor } from "../order-editor";
import { PaymentsPanel } from "./payments-panel";
import { StatusActions } from "./status-actions";

// Per-user back office page: rendered on request, no instant-navigation prefetch needed.
export const instant = false;

export const metadata: Metadata = { title: "Booking" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Button text for a status change, worded for where the order is now. */
function actionKey(from: OrderStatus, to: OrderStatus): MessageKey {
  if (from === "cancelled" && to === "draft") return "action.restore";
  if (from === "ready" && to === "reserved") return "action.unready";
  if (from === "returned" && to === "out") return "action.undoReturn";
  if (from === "closed" && to === "returned") return "action.reopen";
  return `action.${to}` as MessageKey;
}

export default async function OrderPage({ params }: PageProps<"/admin/bookings/[id]">) {
  const user = await requireStaff();
  const t = translator(user.locale);
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [row] = await db
    .select({ o: orders, c: customers })
    .from(orders)
    .leftJoin(customers, eq(customers.id, orders.customerId))
    .where(eq(orders.id, id));
  if (!row) notFound();
  const { o, c } = row;
  const now = new Date();

  const [settings, lines, paymentRows, activity] = await Promise.all([
    loadSettings(db),
    db.select().from(orderLines).where(eq(orderLines.orderId, id)).orderBy(asc(orderLines.position)),
    db.select().from(payments).where(eq(payments.orderId, id)).orderBy(asc(payments.receivedAt)),
    db
      .select({ a: auditLog, name: staffUsers.name })
      .from(auditLog)
      .leftJoin(staffUsers, eq(staffUsers.id, auditLog.actorId))
      .where(and(eq(auditLog.entity, "order"), eq(auditLog.entityId, id)))
      .orderBy(desc(auditLog.createdAt))
      .limit(50),
  ]);
  const tz = settings.business.timezone;
  const canEdit = can(user.role, "editOrders");
  const editable = canEdit && isEditable(o.status);
  const labels = labelsByPrefix(user.locale, [
    "order.",
    "period.",
    "source.",
    "common.",
    "clients.",
    "method.",
    "action.",
  ]);
  const cancel = cancellationPreview(o, settings, now);
  const statusTitles = Object.fromEntries(
    (["draft", "quote_sent", "reserved", "ready", "out", "returned", "closed", "cancelled"] as const).map((to) => [
      to,
      t(actionKey(o.status, to)),
    ]),
  );

  const paymentsPanel = (
    <PaymentsPanel
      orderId={o.id}
      payments={paymentRows.map((p) => ({
        id: p.id,
        kind: p.kind,
        method: p.method,
        amountCents: p.amountCents,
        reference: p.reference,
        receivedAt: p.receivedAt.toISOString(),
      }))}
      remainingCents={o.totalCents - o.paidCents}
      today={localParts(now, tz).date}
      canEdit={canEdit}
      labels={labels}
    />
  );
  const activityCard = (
    <Card title={t("order.activity")} padded={false}>
      {activity.length === 0 ? (
        <p className="px-5 py-4 text-sm text-admin-muted">{t("activity.empty")}</p>
      ) : (
        <ol className="divide-y divide-admin-line text-sm">
          {activity.map(({ a, name }) => {
            const data = (a.data ?? {}) as { from?: OrderStatus; to?: OrderStatus; amountCents?: number };
            const key = `activity.${a.action}` as MessageKey;
            return (
              <li key={a.id} className="px-5 py-3">
                <p>
                  {t(key) ?? a.action}
                  {data.from && data.to && (
                    <span className="text-admin-muted">
                      {" "}
                      · {t(`status.${data.from}` as MessageKey)} → {t(`status.${data.to}` as MessageKey)}
                    </span>
                  )}
                  {data.amountCents != null && <span className="text-admin-muted"> · {money(data.amountCents)}</span>}
                </p>
                <p className="text-xs text-admin-muted">
                  {formatLocal(a.createdAt, "MMM d, h:mm a")}
                  {name ? ` · ${name}` : ""}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );

  const late = isLate(o, now);
  const header = (
    <PageHeader
      back={{ href: "/admin/bookings", label: t("bookings.title") }}
      title={
        <>
          #{o.number} {c?.name ? <span className="text-admin-muted">· {c.name}</span> : null}
        </>
      }
      actions={
        <>
          <Link href={`/admin/bookings/${o.id}/packing-slip`} className={buttonClass("secondary")}>
            <Printer className="size-4" /> {t("order.packingSlip")}
          </Link>
          {canEdit && (
            <StatusActions
              orderId={o.id}
              status={o.status}
              cancellation={{
                keptCents: cancel.keptCents,
                refundCents: cancel.refundCents,
                creditCents: cancel.creditCents,
                balanceDueCents: cancel.balanceDueCents,
                label: cancel.tier?.label ?? null,
              }}
              labels={labels}
              titles={statusTitles}
            />
          )}
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={statusTone[o.status]}>{t(`status.${o.status}` as MessageKey)}</Badge>
        {late && <Badge tone="red">{t("status.late")}</Badge>}
        {o.overbooked && <Badge tone="red">{t("order.overbooked")}</Badge>}
        {o.idCheckedAt && <Badge tone="green">{t("order.idCheckedAt")}</Badge>}
        {o.tags.includes("booqable-import") && <Badge>{t("order.imported")}</Badge>}
      </div>
    </PageHeader>
  );

  if (editable) {
    const data = await loadEditorData();
    return (
      <>
        {header}
        <OrderEditor
          mode="edit"
          orderId={o.id}
          initial={draftFromOrder(o, lines, tz)}
          catalog={data.catalog}
          tiers={data.tiers}
          customers={data.customers}
          paidCents={o.paidCents}
          labels={labels}
          aside={
            <>
              {paymentsPanel}
              {activityCard}
            </>
          }
        />
      </>
    );
  }

  // Out, finished or cancelled: show the stored lines exactly as invoiced.
  const remaining = o.totalCents - o.paidCents;
  return (
    <>
      {header}
      <div className="grid gap-5 p-4 md:p-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          {o.status !== "cancelled" && (
            <p className="rounded-lg border border-admin-line bg-white px-4 py-3 text-sm text-admin-muted">
              {t("order.locked")}
            </p>
          )}
          <Card title={t("order.period")}>
            <p className="text-sm">
              <strong>{t("order.pickup")}:</strong> {formatLocal(o.startsAt, "EEE, MMM d, yyyy · h:mm a")}
              <br />
              <strong>{t("order.return")}:</strong> {formatLocal(o.endsAt, "EEE, MMM d, yyyy · h:mm a")}
              <br />
              <strong>{t("order.fulfillment")}:</strong>{" "}
              {o.fulfillment === "delivery" ? t("order.delivery") : t("order.customerPickup")}
              {o.deliveryAddress ? ` · ${o.deliveryAddress}` : ""}
            </p>
          </Card>
          <Card title={t("order.lines")} padded={false}>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-admin-line">
                {lines.map((l) => (
                  <tr key={l.id}>
                    <td className="px-5 py-3">
                      {l.title}
                      {l.overrideReason && <span className="block text-xs text-admin-muted">{l.overrideReason}</span>}
                    </td>
                    <td className="px-3 py-3 text-right text-admin-muted">
                      {["product", "bundle", "service", "custom"].includes(l.kind) &&
                        `${l.quantity} × ${money(l.unitPriceCents)}`}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold">{money(l.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-admin-line">
                <tr>
                  <td className="px-5 py-3 font-semibold" colSpan={2}>
                    {t("order.grandTotal")}
                  </td>
                  <td className="px-5 py-3 text-right text-base font-semibold">{money(o.totalCents)}</td>
                </tr>
              </tfoot>
            </table>
          </Card>
        </div>
        <div className="min-w-0 space-y-5">
          <Card title={t("order.customer")}>
            {c ? (
              <div className="space-y-1 text-sm">
                <Link
                  href={`/admin/clients/${c.id}`}
                  className="text-base font-semibold text-admin-blue hover:underline"
                >
                  {c.name}
                </Link>
                {c.email && <p>{c.email}</p>}
                {c.phone && <p>{c.phone}</p>}
                {c.address && <p className="text-admin-muted">{addressText(c.address)}</p>}
              </div>
            ) : (
              <p className="text-sm text-admin-muted">{t("order.noCustomer")}</p>
            )}
          </Card>
          <Card title={t("order.summary")}>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between font-semibold">
                <dt>{t("order.grandTotal")}</dt>
                <dd>{money(o.totalCents)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>{t("order.paid")}</dt>
                <dd>{money(o.paidCents)}</dd>
              </div>
              <div className="flex justify-between font-semibold">
                <dt>{t("order.remaining")}</dt>
                <dd className={remaining > 0 ? "text-red-600" : "text-admin-green"}>{money(remaining)}</dd>
              </div>
            </dl>
          </Card>
          {o.internalNotes && (
            <Card title={t("order.notes")}>
              <p className="whitespace-pre-line text-sm">{o.internalNotes}</p>
            </Card>
          )}
          {paymentsPanel}
          {activityCard}
        </div>
      </div>
    </>
  );
}
