ALTER TABLE "subjects" ADD CONSTRAINT "subjects_id_semester_id_user_id_unique" UNIQUE("id","semester_id","user_id");--> statement-breakpoint
CREATE TYPE "public"."class_type" AS ENUM('lecture', 'practical', 'tutorial', 'other');--> statement-breakpoint
CREATE TABLE "timetable_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"semester_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"day_of_week" smallint NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"room" text,
	"class_type" "class_type" DEFAULT 'lecture' NOT NULL,
	"active_from" date,
	"active_to" date,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "timetable_slots_id_semester_id_user_id_unique" UNIQUE("id","semester_id","user_id"),
	CONSTRAINT "timetable_slots_day_of_week_range" CHECK ("timetable_slots"."day_of_week" between 1 and 7),
	CONSTRAINT "timetable_slots_time_order" CHECK ("timetable_slots"."end_time" > "timetable_slots"."start_time"),
	CONSTRAINT "timetable_slots_room_length" CHECK ("timetable_slots"."room" is null or char_length(btrim("timetable_slots"."room")) between 1 and 80),
	CONSTRAINT "timetable_slots_active_range_order" CHECK ("timetable_slots"."active_from" is null or "timetable_slots"."active_to" is null or "timetable_slots"."active_to" >= "timetable_slots"."active_from")
);
--> statement-breakpoint
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_semester_owner_fk" FOREIGN KEY ("semester_id","user_id") REFERENCES "public"."semesters"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_subject_owner_fk" FOREIGN KEY ("subject_id","semester_id","user_id") REFERENCES "public"."subjects"("id","semester_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "timetable_slots_semester_id_idx" ON "timetable_slots" USING btree ("semester_id");--> statement-breakpoint
CREATE INDEX "timetable_slots_subject_id_idx" ON "timetable_slots" USING btree ("subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "timetable_slots_exact_duplicate" ON "timetable_slots" USING btree ("semester_id","day_of_week","start_time","end_time") WHERE "timetable_slots"."archived_at" is null;