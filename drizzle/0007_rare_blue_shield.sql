ALTER TABLE "finances" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "finances" ADD COLUMN "site_id" uuid;--> statement-breakpoint
ALTER TABLE "finances" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "finances" ADD COLUMN "receipt_url" text;--> statement-breakpoint
ALTER TABLE "finances" ADD CONSTRAINT "finances_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finances" ADD CONSTRAINT "finances_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;