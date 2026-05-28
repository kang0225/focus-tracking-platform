CREATE TABLE "tracking_pauses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"paused_at" timestamp with time zone NOT NULL,
	"resumed_at" timestamp with time zone,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tracking_sessions" ADD COLUMN "pause_seconds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tracking_sessions" ADD COLUMN "valid_seconds" integer;--> statement-breakpoint
ALTER TABLE "tracking_sessions" ADD COLUMN "high_focus_seconds" integer;--> statement-breakpoint
ALTER TABLE "tracking_sessions" ADD COLUMN "ranking_score" real;--> statement-breakpoint
ALTER TABLE "tracking_sessions" ADD COLUMN "ranking_eligible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tracking_sessions" ADD COLUMN "ranking_formula_version" smallint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "tracking_sessions" ADD COLUMN "ranking_date" text;--> statement-breakpoint
ALTER TABLE "tracking_pauses" ADD CONSTRAINT "tracking_pauses_session_id_tracking_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."tracking_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tracking_pauses_session_idx" ON "tracking_pauses" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "tracking_sessions_ranking_idx" ON "tracking_sessions" USING btree ("ranking_date","ranking_score") WHERE "tracking_sessions"."ranking_eligible" = true;--> statement-breakpoint
CREATE INDEX "tracking_sessions_user_ranking_idx" ON "tracking_sessions" USING btree ("user_id","ranking_date","ranking_score") WHERE "tracking_sessions"."ranking_eligible" = true;