-- Baseline tables (safe to re-run: IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS "activity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"tone" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"severity" text NOT NULL,
	"acknowledged" boolean NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS "attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"guard_id" uuid NOT NULL,
	"site_id" uuid,
	"checked_in_at" timestamp with time zone NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"method" text NOT NULL,
	"within_geofence" boolean NOT NULL,
	"review_status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS "finances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"amount" double precision NOT NULL,
	"status" text NOT NULL,
	"due_date" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS "guards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"nin" text NOT NULL,
	"phone" text NOT NULL,
	"initials" text NOT NULL,
	"status" text NOT NULL,
	"suspended_at" timestamp with time zone,
	"site" text,
	"nfc_token" text,
	"photo_url" text,
	"monthly_salary" integer DEFAULT 150000 NOT NULL,
	"last_check_in" timestamp with time zone,
	"last_latitude" double precision,
	"last_longitude" double precision,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "guards_nfc_token_unique" UNIQUE("nfc_token")
);

CREATE TABLE IF NOT EXISTS "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"severity" text NOT NULL,
	"status" text NOT NULL,
	"site" text NOT NULL,
	"assignee_id" uuid,
	"comments" text[] DEFAULT '{}' NOT NULL,
	"timeline" text[] DEFAULT '{}' NOT NULL,
	"reported_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);

CREATE TABLE IF NOT EXISTS "patrol_checkpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"patrol_id" uuid NOT NULL,
	"guard_id" uuid NOT NULL,
	"slot" text NOT NULL,
	"signed_at" timestamp with time zone NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	CONSTRAINT "patrol_checkpoints_patrol_slot" UNIQUE("patrol_id","slot")
);

CREATE TABLE IF NOT EXISTS "patrols" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"guard_id" uuid NOT NULL,
	"site_id" uuid,
	"logged_at" timestamp with time zone NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"method" text NOT NULL,
	"within_bounds" boolean NOT NULL,
	"route_name" text,
	"checkpoint" text,
	"progress" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"patrol_date" text,
	"created_at" timestamp with time zone NOT NULL
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
	"paid_at" timestamp with time zone,
	"paid_by" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "payroll_guard_period" UNIQUE("guard_id","period")
);

CREATE TABLE IF NOT EXISTS "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"geofence_radius" integer NOT NULL,
	"status" text NOT NULL,
	"danger_level" text DEFAULT 'low' NOT NULL,
	"client_name" text,
	"created_at" timestamp with time zone NOT NULL
);
