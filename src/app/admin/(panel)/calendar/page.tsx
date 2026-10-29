import { ComingSoon } from "@/components/admin/coming-soon";
import { requireStaff } from "@/lib/auth/session";

// Per-user back office page: rendered on request, no instant-navigation prefetch needed.
export const instant = false;

export default async function CalendarPage() {
  await requireStaff();
  return (
    <ComingSoon
      title="Calendar"
      phase="Phase 4 — Orders"
      items={[
        "Month / week / day views of pickups, deliveries and returns",
        "Downtime blocks",
        "Availability view per product for any date range",
      ]}
    />
  );
}
