import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronRight } from "lucide-react";
import { CatalogueBrowser } from "@/components/store/catalogue-browser";
import { JsonLd } from "@/components/store/json-ld";
import { PageHero } from "@/components/store/page-hero";
import { getCollections, getStoreProducts } from "@/lib/store/catalog";
import { breadcrumbJsonLd, textFromHtml } from "@/lib/seo";

export async function generateStaticParams() {
  const collections = await getCollections();
  return collections.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: PageProps<"/collections/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const c = (await getCollections()).find((x) => x.slug === slug);
  if (!c) return {};
  return {
    title: c.seoTitle ?? `${c.name} Rentals in Winnipeg`,
    description: c.seoDescription ?? textFromHtml(c.descriptionHtml),
    alternates: { canonical: `/collections/${c.slug}` },
    openGraph: c.image ? { images: [{ url: c.image }] } : undefined,
  };
}

async function Collection({ params }: { params: PageProps<"/collections/[slug]">["params"] }) {
  const { slug } = await params;
  const [collections, products] = await Promise.all([getCollections(), getStoreProducts()]);
  const c = collections.find((x) => x.slug === slug);
  if (!c) notFound();
  const children = collections.filter((x) => x.parentId === c.id);
  const items = products.filter(
    (p) => p.collectionSlugs.includes(c.slug) || children.some((ch) => p.collectionSlugs.includes(ch.slug)),
  );
  const filters = children
    .filter((ch) => items.some((p) => p.collectionSlugs.includes(ch.slug)))
    .map((ch) => ({ slug: ch.slug, name: ch.name }));
  const parent = collections.find((x) => x.id === c.parentId);

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Catalogue", path: "/pages/catalogue" },
          { name: c.name, path: `/collections/${c.slug}` },
        ])}
      />
      <PageHero
        title={c.name}
        image={c.image}
        intro={c.descriptionHtml ? <div dangerouslySetInnerHTML={{ __html: c.descriptionHtml }} /> : undefined}
      />
      <div className="container-page py-12 md:py-16">
        <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-1.5 text-sm text-ink-muted">
          <Link href="/" className="hover:text-ink">
            Home
          </Link>
          <ChevronRight className="size-3.5" />
          <Link href="/pages/catalogue" className="hover:text-ink">
            Catalogue
          </Link>
          {parent && parent.slug !== "rental-catalogue" && (
            <>
              <ChevronRight className="size-3.5" />
              <Link href={`/collections/${parent.slug}`} className="hover:text-ink">
                {parent.name}
              </Link>
            </>
          )}
          <ChevronRight className="size-3.5" />
          <span className="text-ink" aria-current="page">
            {c.name}
          </span>
        </nav>
        <CatalogueBrowser products={items} filters={filters} showSearch={items.length > 8} />
      </div>
    </>
  );
}

export default function CollectionPage(props: PageProps<"/collections/[slug]">) {
  return (
    <Suspense fallback={<div className="min-h-[60vh]" />}>
      <Collection params={props.params} />
    </Suspense>
  );
}
