CREATE TYPE "public"."semester_status" AS ENUM('setup', 'active', 'completed', 'archived');--> statement-breakpoint
CREATE TABLE "semesters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"academic_year" text NOT NULL,
	"start_date" date,
	"end_date" date,
	"status" "semester_status" DEFAULT 'setup' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "semesters_name_length" CHECK (char_length(btrim("semesters"."name")) between 1 and 80),
	CONSTRAINT "semesters_academic_year_length" CHECK (char_length(btrim("semesters"."academic_year")) between 1 and 20),
	CONSTRAINT "semesters_date_order" CHECK ("semesters"."start_date" is null or "semesters"."end_date" is null or "semesters"."end_date" >= "semesters"."start_date"),
	CONSTRAINT "semesters_active_has_dates" CHECK ("semesters"."status" <> 'active' or ("semesters"."start_date" is not null and "semesters"."end_date" is not null))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "semesters" ADD CONSTRAINT "semesters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "semesters_user_id_idx" ON "semesters" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "semesters_one_active_per_user" ON "semesters" USING btree ("user_id") WHERE "semesters"."status" = 'active';