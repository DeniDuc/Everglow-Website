import { ComingSoon } from "@/components/admin/coming-soon";
import { requireStaff } from "@/lib/auth/session";

// Per-user back office page: rendered on request, no instant-navigation prefetch needed.
export const instant = false;

export default async function BookingsPage() {
  await requireStaff();
  return (
    <ComingSoon
      title="Bookings"
      phase="Phase 4 — Orders"
      items={[
        "List with filters (status, payment, dates, tags, delivery/pickup, late) and bulk actions",
        "Order page: client, dates, items with live availability, price breakdown, payments, documents, notes, email log",
        "Statuses: Draft → Quote sent → Reserved → Ready → Out → Returned → Closed, plus Cancelled and Late",
        "Import of existing Booqable bookings so no event is lost",
      ]}
    />
  );
}
