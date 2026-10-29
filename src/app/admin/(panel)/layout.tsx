import { Suspense } from "react";
import { and, isNull, sql } from "drizzle-orm";
import { Sidebar } from "@/components/admin/sidebar";
import { db } from "@/db";
import { inquiries } from "@/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { labelsFor } from "@/lib/i18n/admin";

async function Shell({ children }: { children: React.ReactNode }) {
  const user = await requireStaff("view", { skip2faSetup: true });
  const labels = labelsFor(user.locale, [
    "nav.newBooking",
    "nav.dashboard",
    "nav.calendar",
    "nav.bookings",
    "nav.clients",
    "nav.inventory",
    "nav.collections",
    "nav.documents",
    "nav.inquiries",
    "nav.onlineStore",
    "nav.reports",
    "nav.settings",
    "nav.account",
    "nav.logout",
    "nav.viewSite",
  ]);
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(inquiries)
    .where(and(isNull(inquiries.handledAt)));
  return (
    <div className="flex min-h-dvh">
      <Sidebar labels={labels} user={{ name: user.name, email: user.email, role: user.role }} newInquiries={n} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh">
          <div className="hidden w-60 border-r border-admin-line bg-white lg:block" />
          <div className="flex-1" />
        </div>
      }
    >
      <Shell>{children}</Shell>
    </Suspense>
  );
}
