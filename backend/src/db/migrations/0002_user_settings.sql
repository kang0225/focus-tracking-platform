ALTER TABLE "users" ADD COLUMN "daily_goal_hours" real DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "dday_date" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "dday_label" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "daily_motto" text;
