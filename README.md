# Everglow Events & Tents — rental platform

Custom storefront + back office for **EVERGLOW EVENTS & TENTS INC.** (Winnipeg), replacing Booqable.

- **Storefront** (`/`): catalogue, collections, product pages, rental-period picker with live availability, cart priced by the server (delivery tier, damage protection, 50% deposit / 100% rush), contact form.
- **Admin** (`/admin`): Booqable-style back office in English or Russian — dashboard, inventory and product editor, collections, clients, inquiries, settings for every business rule, staff roles, two-step verification.

Status and roadmap: see [Phases](#phases). Why things are built this way: [DECISIONS.md](DECISIONS.md). Visual tokens: [design-tokens.md](design-tokens.md).

## Для владельца (кратко)

- Сайт: главная, каталог, коллекции, страницы товаров, корзина. Клиент выбирает даты — сразу видит, свободен ли товар, и точную сумму.
- Админка: `/admin`. Язык меняется в «Мой аккаунт». Там же включается двухэтапная проверка (Google Authenticator / 1Password).
- Все правила (депозит, срочный заказ, защита 10%, налоги, тарифы доставки, закрытые дни, тексты страниц и FAQ) меняются в «Настройках» без программиста.
- Остатки товаров пока временные — проверьте их в «Инвентаре» (или пришлите CSV из Booqable).

## Tech stack

Next.js 16 (App Router, Cache Components) · TypeScript · Tailwind CSS 4 · Postgres + Drizzle ORM · Supabase (hosted Postgres + Storage) · Vercel · Vitest · Playwright · GitHub Actions. Stripe and Resend are added in phases 5–6.

## Local setup

Requirements: Node 22, Postgres 16.

```bash
npm install
```

```bash
cp .env.example .env.local
```

Fill `.env.local`: generate the two keys with

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

and set `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD` for the first owner account. Then create the database tables and load the catalogue:

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

```bash
npm run dev
```

Open http://localhost:3000 (store) and http://localhost:3000/admin (sign in with the seed owner, then change the password and turn on 2FA under **My account**).

## Environment variables

| Name | Required | What it is |
| --- | --- | --- |
| `DATABASE_URL` | yes* | Postgres connection string (Supabase **transaction pooler** URL on Vercel). *Not needed when the Supabase ↔ Vercel integration is installed: `POSTGRES_URL` / `POSTGRES_URL_NON_POOLING` are used automatically. |
| `NEXT_PUBLIC_SITE_URL` | yes | Public URL, e.g. `https://everglowet.com` (canonical links, sitemap). |
| `ENCRYPTION_KEY` | yes | 32 random bytes (base64). Encrypts customer personal data. **Back it up in a password manager — without it encrypted data cannot be read.** |
| `BLIND_INDEX_KEY` | yes | 32 random bytes (base64). Used to look up customers by email. |
| `STORAGE_DRIVER` | no | Picked automatically: Supabase Storage when `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) and `SUPABASE_SERVICE_ROLE_KEY` exist, otherwise `public/uploads` (development). |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET` | prod | Supabase Storage for uploaded photos (public bucket `media`, created automatically). Set by the Supabase integration. Server-side only. |
| `GMAIL_APP_PASSWORD` | prod | Gmail App Password for eventseverglow@gmail.com. All emails (confirmations, reminders, invoices, staff alerts) are sent from that address. Without it emails are skipped. |
| `SEED_OWNER_EMAIL`, `SEED_OWNER_PASSWORD` | seed | First owner account created by `npm run db:seed`. |

Secrets live only in environment variables (Vercel → Project → Settings → Environment Variables), never in the repository.

## Scripts

| Command | |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server (needs the database) |
| `npm run lint` · `npm run typecheck` · `npm run format` | Quality checks |
| `npm test` | Unit + integration tests (pricing, availability, double booking). Uses `TEST_DATABASE_URL` (default `postgres://everglow:everglow@localhost:5432/everglow_test`). |
| `npm run test:e2e` | Playwright end-to-end tests against `next start` (build first). Locally you can point to an existing Chromium with `PW_CHROMIUM_PATH`. |
| `npm run db:generate` | Create a SQL migration after editing `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Load settings, delivery tiers, FAQ, pages and the Booqable catalogue snapshot (safe to re-run) |
| `npm run db:import-invoices <file>` | Import customers and bookings parsed from Booqable invoice PDFs (JSON kept in git-ignored `data/private/`; `--dry-run` first) |
| `npm run db:snapshot` | Re-download the public Booqable storefront (products, photos, collections) into `data/booqable` |

## Deploy (Vercel + Supabase)

1. **Supabase**: create a project (region: Canada Central). Copy the *transaction pooler* connection string (Project Settings → Database). Create a **public** Storage bucket `media`. Copy the project URL and the `service_role` key (Project Settings → API).
2. **Vercel**: import the GitHub repository, framework Next.js. Add the environment variables above for Production and Preview.
3. Deploys run `npm run vercel-build`: database migrations, the non-destructive seed (creates what is missing, never overwrites the owner's edits) and the Next.js build. To run them by hand instead:
   ```bash
   DATABASE_URL="postgres://…pooler.supabase.com:6543/postgres" npm run db:migrate
   ```
   ```bash
   DATABASE_URL="postgres://…" SEED_OWNER_EMAIL=… SEED_OWNER_PASSWORD=… npm run db:seed
   ```
4. Deploy. The free `*.vercel.app` URL works until the domain moves (phase 8: lower DNS TTL, freeze Booqable bookings, final import, point `everglowet.com` to Vercel, verify HTTPS/redirects/emails/payments, then cancel Booqable).

## Backups and restore

- Supabase takes **daily automatic backups** (Pro plan: point-in-time recovery). Additionally keep a weekly logical export:
  ```bash
  pg_dump "$DATABASE_URL" --format=custom --no-owner --file=everglow-$(date +%F).dump
  ```
- Restore into an empty database:
  ```bash
  pg_restore --no-owner --dbname="$NEW_DATABASE_URL" everglow-YYYY-MM-DD.dump
  ```
- A backup is only readable with the same `ENCRYPTION_KEY` / `BLIND_INDEX_KEY`. Store the keys separately from the dumps.
- Test a restore every few months into a scratch database and open the admin against it.

## Operations

- **Add a staff member**: Settings → Staff & roles (owner only). Share the temporary password privately; they change it and turn on 2FA. Owners can require 2FA for everyone (Settings → Security).
- **Change prices / stock / photos**: Inventory → product → Save. The website updates immediately.
- **Change policies or texts**: Settings → Payments / Pricing / Delivery / Pages & FAQ.
- **Rotate keys**: database password in Supabase → update `DATABASE_URL` in Vercel → redeploy. `ENCRYPTION_KEY` rotation needs a re-encryption job (format is versioned `v1.`); do not change it casually.

## Project layout

```
src/app/(store)/        storefront pages (static, cached)
src/app/admin/          back office (login, panel)
src/app/api/            availability + cart quote endpoints
src/lib/pricing/        pricing engine (pure)
src/lib/availability/   availability engine (pure) + locked reservations (db)
src/lib/auth/           sessions, roles, passwords, TOTP
src/db/schema.ts        database schema (migrations in drizzle/)
scripts/                migrate, seed, Booqable snapshot
tests/unit|integration|e2e
data/                   Booqable snapshot and seed content
```

## Phases

| Phase | Status |
| --- | --- |
| 1 Foundation (schema, auth, design, storefront pages) | ✅ |
| 2 Catalogue & admin products (CRUD, photos, collections; Booqable CSV import waits for the export file) | ✅ / CSV pending |
| 3 Availability & pricing engines, date picker, live availability | ✅ |
| 4 Orders in admin (manual bookings, statuses, calendar, packing slips, customers) | next |
| 5 Checkout & Stripe (deposit, saved card, payment links, refunds, webhooks, online contract signature) | |
| 6 Documents & emails (quotes, invoices, contracts, reminders, staff alerts) | |
| 7 Reports, coupons, polish | |
| 8 Migration & cutover | |
