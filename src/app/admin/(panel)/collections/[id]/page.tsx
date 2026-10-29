import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/admin/ui";
import { db } from "@/db";
import { collections } from "@/db/schema";
import { can } from "@/lib/auth/roles";
import { requireStaff } from "@/lib/auth/session";
import { CollectionEditor } from "./collection-editor";

// Per-user back office page: rendered on request, no instant-navigation prefetch needed.
export const instant = false;

export const metadata: Metadata = { title: "Edit collection" };

export default async function CollectionEditPage({ params }: PageProps<"/admin/collections/[id]">) {
  const user = await requireStaff();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [c] = await db.select().from(collections).where(eq(collections.id, id));
  if (!c) notFound();
  const all = await db
    .select({ id: collections.id, name: collections.name })
    .from(collections)
    .orderBy(asc(collections.position));
  return (
    <>
      <PageHeader title={c.name} back={{ href: "/admin/collections", label: "Collections" }} />
      <CollectionEditor
        canEdit={can(user.role, "editCatalog")}
        image={c.image}
        parents={all}
        initial={{
          id: c.id,
          name: c.name,
          slug: c.slug,
          descriptionHtml: c.descriptionHtml ?? "",
          parentId: c.parentId,
          position: c.position,
          featured: c.featured,
          visible: c.visible,
          seoTitle: c.seoTitle,
          seoDescription: c.seoDescription,
        }}
      />
    </>
  );
}
