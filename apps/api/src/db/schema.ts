import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { ClassType, SemesterStatus } from "@gpa/shared";

/**
 * Drizzle schema for The GPA Project.
 *
 * This module is server-only: it is imported by `apps/api` and never by
 * the browser, because `@gpa/shared` is bundled into the client and must
 * stay free of database code (D012).
 *
 * Ownership is structural. Every user-owned table carries a `user_id`
 * that references `users.id`, so a record cannot exist without an owner
 * and cannot be attributed to a user that does not exist. The API will
 * derive that id from a verified session, never from the request body
 * (D009).
 */

/**
 * Users are identified by their authentication provider's opaque subject
 * (`user_...`), not by email or a client-supplied value. No session code
 * exists yet (D015); the first authenticated request will create the row.
 */
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const semesterStatusEnum = pgEnum("semester_status", [
  "setup",
  "active",
  "completed",
  "archived",
]);

type SchemaSemesterStatus = (typeof semesterStatusEnum.enumValues)[number];

// The values above are repeated from `@gpa/shared` because drizzle-kit
// loads this file through a CommonJS resolver that cannot import the
// ESM-only shared package. This equality check turns any future drift
// between the two into a type error instead of a runtime mismatch.
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

export const semesterStatusParity: Equal<SemesterStatus, SchemaSemesterStatus> =
  true;

export const semesters = pgTable(
  "semesters",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Restrict, not cascade: deleting an owner must not silently delete
    // their academic history. Removing a user whose data exists needs an
    // explicit, reviewed decision.
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    name: text("name").notNull(),
    academicYear: text("academic_year").notNull(),

    // Calendar dates with no time component. NULL while the term is being
    // set up, because a student may create the semester before the
    // college publishes the dates.
    startDate: date("start_date"),
    endDate: date("end_date"),

    status: semesterStatusEnum("status").notNull().default("setup"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("semesters_user_id_idx").on(table.userId),

    // Composite foreign-key target for subjects: `(id, user_id)` lets the
    // database prove that a subject's owner is the semester's owner, not
    // just that both ids exist somewhere.
    unique("semesters_id_user_id_unique").on(table.id, table.userId),

    // At most one active semester per user (MAIN_PLAN section 7). A
    // partial index expresses this in the database rather than trusting
    // every future code path to check first.
    uniqueIndex("semesters_one_active_per_user")
      .on(table.userId)
      .where(sql`${table.status} = 'active'`),

    // The constraints below repeat the shared contract so a record cannot
    // reach an invalid state through SQL, a script, or a future endpoint
    // that skips the zod layer.
    check(
      "semesters_name_length",
      sql`char_length(btrim(${table.name})) between 1 and 80`,
    ),
    check(
      "semesters_academic_year_length",
      sql`char_length(btrim(${table.academicYear})) between 1 and 20`,
    ),
    check(
      "semesters_date_order",
      sql`${table.startDate} is null or ${table.endDate} is null or ${table.endDate} >= ${table.startDate}`,
    ),
    check(
      "semesters_active_has_dates",
      sql`${table.status} <> 'active' or (${table.startDate} is not null and ${table.endDate} is not null)`,
    ),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type SemesterRow = typeof semesters.$inferSelect;

export const subjects = pgTable(
  "subjects",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Every subject belongs to a specific semester. The composite foreign
    // key below is the only relationship: it also requires `user_id` to
    // match the semester's owner, so a subject cannot be filed under
    // someone else's term through any code path.
    semesterId: uuid("semester_id").notNull(),

    // Owner is derived from the associated semester, not from the request.
    userId: text("user_id").notNull(),

    name: text("name").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("subjects_user_id_idx").on(table.userId),
    index("subjects_semester_id_idx").on(table.semesterId),

    // Composite foreign-key target for timetable slots: a slot references
    // `(subject_id, semester_id, user_id)`, so the database proves its
    // subject belongs to the same semester and owner as the slot (D035).
    unique("subjects_id_semester_id_user_id_unique").on(
      table.id,
      table.semesterId,
      table.userId,
    ),

    // Ownership integrity: the referenced pair must exist in semesters,
    // so `user_id` is the owner of `semester_id`, and the referenced user
    // therefore exists too (semesters.user_id already references users).
    foreignKey({
      columns: [table.semesterId, table.userId],
      foreignColumns: [semesters.id, semesters.userId],
      name: "subjects_semester_owner_fk",
    }).onDelete("restrict"),

    // Repeats the shared contract so a subject cannot be stored with a
    // blank or overlong name through SQL, a script, or a future endpoint.
    check(
      "subjects_name_length",
      sql`char_length(btrim(${table.name})) between 1 and 80`,
    ),

    // The same subject name is allowed in different semesters, and names
    // are not unique even within one semester: identity is the id (P09).
  ],
);

export type SubjectRow = typeof subjects.$inferSelect;

export const classTypeEnum = pgEnum("class_type", [
  "lecture",
  "practical",
  "tutorial",
  "other",
]);

type SchemaClassType = (typeof classTypeEnum.enumValues)[number];

// Repeated from `@gpa/shared` for the same drizzle-kit resolver reason as
// the semester status enum above. A drift between the two becomes a type
// error here instead of a runtime mismatch.
export const classTypeParity: Equal<ClassType, SchemaClassType> = true;

/**
 * Recurring weekly timetable slots.
 *
 * A slot is a rule, not an event (D030): it says that a subject meets at a
 * wall-clock time on a weekday, and carries no date of its own. Dated class
 * occurrences are generated from these rules in P15 and never live here.
 *
 * `archived_at` stops a slot from generating future classes while keeping
 * the row that existing occurrences point at (D035). P12 has no
 * occurrences yet, so removal is still a hard delete when nothing refers
 * to the row.
 */
export const timetableSlots = pgTable(
  "timetable_slots",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    semesterId: uuid("semester_id").notNull(),
    userId: text("user_id").notNull(),
    subjectId: uuid("subject_id").notNull(),

    // ISO weekday: Monday is 1 and Sunday is 7, matching `isodow`.
    dayOfWeek: smallint("day_of_week").notNull(),

    // Wall-clock times with no date and no time zone (D034). Both are
    // compared as strings in `HH:MM` form before they reach SQL.
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),

    room: text("room"),
    classType: classTypeEnum("class_type").notNull().default("lecture"),

    // Optional effective range inside the semester. A timetable that
    // changes mid-term uses an end date on the old slot plus a new slot,
    // never an edit of a past occurrence.
    activeFrom: date("active_from"),
    activeTo: date("active_to"),

    archivedAt: timestamp("archived_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("timetable_slots_semester_id_idx").on(table.semesterId),
    index("timetable_slots_subject_id_idx").on(table.subjectId),

    // Composite foreign-key target for P15's dated occurrences: it lets
    // the database prove that an occurrence's source slot belongs to the
    // occurrence's semester and owner (D035).
    unique("timetable_slots_id_semester_id_user_id_unique").on(
      table.id,
      table.semesterId,
      table.userId,
    ),

    // Ownership is structural: the slot's semester, and its subject within
    // that semester, must both belong to the same owner.
    foreignKey({
      columns: [table.semesterId, table.userId],
      foreignColumns: [semesters.id, semesters.userId],
      name: "timetable_slots_semester_owner_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.subjectId, table.semesterId, table.userId],
      foreignColumns: [subjects.id, subjects.semesterId, subjects.userId],
      name: "timetable_slots_subject_owner_fk",
    }).onDelete("restrict"),

    // Repeat the shared rules so a slot cannot reach an invalid state
    // through SQL, a script, or a future endpoint that skips zod.
    check(
      "timetable_slots_day_of_week_range",
      sql`${table.dayOfWeek} between 1 and 7`,
    ),
    check(
      "timetable_slots_time_order",
      sql`${table.endTime} > ${table.startTime}`,
    ),
    check(
      "timetable_slots_room_length",
      sql`${table.room} is null or char_length(btrim(${table.room})) between 1 and 80`,
    ),
    check(
      "timetable_slots_active_range_order",
      sql`${table.activeFrom} is null or ${table.activeTo} is null or ${table.activeTo} >= ${table.activeFrom}`,
    ),

    // Backstop for the repository's overlap check: the same time on the
    // same weekday cannot exist twice in one semester. Archived slots are
    // excluded so a replaced rule can keep its history (D035).
    uniqueIndex("timetable_slots_exact_duplicate")
      .on(table.semesterId, table.dayOfWeek, table.startTime, table.endTime)
      .where(sql`${table.archivedAt} is null`),
  ],
);

export type TimetableSlotRow = typeof timetableSlots.$inferSelect;
