"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Search, SlidersHorizontal } from "lucide-react";
import type { ProductCardData } from "@/lib/store/catalog";
import { cn } from "@/lib/cn";
import { useBooking } from "./booking-provider";
import { ProductCard } from "./product-card";

type Sort = "featured" | "price-asc" | "price-desc" | "name";

/** Filterable product grid used by the catalogue and collection pages. */
export function CatalogueBrowser({
  products,
  filters,
  initialFilter = "all",
  showSearch = true,
}: {
  products: ProductCardData[];
  filters: { slug: string; name: string }[];
  initialFilter?: string;
  showSearch?: boolean;
}) {
  const { availability, periodRange } = useBooking();
  const [filter, setFilter] = useState(initialFilter);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("featured");
  const [onlyAvailable, setOnlyAvailable] = useState(false);

  const shown = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    let list = products.filter((p) => filter === "all" || p.collectionSlugs.includes(filter));
    if (terms.length)
      list = list.filter((p) => terms.every((t) => `${p.name} ${p.excerpt ?? ""}`.toLowerCase().includes(t)));
    if (onlyAvailable && periodRange) list = list.filter((p) => (availability[p.id]?.total ?? 1) > 0);
    const sorted = [...list];
    if (sort === "price-asc") sorted.sort((a, b) => a.fromPriceCents - b.fromPriceCents);
    if (sort === "price-desc") sorted.sort((a, b) => b.fromPriceCents - a.fromPriceCents);
    if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    return sorted;
  }, [products, filter, q, sort, onlyAvailable, availability, periodRange]);

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        {filters.length > 1 && (
          <div
            className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0"
            role="tablist"
            aria-label="Filter by collection"
          >
            {[{ slug: "all", name: "All" }, ...filters].map((f) => (
              <button
                key={f.slug}
                type="button"
                role="tab"
                aria-selected={filter === f.slug}
                onClick={() => setFilter(f.slug)}
                className={cn(
                  "relative shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                  filter === f.slug ? "text-cream" : "bg-white text-ink-soft ring-1 ring-line hover:text-ink",
                )}
              >
                {filter === f.slug && (
                  <motion.span
                    layoutId="catalogue-filter"
                    className="absolute inset-0 rounded-full bg-ink"
                    transition={{ type: "spring", stiffness: 400, damping: 34 }}
                  />
                )}
                <span className="relative">{f.name}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {showSearch && (
            <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-white px-4 ring-1 ring-line focus-within:ring-gold-500 sm:w-64 sm:flex-none">
              <Search className="size-4 text-ink-muted" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search"
                aria-label="Search products"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
            </label>
          )}
          <label className="flex h-11 items-center gap-2 rounded-full bg-white px-4 text-sm ring-1 ring-line">
            <SlidersHorizontal className="size-4 text-ink-muted" />
            <span className="sr-only">Sort by</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="bg-transparent outline-none"
            >
              <option value="featured">Featured</option>
              <option value="price-asc">Price: low to high</option>
              <option value="price-desc">Price: high to low</option>
              <option value="name">Name</option>
            </select>
          </label>
          {periodRange && (
            <label className="flex h-11 cursor-pointer items-center gap-2 rounded-full bg-white px-4 text-sm ring-1 ring-line">
              <input
                type="checkbox"
                checked={onlyAvailable}
                onChange={(e) => setOnlyAvailable(e.target.checked)}
                className="size-4 accent-ink"
              />
              Available only
            </label>
          )}
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {shown.length} products
      </p>
      {shown.length === 0 ? (
        <div className="rounded-3xl bg-white p-12 text-center">
          <p className="font-display text-2xl">No matching items</p>
          <p className="mt-2 text-sm text-ink-muted">Try another collection or clear the search.</p>
        </div>
      ) : (
        <motion.ul layout className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">
          <AnimatePresence mode="popLayout">
            {shown.map((p, i) => (
              <motion.li
                key={p.id}
                layout
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              >
                <ProductCard product={p} priority={i < 4} />
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
      )}
    </div>
  );
}
