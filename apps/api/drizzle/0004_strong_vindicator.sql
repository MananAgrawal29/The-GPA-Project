ALTER TABLE "day_exception_slots" ADD CONSTRAINT "day_exception_slots_id_semester_id_user_id_unique" UNIQUE("id","semester_id","user_id");--> statement-breakpoint
CREATE TYPE "public"."class_occurrence_status" AS ENUM('scheduled', 'cancelled');--> statement-breakpoint
CREATE TABLE "class_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"semester_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"source_slot_id" uuid,
	"source_exception_slot_id" uuid,
	"date" date NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"room" text,
	"class_type" "class_type" DEFAULT 'lecture' NOT NULL,
	"status" "class_occurrence_status" DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_occurrences_id_semester_id_user_id_unique" UNIQUE("id","semester_id","user_id"),
	CONSTRAINT "class_occurrences_time_order" CHECK ("class_occurrences"."end_time" > "class_occurrences"."start_time"),
	CONSTRAINT "class_occurrences_room_length" CHECK ("class_occurrences"."room" is null or char_length(btrim("class_occurrences"."room")) between 1 and 80),
	CONSTRAINT "class_occurrences_source_exclusivity" CHECK ("class_occurrences"."source_slot_id" is null or "class_occurrences"."source_exception_slot_id" is null)
);
--> statement-breakpoint
ALTER TABLE "class_occurrences" ADD CONSTRAINT "class_occurrences_semester_owner_fk" FOREIGN KEY ("semester_id","user_id") REFERENCES "public"."semesters"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_occurrences" ADD CONSTRAINT "class_occurrences_subject_owner_fk" FOREIGN KEY ("subject_id","semester_id","user_id") REFERENCES "public"."subjects"("id","semester_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_occurrences" ADD CONSTRAINT "class_occurrences_source_slot_owner_fk" FOREIGN KEY ("source_slot_id","semester_id","user_id") REFERENCES "public"."timetable_slots"("id","semester_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_occurrences" ADD CONSTRAINT "class_occurrences_source_exception_slot_owner_fk" FOREIGN KEY ("source_exception_slot_id","semester_id","user_id") REFERENCES "public"."day_exception_slots"("id","semester_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "class_occurrences_semester_id_idx" ON "class_occurrences" USING btree ("semester_id");--> statement-breakpoint
CREATE INDEX "class_occurrences_subject_id_idx" ON "class_occurrences" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "class_occurrences_date_idx" ON "class_occurrences" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "class_occurrences_source_slot_date_unique" ON "class_occurrences" USING btree ("source_slot_id","date") WHERE "class_occurrences"."source_slot_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "class_occurrences_source_exception_slot_unique" ON "class_occurrences" USING btree ("source_exception_slot_id") WHERE "class_occurrences"."source_exception_slot_id" is not null;--> statement-breakpoint
