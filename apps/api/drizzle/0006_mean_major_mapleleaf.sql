CREATE TYPE "public"."staff_role" AS ENUM('admin', 'operations');--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "role" "staff_role" DEFAULT 'operations' NOT NULL;--> statement-breakpoint
CREATE INDEX "staff_role_idx" ON "staff" USING btree ("role");