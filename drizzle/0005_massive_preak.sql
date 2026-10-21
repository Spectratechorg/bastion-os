CREATE TABLE "patrol_checkpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"patrol_id" uuid NOT NULL,
	"slot" text NOT NULL,
	"signed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"guard_id" uuid NOT NULL,
	"period" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"base_salary" integer NOT NULL,
	"days_in_period" integer NOT NULL,
	"days_present" integer NOT NULL,
	"days_absent" integer NOT NULL,
	"absence_deduction" integer NOT NULL,
	"pension" integer NOT NULL,
	"net_pay" integer NOT NULL,
	"paid_at" timestamp with time zone,
	"paid_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guards" ADD COLUMN "photo_url" text;--> statement-breakpoint
ALTER TABLE "guards" ADD COLUMN "monthly_salary" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "patrols" ADD COLUMN "patrol_date" text;--> statement-breakpoint
ALTER TABLE "patrol_checkpoints" ADD CONSTRAINT "patrol_checkpoints_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patrol_checkpoints" ADD CONSTRAINT "patrol_checkpoints_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patrol_checkpoints" ADD CONSTRAINT "patrol_checkpoints_patrol_id_patrols_id_fk" FOREIGN KEY ("patrol_id") REFERENCES "public"."patrols"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_records" ADD CONSTRAINT "payroll_records_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_records" ADD CONSTRAINT "payroll_records_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_records" ADD CONSTRAINT "payroll_records_guard_id_guards_id_fk" FOREIGN KEY ("guard_id") REFERENCES "public"."guards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_records" ADD CONSTRAINT "payroll_records_paid_by_user_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "patrol_checkpoints_patrol_slot_unique" ON "patrol_checkpoints" USING btree ("patrol_id","slot");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_records_guard_period_unique" ON "payroll_records" USING btree ("guard_id","period");--> statement-breakpoint
CREATE UNIQUE INDEX "patrols_organization_guard_date_unique" ON "patrols" USING btree ("organization_id","guard_id","patrol_date");