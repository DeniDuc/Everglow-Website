import { ComingSoon } from "@/components/admin/coming-soon";
import { requireStaff } from "@/lib/auth/session";

// Per-user back office page: rendered on request, no instant-navigation prefetch needed.
export const instant = false;

export default async function ReportsPage() {
  await requireStaff("viewReports");
  return (
    <ComingSoon
      title="Reports"
      phase="Phase 7 — Reports"
      items={[
        "Revenue by period, orders and average order value",
        "Product performance and utilization",
        "Customer value, coupons, CSV export everywhere",
      ]}
    />
  );
}
