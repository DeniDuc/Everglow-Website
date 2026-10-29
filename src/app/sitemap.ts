import type { MetadataRoute } from "next";
import { getCollections, getStoreProducts } from "@/lib/store/catalog";
import { absoluteUrl } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [collections, products] = await Promise.all([getCollections(), getStoreProducts()]);
  const pages = [
    "/",
    "/pages/catalogue",
    "/pages/contact",
    "/pages/terms",
    "/pages/privacy",
    "/pages/customer-responsibility",
  ];
  return [
    ...pages.map((p) => ({ url: absoluteUrl(p), changeFrequency: "weekly" as const, priority: p === "/" ? 1 : 0.6 })),
    ...collections.map((c) => ({
      url: absoluteUrl(`/collections/${c.slug}`),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...products.map((p) => ({
      url: absoluteUrl(`/products/${p.slug}`),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
