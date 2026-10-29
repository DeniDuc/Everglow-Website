// One-off: shrink downloaded media to web sizes (WebP, max 1800px) and rewrite catalog.json paths.
import sharp from "sharp";
import { readdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const renamed = {};
for (const folder of ["products", "collections", "site"]) {
  const dir = path.join(root, "public/media", folder);
  for (const f of await readdir(dir)) {
    if (f === "favicon.png") continue;
    const src = path.join(dir, f);
    const isLogo = f === "logo.png";
    const out = isLogo ? "logo.png" : f.replace(/\.[a-z0-9]+$/i, "") + ".webp";
    const img = sharp(src).rotate();
    const buf = isLogo
      ? await img.trim().resize({ width: 800, withoutEnlargement: true }).png().toBuffer()
      : await img.resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    if (out !== f) await unlink(src);
    await writeFile(path.join(dir, out), buf);
    renamed[`/media/${folder}/${f}`] = `/media/${folder}/${out}`;
  }
}
const catPath = path.join(root, "data/booqable/catalog.json");
let cat = await readFile(catPath, "utf8");
for (const [a, b] of Object.entries(renamed)) cat = cat.split(a).join(b);
await writeFile(catPath, cat);
console.log("optimized", Object.keys(renamed).length);
