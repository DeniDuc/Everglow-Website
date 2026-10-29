import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { Plus } from "lucide-react";
import { Badge, buttonClass, Card, EmptyState, PageHeader } from "@/components/admin/ui";
import { db } from "@/db";
import { customers, orders } from "@/db/schema";
import { can } from "@/lib/auth/roles";
import { requireStaff } from "@/lib/auth/session";
import { addressText } from "@/lib/customers";
import { formatLocal, money } from "@/lib/format";
import { labelsByPrefix, translator, type MessageKey } from "@/lib/i18n/admin";
import { paymentState, statusTone } from "@/lib/orders/status";
import { ClientForm } from "../client-form";

// Per-user back office page: rendered on request, no instant-navigation prefetch needed.
export const instant = false;

export const metadata: Metadata = { title: "Client" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ClientPage({ params }: PageProps<"/admin/clients/[id]">) {
  const user = await requireStaff();
  const t = translator(user.locale);
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [c] = await db.select().from(customers).where(eq(customers.id, id));
  if (!c) notFound();
  const list = await db.select().from(orders).where(eq(orders.customerId, id)).orderBy(desc(orders.startsAt));
  const booked = list.filter((o) => o.status !== "cancelled").reduce((s, o) => s + o.totalCents, 0);
  const canEdit = can(user.role, "editOrders");

  return (
    <>
      <PageHeader
        back={{ href: "/admin/clients", label: t("clients.title") }}
        title={c.name}
        actions={
          canEdit && (
            <Link href={`/admin/bookings/new?customer=${c.id}`} className={buttonClass("primary")}>
              <Plus className="size-4" /> {t("clients.newBooking")}
            </Link>
          )
        }
      >
        <span className="text-sm text-admin-muted">#{c.number}</span>
      </PageHeader>
      <div className="grid gap-5 p-4 md:p-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ClientForm
          id={c.id}
          canEdit={canEdit}
          labels={labelsByPrefix(user.locale, ["clients.", "common.", "source."])}
          initial={{
            name: c.name,
            email: c.email ?? "",
            phone: c.phone ?? "",
            company: c.company ?? "",
            address: addressText(c.address, "\n"),
            notes: c.notes ?? "",
            source: c.source,
          }}
        />
        <Card
          title={t("clients.bookings")}
          padded={false}
          actions={
            <span className="text-sm text-admin-muted">
              {t("clients.spent")} {money(booked)}
            </span>
          }
        >
          {list.length === 0 ? (
            <EmptyState title={t("bookings.empty")} />
          ) : (
            <ul className="divide-y divide-admin-line">
              {list.map((o) => {
                const pay = paymentState(o.totalCents, o.paidCents);
                return (
                  <li key={o.id}>
                    <Link
                      href={`/admin/bookings/${o.id}`}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-sm hover:bg-admin-bg/60"
                    >
                      <strong className="text-admin-blue">#{o.number}</strong>
                      <span>
                        {formatLocal(o.startsAt, "MMM d")} – {formatLocal(o.endsAt, "MMM d, yyyy")}
                      </span>
                      <Badge tone={statusTone[o.status]}>{t(`status.${o.status}` as MessageKey)}</Badge>
                      <span className="ml-auto font-semibold">{money(o.totalCents)}</span>
                      <Badge tone={pay === "paid" ? "green" : pay === "partial" ? "amber" : "red"}>
                        {t(`pay.${pay}` as MessageKey)}
                      </Badge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
