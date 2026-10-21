ALTER TABLE "organization" ADD COLUMN "patrol_start_hour" integer DEFAULT 8 NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "patrol_end_hour" integer DEFAULT 18 NOT NULL;