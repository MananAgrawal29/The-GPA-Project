CREATE TYPE "public"."day_exception_kind" AS ENUM('holiday', 'special_schedule');--> statement-breakpoint
CREATE TABLE "day_exception_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exception_id" uuid NOT NULL,
	"semester_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"room" text,
	"class_type" "class_type" DEFAULT 'lecture' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "day_exception_slots_time_order" CHECK ("day_exception_slots"."end_time" > "day_exception_slots"."start_time"),
	CONSTRAINT "day_exception_slots_room_length" CHECK ("day_exception_slots"."room" is null or char_length(btrim("day_exception_slots"."room")) between 1 and 80)
);
--> statement-breakpoint
CREATE TABLE "day_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"semester_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"kind" "day_exception_kind" NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "day_exceptions_semester_date_unique" UNIQUE("semester_id","date"),
	CONSTRAINT "day_exceptions_id_semester_id_user_id_unique" UNIQUE("id","semester_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "day_exception_slots" ADD CONSTRAINT "day_exception_slots_exception_owner_fk" FOREIGN KEY ("exception_id","semester_id","user_id") REFERENCES "public"."day_exceptions"("id","semester_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_exception_slots" ADD CONSTRAINT "day_exception_slots_subject_owner_fk" FOREIGN KEY ("subject_id","semester_id","user_id") REFERENCES "public"."subjects"("id","semester_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_exception_slots" ADD CONSTRAINT "day_exception_slots_semester_owner_fk" FOREIGN KEY ("semester_id","user_id") REFERENCES "public"."semesters"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_exceptions" ADD CONSTRAINT "day_exceptions_semester_owner_fk" FOREIGN KEY ("semester_id","user_id") REFERENCES "public"."semesters"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "day_exception_slots_exception_id_idx" ON "day_exception_slots" USING btree ("exception_id");--> statement-breakpoint
CREATE INDEX "day_exception_slots_semester_id_idx" ON "day_exception_slots" USING btree ("semester_id");--> statement-breakpoint
CREATE INDEX "day_exception_slots_subject_id_idx" ON "day_exception_slots" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "day_exceptions_semester_id_idx" ON "day_exceptions" USING btree ("semester_id");--> statement-breakpoint
CREATE INDEX "day_exceptions_user_id_idx" ON "day_exceptions" USING btree ("user_id");