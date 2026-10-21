ALTER TABLE "attendance" ADD COLUMN "review_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "guards" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "assignee_id" uuid;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "comments" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "timeline" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "patrols" ADD COLUMN "route_name" text;--> statement-breakpoint
ALTER TABLE "patrols" ADD COLUMN "checkpoint" text;--> statement-breakpoint
ALTER TABLE "patrols" ADD COLUMN "progress" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "patrols" ADD COLUMN "status" text DEFAULT 'in_progress' NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "danger_level" text DEFAULT 'low' NOT NULL;