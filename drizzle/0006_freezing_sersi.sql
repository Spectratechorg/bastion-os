ALTER TABLE "organization" ADD COLUMN "guard_app_code" text;--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_guard_app_code_unique" UNIQUE("guard_app_code");