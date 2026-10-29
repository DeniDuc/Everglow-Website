import Image from "next/image";
import Link from "next/link";
import { Truck } from "lucide-react";
import { money } from "@/lib/format";
import type { ProductCardData } from "@/lib/store/catalog";
import { AvailabilityBadge } from "./availability-badge";

export function ProductCard({ product, priority = false }: { product: ProductCardData; priority?: boolean }) {
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-white transition-[box-shadow,transform] duration-500 ease-[var(--ease-out-soft)] hover:-translate-y-1 hover:shadow-lift">
      <div className="relative aspect-square overflow-hidden bg-white">
        {product.image ? (
          <Image
            src={product.image.src}
            alt={product.image.alt}
            fill
            priority={priority}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 300px"
            className="object-contain p-3 transition-transform duration-700 ease-[var(--ease-out-soft)] group-hover:scale-[1.05]"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-sand-50 text-sm text-ink-muted">
            Photo coming soon
          </div>
        )}
        <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-1.5">
          <AvailabilityBadge productId={product.id} className="bg-white/90 backdrop-blur" />
          {product.requiresDelivery && (
            <span
              className="ml-auto flex items-center gap-1 rounded-full bg-slate/90 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-wide text-white backdrop-blur"
              title="Delivered and installed by our team"
            >
              <Truck className="size-3.5" /> Delivery
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 border-t border-line p-4">
        <h3 className="font-medium leading-snug text-ink">
          <Link href={`/products/${product.slug}`} className="after:absolute after:inset-0">
            {product.name}
          </Link>
        </h3>
        {product.excerpt && (
          <p className="line-clamp-2 text-[0.82rem] leading-relaxed text-ink-muted">{product.excerpt}</p>
        )}
        <p className="mt-auto flex flex-wrap items-baseline gap-x-1 pt-2">
          <span className="text-lg font-semibold text-gold-700">{money(product.fromPriceCents)}</span>
          <span className="text-sm text-ink-muted">/ {product.priceLabel}</span>
        </p>
      </div>
    </article>
  );
}
