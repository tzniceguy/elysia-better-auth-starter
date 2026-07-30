CREATE TYPE "public"."staff_status" AS ENUM('active', 'suspended', 'deleted');--> statement-breakpoint
CREATE TABLE "staff" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"user_id" text NOT NULL,
	"full_name" text NOT NULL,
	"phone_number" text NOT NULL,
	"avatar_url" text,
	"status" "staff_status" DEFAULT 'active' NOT NULL,
	CONSTRAINT "staff_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_user_id_idx" ON "staff" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "staff_public_id_idx" ON "staff" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "staff_status_idx" ON "staff" USING btree ("status");