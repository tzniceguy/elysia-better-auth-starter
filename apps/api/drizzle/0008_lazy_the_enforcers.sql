CREATE TYPE "public"."outbox_status" AS ENUM('pending', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "outbox_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"event_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"payload" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_retry_at" timestamp with time zone
);
--> statement-breakpoint
DROP TABLE "outbox" CASCADE;--> statement-breakpoint
CREATE INDEX "outbox_event_status_idx" ON "outbox_event" USING btree ("status");--> statement-breakpoint
CREATE INDEX "outbox_event_resource_idx" ON "outbox_event" USING btree ("event_type","resource_id");