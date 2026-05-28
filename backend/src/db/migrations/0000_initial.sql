CREATE TYPE "public"."device_role" AS ENUM('pc', 'phone');--> statement-breakpoint
CREATE TYPE "public"."room_type" AS ENUM('public', 'invite');--> statement-breakpoint
CREATE TYPE "public"."tracking_job_reason" AS ENUM('finish', 'leave');--> statement-breakpoint
CREATE TYPE "public"."tracking_job_status" AS ENUM('queued', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."tracking_page" AS ENUM('solo', 'room');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"google_sub" text NOT NULL,
	"email" text,
	"name" text NOT NULL,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "users_google_sub_unique" UNIQUE("google_sub"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"user_agent" text,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "device_role" NOT NULL,
	"label" text,
	"user_agent" text,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "active_pairings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"pc_device_id" uuid,
	"phone_device_id" uuid,
	"apple_watch_paired" text,
	"established_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pairing_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"issuer_user_id" uuid NOT NULL,
	"issuer_device_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"claimed_by_user_id" uuid,
	"claimed_by_device_id" uuid,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" text PRIMARY KEY NOT NULL,
	"type" "room_type" NOT NULL,
	"invite_code" text,
	"max_participants" integer DEFAULT 5 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ml_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"content_md" text NOT NULL,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracking_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid,
	"meeting_id" text NOT NULL,
	"page" "tracking_page" NOT NULL,
	"reason" "tracking_job_reason" NOT NULL,
	"status" "tracking_job_status" DEFAULT 'queued' NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"result_json" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracking_minute_samples" (
	"session_id" uuid NOT NULL,
	"minute_index" integer NOT NULL,
	"bucket_start" timestamp with time zone NOT NULL,
	"avg_heart_rate" real,
	"avg_focus_score" real,
	"focus_ratio" real,
	"sample_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracking_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"room_id" text,
	"page" "tracking_page" DEFAULT 'solo' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"focus_threshold" real,
	"duration_seconds" integer,
	"avg_bpm" real,
	"focus_ratio" real,
	"summary_json" jsonb
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_pairings" ADD CONSTRAINT "active_pairings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_pairings" ADD CONSTRAINT "active_pairings_pc_device_id_devices_id_fk" FOREIGN KEY ("pc_device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_pairings" ADD CONSTRAINT "active_pairings_phone_device_id_devices_id_fk" FOREIGN KEY ("phone_device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairing_codes" ADD CONSTRAINT "pairing_codes_issuer_user_id_users_id_fk" FOREIGN KEY ("issuer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairing_codes" ADD CONSTRAINT "pairing_codes_issuer_device_id_devices_id_fk" FOREIGN KEY ("issuer_device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairing_codes" ADD CONSTRAINT "pairing_codes_claimed_by_user_id_users_id_fk" FOREIGN KEY ("claimed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairing_codes" ADD CONSTRAINT "pairing_codes_claimed_by_device_id_devices_id_fk" FOREIGN KEY ("claimed_by_device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_participants" ADD CONSTRAINT "room_participants_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_participants" ADD CONSTRAINT "room_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ml_feedback" ADD CONSTRAINT "ml_feedback_job_id_tracking_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."tracking_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ml_feedback" ADD CONSTRAINT "ml_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_jobs" ADD CONSTRAINT "tracking_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_jobs" ADD CONSTRAINT "tracking_jobs_session_id_tracking_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."tracking_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_minute_samples" ADD CONSTRAINT "tracking_minute_samples_session_id_tracking_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."tracking_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_sessions" ADD CONSTRAINT "tracking_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_sessions" ADD CONSTRAINT "tracking_sessions_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "devices_user_id_idx" ON "devices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "pairing_codes_issuer_idx" ON "pairing_codes" USING btree ("issuer_user_id");--> statement-breakpoint
CREATE INDEX "pairing_codes_expires_at_idx" ON "pairing_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "room_participants_active_unique_idx" ON "room_participants" USING btree ("room_id","user_id") WHERE "room_participants"."left_at" IS NULL;--> statement-breakpoint
CREATE INDEX "room_participants_room_idx" ON "room_participants" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "room_participants_user_idx" ON "room_participants" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rooms_invite_code_unique_idx" ON "rooms" USING btree ("invite_code") WHERE "rooms"."invite_code" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "rooms_type_idx" ON "rooms" USING btree ("type");--> statement-breakpoint
CREATE INDEX "ml_feedback_job_idx" ON "ml_feedback" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "ml_feedback_user_idx" ON "ml_feedback" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tracking_jobs_user_created_idx" ON "tracking_jobs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "tracking_jobs_status_idx" ON "tracking_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tracking_minute_samples_session_idx" ON "tracking_minute_samples" USING btree ("session_id","minute_index");--> statement-breakpoint
CREATE INDEX "tracking_sessions_user_started_idx" ON "tracking_sessions" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "tracking_sessions_room_idx" ON "tracking_sessions" USING btree ("room_id");