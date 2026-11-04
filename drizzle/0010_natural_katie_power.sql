CREATE TABLE "guard_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text,
	"guard_id" uuid NOT NULL,
	"site_id" uuid,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"battery_level" integer,
	"accuracy" double precision,
	"speed" double precision,
	"source" text DEFAULT 'kafka',
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guard_locations" ADD CONSTRAINT "guard_locations_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guard_locations" ADD CONSTRAINT "guard_locations_guard_id_guards_id_fk" FOREIGN KEY ("guard_id") REFERENCES "public"."guards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guard_locations" ADD CONSTRAINT "guard_locations_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;