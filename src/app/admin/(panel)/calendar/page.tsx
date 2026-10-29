import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, gte, inArray, lt, ne, or } from "drizzle-orm";
import { ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, Plus, Truck } from "lucide-react";
import { PrintButton } from "@/components/admin/print-button";
import { buttonClass, Card, PageHeader } from "@/components/admin/ui";
import { db } from "@/db";
import { customers, orderLines, orders } from "@/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { localParts, zonedDateTime } from "@/lib/availability/engine";
import { cn } from "@/lib/cn";
import { addressText } from "@/lib/customers";
import { formatLocal, TIMEZONE } from "@/lib/format";
import { translator, type MessageKey } from "@/lib/i18n/admin";
import { statusTone } from "@/lib/orders/status";

// Per-user back office page: rendered on request, no instant-navigation prefetch needed.
export const instant = false;

export const metadata: Metadata = { title: "Calendar" };

const ymdRe = /^\d{4}-\d{2}-\d{2}$/;

function shiftDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

type Event = { kind: "out" | "back"; at: Date; o: typeof orders.$inferSelect; name: string | null };

export default async function CalendarPage({ searchParams }: PageProps<"/admin/calendar">) {
  const user = await requireStaff();
  const t = translator(user.locale);
  const sp = await searchParams;
  const today = localParts(new Date(), TIMEZONE).date;
  const day = typeof sp.day === "string" && ymdRe.test(sp.day) ? sp.day : today;
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : day.slice(0, 7);

  // Weeks start on Sunday; the grid covers whole weeks around the month.
  const first = `${month}-01`;
  const firstDow = new Date(`${first}T12:00:00Z`).getUTCDay();
  const gridStart = shiftDays(first, -firstDow);
  const lastOfMonth = shiftDays(`${shiftMonth(month, 1)}-01`, -1);
  const gridEnd = shiftDays(lastOfMonth, 7 - new Date(`${lastOfMonth}T12:00:00Z`).getUTCDay());
  const from = zonedDateTime(gridStart, "00:00", TIMEZONE);
  const to = zonedDateTime(gridEnd, "00:00", TIMEZONE);

  const rows = await db
    .select({ o: orders, name: customers.name, phone: customers.phone, address: customers.address })
    .from(orders)
    .leftJoin(customers, eq(customers.id, orders.customerId))
    .where(
      and(
        ne(orders.status, "cancelled"),
        or(
          and(gte(orders.startsAt, from), lt(orders.startsAt, to)),
          and(gte(orders.endsAt, from), lt(orders.endsAt, to)),
        ),
      ),
    )
    .orderBy(asc(orders.startsAt));

  const byDay = new Map<string, Event[]>();
  const add = (date: string, e: Event) => byDay.set(date, [...(byDay.get(date) ?? []), e]);
  for (const r of rows) {
    add(localParts(r.o.startsAt, TIMEZONE).date, { kind: "out", at: r.o.startsAt, o: r.o, name: r.name });
    add(localParts(r.o.endsAt, TIMEZONE).date, { kind: "back", at: r.o.endsAt, o: r.o, name: r.name });
  }
  for (const list of byDay.values()) list.sort((a, b) => a.at.getTime() - b.at.getTime());

  const days: string[] = [];
  for (let d = gridStart; d < gridEnd; d = shiftDays(d, 1)) days.push(d);

  // Run sheet for the selected day: what leaves and what comes back, with the items.
  const sheet = byDay.get(day) ?? [];
  const sheetIds = [...new Set(sheet.map((e) => e.o.id))];
  const sheetLines = sheetIds.length
    ? await db
        .select()
        .from(orderLines)
        .where(and(inArray(orderLines.orderId, sheetIds), inArray(orderLines.kind, ["product", "bundle", "custom"])))
        .orderBy(asc(orderLines.position))
    : [];
  const contact = new Map(rows.map((r) => [r.o.id, r]));
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    formatLocal(zonedDateTime(shiftDays(gridStart, i), "12:00", TIMEZONE), "EEE"),
  );

  return (
    <>
      <PageHeader
        title={t("cal.title")}
        actions={
          <Link href={`/admin/bookings/new?date=${day}`} className={buttonClass("primary")}>
            <Plus className="size-4" /> {t("bookings.new")}
          </Link>
        }
      >
        <nav className="flex items-center gap-1 print:hidden" aria-label={t("cal.title")}>
          <Link
            href={`/admin/calendar?month=${shiftMonth(month, -1)}&day=${day}`}
            className={buttonClass("secondary")}
            aria-label={t("cal.prev")}
          >
            <ChevronLeft className="size-4" />
          </Link>
          <Link href="/admin/calendar" className={buttonClass("secondary")}>
            {t("cal.today")}
          </Link>
          <Link
            href={`/admin/calendar?month=${shiftMonth(month, 1)}&day=${day}`}
            className={buttonClass("secondary")}
            aria-label={t("cal.next")}
          >
            <ChevronRight className="size-4" />
          </Link>
          <span className="ml-2 text-lg font-semibold">
            {formatLocal(zonedDateTime(first, "12:00", TIMEZONE), "MMMM yyyy")}
          </span>
        </nav>
      </PageHeader>
      <div className="grid gap-5 p-4 md:p-6 xl:grid-cols-[minmax(0,1fr)_380px] print:block print:p-0">
        <div className="overflow-x-auto rounded-lg border border-admin-line bg-white print:hidden">
          <div className="grid min-w-[720px] grid-cols-7 border-b border-admin-line text-xs font-semibold text-admin-muted">
            {weekdays.map((w) => (
              <div key={w} className="px-2 py-2">
                {w}
              </div>
            ))}
          </div>
          <div className="grid min-w-[720px] grid-cols-7">
            {days.map((d) => {
              const events = byDay.get(d) ?? [];
              const inMonth = d.startsWith(month);
              return (
                <Link
                  key={d}
                  href={`/admin/calendar?month=${month}&day=${d}`}
                  aria-current={d === day ? "date" : undefined}
                  className={cn(
                    "min-h-28 border-r border-b border-admin-line p-1.5 text-xs hover:bg-admin-bg/60 [&:nth-child(7n)]:border-r-0",
                    !inMonth && "bg-admin-bg/50 text-admin-muted",
                    d === day && "ring-2 ring-admin-blue ring-inset",
                  )}
                >
                  <span
                    className={cn(
                      "mb-1 inline-flex size-6 items-center justify-center rounded-full font-semibold",
                      d === today && "bg-admin-blue text-white",
                    )}
                  >
                    {Number(d.slice(8))}
                  </span>
                  <ul className="space-y-0.5">
                    {events.slice(0, 4).map((e) => (
                      <li
                        key={`${e.kind}-${e.o.id}`}
                        className={cn(
                          "flex items-center gap-1 truncate rounded px-1 py-0.5",
                          e.kind === "out" ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900",
                          (e.o.status === "draft" || e.o.status === "quote_sent") && "opacity-60",
                        )}
                      >
                        {e.kind === "out" ? (
                          <ArrowUpRight className="size-3 shrink-0" aria-label={t("cal.out")} />
                        ) : (
                          <ArrowDownLeft className="size-3 shrink-0" aria-label={t("cal.back")} />
                        )}
                        <span
                          className="truncate"
                          title={`${formatLocal(e.at, "h:mm a")} #${e.o.number} ${e.name ?? ""}`}
                        >
                          #{e.o.number} {e.name ?? ""}
                        </span>
                      </li>
                    ))}
                    {events.length > 4 && <li className="px-1 text-admin-muted">+{events.length - 4}</li>}
                  </ul>
                </Link>
              );
            })}
          </div>
        </div>

        <Card
          title={`${t("cal.day")} · ${formatLocal(zonedDateTime(day, "12:00", TIMEZONE), "EEE, MMM d")}`}
          actions={sheet.length > 0 ? <PrintButton label={t("order.print")} /> : null}
          padded={false}
          className="print:border-0"
        >
          {sheet.length === 0 ? (
            <p className="px-5 py-6 text-sm text-admin-muted">{t("cal.nothing")}</p>
          ) : (
            <ol className="divide-y divide-admin-line">
              {sheet.map((e) => {
                const c = contact.get(e.o.id);
                return (
                  <li key={`${e.kind}-${e.o.id}`} className="break-inside-avoid px-5 py-4 text-sm">
                    <p className="flex items-center gap-2 font-semibold">
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-xs uppercase",
                          e.kind === "out" ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900",
                        )}
                      >
                        {e.kind === "out" ? t("cal.out") : t("cal.back")}
                      </span>
                      {formatLocal(e.at, "h:mm a")}
                      <Link href={`/admin/bookings/${e.o.id}`} className="text-admin-blue hover:underline">
                        #{e.o.number}
                      </Link>
                      <span className={cn("ml-auto text-xs", statusTone[e.o.status] === "red" && "text-red-600")}>
                        {t(`status.${e.o.status}` as MessageKey)}
                      </span>
                    </p>
                    <p className="mt-1">
                      {c?.name ?? "—"}
                      {c?.phone ? ` · ${c.phone}` : ""}
                    </p>
                    {e.o.fulfillment === "delivery" && (
                      <p className="mt-1 flex items-start gap-1.5 text-admin-muted">
                        <Truck className="mt-0.5 size-4 shrink-0" />
                        {e.o.deliveryAddress || addressText(c?.address) || "—"}
                      </p>
                    )}
                    <ul className="mt-2 space-y-0.5">
                      {sheetLines
                        .filter((l) => l.orderId === e.o.id)
                        .map((l) => (
                          <li key={l.id}>
                            <strong>{l.quantity}</strong> × {l.title}
                          </li>
                        ))}
                    </ul>
                    {e.o.deliveryNotes && <p className="mt-1 text-xs text-admin-muted">{e.o.deliveryNotes}</p>}
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      </div>
    </>
  );
}
