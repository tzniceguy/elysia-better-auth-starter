CREATE TYPE "public"."audit_actor_type" AS ENUM('staff', 'customer', 'system');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_type" "audit_actor_type" NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"recipient" text NOT NULL,
	"subject" text NOT NULL,
	"body_html" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"last_error" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset" ADD COLUMN "raw_key" text;--> statement-breakpoint
ALTER TABLE "asset" ADD COLUMN "processed_size" integer;--> statement-breakpoint
ALTER TABLE "asset" ADD COLUMN "orig_width" integer;--> statement-breakpoint
ALTER TABLE "asset" ADD COLUMN "orig_height" integer;--> statement-breakpoint
ALTER TABLE "asset" ADD COLUMN "processing_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "asset" ADD COLUMN "processing_finished_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "asset" ADD COLUMN "processing_error" text;--> statement-breakpoint
ALTER TABLE "asset" ADD COLUMN "attempts" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_type","actor_id");--> statement-breakpoint
CREATE INDEX "outbox_status_next_retry_idx" ON "outbox" USING btree ("status","next_retry_at");--> statement-breakpoint
CREATE INDEX "outbox_recipient_idx" ON "outbox" USING btree ("recipient");