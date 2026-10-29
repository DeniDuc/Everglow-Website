import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/ui";
import { db } from "@/db";
import { requireStaff } from "@/lib/auth/session";
import { localParts } from "@/lib/availability/engine";
import { labelsByPrefix, translator } from "@/lib/i18n/admin";
import type { OrderDraft } from "@/lib/orders/schema";
import { loadSettings } from "@/lib/settings";
import { loadEditorData } from "../editor-data";
import { OrderEditor } from "../order-editor";

// Per-user back office page: rendered on request, no instant-navigation prefetch needed.
export const instant = false;

export const metadata: Metadata = { title: "New booking" };

function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default async function NewBookingPage({ searchParams }: PageProps<"/admin/bookings/new">) {
  const user = await requireStaff("editOrders");
  const t = translator(user.locale);
  const sp = await searchParams;
  const [settings, data] = await Promise.all([loadSettings(db), loadEditorData()]);

  const today = localParts(new Date(), settings.business.timezone).date;
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : addDays(today, 1);
  const customerId =
    typeof sp.customer === "string" && data.customers.some((c) => c.id === sp.customer) ? sp.customer : null;
  const initial: OrderDraft = {
    customerId,
    startDate: date,
    startTime: settings.booking.defaultPickupTime,
    endDate: addDays(date, Math.max(1, settings.pricing.defaultPeriodDays - 1)),
    endTime: settings.booking.defaultReturnTime,
    fulfillment: "pickup",
    deliveryTierId: null,
    outOfTownKm: 0,
    deliveryAddress: data.customers.find((c) => c.id === customerId)?.address ?? "",
    deliveryNotes: "",
    damageProtection: settings.pricing.damageProtectionDefaultOn,
    discountBp: 0,
    internalNotes: "",
    lines: [],
  };

  return (
    <>
      <PageHeader title={t("bookings.new")} back={{ href: "/admin/bookings", label: t("bookings.title") }} />
      <OrderEditor
        mode="new"
        orderId={null}
        initial={initial}
        catalog={data.catalog}
        tiers={data.tiers}
        customers={data.customers}
        labels={labelsByPrefix(user.locale, ["order.", "period.", "source.", "common.", "clients."])}
      />
    </>
  );
}
