-- Payroll, patrol checkpoints, guard photos, client names (idempotent)
ALTER TABLE "guards" ADD COLUMN IF NOT EXISTS "photo_url" text;
ALTER TABLE "guards" ADD COLUMN IF NOT EXISTS "monthly_salary" integer NOT NULL DEFAULT 150000;
ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "client_name" text;
ALTER TABLE "patrols" ADD COLUMN IF NOT EXISTS "patrol_date" text;
CREATE TABLE IF NOT EXISTS "patrol_checkpoints" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "organization_id" uuid NOT NULL,
  "patrol_id" uuid NOT NULL,
  "guard_id" uuid NOT NULL,
  "slot" text NOT NULL,
  "signed_at" timestamptz NOT NULL,
  "latitude" double precision,
  "longitude" double precision,
  CONSTRAINT "patrol_checkpoints_patrol_slot" UNIQUE("patrol_id","slot")
);
CREATE TABLE IF NOT EXISTS "payroll_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "organization_id" uuid NOT NULL,
  "guard_id" uuid NOT NULL,
  "period" text NOT NULL,
  "base_salary" integer NOT NULL,
  "days_in_period" integer NOT NULL,
  "days_present" integer NOT NULL,
  "days_absent" integer NOT NULL,
  "absence_deduction" integer NOT NULL,
  "pension" integer NOT NULL,
  "net_pay" integer NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "paid_at" timestamptz,
  "paid_by" text,
  "created_at" timestamptz NOT NULL,
  CONSTRAINT "payroll_guard_period" UNIQUE("guard_id","period")
);
CREATE INDEX IF NOT EXISTS "patrol_checkpoints_org_idx" ON "patrol_checkpoints" ("organization_id");
CREATE INDEX IF NOT EXISTS "payroll_org_period_idx" ON "payroll_records" ("organization_id","period");
