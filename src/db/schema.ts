import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { decrypt, encrypt } from "@/lib/crypto";

/**
 * Database schema. Conventions:
 * - Money is integer cents (CAD). Percentages are basis points (1000 = 10%).
 * - Timestamps are timestamptz (UTC); the UI shows America/Winnipeg.
 * - Customer personal data uses `encryptedText` (AES-256-GCM at the application layer),
 *   on top of the database provider's encryption at rest.
 */

/** Text column transparently encrypted on write and decrypted on read. */
export const encryptedText = customType<{ data: string; driverData: string }>({
  dataType: () => "text",
  toDriver: (value) => encrypt(value),
  fromDriver: (value) => decrypt(value),
});

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// ---------------------------------------------------------------------------
// Settings, content, labels
// ---------------------------------------------------------------------------

/** Key/value settings editable in admin (see src/lib/settings.ts for keys and defaults). */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamps.updatedAt,
});

/** Customer-facing wording the owner can rename (e.g. "Booking" vs "Order"). */
export const labels = pgTable("labels", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/** Editable content pages: terms, privacy, customer responsibility, contact intro. */
export const pages = pgTable("pages", {
  slug: text("slug").primaryKey(),
  title: text("title").notNull(),
  bodyHtml: text("body_html").notNull().default(""),
  version: integer("version").notNull().default(1),
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  ...timestamps,
});

export const faqItems = pgTable("faq_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  question: text("question").notNull(),
  answerHtml: text("answer_html").notNull(),
  position: integer("position").notNull().default(0),
  visible: boolean("visible").notNull().default(true),
  ...timestamps,
});

export const redirects = pgTable("redirects", {
  fromPath: text("from_path").primaryKey(),
  toPath: text("to_path").notNull(),
  statusCode: integer("status_code").notNull().default(301),
});

export const blackoutDates = pgTable("blackout_dates", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Local calendar date in America/Winnipeg, YYYY-MM-DD. */
  date: text("date").notNull().unique(),
  reason: text("reason"),
});

export const deliveryTiers = pgTable("delivery_tiers", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  priceCents: integer("price_cents").notNull(),
  /** Upper bound of cart delivery points for the automatic suggestion; null = no limit. */
  maxPoints: integer("max_points"),
  position: integer("position").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const taxRates = pgTable("tax_rates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  rateBp: integer("rate_bp").notNull(),
  active: boolean("active").notNull().default(false),
  position: integer("position").notNull().default(0),
});

// ---------------------------------------------------------------------------
// Staff, sessions, audit
// ---------------------------------------------------------------------------

export const staffRole = pgEnum("staff_role", ["owner", "staff", "readonly"]);

export const staffUsers = pgTable("staff_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: staffRole("role").notNull().default("staff"),
  locale: text("locale").notNull().default("en"),
  totpSecret: encryptedText("totp_secret"),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  disabled: boolean("disabled").notNull().default(false),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  ...timestamps,
});

export const staffSessions = pgTable(
  "staff_sessions",
  {
    /** sha256 of the cookie token; the raw token never touches the database. */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "cascade" }),
    /** False until the TOTP step is passed for users with 2FA enabled. */
    mfaPassed: boolean("mfa_passed").notNull().default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    userAgent: text("user_agent"),
    createdAt: timestamps.createdAt,
  },
  (t) => [index("staff_sessions_user_idx").on(t.userId)],
);

/** Sliding-window rate limiting (login, contact form, checkout). */
export const rateLimitHits = pgTable(
  "rate_limit_hits",
  {
    id: serial("id").primaryKey(),
    bucket: text("bucket").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("rate_limit_bucket_idx").on(t.bucket, t.at)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    actorId: uuid("actor_id").references(() => staffUsers.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    data: jsonb("data"),
    createdAt: timestamps.createdAt,
  },
  (t) => [index("audit_entity_idx").on(t.entity, t.entityId)],
);

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

export const collections = pgTable("collections", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  descriptionHtml: text("description_html"),
  image: text("image"),
  parentId: uuid("parent_id"),
  position: integer("position").notNull().default(0),
  /** Shown in the storefront menu / home tiles. */
  featured: boolean("featured").notNull().default(false),
  visible: boolean("visible").notNull().default(true),
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  booqableId: text("booqable_id").unique(),
  ...timestamps,
});

export const productType = pgEnum("product_type", ["rental", "service", "bundle"]);
export const trackingType = pgEnum("tracking_type", ["bulk", "trackable", "none"]);
/**
 * structure: flat price for up to `period_days`, then `extra_day_price_cents` per extra day.
 * daily: price per started day. fixed: price per booking (services, fees).
 */
export const priceType = pgEnum("price_type", ["structure", "daily", "fixed", "free"]);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    productType: productType("product_type").notNull().default("rental"),
    trackingType: trackingType("tracking_type").notNull().default("bulk"),
    descriptionHtml: text("description_html").notNull().default(""),
    excerpt: text("excerpt"),
    priceType: priceType("price_type").notNull().default("structure"),
    periodDays: integer("period_days").notNull().default(3),
    /** Null = use the global default extra-day rule from settings. */
    extraDayPriceCents: integer("extra_day_price_cents"),
    /** Optional refundable security deposit held on the card (authorization). */
    securityDepositCents: integer("security_deposit_cents").notNull().default(0),
    /** E.g. 20x20 and larger tents: cannot be picked up by the customer. */
    requiresDelivery: boolean("requires_delivery").notNull().default(false),
    /** Size of the item for the automatic delivery tier suggestion (1 chair = 1 point). */
    deliveryPoints: integer("delivery_points").notNull().default(1),
    /** Smallest delivery tier this item can go with (e.g. a 20x20 tent needs "medium"). */
    minDeliveryTier: text("min_delivery_tier"),
    /** Counts toward the damage protection base. */
    damageProtection: boolean("damage_protection").notNull().default(true),
    bufferBeforeMinutes: integer("buffer_before_minutes").notNull().default(0),
    bufferAfterMinutes: integer("buffer_after_minutes").notNull().default(0),
    /** Items that can be sub-rented: staff may overbook with a warning. */
    allowShortage: boolean("allow_shortage").notNull().default(false),
    showInStore: boolean("show_in_store").notNull().default(true),
    featured: boolean("featured").notNull().default(false),
    sortingWeight: integer("sorting_weight").notNull().default(0),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    /** Free-form internal fields: purchase price, warehouse location, weight, footprint… */
    custom: jsonb("custom").$type<Record<string, string>>().notNull().default({}),
    booqableId: text("booqable_id").unique(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("products_store_idx").on(t.showInStore, t.sortingWeight)],
);

/** Every product has at least one variant; stock and price live here. */
export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Option values, e.g. ["White"]; empty for the single default variant. */
    options: text("options")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    sku: text("sku"),
    basePriceCents: integer("base_price_cents").notNull().default(0),
    /** Bulk stock quantity. For trackable products stock is counted from stock_items. */
    stockQuantity: integer("stock_quantity").notNull().default(0),
    position: integer("position").notNull().default(0),
    booqableId: text("booqable_id").unique(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("variants_product_idx").on(t.productId)],
);

export const productPhotos = pgTable("product_photos", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  src: text("src").notNull(),
  alt: text("alt"),
  position: integer("position").notNull().default(0),
});

export const productCollections = pgTable(
  "product_collections",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.productId, t.collectionId] })],
);

/** Components of a bundle product (a bundle consumes its components' stock). */
export const bundleItems = pgTable("bundle_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  bundleId: uuid("bundle_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  variantId: uuid("variant_id")
    .notNull()
    .references(() => productVariants.id, { onDelete: "restrict" }),
  quantity: integer("quantity").notNull().default(1),
});

/** Individually tracked units (e.g. each tent) with their own history. */
export const stockItems = pgTable("stock_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  variantId: uuid("variant_id")
    .notNull()
    .references(() => productVariants.id, { onDelete: "cascade" }),
  identifier: text("identifier").notNull(),
  status: text("status").notNull().default("available"),
  notes: text("notes"),
  ...timestamps,
});

/** Maintenance / repair blocks that remove stock from availability. */
export const downtimes = pgTable(
  "downtimes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull().default(1),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    reason: text("reason"),
    ...timestamps,
  },
  (t) => [index("downtimes_variant_idx").on(t.variantId, t.startsAt, t.endsAt)],
);

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export const customerSource = pgEnum("customer_source", [
  "website",
  "facebook_marketplace",
  "phone",
  "referral",
  "walk_in",
  "other",
]);

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: serial("number").notNull().unique(),
    name: encryptedText("name").notNull(),
    email: encryptedText("email"),
    /** Blind index for exact lookups by email. */
    emailHash: text("email_hash").unique(),
    phone: encryptedText("phone"),
    company: encryptedText("company"),
    /** JSON-encoded address, encrypted. */
    address: encryptedText("address"),
    notes: encryptedText("notes"),
    source: customerSource("source").notNull().default("website"),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    discountBp: integer("discount_bp").notNull().default(0),
    marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
    booqableId: text("booqable_id").unique(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("customers_email_hash_idx").on(t.emailHash)],
);

/** Contact-form messages. */
export const inquiries = pgTable("inquiries", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
  name: encryptedText("name").notNull(),
  email: encryptedText("email").notNull(),
  phone: encryptedText("phone"),
  message: encryptedText("message").notNull(),
  handledAt: timestamp("handled_at", { withTimezone: true }),
  createdAt: timestamps.createdAt,
});

// ---------------------------------------------------------------------------
// Orders & reservations
// ---------------------------------------------------------------------------

export const orderStatus = pgEnum("order_status", [
  "draft",
  "quote_sent",
  "reserved",
  "ready",
  "out",
  "returned",
  "closed",
  "cancelled",
]);

export const fulfillment = pgEnum("fulfillment", ["pickup", "delivery"]);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: serial("number").notNull().unique(),
    status: orderStatus("status").notNull().default("draft"),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "restrict" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    fulfillment: fulfillment("fulfillment").notNull().default("pickup"),
    deliveryTierId: uuid("delivery_tier_id").references(() => deliveryTiers.id),
    deliveryTierOverridden: boolean("delivery_tier_overridden").notNull().default(false),
    outOfTownKm: integer("out_of_town_km").notNull().default(0),
    deliveryAddress: encryptedText("delivery_address"),
    deliveryNotes: encryptedText("delivery_notes"),
    damageProtection: boolean("damage_protection").notNull().default(true),
    discountBp: integer("discount_bp").notNull().default(0),
    /** Cached totals from the pricing engine (recomputed on every change). */
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),
    depositDueCents: integer("deposit_due_cents").notNull().default(0),
    paidCents: integer("paid_cents").notNull().default(0),
    /** Event details: guests, venue type, site notes (encrypted JSON). */
    eventDetails: encryptedText("event_details"),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    source: customerSource("source").notNull().default("website"),
    /** Public token for the customer's order page (/order/<token>). */
    publicToken: text("public_token").unique(),
    overbooked: boolean("overbooked").notNull().default(false),
    booqableNumber: text("booqable_number"),
    createdById: uuid("created_by_id").references(() => staffUsers.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("orders_period_idx").on(t.startsAt, t.endsAt), index("orders_status_idx").on(t.status)],
);

export const orderLineKind = pgEnum("order_line_kind", [
  "product",
  "bundle",
  "service",
  "custom",
  "discount",
  "fee",
  "delivery",
]);

export const orderLines = pgTable(
  "order_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    kind: orderLineKind("kind").notNull(),
    productId: uuid("product_id").references(() => products.id, { onDelete: "restrict" }),
    variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    quantity: integer("quantity").notNull().default(1),
    unitPriceCents: integer("unit_price_cents").notNull().default(0),
    /** Manual price override per unit (staff), with reason in the audit log. */
    overrideUnitPriceCents: integer("override_unit_price_cents"),
    overrideReason: text("override_reason"),
    totalCents: integer("total_cents").notNull().default(0),
    position: integer("position").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("order_lines_order_idx").on(t.orderId)],
);

export const reservationStatus = pgEnum("reservation_status", ["hold", "reserved"]);

/**
 * Stock claims used by the availability engine. One row per variant per order (or cart hold).
 * `block_starts_at`/`block_ends_at` already include the product buffers.
 * Rows are written inside a transaction that locks the affected variant rows,
 * so two checkouts can never take the last unit.
 */
export const reservations = pgTable(
  "reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "cascade" }),
    /** Anonymous cart id for short checkout holds. */
    cartId: text("cart_id"),
    quantity: integer("quantity").notNull(),
    status: reservationStatus("status").notNull().default("hold"),
    blockStartsAt: timestamp("block_starts_at", { withTimezone: true }).notNull(),
    blockEndsAt: timestamp("block_ends_at", { withTimezone: true }).notNull(),
    /** Holds expire; reserved rows have no expiry. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    index("reservations_variant_period_idx").on(t.variantId, t.blockStartsAt, t.blockEndsAt),
    index("reservations_order_idx").on(t.orderId),
    uniqueIndex("reservations_cart_variant_idx").on(t.cartId, t.variantId),
  ],
);
