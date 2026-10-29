import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { AlertTriangle, Eye, EyeOff, Plus } from "lucide-react";
import { Badge, buttonClass, Input, PageHeader, Table } from "@/components/admin/ui";
import { db } from "@/db";
import { collections, productCollections, productPhotos, products, productVariants, stockItems } from "@/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { money } from "@/lib/format";
import { translator } from "@/lib/i18n/admin";
import { priceLabel } from "@/lib/pricing";
import { createProduct } from "./actions";

// Per-user back office page: rendered on request, no instant-navigation prefetch needed.
export const instant = false;

export const metadata: Metadata = { title: "Inventory" };

export default async function InventoryPage({ searchParams }: PageProps<"/admin/inventory">) {
  const user = await requireStaff();
  const t = translator(user.locale);
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const col = typeof sp.collection === "string" ? sp.collection : "";

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      slug: products.slug,
      productType: products.productType,
      trackingType: products.trackingType,
      priceType: products.priceType,
      periodDays: products.periodDays,
      showInStore: products.showInStore,
      custom: products.custom,
      requiresDelivery: products.requiresDelivery,
      minPrice: sql<number>`(select min(base_price_cents) from ${productVariants} v where v.product_id = "products"."id" and v.archived_at is null)`,
      stock: sql<number>`(select coalesce(sum(case when "products"."tracking_type" = 'trackable' then (select count(*) from ${stockItems} si where si.variant_id = v.id and si.status <> 'retired') else v.stock_quantity end), 0)::int from ${productVariants} v where v.product_id = "products"."id" and v.archived_at is null)`,
      variants: sql<number>`(select count(*)::int from ${productVariants} v where v.product_id = "products"."id" and v.archived_at is null)`,
      photo: sql<
        string | null
      >`(select src from ${productPhotos} ph where ph.product_id = "products"."id" order by position limit 1)`,
      collectionSlugs: sql<
        string[]
      >`coalesce((select array_agg(c.slug) from ${productCollections} pc join ${collections} c on c.id = pc.collection_id where pc.product_id = "products"."id"), '{}')`,
    })
    .from(products)
    .where(isNull(products.archivedAt))
    .orderBy(asc(products.sortingWeight), asc(products.name));
  const allCollections = await db
    .select({ slug: collections.slug, name: collections.name })
    .from(collections)
    .where(and(eq(collections.visible, true)))
    .orderBy(asc(collections.position));

  const shown = rows.filter(
    (r) => (!q || r.name.toLowerCase().includes(q) || r.slug.includes(q)) && (!col || r.collectionSlugs.includes(col)),
  );
  const toConfirm = rows.filter((r) => r.custom?.stockToConfirm).length;

  return (
    <>
      <PageHeader
        title={t("inv.title")}
        actions={
          can(user.role, "editCatalog") && (
            <form action={createProduct} className="flex gap-2">
              <Input
                name="name"
                placeholder={t("common.name")}
                className="hidden w-48 sm:block"
                aria-label="New product name"
              />
              <button type="submit" className={buttonClass("primary")}>
                <Plus className="size-4" /> {t("inv.addProduct")}
              </button>
            </form>
          )
        }
      >
        <form className="w-full max-w-xs" role="search">
          <Input name="q" defaultValue={q} placeholder={t("common.search")} aria-label="Search products" />
          {col && <input type="hidden" name="collection" value={col} />}
        </form>
      </PageHeader>
      <div className="space-y-4 p-4 md:p-6">
        {toConfirm > 0 && (
          <p className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <AlertTriangle className="size-4 shrink-0" /> {t("dash.stockWarning")} ({toConfirm})
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/inventory"
            className={buttonClass(col ? "secondary" : "primary") + " h-8 rounded-full px-3 text-xs"}
          >
            {t("common.all")} ({rows.length})
          </Link>
          {allCollections.map((c) => (
            <Link
              key={c.slug}
              href={`/admin/inventory?collection=${c.slug}`}
              className={buttonClass(col === c.slug ? "primary" : "secondary") + " h-8 rounded-full px-3 text-xs"}
            >
              {c.name}
            </Link>
          ))}
        </div>
        <p className="text-sm text-admin-muted">
          Showing {shown.length} of {rows.length}
        </p>
        <Table head={[t("common.name"), t("inv.productType"), t("inv.pricing"), t("inv.stock"), t("inv.onlineStore")]}>
          {shown.map((r) => (
            <tr key={r.id} className="hover:bg-admin-bg/60">
              <td className="px-4 py-3">
                <Link
                  href={`/admin/inventory/${r.id}`}
                  className="flex items-center gap-3 font-semibold hover:text-admin-blue"
                >
                  <span className="relative size-10 shrink-0 overflow-hidden rounded border border-admin-line bg-white">
                    {r.photo && <Image src={r.photo} alt="" fill sizes="40px" className="object-contain" />}
                  </span>
                  <span>
                    {r.name}
                    {r.variants > 1 && (
                      <span className="block text-xs font-normal text-admin-muted">{r.variants} variants</span>
                    )}
                  </span>
                </Link>
              </td>
              <td className="whitespace-nowrap px-4 py-3">
                {r.productType === "rental"
                  ? t("inv.rental")
                  : r.productType === "service"
                    ? t("inv.service")
                    : t("inv.bundle")}
              </td>
              <td className="whitespace-nowrap px-4 py-3">
                <span className="block text-admin-muted">
                  {priceLabel({ priceType: r.priceType, periodDays: r.periodDays })}
                </span>
                {money(r.minPrice ?? 0)}
              </td>
              <td className="whitespace-nowrap px-4 py-3">
                {r.stock}
                {r.custom?.stockToConfirm && (
                  <span className="ml-2">
                    <Badge tone="amber">{t("inv.toConfirm")}</Badge>
                  </span>
                )}
              </td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center gap-1.5 rounded border border-admin-line px-2.5 py-1 text-xs font-semibold">
                  {r.showInStore ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                  {r.showInStore ? t("common.visible") : t("common.hidden")}
                </span>
              </td>
            </tr>
          ))}
        </Table>
      </div>
    </>
  );
}
