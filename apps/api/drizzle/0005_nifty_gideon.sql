CREATE TYPE "public"."asset_status" AS ENUM('uploading', 'uploaded', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."asset_type" AS ENUM('document', 'image');--> statement-breakpoint
CREATE TABLE "asset" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_type" "asset_type" NOT NULL,
	"status" "asset_status" DEFAULT 'uploading' NOT NULL,
	"owner_id" text NOT NULL,
	"storage_url" text NOT NULL,
	"mime_type" text,
	"file_size" integer
);
--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_status_idx" ON "asset" USING btree ("status");--> statement-breakpoint
CREATE INDEX "asset_type_idx" ON "asset" USING btree ("asset_type");--> statement-breakpoint
CREATE INDEX "asset_owner_idx" ON "asset" USING btree ("owner_id");