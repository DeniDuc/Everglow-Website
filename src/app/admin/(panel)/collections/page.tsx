import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { asc, sql } from "drizzle-orm";
import { Plus } from "lucide-react";
import { Badge, buttonClass, Input, PageHeader, Table } from "@/components/admin/ui";
import { db } from "@/db";
import { collections, productCollections } from "@/db/schema";
import { can } from "@/lib/auth/roles";
import { requireStaff } from "@/lib/auth/session";
import { translator } from "@/lib/i18n/admin";
import { createCollection } from "./actions";

// Per-user back office page: rendered on request, no instant-navigation prefetch needed.
export const instant = false;

export const metadata: Metadata = { title: "Collections" };

export default async function CollectionsPage() {
  const user = await requireStaff();
  const t = translator(user.locale);
  const rows = await db
    .select({
      c: collections,
      count: sql<number>`(select count(*)::int from ${productCollections} pc where pc.collection_id = "collections"."id")`,
    })
    .from(collections)
    .orderBy(asc(collections.position), asc(collections.name));
  const names = new Map(rows.map((r) => [r.c.id, r.c.name]));
  return (
    <>
      <PageHeader
        title={t("col.title")}
        actions={
          can(user.role, "editCatalog") && (
            <form action={createCollection} className="flex gap-2">
              <Input
                name="name"
                placeholder={t("common.name")}
                className="hidden w-48 sm:block"
                aria-label="New collection name"
              />
              <button className={buttonClass("primary")}>
                <Plus className="size-4" /> {t("common.add")}
              </button>
            </form>
          )
        }
      />
      <div className="p-4 md:p-6">
        <Table head={[t("common.name"), "URL", "Parent", t("col.items"), t("inv.onlineStore")]}>
          {rows.map(({ c, count }) => (
            <tr key={c.id} className="hover:bg-admin-bg/60">
              <td className="px-4 py-3">
                <Link
                  href={`/admin/collections/${c.id}`}
                  className="flex items-center gap-3 font-semibold hover:text-admin-blue"
                >
                  <span className="relative size-10 overflow-hidden rounded bg-admin-bg">
                    {c.image && <Image src={c.image} alt="" fill sizes="40px" className="object-cover" />}
                  </span>
                  {c.name}
                </Link>
              </td>
              <td className="px-4 py-3 text-admin-muted">/collections/{c.slug}</td>
              <td className="px-4 py-3">{c.parentId ? names.get(c.parentId) : "—"}</td>
              <td className="px-4 py-3">{count}</td>
              <td className="px-4 py-3">
                {c.visible ? <Badge tone="green">{t("common.visible")}</Badge> : <Badge>{t("common.hidden")}</Badge>}
                {c.featured && (
                  <span className="ml-1">
                    <Badge tone="blue">Menu</Badge>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </div>
    </>
  );
}
