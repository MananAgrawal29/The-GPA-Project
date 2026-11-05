ALTER TABLE "semesters" ADD CONSTRAINT "semesters_id_user_id_unique" UNIQUE("id","user_id");--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"semester_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subjects_name_length" CHECK (char_length(btrim("subjects"."name")) between 1 and 80)
);
--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_semester_owner_fk" FOREIGN KEY ("semester_id","user_id") REFERENCES "public"."semesters"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subjects_user_id_idx" ON "subjects" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subjects_semester_id_idx" ON "subjects" USING btree ("semester_id");
