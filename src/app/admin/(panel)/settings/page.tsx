import type { Metadata } from "next";
import Link from "next/link";
import { asc } from "drizzle-orm";
import { Trash2 } from "lucide-react";
import { Button, Card, Input, PageHeader } from "@/components/admin/ui";
import { db } from "@/db";
import { blackoutDates, deliveryTiers, faqItems, pages, staffUsers, taxRates } from "@/db/schema";
import { can } from "@/lib/auth/roles";
import { requireStaff } from "@/lib/auth/session";
import { translator, type MessageKey } from "@/lib/i18n/admin";
import { loadSettings } from "@/lib/settings";
import { cn } from "@/lib/cn";
import { addBlackout, removeBlackout } from "./actions";
import {
  CancellationEditor,
  DeliveryTiersEditor,
  FaqEditor,
  PageContentEditor,
  SettingsForm,
  StaffManager,
  TaxRatesEditor,
} from "./settings-forms";

// Per-user back office page: rendered on request, no instant-navigation prefetch needed.
export const instant = false;

export const metadata: Metadata = { title: "Settings" };

const tabs: { key: string; label: MessageKey }[] = [
  { key: "business", label: "settings.business" },
  { key: "booking", label: "settings.booking" },
  { key: "payments", label: "settings.payments" },
  { key: "pricing", label: "settings.pricing" },
  { key: "delivery", label: "settings.delivery" },
  { key: "blackouts", label: "settings.blackouts" },
  { key: "content", label: "settings.content" },
  { key: "staff", label: "settings.staff" },
  { key: "security", label: "settings.security" },
];

export default async function SettingsPage({ searchParams }: PageProps<"/admin/settings">) {
  const user = await requireStaff();
  const t = translator(user.locale);
  const tab = String((await searchParams).tab ?? "business");
  const canEdit = can(user.role, "editSettings");
  const s = await loadSettings(db);

  let body: React.ReactNode = null;
  if (tab === "business") {
    body = (
      <SettingsForm
        title={t("settings.business")}
        settingsKey="business"
        initial={s.business}
        canEdit={canEdit}
        fields={[
          { name: "name", label: "Business name", type: "text" },
          { name: "legalName", label: "Legal name (documents)", type: "text" },
          { name: "tagline", label: "Tagline", type: "text", wide: true },
          { name: "street", label: "Street", type: "text" },
          { name: "city", label: "City", type: "text" },
          { name: "province", label: "Province", type: "text" },
          { name: "postalCode", label: "Postal code", type: "text" },
          { name: "phone", label: "Phone", type: "text" },
          { name: "email", label: "Public email", type: "email" },
          { name: "facebookUrl", label: "Facebook", type: "text" },
          { name: "instagramUrl", label: "Instagram", type: "text" },
        ]}
      />
    );
  } else if (tab === "booking") {
    body = (
      <SettingsForm
        title={t("settings.booking")}
        settingsKey="booking"
        initial={s.booking}
        canEdit={canEdit}
        description="Rules customers see in the online store. Staff can always book outside them."
        fields={[
          {
            name: "minNoticeHours",
            label: "Minimum notice (hours)",
            type: "number",
            hint: "How soon before pickup a customer can book online.",
          },
          { name: "maxAdvanceDays", label: "Book up to (days ahead)", type: "number" },
          { name: "openTime", label: "Earliest pickup/return time", type: "time" },
          { name: "closeTime", label: "Latest pickup/return time", type: "time" },
          { name: "slotMinutes", label: "Time step (minutes)", type: "number" },
          {
            name: "defaultBufferAfterMinutes",
            label: "Turnaround between rentals (minutes)",
            type: "number",
            hint: "Cleaning/checking time added after every return.",
          },
          { name: "defaultPickupTime", label: "Default pickup time", type: "time" },
          { name: "defaultReturnTime", label: "Default return time", type: "time" },
          { name: "cartHoldMinutes", label: "Hold items during checkout (minutes)", type: "number" },
          { name: "quotesHoldStock", label: "Quotes and drafts reserve stock", type: "bool" },
        ]}
      />
    );
  } else if (tab === "payments") {
    body = (
      <div className="space-y-5">
        <SettingsForm
          title={t("settings.payments")}
          settingsKey="payments"
          initial={s.payments}
          canEdit={canEdit}
          fields={[
            { name: "depositBp", label: "Deposit at booking", type: "percent" },
            { name: "nonRefundableBp", label: "Non-refundable part of the order", type: "percent" },
            { name: "rushThresholdDays", label: "Full prepayment when the event is within (days)", type: "number" },
            { name: "balanceDueDaysBefore", label: "Balance due (days before event)", type: "number" },
            {
              name: "reminderDaysBefore",
              label: "Balance reminders (days before, comma separated)",
              type: "days-list",
            },
            { name: "autoChargeDaysBefore", label: "Automatic balance charge (days before)", type: "days-list" },
            {
              name: "autoChargeEnabled",
              label: "Charge the saved card automatically on those days",
              type: "bool",
              hint: "Off: staff charge manually from the order. Turns on with Stripe in phase 5.",
            },
          ]}
        />
        <CancellationEditor initial={s.cancellation.tiers} canEdit={canEdit} />
      </div>
    );
  } else if (tab === "pricing") {
    const rates = await db.select().from(taxRates).orderBy(asc(taxRates.position));
    body = (
      <div className="space-y-5">
        <SettingsForm
          title={t("settings.pricing")}
          settingsKey="pricing"
          initial={s.pricing}
          canEdit={canEdit}
          fields={[
            { name: "defaultPeriodDays", label: "Default days included in the price", type: "number" },
            { name: "extraDayBp", label: "Extra day price (of base price, when a product has none)", type: "percent" },
            {
              name: "damageProtectionBp",
              label: "Damage Protection Plan",
              type: "percent",
              hint: "Charged on rental items only (not delivery or services).",
            },
            { name: "damageProtectionDefaultOn", label: "Add damage protection by default", type: "bool" },
            { name: "taxesEnabled", label: "Charge taxes", type: "bool" },
            { name: "pricesIncludeTax", label: "Prices already include tax", type: "bool" },
          ]}
        />
        <TaxRatesEditor
          initial={rates.map((r) => ({
            id: r.id,
            name: r.name,
            rateBp: r.rateBp,
            active: r.active,
            position: r.position,
          }))}
          canEdit={canEdit}
          enabled={s.pricing.taxesEnabled}
        />
      </div>
    );
  } else if (tab === "delivery") {
    const tiers = await db.select().from(deliveryTiers).orderBy(asc(deliveryTiers.position));
    body = (
      <div className="space-y-5">
        <DeliveryTiersEditor initial={tiers} canEdit={canEdit} />
        <SettingsForm
          title={t("settings.delivery")}
          settingsKey="delivery"
          initial={s.delivery}
          canEdit={canEdit}
          fields={[
            { name: "perKmCents", label: "Out of town, per km", type: "money" },
            { name: "originAddress", label: "Warehouse address (distance origin)", type: "text", wide: true },
            { name: "deliveryNote", label: "Note shown to customers with delivery", type: "textarea", wide: true },
          ]}
        />
      </div>
    );
  } else if (tab === "blackouts") {
    const dates = await db.select().from(blackoutDates).orderBy(asc(blackoutDates.date));
    body = (
      <Card title={t("settings.blackouts")}>
        <p className="mb-4 text-sm text-admin-muted">
          Customers can&apos;t pick up or return on these dates (holidays, away mode). Staff can still book manually.
        </p>
        <ul className="mb-4 divide-y divide-admin-line rounded-md border border-admin-line">
          {dates.length === 0 && <li className="px-4 py-3 text-sm text-admin-muted">—</li>}
          {dates.map((d) => (
            <li key={d.id} className="flex items-center justify-between px-4 py-2 text-sm">
              <span>
                <strong>{d.date}</strong> {d.reason && <span className="text-admin-muted">· {d.reason}</span>}
              </span>
              {canEdit && (
                <form action={removeBlackout.bind(null, d.id)}>
                  <button type="submit" className="rounded p-1.5 text-red-600 hover:bg-red-50" aria-label="Remove date">
                    <Trash2 className="size-4" />
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
        {canEdit && (
          <form action={addBlackout} className="flex flex-wrap gap-2">
            <Input type="date" name="date" required className="w-44" />
            <Input name="reason" placeholder="Reason (optional)" className="w-64" />
            <Button type="submit" variant="primary">
              Add date
            </Button>
          </form>
        )}
      </Card>
    );
  } else if (tab === "content") {
    const [allPages, faq] = await Promise.all([
      db.select().from(pages).orderBy(asc(pages.slug)),
      db.select().from(faqItems).orderBy(asc(faqItems.position)),
    ]);
    body = (
      <div className="space-y-5">
        <FaqEditor
          initial={faq.map((f) => ({ id: f.id, question: f.question, answerHtml: f.answerHtml, visible: f.visible }))}
          canEdit={canEdit}
        />
        {allPages.map((p) => (
          <PageContentEditor
            key={p.slug}
            canEdit={canEdit}
            page={{
              slug: p.slug,
              title: p.title,
              bodyHtml: p.bodyHtml,
              version: p.version,
              seoTitle: p.seoTitle,
              seoDescription: p.seoDescription,
            }}
          />
        ))}
      </div>
    );
  } else if (tab === "staff") {
    const staff = await db.select().from(staffUsers).orderBy(asc(staffUsers.createdAt));
    body = (
      <StaffManager
        currentUserId={user.id}
        canManage={can(user.role, "manageStaff")}
        staff={staff.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          disabled: u.disabled,
          totpEnabled: u.totpEnabled,
          lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        }))}
      />
    );
  } else if (tab === "security") {
    body = (
      <SettingsForm
        title={t("settings.security")}
        settingsKey="security"
        initial={s.security}
        canEdit={canEdit}
        fields={[
          { name: "require2fa", label: "Require two-step verification for every staff account", type: "bool" },
          { name: "sessionIdleHours", label: "Sign out after inactivity (hours)", type: "number" },
        ]}
      />
    );
  }

  return (
    <>
      <PageHeader title={t("settings.title")} />
      <div className="grid gap-5 p-4 md:p-6 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Settings sections" className="no-scrollbar flex gap-1 overflow-x-auto lg:flex-col">
          {tabs.map((tb) => (
            <Link
              key={tb.key}
              href={`/admin/settings?tab=${tb.key}`}
              className={cn(
                "shrink-0 rounded-md px-3 py-2 text-sm",
                tab === tb.key
                  ? "bg-white font-semibold text-admin-blue shadow-sm"
                  : "text-admin-text hover:bg-white/60",
              )}
            >
              {t(tb.label)}
            </Link>
          ))}
        </nav>
        <div className="min-w-0 max-w-4xl">
          {!canEdit && (
            <p className="mb-4 rounded-md bg-amber-50 px-4 py-2 text-sm text-amber-900">
              Only the owner can change settings.
            </p>
          )}
          {body}
        </div>
      </div>
    </>
  );
}
