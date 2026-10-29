CREATE TYPE "public"."customer_source" AS ENUM('website', 'facebook_marketplace', 'phone', 'referral', 'walk_in', 'other');--> statement-breakpoint
CREATE TYPE "public"."fulfillment" AS ENUM('pickup', 'delivery');--> statement-breakpoint
CREATE TYPE "public"."order_line_kind" AS ENUM('product', 'bundle', 'service', 'custom', 'discount', 'fee', 'delivery');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('draft', 'quote_sent', 'reserved', 'ready', 'out', 'returned', 'closed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."price_type" AS ENUM('structure', 'daily', 'fixed', 'free');--> statement-breakpoint
CREATE TYPE "public"."product_type" AS ENUM('rental', 'service', 'bundle');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('hold', 'reserved');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('owner', 'staff', 'readonly');--> statement-breakpoint
CREATE TYPE "public"."tracking_type" AS ENUM('bulk', 'trackable', 'none');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blackout_dates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" text NOT NULL,
	"reason" text,
	CONSTRAINT "blackout_dates_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "bundle_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bundle_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description_html" text,
	"image" text,
	"parent_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"seo_title" text,
	"seo_description" text,
	"booqable_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collections_slug_unique" UNIQUE("slug"),
	CONSTRAINT "collections_booqable_id_unique" UNIQUE("booqable_id")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" serial NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"email_hash" text,
	"phone" text,
	"company" text,
	"address" text,
	"notes" text,
	"source" "customer_source" DEFAULT 'website' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"discount_bp" integer DEFAULT 0 NOT NULL,
	"marketing_opt_in" boolean DEFAULT false NOT NULL,
	"booqable_id" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_number_unique" UNIQUE("number"),
	CONSTRAINT "customers_email_hash_unique" UNIQUE("email_hash"),
	CONSTRAINT "customers_booqable_id_unique" UNIQUE("booqable_id")
);
--> statement-breakpoint
CREATE TABLE "delivery_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_cents" integer NOT NULL,
	"max_points" integer,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "delivery_tiers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "downtimes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "faq_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question" text NOT NULL,
	"answer_html" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"message" text NOT NULL,
	"handled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "labels" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"kind" "order_line_kind" NOT NULL,
	"product_id" uuid,
	"variant_id" uuid,
	"title" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_cents" integer DEFAULT 0 NOT NULL,
	"override_unit_price_cents" integer,
	"override_reason" text,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" serial NOT NULL,
	"status" "order_status" DEFAULT 'draft' NOT NULL,
	"customer_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"fulfillment" "fulfillment" DEFAULT 'pickup' NOT NULL,
	"delivery_tier_id" uuid,
	"delivery_tier_overridden" boolean DEFAULT false NOT NULL,
	"out_of_town_km" integer DEFAULT 0 NOT NULL,
	"delivery_address" text,
	"delivery_notes" text,
	"damage_protection" boolean DEFAULT true NOT NULL,
	"discount_bp" integer DEFAULT 0 NOT NULL,
	"subtotal_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"deposit_due_cents" integer DEFAULT 0 NOT NULL,
	"paid_cents" integer DEFAULT 0 NOT NULL,
	"event_details" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"source" "customer_source" DEFAULT 'website' NOT NULL,
	"public_token" text,
	"overbooked" boolean DEFAULT false NOT NULL,
	"booqable_number" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_number_unique" UNIQUE("number"),
	CONSTRAINT "orders_public_token_unique" UNIQUE("public_token")
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"slug" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"body_html" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"seo_title" text,
	"seo_description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_collections" (
	"product_id" uuid NOT NULL,
	"collection_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "product_collections_product_id_collection_id_pk" PRIMARY KEY("product_id","collection_id")
);
--> statement-breakpoint
CREATE TABLE "product_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"src" text NOT NULL,
	"alt" text,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"name" text NOT NULL,
	"options" text[] DEFAULT '{}'::text[] NOT NULL,
	"sku" text,
	"base_price_cents" integer DEFAULT 0 NOT NULL,
	"stock_quantity" integer DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"booqable_id" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_variants_booqable_id_unique" UNIQUE("booqable_id")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"product_type" "product_type" DEFAULT 'rental' NOT NULL,
	"tracking_type" "tracking_type" DEFAULT 'bulk' NOT NULL,
	"description_html" text DEFAULT '' NOT NULL,
	"excerpt" text,
	"price_type" "price_type" DEFAULT 'structure' NOT NULL,
	"period_days" integer DEFAULT 3 NOT NULL,
	"extra_day_price_cents" integer,
	"security_deposit_cents" integer DEFAULT 0 NOT NULL,
	"requires_delivery" boolean DEFAULT false NOT NULL,
	"delivery_points" integer DEFAULT 1 NOT NULL,
	"min_delivery_tier" text,
	"damage_protection" boolean DEFAULT true NOT NULL,
	"buffer_before_minutes" integer DEFAULT 0 NOT NULL,
	"buffer_after_minutes" integer DEFAULT 0 NOT NULL,
	"allow_shortage" boolean DEFAULT false NOT NULL,
	"show_in_store" boolean DEFAULT true NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"sorting_weight" integer DEFAULT 0 NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"seo_title" text,
	"seo_description" text,
	"custom" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"booqable_id" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_slug_unique" UNIQUE("slug"),
	CONSTRAINT "products_booqable_id_unique" UNIQUE("booqable_id")
);
--> statement-breakpoint
CREATE TABLE "rate_limit_hits" (
	"id" serial PRIMARY KEY NOT NULL,
	"bucket" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "redirects" (
	"from_path" text PRIMARY KEY NOT NULL,
	"to_path" text NOT NULL,
	"status_code" integer DEFAULT 301 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"order_id" uuid,
	"cart_id" text,
	"quantity" integer NOT NULL,
	"status" "reservation_status" DEFAULT 'hold' NOT NULL,
	"block_starts_at" timestamp with time zone NOT NULL,
	"block_ends_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"mfa_passed" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "staff_role" DEFAULT 'staff' NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"totp_secret" text,
	"totp_enabled" boolean DEFAULT false NOT NULL,
	"disabled" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "stock_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"identifier" text NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"rate_bp" integer NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_staff_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."staff_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundle_items" ADD CONSTRAINT "bundle_items_bundle_id_products_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundle_items" ADD CONSTRAINT "bundle_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downtimes" ADD CONSTRAINT "downtimes_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_tier_id_delivery_tiers_id_fk" FOREIGN KEY ("delivery_tier_id") REFERENCES "public"."delivery_tiers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_id_staff_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."staff_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_collections" ADD CONSTRAINT "product_collections_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_collections" ADD CONSTRAINT "product_collections_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_photos" ADD CONSTRAINT "product_photos_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_sessions" ADD CONSTRAINT "staff_sessions_user_id_staff_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."staff_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "customers_email_hash_idx" ON "customers" USING btree ("email_hash");--> statement-breakpoint
CREATE INDEX "downtimes_variant_idx" ON "downtimes" USING btree ("variant_id","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "order_lines_order_idx" ON "order_lines" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_period_idx" ON "orders" USING btree ("starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "variants_product_idx" ON "product_variants" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "products_store_idx" ON "products" USING btree ("show_in_store","sorting_weight");--> statement-breakpoint
CREATE INDEX "rate_limit_bucket_idx" ON "rate_limit_hits" USING btree ("bucket","at");--> statement-breakpoint
CREATE INDEX "reservations_variant_period_idx" ON "reservations" USING btree ("variant_id","block_starts_at","block_ends_at");--> statement-breakpoint
CREATE INDEX "reservations_order_idx" ON "reservations" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reservations_cart_variant_idx" ON "reservations" USING btree ("cart_id","variant_id");--> statement-breakpoint
CREATE INDEX "staff_sessions_user_idx" ON "staff_sessions" USING btree ("user_id");