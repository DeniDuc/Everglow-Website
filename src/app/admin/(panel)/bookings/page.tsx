import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq, gte, inArray, lt, sql, type SQL } from "drizzle-orm";
import { Plus, Truck } from "lucide-react";
import { Badge, buttonClass, EmptyState, Input, PageHeader, Table } from "@/components/admin/ui";
import { db } from "@/db";
import { customers, orders } from "@/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { formatLocal, money } from "@/lib/format";
import { translator, type MessageKey } from "@/lib/i18n/admin";
import { isLate, paymentState, statusTone } from "@/lib/orders/status";

// Per-user back office page: rendered on request, no instant-navigation prefetch needed.
export const instant = false;

export const metadata: Metadata = { title: "Bookings" };

const views = ["upcoming", "active", "late", "drafts", "past", "cancelled", "all"] as const;
type View = (typeof views)[number];

function viewFilter(view: View, now: Date): { where?: SQL; order: SQL[] } {
  switch (view) {
    case "upcoming":
      return { where: inArray(orders.status, ["reserved", "ready"]), order: [asc(orders.startsAt)] };
    case "active":
      return { where: and(eq(orders.status, "out"), gte(orders.endsAt, now)), order: [asc(orders.endsAt)] };
    case "late":
      return { where: and(eq(orders.status, "out"), lt(orders.endsAt, now)), order: [asc(orders.endsAt)] };
    case "drafts":
      return { where: inArray(orders.status, ["draft", "quote_sent"]), order: [desc(orders.createdAt)] };
    case "past":
      return { where: inArray(orders.status, ["returned", "closed"]), order: [desc(orders.endsAt)] };
    case "cancelled":
      return { where: eq(orders.status, "cancelled"), order: [desc(orders.updatedAt)] };
    case "all":
      return { order: [desc(orders.number)] };
  }
}

export default async function BookingsPage({ searchParams }: PageProps<"/admin/bookings">) {
  const user = await requireStaff();
  const t = translator(user.locale);
  const sp = await searchParams;
  const view: View = views.includes(sp.view as View) ? (sp.view as View) : "upcoming";
  const q = String(sp.q ?? "").trim();
  const now = new Date();
  const nowSql = sql`${now.toISOString()}::timestamptz`;
  const f = viewFilter(q ? "all" : view, now);

  const [rows, [counts]] = await Promise.all([
    db
      .select({ o: orders, name: customers.name, email: customers.email, phone: customers.phone })
      .from(orders)
      .leftJoin(customers, eq(customers.id, orders.customerId))
      .where(f.where)
      .orderBy(...f.order)
      .limit(2000),
    db
      .select({
        upcoming: sql<number>`count(*) filter (where ${orders.status} in ('reserved','ready'))::int`,
        active: sql<number>`count(*) filter (where ${orders.status} = 'out' and ${orders.endsAt} >= ${nowSql})::int`,
        late: sql<number>`count(*) filter (where ${orders.status} = 'out' and ${orders.endsAt} < ${nowSql})::int`,
        drafts: sql<number>`count(*) filter (where ${orders.status} in ('draft','quote_sent'))::int`,
      })
      .from(orders),
  ]);

  // Client details are encrypted, so text search runs after decryption (fine at this scale).
  const needle = q.toLowerCase().replace(/^#/, "");
  const digits = q.replace(/\D/g, "");
  const shown = q
    ? rows.filter(
        (r) =>
          String(r.o.number) === needle ||
          [r.name, r.email].some((v) => v?.toLowerCase().includes(needle)) ||
          (digits.length >= 3 && r.phone?.replace(/\D/g, "").includes(digits)),
      )
    : rows;

  const tabLabel: Record<View, MessageKey> = {
    upcoming: "bookings.tab.upcoming",
    active: "bookings.tab.active",
    late: "bookings.tab.late",
    drafts: "bookings.tab.drafts",
    past: "bookings.tab.past",
    cancelled: "bookings.tab.cancelled",
    all: "bookings.tab.all",
  };
  const badgeCount: Partial<Record<View, number>> = counts;

  return (
    <>
      <PageHeader
        title={t("bookings.title")}
        actions={
          <Link href="/admin/bookings/new" className={buttonClass("primary")}>
            <Plus className="size-4" /> {t("bookings.new")}
          </Link>
        }
      >
        <form className="w-full max-w-xs" role="search">
          <input type="hidden" name="view" value={view} />
          <Input name="q" defaultValue={q} placeholder={t("bookings.search")} aria-label={t("bookings.search")} />
        </form>
      </PageHeader>
      <div className="space-y-4 p-4 md:p-6">
        <nav className="flex gap-1 overflow-x-auto border-b border-admin-line" aria-label={t("bookings.title")}>
          {views.map((v) => (
            <Link
              key={v}
              href={`/admin/bookings?view=${v}`}
              aria-current={!q && v === view ? "page" : undefined}
              className={cn(
                "-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold",
                !q && v === view
                  ? "border-admin-blue text-admin-blue"
                  : "border-transparent text-admin-muted hover:text-admin-text",
              )}
            >
              {t(tabLabel[v])}
              {badgeCount[v] ? (
                <span
                  className={cn(
                    "rounded-full px-1.5 text-xs",
                    v === "late" ? "bg-red-100 text-red-700" : "bg-admin-bg text-admin-muted",
                  )}
                >
                  {badgeCount[v]}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>
        {shown.length === 0 ? (
          <div className="rounded-lg border border-admin-line bg-white">
            <EmptyState
              title={q ? t("common.noResults") : t("bookings.empty")}
              action={
                <Link href="/admin/bookings/new" className={buttonClass("primary")}>
                  <Plus className="size-4" /> {t("bookings.new")}
                </Link>
              }
            />
          </div>
        ) : (
          <Table
            head={[
              "#",
              t("bookings.col.client"),
              t("bookings.col.pickup"),
              t("bookings.col.return"),
              t("bookings.col.status"),
              t("bookings.col.total"),
              t("bookings.col.payment"),
            ]}
          >
            {shown.map(({ o, name }) => {
              const pay = paymentState(o.totalCents, o.paidCents);
              return (
                <tr key={o.id} className="hover:bg-admin-bg/60">
                  <td className="px-4 py-3 font-semibold">
                    <Link href={`/admin/bookings/${o.id}`} className="text-admin-blue hover:underline">
                      #{o.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/bookings/${o.id}`} className="font-semibold hover:text-admin-blue">
                      {name ?? "—"}
                    </Link>
                    {o.fulfillment === "delivery" && (
                      <Truck className="ml-2 inline size-4 text-admin-muted" aria-label={t("order.delivery")} />
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">{formatLocal(o.startsAt, "EEE MMM d · h:mm a")}</td>
                  <td className="whitespace-nowrap px-4 py-3">{formatLocal(o.endsAt, "EEE MMM d · h:mm a")}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <Badge tone={statusTone[o.status]}>{t(`status.${o.status}` as MessageKey)}</Badge>{" "}
                    {isLate(o, now) && <Badge tone="red">{t("status.late")}</Badge>}{" "}
                    {o.overbooked && <Badge tone="red">{t("order.overbooked")}</Badge>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">{money(o.totalCents)}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <Badge
                      tone={
                        pay === "paid" ? "green" : pay === "partial" ? "amber" : pay === "overpaid" ? "blue" : "red"
                      }
                    >
                      {t(`pay.${pay}` as MessageKey)}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </div>
    </>
  );
}
