import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import { Badge, Button, EmptyState, PageHeader } from "@/components/admin/ui";
import { db } from "@/db";
import { inquiries } from "@/db/schema";
import { audit, requireStaff } from "@/lib/auth/session";
import { formatLocal } from "@/lib/format";
import { translator } from "@/lib/i18n/admin";

// Per-user back office page: rendered on request, no instant-navigation prefetch needed.
export const instant = false;

export const metadata: Metadata = { title: "Inquiries" };

async function markHandled(id: string) {
  "use server";
  const user = await requireStaff("editOrders");
  await db.update(inquiries).set({ handledAt: new Date() }).where(eq(inquiries.id, id));
  await audit(user.id, "inquiry_handled", "inquiry", id);
  revalidatePath("/admin/inquiries");
}

export default async function InquiriesPage() {
  const user = await requireStaff();
  const t = translator(user.locale);
  const rows = await db.select().from(inquiries).orderBy(desc(inquiries.createdAt)).limit(200);
  return (
    <>
      <PageHeader title={t("inq.title")} />
      <div className="space-y-3 p-4 md:p-6">
        {rows.length === 0 && (
          <div className="rounded-lg border border-admin-line bg-white">
            <EmptyState title={t("common.noResults")} text="Messages from the website contact form appear here." />
          </div>
        )}
        {rows.map((i) => (
          <article key={i.id} className="rounded-lg border border-admin-line bg-white p-5">
            <header className="flex flex-wrap items-center gap-3">
              <h2 className="font-semibold">{i.name}</h2>
              <a href={`mailto:${i.email}`} className="text-sm text-admin-blue">
                {i.email}
              </a>
              {i.phone && (
                <a href={`tel:${i.phone}`} className="text-sm text-admin-blue">
                  {i.phone}
                </a>
              )}
              <span className="ml-auto text-xs text-admin-muted">{formatLocal(i.createdAt, "dd-MM-yyyy h:mm a")}</span>
              {i.handledAt ? (
                <Badge tone="green">{t("inq.handled")}</Badge>
              ) : (
                <form action={markHandled.bind(null, i.id)}>
                  <Button type="submit" className="h-8">
                    {t("inq.markHandled")}
                  </Button>
                </form>
              )}
            </header>
            <p className="mt-3 whitespace-pre-wrap text-sm">{i.message}</p>
          </article>
        ))}
      </div>
    </>
  );
}
