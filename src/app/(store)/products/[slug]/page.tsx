import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronRight } from "lucide-react";
import { BookingPanel } from "@/components/store/booking-panel";
import { Gallery } from "@/components/store/gallery";
import { JsonLd } from "@/components/store/json-ld";
import { ProductCard } from "@/components/store/product-card";
import { SectionHeading } from "@/components/ui/section-heading";
import { getProductBySlug, getStoreProducts, getStoreSettings } from "@/lib/store/catalog";
import { breadcrumbJsonLd, productJsonLd, textFromHtml } from "@/lib/seo";

export async function generateStaticParams() {
  const products = await getStoreProducts();
  return products.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/products/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const p = await getProductBySlug(slug);
  if (!p) return {};
  const description = p.seoDescription ?? textFromHtml(p.descriptionHtml);
  return {
    title: p.seoTitle ?? `${p.name} Rental in Winnipeg`,
    description,
    alternates: { canonical: `/products/${p.slug}` },
    openGraph: { title: p.name, description, images: p.photos.slice(0, 1).map((ph) => ({ url: ph.src, alt: ph.alt })) },
  };
}

async function Product({ params }: { params: PageProps<"/products/[slug]">["params"] }) {
  const { slug } = await params;
  const [p, all, settings] = await Promise.all([getProductBySlug(slug), getStoreProducts(), getStoreSettings()]);
  if (!p) notFound();
  const main = p.collections.find((c) => c.slug !== "rental-catalogue") ?? p.collections[0];
  const related = all
    .filter((x) => x.id !== p.id)
    // Cross-sell: items from other collections first (tables and chairs with a tent), popular first.
    .map((x) => {
      const sameCollection = x.collectionSlugs.some(
        (s) => s !== "rental-catalogue" && p.collections.some((c) => c.slug === s),
      );
      return { x, score: (sameCollection ? 2 : 0) + (x.featured ? 0 : 1) };
    })
    .sort((a, b) => a.score - b.score || a.x.sortingWeight - b.x.sortingWeight)
    .slice(0, 4)
    .map((r) => r.x);

  return (
    <>
      <JsonLd
        data={productJsonLd({
          name: p.name,
          slug: p.slug,
          description: textFromHtml(p.descriptionHtml, 500),
          images: p.photos.map((ph) => ph.src),
          variants: p.variants,
          priceLabel: p.priceLabel,
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Catalogue", path: "/pages/catalogue" },
          ...(main ? [{ name: main.name, path: `/collections/${main.slug}` }] : []),
          { name: p.name, path: `/products/${p.slug}` },
        ])}
      />
      <div className="container-page py-8 md:py-12">
        <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center gap-1.5 text-sm text-ink-muted">
          <Link href="/pages/catalogue" className="hover:text-ink">
            Catalogue
          </Link>
          {main && (
            <>
              <ChevronRight className="size-3.5" />
              <Link href={`/collections/${main.slug}`} className="hover:text-ink">
                {main.name}
              </Link>
            </>
          )}
          <ChevronRight className="size-3.5" />
          <span className="text-gold-700" aria-current="page">
            {p.name}
          </span>
        </nav>

        <div className="grid gap-8 lg:grid-cols-[1.05fr_1fr] lg:gap-14">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <Gallery photos={p.photos} name={p.name} />
          </div>
          <div>
            <h1 className="heading-lg animate-fade-up">{p.name}</h1>
            <div className="mt-5 animate-fade-up [animation-delay:80ms]">
              <BookingPanel
                product={{
                  id: p.id,
                  slug: p.slug,
                  name: p.name,
                  priceLabel: p.priceLabel,
                  requiresDelivery: p.requiresDelivery,
                  image: p.photos[0]?.src ?? null,
                  variants: p.variants,
                }}
                deliveryFromCents={settings.deliveryTiers[0]?.priceCents ?? null}
                depositPercent={settings.payments.depositBp / 100}
                damageProtectionPercent={settings.pricing.damageProtectionBp / 100}
              />
            </div>
            <section aria-labelledby="details-heading" className="mt-10 border-t border-line pt-8">
              <h2 id="details-heading" className="heading-md mb-4">
                Details
              </h2>
              <div className="prose-everglow" dangerouslySetInnerHTML={{ __html: p.descriptionHtml }} />
            </section>
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="container-page pb-20 pt-8" aria-labelledby="together-heading">
          <SectionHeading eyebrow="Complete the setup" title="Rent together with" />
          <ul className="mt-8 grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-4">
            {related.map((r) => (
              <li key={r.id}>
                <ProductCard product={r} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

export default function ProductPage(props: PageProps<"/products/[slug]">) {
  return (
    <Suspense fallback={<div className="min-h-[70vh]" />}>
      <Product params={props.params} />
    </Suspense>
  );
}
