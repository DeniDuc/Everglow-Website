import type { Metadata } from "next";
import { CatalogueBrowser } from "@/components/store/catalogue-browser";
import { JsonLd } from "@/components/store/json-ld";
import { PageHero } from "@/components/store/page-hero";
import { getCollections, getStoreProducts } from "@/lib/store/catalog";
import { breadcrumbJsonLd } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Rental Catalogue – Tents, Tables, Chairs & Event Essentials",
  description:
    "Browse every rental: marquee and pop-up tents, tables, chairs, linens, lighting and lawn games in Winnipeg. Choose your dates to see live availability.",
  alternates: { canonical: "/pages/catalogue" },
};

export default async function CataloguePage() {
  const [products, collections] = await Promise.all([getStoreProducts(), getCollections()]);
  const catalogue = collections.find((c) => c.slug === "rental-catalogue");
  const filters = collections
    .filter((c) => c.parentId === catalogue?.id || ["linen", "lawn-games", "event-lighting"].includes(c.slug))
    .filter((c) => products.some((p) => p.collectionSlugs.includes(c.slug)))
    .map((c) => ({ slug: c.slug, name: c.name }));
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Catalogue", path: "/pages/catalogue" }])} />
      <PageHero
        eyebrow="Our"
        title="Rental Catalogue"
        image={catalogue?.image}
        intro="Everything you need to host a great event — tents, tables, chairs, and more. Clean, reliable, and easy to set up. Perfect for weddings, parties, and special moments."
      />
      <div className="container-page py-12 md:py-16">
        <CatalogueBrowser products={products} filters={filters} />
      </div>
    </>
  );
}
