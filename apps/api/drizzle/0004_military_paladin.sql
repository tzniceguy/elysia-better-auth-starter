CREATE TABLE "persmission" (
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "persmission_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"resource" text NOT NULL,
	"action" text NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "role" (
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "role_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"description" text,
	"is_staff" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "role_persmission" (
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "role_persmission_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"role_id" integer NOT NULL,
	"permsission_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_role" (
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "user_role_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"role_id" integer NOT NULL
);
--> statement-breakpoint
DROP TABLE "driver" CASCADE;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "staff_role" text;--> statement-breakpoint
ALTER TABLE "role_persmission" ADD CONSTRAINT "role_persmission_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_persmission" ADD CONSTRAINT "role_persmission_permsission_id_persmission_id_fk" FOREIGN KEY ("permsission_id") REFERENCES "public"."persmission"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer" DROP COLUMN "total_rides";