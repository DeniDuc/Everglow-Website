import type { Metadata } from "next";
import { desc, isNull } from "drizzle-orm";
import { Badge, EmptyState, Input, PageHeader, Table } from "@/components/admin/ui";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { formatLocal } from "@/lib/format";
import { translator } from "@/lib/i18n/admin";

// Per-user back office page: rendered on request, no instant-navigation prefetch needed.
export const instant = false;

export const metadata: Metadata = { title: "Clients" };

const sourceLabel: Record<string, string> = {
  website: "Website",
  facebook_marketplace: "Facebook Marketplace",
  phone: "Phone",
  referral: "Referral",
  walk_in: "Walk-in",
  other: "Other",
};

export default async function ClientsPage({ searchParams }: PageProps<"/admin/clients">) {
  const user = await requireStaff();
  const t = translator(user.locale);
  const q = String((await searchParams).q ?? "")
    .trim()
    .toLowerCase();
  // Personal data is encrypted at rest, so search happens after decryption (fine at this scale).
  const rows = await db
    .select()
    .from(customers)
    .where(isNull(customers.archivedAt))
    .orderBy(desc(customers.number))
    .limit(5000);
  const shown = q
    ? rows.filter((c) => [c.name, c.email, c.phone, c.company].some((v) => v?.toLowerCase().includes(q)))
    : rows;
  return (
    <>
      <PageHeader title={t("clients.title")}>
        <form className="w-full max-w-xs" role="search">
          <Input name="q" defaultValue={q} placeholder={t("common.search")} aria-label="Search clients" />
        </form>
      </PageHeader>
      <div className="p-4 md:p-6">
        {shown.length === 0 ? (
          <div className="rounded-lg border border-admin-line bg-white">
            <EmptyState
              title={t("common.noResults")}
              text="Clients are created from website bookings, the contact form, manual orders and the Booqable import."
            />
          </div>
        ) : (
          <Table
            head={[
              "#",
              t("common.name"),
              t("common.email"),
              t("common.phone"),
              t("clients.source"),
              t("common.created"),
              "Tags",
            ]}
          >
            {shown.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3 font-semibold">#{c.number}</td>
                <td className="px-4 py-3 font-semibold">{c.name}</td>
                <td className="px-4 py-3">{c.email}</td>
                <td className="px-4 py-3">{c.phone}</td>
                <td className="px-4 py-3">{sourceLabel[c.source]}</td>
                <td className="whitespace-nowrap px-4 py-3">{formatLocal(c.createdAt, "dd-MM-yyyy")}</td>
                <td className="px-4 py-3">
                  {c.tags.map((tag) => (
                    <span key={tag} className="mr-1">
                      <Badge>{tag.toUpperCase()}</Badge>
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </div>
    </>
  );
}
