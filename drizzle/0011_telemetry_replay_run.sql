ALTER TABLE "telemetry_samples" ADD COLUMN "replay_run" text;--> statement-breakpoint
CREATE INDEX "telemetry_samples_replay_idx" ON "telemetry_samples" USING btree ("replay_run");