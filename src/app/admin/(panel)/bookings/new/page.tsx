import { ComingSoon } from "@/components/admin/coming-soon";
import { requireStaff } from "@/lib/auth/session";

// Per-user back office page: rendered on request, no instant-navigation prefetch needed.
export const instant = false;

export default async function NewBookingPage() {
  await requireStaff();
  return (
    <ComingSoon
      title="New booking"
      phase="Phase 4 — Orders"
      items={[
        "Create bookings for phone / Facebook Marketplace clients",
        "Product picker with live availability and low-stock warnings",
        "Delivery tier suggestion, custom lines, price overrides with reason",
      ]}
    />
  );
}
