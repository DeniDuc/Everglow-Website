import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/ui";
import { requireStaff } from "@/lib/auth/session";
import { labelsByPrefix, translator } from "@/lib/i18n/admin";
import { ClientForm } from "../client-form";

// Per-user back office page: rendered on request, no instant-navigation prefetch needed.
export const instant = false;

export const metadata: Metadata = { title: "New client" };

export default async function NewClientPage() {
  const user = await requireStaff("editOrders");
  const t = translator(user.locale);
  return (
    <>
      <PageHeader back={{ href: "/admin/clients", label: t("clients.title") }} title={t("clients.new")} />
      <div className="max-w-3xl p-4 md:p-6">
        <ClientForm
          id={null}
          canEdit
          labels={labelsByPrefix(user.locale, ["clients.", "common.", "source."])}
          initial={{ name: "", email: "", phone: "", company: "", address: "", notes: "", source: "phone" }}
        />
      </div>
    </>
  );
}
