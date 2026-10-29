/**
 * Snapshot the public Booqable storefront (everglowet.com) into data/booqable/catalog.json
 * and download product/collection photos into public/media.
 *
 * Only public storefront data is read. The authoritative import is the CSV export
 * (scripts/import-booqable-csv.ts); this snapshot keeps descriptions and photos exactly as live.
 *
 * Usage: npx tsx scripts/booqable-snapshot.ts [--base https://everglowet.com]
 */
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const base = process.argv.includes("--base")
  ? process.argv[process.argv.indexOf("--base") + 1]
  : "https://everglowet.com";
const root = path.resolve(__dirname, "..");
const mediaDir = path.join(root, "public", "media");

type JsonApi<T> = { data: Array<{ id: string; type: string; attributes: T }> };

async function api<T>(p: string): Promise<JsonApi<T>> {
  const res = await fetch(`${base}/api/boomerang/${p}`);
  if (!res.ok) throw new Error(`${p}: ${res.status}`);
  return res.json() as Promise<JsonApi<T>>;
}

async function download(url: string, folder: string): Promise<string> {
  const clean = url.split("?")[0];
  const ext = (path.extname(clean) || ".jpg").toLowerCase().slice(0, 6);
  const name = createHash("sha1").update(clean).digest("hex").slice(0, 16) + ext;
  const dir = path.join(mediaDir, folder);
  await mkdir(dir, { recursive: true });
  const res = await fetch(clean);
  if (!res.ok) throw new Error(`download ${clean}: ${res.status}`);
  await writeFile(path.join(dir, name), Buffer.from(await res.arrayBuffer()));
  return `/media/${folder}/${name}`;
}

type Group = {
  name: string;
  slug: string;
  description: string | null;
  tracking_type: string;
  price_type: string;
  product_type: string;
  show_in_store: boolean;
  sorting_weight: number;
  has_variations: boolean;
};
type Variant = {
  name: string;
  slug: string;
  base_price_in_cents: number | null;
  product_group_id: string;
  variation_values: string[] | null;
  tracking_type: string;
};
type Collection = {
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  parent_id: string | null;
  position: number;
  system: boolean;
};
type Photo = { url: string; position: number; alt_text: string | null };

async function main() {
  const items = await api<Group & Variant>("items?page[size]=200");
  const groups = items.data.filter((d) => d.type === "product_groups");
  const variants = items.data.filter((d) => d.type === "products");

  const collections = await api<Collection>("collections?page[size]=100");
  const membership: Record<string, string[]> = {};
  for (const c of collections.data) {
    const res = await api<{ product_group_id?: string }>(`items?filter[collection_id]=${c.id}&page[size]=200`);
    membership[c.id] = [
      ...new Set(res.data.map((d) => (d.type === "products" ? d.attributes.product_group_id! : d.id))),
    ];
  }

  const outCollections = [];
  for (const c of collections.data) {
    const a = c.attributes;
    outCollections.push({
      booqableId: c.id,
      name: a.name,
      slug: a.slug,
      descriptionHtml: a.description,
      image: a.image_url ? await download(a.image_url, "collections") : null,
      parentBooqableId: a.parent_id,
      position: a.position,
      system: a.system,
      productBooqableIds: membership[c.id],
    });
  }

  const outProducts = [];
  for (const g of groups) {
    const a = g.attributes;
    const photos = await api<Photo>(`photos?filter[owner_id]=${g.id}`);
    const images = [];
    for (const p of photos.data.sort((x, y) => x.attributes.position - y.attributes.position)) {
      images.push({ src: await download(p.attributes.url, "products"), alt: p.attributes.alt_text });
    }
    outProducts.push({
      booqableId: g.id,
      name: a.name.trim(),
      slug: a.slug,
      descriptionHtml: a.description,
      trackingType: a.tracking_type,
      priceType: a.price_type,
      productType: a.product_type,
      showInStore: a.show_in_store,
      sortingWeight: a.sorting_weight,
      images,
      variants: variants
        .filter((v) => v.attributes.product_group_id === g.id)
        .map((v) => ({
          booqableId: v.id,
          name: v.attributes.name.trim(),
          slug: v.attributes.slug,
          basePriceCents: v.attributes.base_price_in_cents,
          variationValues: v.attributes.variation_values ?? [],
        })),
    });
    console.log(`product ${a.slug}: ${images.length} photos`);
  }

  await writeFile(
    path.join(root, "data", "booqable", "catalog.json"),
    JSON.stringify(
      { source: base, takenAt: new Date().toISOString(), collections: outCollections, products: outProducts },
      null,
      2,
    ) + "\n",
  );
  console.log(`saved ${outProducts.length} products, ${outCollections.length} collections`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
