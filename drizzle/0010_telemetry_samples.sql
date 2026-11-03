CREATE TABLE "telemetry_samples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text,
	"kind" text NOT NULL,
	"screen" text,
	"route" text,
	"metric" text NOT NULL,
	"value" double precision NOT NULL,
	"rating" text,
	"device" text,
	"navigation_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "telemetry_samples" ADD CONSTRAINT "telemetry_samples_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "telemetry_samples_created_idx" ON "telemetry_samples" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "telemetry_samples_org_created_idx" ON "telemetry_samples" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "telemetry_samples_kind_metric_idx" ON "telemetry_samples" USING btree ("kind","metric");