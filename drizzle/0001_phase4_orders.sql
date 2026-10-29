CREATE TYPE "public"."payment_kind" AS ENUM('payment', 'refund');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('card', 'etransfer', 'cash', 'cheque', 'credit', 'booqable', 'other');--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"kind" "payment_kind" DEFAULT 'payment' NOT NULL,
	"method" "payment_method" NOT NULL,
	"amount_cents" integer NOT NULL,
	"reference" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "internal_notes" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "id_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "id_checked_by_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_id_staff_users_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."staff_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_id_checked_by_id_staff_users_id_fk" FOREIGN KEY ("id_checked_by_id") REFERENCES "public"."staff_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Amounts already paid on orders imported from Booqable become one payment row each,
-- so orders.paid_cents always equals the sum of the payments table.
INSERT INTO "payments" ("order_id", "kind", "method", "amount_cents", "reference", "received_at")
SELECT "id", 'payment', 'booqable', "paid_cents", 'Paid in Booqable (imported)', "created_at"
FROM "orders" WHERE "paid_cents" > 0;
