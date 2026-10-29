import type { Settings } from "@/lib/settings-schema";
import { absoluteUrl } from "@/lib/site";

/** schema.org data for Google rich results. */

export function localBusinessJsonLd(business: Settings["business"]) {
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": absoluteUrl("/#business"),
    name: business.name,
    legalName: business.legalName,
    slogan: business.tagline,
    description: "Tent, table, chair and event essentials rentals in Winnipeg, Manitoba. Self-pickup or delivery.",
    url: absoluteUrl("/"),
    logo: absoluteUrl("/media/site/logo.png"),
    image: absoluteUrl("/media/site/og.jpg"),
    telephone: business.phone,
    email: business.email,
    priceRange: "$$",
    currenciesAccepted: business.currency,
    paymentAccepted: "Credit card, Visa Debit",
    address: {
      "@type": "PostalAddress",
      streetAddress: business.street,
      addressLocality: business.city,
      addressRegion: business.province,
      postalCode: business.postalCode,
      addressCountry: business.country,
    },
    areaServed: { "@type": "City", name: "Winnipeg" },
    sameAs: [business.facebookUrl, business.instagramUrl],
  };
}

export function faqJsonLd(items: { question: string; answerHtml: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({
      "@type": "Question",
      name: i.question,
      acceptedAnswer: { "@type": "Answer", text: i.answerHtml },
    })),
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((i, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name: i.name,
      item: absoluteUrl(i.path),
    })),
  };
}

export function productJsonLd(p: {
  name: string;
  slug: string;
  description: string;
  images: string[];
  variants: { name: string; priceCents: number; sku: string | null }[];
  priceLabel: string;
}) {
  const prices = p.variants.map((v) => v.priceCents / 100);
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: p.description,
    image: p.images.map((src) => absoluteUrl(src)),
    url: absoluteUrl(`/products/${p.slug}`),
    brand: { "@type": "Brand", name: "Everglow Events & Tents" },
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "CAD",
      lowPrice: Math.min(...prices).toFixed(2),
      highPrice: Math.max(...prices).toFixed(2),
      offerCount: p.variants.length,
      availability: "https://schema.org/InStock",
      businessFunction: "http://purl.org/goodrelations/v1#LeaseOut",
      seller: { "@id": absoluteUrl("/#business") },
    },
  };
}

/** Plain-text description for meta tags from imported HTML. */
export function textFromHtml(html: string | null | undefined, max = 160): string {
  if (!html) return "";
  const text = html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return text.length <= max ? text : text.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
}
