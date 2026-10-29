# Decisions

Why things are the way they are. Newest decisions at the top of each section. Owner answers are quoted from the kickoff conversation (2026-10-29).

## Business rules (from the owner)

| Topic | Decision | Where to change |
| --- | --- | --- |
| Taxes | **No tax is charged for now** (small-supplier threshold). GST 5% and PST 7% rows exist but are inactive; turn on in Settings → Pricing once the accountant confirms. | Settings → Pricing & protection |
| Damage Protection Plan | **10%, always added, on rental items only — not on delivery or services.** Customer can untick it at checkout; staff can remove it on request. Calculated after any order discount. | Settings → Pricing; per product "Damage protection applies" |
| Deposit | 50% at booking; 25% of the order total is non-refundable. | Settings → Payments |
| Rush bookings | **Event within 14 days → 100% prepayment.** Exactly 14 days is not rush. | Settings → Payments |
| Balance | Due 14 days before. Reminders at **21, 14 and 7 days**. Owner reserves the right to charge the saved card at 14 **or** 7 days, so automatic charging is a switch (off by default) with configurable days `[14, 7]`; staff can always charge manually. | Settings → Payments |
| Delivery tiers | Small $80 / Medium $120 / Large $200 + $4/km out of town, as on the live site. The cart suggests a tier from "delivery points" per product (chair = 1, 6 ft table = 4, 20×20 tent = 80 with minimum Medium, 20×40/20×60 = minimum Large); staff override. To be tuned by the owner ("в будущем подстроим"). | Settings → Delivery; product → Rental rules |
| Out-of-town km | Customer ticks "outside Winnipeg" and enters approximate km; staff confirm before charging. A maps API can calculate it later. | — |
| Hours | Flexible. Defaults: pickup/return 08:00–21:00, 30-min steps, 24 h minimum notice. | Settings → Booking rules |
| Turnaround | "At least an hour or two between rentals" → default **120 minutes after each return**; per-product override. | Settings → Booking rules; product → Rental rules |
| Setup fee | Custom per order, not advertised (e.g. arranging chairs to a plan). Will be a custom line on admin orders (phase 4). Tent installation is included in tent prices. The Booqable "Service SET-UP Fee" product is not shown in the store. | — |
| Booqable "Customer pickup: free" product | Not imported: it was a workaround for choosing pickup; checkout now has a real pickup/delivery choice. | — |
| Contract / Terms | Owner wants customers to **sign the full agreement online** at checkout (not just an "I agree" box), plus the short-form agreement. Planned for phase 5/6 (typed name + drawn signature, timestamp, IP, document hash, signed PDF stored). | — |
| ID at handover | Staff check government ID at pickup/delivery. We record "ID checked by <staff> at <time>"; storing scans is optional and off until the owner decides (privacy). | — |
| Admin look | Similar to Booqable (left sidebar, grey canvas, blue actions), only the features the business uses. English + Russian per user. | Account → Language |
| Storefront look | Keep the current style (sand palette, Bona Nova + Poppins, script "Our" eyebrows) but improve it: modern layout, smooth motion, every element useful. Overrides the original "do not redesign" rule at the owner's request. | — |
| Data protection | Owner: customer data must be stored encrypted. See Security below. | — |
| Domain | Build on a free URL first; move everglowet.com later. | — |

### Open questions (defaults in use)

1. **Extra-day price** for rentals longer than 3 days is not public on the live site. Default: 33.33% of the base price per extra day (≈ the 3-day price spread over 3 days); per-product override available. Please confirm.
2. **Stock quantities** were not public: placeholders were seeded (tents 1, tables 20, chairs 100…) and every product is flagged "Stock to confirm" until the owner saves real numbers or the Booqable CSV is imported.
3. **Terms & Conditions section 13** refund tiers: default is "30+ days → refund everything except the non-refundable 25%; under 30 days → no refund", from the FAQ. Replace with the PDF's tiers when available.
4. Privacy policy text is a draft and must be reviewed.

## Time zone

- Everything is stored in UTC and shown in `America/Winnipeg` using the runtime's tz database (never hard-coded offsets).
- **Manitoba stays on daylight time permanently from 2026-10-31** (UTC−5 all year; announced 2026-09-17). Servers must run a tz database that includes this change (current Node.js / Vercel runtime). Local machines with older Node versions will show winter times one hour off until updated. Tests use historical (2025) transitions so they pass with any tz database version.

## Architecture

- **Next.js 16 (App Router) + TypeScript**, deployed on Vercel. Uses Cache Components: storefront pages are prerendered (static HTML, cached data tagged `catalog`/`content`/`settings`) and refreshed on admin saves with `updateTag`. Admin pages render per request.
- **Postgres via Drizzle ORM** instead of the Supabase JS client. Reason: plain SQL migrations in the repo, typed queries, identical behaviour against local Postgres (tests, CI) and Supabase Postgres (production). Supabase still hosts the database, backups and file storage.
- **Own staff authentication** instead of Supabase Auth. Reason: only a few staff accounts, needs TOTP 2FA, roles and audit log in the same database; avoids a second identity system and works in local/CI without Supabase. Argon2id hashes, random session tokens stored as SHA-256, httpOnly cookies, idle timeout, rate limits. Customer accounts (magic links) come with checkout (phase 5).
- **Availability engine**: pure functions (`src/lib/availability/engine.ts`) + a DB layer that writes claims to `reservations` inside a transaction after `SELECT … FOR UPDATE` on the affected variant rows. This serializes concurrent checkouts per item; proven by an integration test where two simultaneous bookings race for the last tent. Usage is the *peak* concurrent quantity in the window (bookings that don't overlap each other don't add up). Ranges are half-open; buffers are stored in the claim.
- **Pricing engine**: pure function `computeQuote` used by the cart now and by checkout, admin orders, documents and emails later. Integer cents, basis points, half-up rounding once per amount.
- **Variants**: every product has ≥ 1 variant (Booqable "product group → products" model). Stock and price live on the variant.
- **Images**: Booqable photos were downloaded once and re-encoded to WebP (≤ 1800 px) under `public/media`; new uploads go through `sharp` (strips EXIF/GPS) to local disk in development or Supabase Storage in production (`STORAGE_DRIVER`).
- **Rich text**: Tiptap editor in admin; HTML is sanitized with an allow-list on save.
- **Reveal animations** use CSS scroll-driven animations (no JS, content always in the HTML for Google; browsers without support just show it). Motion library is used for interactive pieces (drawer, dialogs, filters).

## Security

- Customer personal data (name, email, phone, company, address, notes, inquiry text, delivery address, event details) and staff TOTP secrets are encrypted in the application with **AES-256-GCM** (`ENCRYPTION_KEY`), on top of the provider's encryption at rest and TLS in transit. Email lookups use an HMAC blind index (`BLIND_INDEX_KEY`). Key format is versioned (`v1.`) for rotation. Admin search decrypts in memory — fine for thousands of customers.
- No card data will ever touch our servers (Stripe-hosted fields, phase 5).
- Every admin page and server action calls `requireStaff(permission)`; the proxy only does a fast cookie check. Roles: owner / staff / read-only. Sensitive actions are written to `audit_log`.
- Security headers (HSTS, X-Frame-Options DENY, nosniff, referrer policy, permissions policy); admin is `noindex` and `no-store`.
- Forms: Zod validation, honeypot + Postgres-backed rate limiting for contact and login.

## SEO

- Same URL paths as the Booqable site (`/`, `/pages/catalogue`, `/pages/contact`, `/collections/<slug>`, `/products/<slug>`); slugs imported unchanged. `/collections/rental-catalogue` and `/collections/all` 301 to the catalogue.
- Canonical URLs, Open Graph image, `sitemap.xml`, `robots.txt`, JSON-LD: `LocalBusiness`, `Product` (AggregateOffer, lease), `BreadcrumbList`, `FAQPage`.
- Pages are static HTML (fast LCP), images served as AVIF/WebP with responsive sizes.
