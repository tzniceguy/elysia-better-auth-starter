CREATE TABLE "customer" (
	"id" text PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"user_id" text NOT NULL,
	"full_name" text NOT NULL,
	"phone_number" text NOT NULL,
	"avatar_url" text,
	"total_rides" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"push_enabled" boolean DEFAULT true NOT NULL,
	"promotional_enabled" boolean DEFAULT false NOT NULL,
	"last_active_at" timestamp DEFAULT now() NOT NULL,
	"registered_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "customer_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "driver" (
	"id" text PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"user_id" text NOT NULL,
	"full_name" text NOT NULL,
	"phone_number" text NOT NULL,
	"vehicle_type" text NOT NULL,
	"license_number" text NOT NULL,
	"avatar_url" text,
	"delivery_count" integer DEFAULT 0 NOT NULL,
	"rating_average" double precision DEFAULT 0 NOT NULL,
	"availability" text DEFAULT 'offline' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"current_lat" double precision,
	"current_lng" double precision,
	"location_updated_at" timestamp,
	CONSTRAINT "driver_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver" ADD CONSTRAINT "driver_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_user_id_idx" ON "customer" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "customer_public_id_idx" ON "customer" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "driver_user_id_idx" ON "driver" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "driver_public_id_idx" ON "driver" USING btree ("public_id");