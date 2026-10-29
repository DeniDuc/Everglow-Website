import { ComingSoon } from "@/components/admin/coming-soon";
import { requireStaff } from "@/lib/auth/session";

// Per-user back office page: rendered on request, no instant-navigation prefetch needed.
export const instant = false;

export default async function DocumentsPage() {
  await requireStaff();
  return (
    <ComingSoon
      title="Documents"
      phase="Phase 6 — Documents & emails"
      items={[
        "Quotes, invoices (auto-numbered, continuing after Booqable), contracts, packing slips",
        "E-signature of the full rental agreement online, signature pad at handover",
        "ID-checked record at pickup/delivery",
      ]}
    />
  );
}
