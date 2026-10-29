import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { AlertTriangle, ArrowRight, Mail } from "lucide-react";
import { Card, EmptyState, PageHeader } from "@/components/admin/ui";
import { db } from "@/db";
import { customers, inquiries, orders, products } from "@/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { zonedDateTime, localParts } from "@/lib/availability/engine";
import { formatLocal, money, TIMEZONE } from "@/lib/format";
import { translator } from "@/lib/i18n/admin";

// Per-user back office page: rendered on request, no instant-navigation prefetch needed.
export const instant = false;

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: PageProps<"/admin">) {
  const user = await requireStaff();
  const t = translator(user.locale);
  const sp = await searchParams;
  const range = sp.range === "tomorrow" || sp.range === "week" ? sp.range : "today";

  const today = localParts(new Date(), TIMEZONE).date;
  const startDay = range === "tomorrow" ? addDays(today, 1) : today;
  const endDay = range === "week" ? addDays(today, 7) : addDays(startDay, 1);
  const from = zonedDateTime(startDay, "00:00", TIMEZONE);
  const to = zonedDateTime(endDay, "00:00", TIMEZONE);

  const [goingOut, comingBack, newInquiries, stats, toConfirm] = await Promise.all([
    db
      .select({ o: orders, name: customers.name })
      .from(orders)
      .leftJoin(customers, eq(customers.id, orders.customerId))
      .where(and(inArray(orders.status, ["reserved", "ready"]), gte(orders.startsAt, from), lt(orders.startsAt, to)))
      .orderBy(asc(orders.startsAt)),
    db
      .select({ o: orders, name: customers.name })
      .from(orders)
      .leftJoin(customers, eq(customers.id, orders.customerId))
      .where(and(inArray(orders.status, ["out"]), gte(orders.endsAt, from), lt(orders.endsAt, to)))
      .orderBy(asc(orders.endsAt)),
    db.select().from(inquiries).where(isNull(inquiries.handledAt)).orderBy(desc(inquiries.createdAt)).limit(5),
    db
      .select({
        products: sql<number>`(select count(*)::int from ${products} where archived_at is null)`,
        customers: sql<number>`(select count(*)::int from ${customers} where archived_at is null)`,
        upcoming: sql<number>`(select count(*)::int from ${orders} where status in ('reserved','ready') and starts_at >= now())`,
      })
      .from(sql`(select 1) as one`),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(products)
      .where(and(isNull(products.archivedAt), sql`${products.custom} ? 'stockToConfirm'`)),
  ]);

  const tabs = [
    { key: "today", label: t("dash.today") },
    { key: "tomorrow", label: t("dash.tomorrow") },
    { key: "week", label: t("dash.next7") },
  ];

  return (
    <>
      <PageHeader title={t("dash.title")}>
        <nav className="flex gap-1 rounded-md border border-admin-line bg-white p-1" aria-label="Period">
          {tabs.map((tab) => (
            <Link
              key={tab.key}
              href={`/admin?range=${tab.key}`}
              className={`rounded px-3 py-1.5 text-sm font-semibold ${range === tab.key ? "bg-admin-blue text-white" : "text-admin-text hover:bg-admin-bg"}`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </PageHeader>
      <div className="grid gap-5 p-4 md:p-6 xl:grid-cols-[1fr_1fr_320px]">
        {sp.denied && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 xl:col-span-3">
            You don&apos;t have permission for that page.
          </p>
        )}
        {toConfirm[0].n > 0 && (
          <Link
            href="/admin/inventory"
            className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100 xl:col-span-3"
          >
            <AlertTriangle className="size-5 shrink-0" />
            <span className="flex-1">
              {t("dash.stockWarning")} ({toConfirm[0].n})
            </span>
            <span className="font-semibold">{t("dash.reviewInventory")} →</span>
          </Link>
        )}
        <Card title={t("dash.goingOut")} padded={false}>
          <OrderList rows={goingOut} field="startsAt" empty={t("dash.noResults")} />
          <div className="flex justify-between border-t border-admin-line px-5 py-3 text-sm text-admin-blue">
            <Link href="/admin/bookings">{t("common.viewAll")}</Link>
          </div>
        </Card>
        <Card title={t("dash.comingBack")} padded={false}>
          <OrderList rows={comingBack} field="endsAt" empty={t("dash.noResults")} />
          <div className="flex justify-between border-t border-admin-line px-5 py-3 text-sm text-admin-blue">
            <Link href="/admin/bookings">{t("common.viewAll")}</Link>
          </div>
        </Card>
        <div className="space-y-5 xl:row-span-2">
          <Card title={t("dash.inquiries")} padded={false}>
            {newInquiries.length === 0 ? (
              <EmptyState title={t("dash.noResults")} />
            ) : (
              <ul className="divide-y divide-admin-line">
                {newInquiries.map((i) => (
                  <li key={i.id} className="px-5 py-3 text-sm">
                    <p className="flex items-center gap-2 font-semibold">
                      <Mail className="size-4 text-admin-blue" /> {i.name}
                    </p>
                    <p className="mt-1 line-clamp-2 text-admin-muted">{i.message}</p>
                    <p className="mt-1 text-xs text-admin-muted">{formatLocal(i.createdAt, "dd-MM-yyyy h:mm a")}</p>
                  </li>
                ))}
              </ul>
            )}
            <Link
              href="/admin/inquiries"
              className="flex items-center gap-1 border-t border-admin-line px-5 py-3 text-sm text-admin-blue"
            >
              {t("inq.title")} <ArrowRight className="size-4" />
            </Link>
          </Card>
          <div className="grid grid-cols-3 gap-3 xl:grid-cols-1">
            {[
              { label: t("dash.upcoming"), value: stats[0].upcoming, href: "/admin/bookings" },
              { label: t("dash.products"), value: stats[0].products, href: "/admin/inventory" },
              { label: t("dash.clients"), value: stats[0].customers, href: "/admin/clients" },
            ].map((s) => (
              <Link
                key={s.label}
                href={s.href}
                className="rounded-lg border border-admin-line bg-white p-4 hover:border-admin-blue"
              >
                <p className="text-sm text-admin-muted">{s.label}</p>
                <p className="mt-1 text-3xl font-light">{s.value}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

type OrderRow = { o: typeof orders.$inferSelect; name: string | null };

function OrderList({ rows, field, empty }: { rows: OrderRow[]; field: "startsAt" | "endsAt"; empty: string }) {
  if (rows.length === 0) return <EmptyState title={empty} />;
  return (
    <ul className="divide-y divide-admin-line">
      {rows.map(({ o, name }) => (
        <li key={o.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
          <Link href={`/admin/bookings/${o.id}`} className="hover:text-admin-blue">
            <strong>#{o.number}</strong> {name ?? "—"} · {o.fulfillment === "delivery" ? "Delivery" : "Pickup"}
          </Link>
          <span className="text-admin-muted">
            {formatLocal(o[field], "EEE h:mm a")} · {money(o.totalCents)}
          </span>
        </li>
      ))}
    </ul>
  );
}
