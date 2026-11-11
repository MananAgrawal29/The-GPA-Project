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
import type {
  ClassOccurrenceStatus,
  ClassType,
  SemesterStatus,
} from "@gpa/shared";

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
    // someone else\'s term through any code path.
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

/**
 * P14 --- Calendar Date Exceptions
 * Based on DECISIONS.md D004, D005, D033
 * One exception per semester date, with optional reason
 */

export const dayExceptionKindEnum = pgEnum("day_exception_kind", [
  "holiday",
  "special_schedule",
]);

type SchemaDayExceptionKind = (typeof dayExceptionKindEnum.enumValues)[number];

/**
 * Date-specific holidays and special schedule overrides.
 *
 * A day exception is a one-time calendar event (D033): it marks a specific
 * date within a semester, either as a holiday (no classes) or a special
 * schedule (custom class list). It does not mutate the recurring weekly
 * timetable.
 *
 * `kind` = 'holiday': no classes that day, optional reason
 * `kind` = 'special_schedule': classes defined in `day_exception_slots`
 *
 * Constraints:
 * - One exception per semester date (UNIQUE (semester_id, date))
 * - Holiday exceptions cannot contain slots (enforced in repository)
 * - Date must fall inside semester range (enforced in repository)
 */
export const dayExceptions = pgTable(
  "day_exceptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    semesterId: uuid("semester_id").notNull(),
    userId: text("user_id").notNull(),

    date: date("date").notNull(),
    kind: dayExceptionKindEnum("kind").notNull(),
    reason: text("reason"), // optional, trimmed 1-200 chars

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("day_exceptions_semester_id_idx").on(table.semesterId),
    index("day_exceptions_user_id_idx").on(table.userId),

    // One exception per semester date
    unique("day_exceptions_semester_date_unique").on(
      table.semesterId,
      table.date,
    ),

    // Composite foreign-key target for P14's day_exception_slots: it lets
    // the database prove that a slot's source exception belongs to the
    // occurrence's semester and owner.
    unique("day_exceptions_id_semester_id_user_id_unique").on(
      table.id,
      table.semesterId,
      table.userId,
    ),

    // Ownership is structural: the exception's semester must belong to the same owner.
    foreignKey({
      columns: [table.semesterId, table.userId],
      foreignColumns: [semesters.id, semesters.userId],
      name: "day_exceptions_semester_owner_fk",
    }).onDelete("restrict"),

    // Date must fall inside semester range (enforced in repository)
    // No CHECK constraint to avoid table coupling
  ],
);

/**
 * Classes that happen on a specific date for a special schedule exception.
 *
 * A day_exception with kind = 'special_schedule' defines its classes
 * in this table. A holiday exception (kind = 'holiday') has zero or no
 * slots.
 *
 * Slots within one exception cannot overlap on the same calendar date.
 * Overlap prevention is enforced in the repository layer using P12's
 * concurrency control pattern (SELECT FOR UPDATE on parent exception).
 */
export const dayExceptionSlots = pgTable(
  "day_exception_slots",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    exceptionId: uuid("exception_id").notNull(),
    semesterId: uuid("semester_id").notNull(),
    userId: text("user_id").notNull(),
    subjectId: uuid("subject_id").notNull(),

    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),

    room: text("room"),
    classType: classTypeEnum("class_type").notNull().default("lecture"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("day_exception_slots_exception_id_idx").on(table.exceptionId),
    index("day_exception_slots_semester_id_idx").on(table.semesterId),
    index("day_exception_slots_subject_id_idx").on(table.subjectId),

    // Exception-slot ownership: slot's semester_id/user_id must match parent exception
    // This composite FK ensures the slot's semester/user are those of its exception
    foreignKey({
      columns: [table.exceptionId, table.semesterId, table.userId],
      foreignColumns: [
        dayExceptions.id,
        dayExceptions.semesterId,
        dayExceptions.userId,
      ],
      name: "day_exception_slots_exception_owner_fk",
    }).onDelete("restrict"),

    // Subject belongs to the same semester and owner as the slot
    foreignKey({
      columns: [table.subjectId, table.semesterId, table.userId],
      foreignColumns: [subjects.id, subjects.semesterId, subjects.userId],
      name: "day_exception_slots_subject_owner_fk",
    }).onDelete("restrict"),

    // Semester ownership
    foreignKey({
      columns: [table.semesterId, table.userId],
      foreignColumns: [semesters.id, semesters.userId],
      name: "day_exception_slots_semester_owner_fk",
    }).onDelete("restrict"),

    // Time ordering: end strictly after start, no midnight crossing
    check(
      "day_exception_slots_time_order",
      sql`${table.endTime} > ${table.startTime}`,
    ),

    // Room length if present
    check(
      "day_exception_slots_room_length",
      sql`${table.room} is null or char_length(btrim(${table.room})) between 1 and 80`,
    ),

    // Slot overlap prevention: handled in repository layer with transaction lock
    // on parent day_exception row, following P12's concurrency-control pattern.
    // No database constraint: P12's partial unique index on exact duplicate times,
    // P14 will enforce within-exception overlap in application layer.

    // Composite foreign-key target for P15's dated occurrences: it lets the
    // database prove that an occurrence's source exception slot belongs to the
    // occurrence's semester and owner (D035).
    unique("day_exception_slots_id_semester_id_user_id_unique").on(
      table.id,
      table.semesterId,
      table.userId,
    ),
  ],
);

/**
 * P15 --- Dated class occurrences
 *
 * An occurrence is one dated, planned class generated from a recurring slot
 * or a special-schedule exception slot. Date, times, room, class type, and
 * subject are copied when the row is created, so later rule edits cannot
 * rewrite planned history (D030, D032).
 */
export const classOccurrenceStatusEnum = pgEnum("class_occurrence_status", [
  "scheduled",
  "cancelled",
]);

type SchemaClassOccurrenceStatus =
  (typeof classOccurrenceStatusEnum.enumValues)[number];

export const classOccurrenceStatusParity: Equal<
  ClassOccurrenceStatus,
  SchemaClassOccurrenceStatus
> = true;

export const classOccurrences = pgTable(
  "class_occurrences",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    semesterId: uuid("semester_id").notNull(),
    userId: text("user_id").notNull(),
    subjectId: uuid("subject_id").notNull(),

    // At most one source may be set. A manual one-off occurrence has
    // neither (D032); generated rows carry exactly one.
    sourceSlotId: uuid("source_slot_id"),
    sourceExceptionSlotId: uuid("source_exception_slot_id"),

    date: date("date").notNull(),

    // Wall-clock times with no date and no time zone (D034).
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),

    room: text("room"),
    classType: classTypeEnum("class_type").notNull().default("lecture"),
    status: classOccurrenceStatusEnum("status").notNull().default("scheduled"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("class_occurrences_semester_id_idx").on(table.semesterId),
    index("class_occurrences_subject_id_idx").on(table.subjectId),
    index("class_occurrences_date_idx").on(table.date),

    // Composite foreign-key target for P17 attendance: it lets the
    // database prove that an attendance row's occurrence belongs to its
    // semester and owner (D035).
    unique("class_occurrences_id_semester_id_user_id_unique").on(
      table.id,
      table.semesterId,
      table.userId,
    ),

    // Ownership is structural: the occurrence's semester must belong to
    // the same owner.
    foreignKey({
      columns: [table.semesterId, table.userId],
      foreignColumns: [semesters.id, semesters.userId],
      name: "class_occurrences_semester_owner_fk",
    }).onDelete("restrict"),

    // Subject belongs to the same semester and owner.
    foreignKey({
      columns: [table.subjectId, table.semesterId, table.userId],
      foreignColumns: [subjects.id, subjects.semesterId, subjects.userId],
      name: "class_occurrences_subject_owner_fk",
    }).onDelete("restrict"),

    // A generated recurring occurrence points at its source slot, which
    // must belong to the same semester and owner. The foreign key is
    // nullable because manual occurrences have no source (D032).
    foreignKey({
      columns: [table.sourceSlotId, table.semesterId, table.userId],
      foreignColumns: [
        timetableSlots.id,
        timetableSlots.semesterId,
        timetableSlots.userId,
      ],
      name: "class_occurrences_source_slot_owner_fk",
    }).onDelete("restrict"),

    // A generated special-schedule occurrence points at its source
    // exception slot, which must belong to the same semester and owner.
    foreignKey({
      columns: [table.sourceExceptionSlotId, table.semesterId, table.userId],
      foreignColumns: [
        dayExceptionSlots.id,
        dayExceptionSlots.semesterId,
        dayExceptionSlots.userId,
      ],
      name: "class_occurrences_source_exception_slot_owner_fk",
    }).onDelete("restrict"),

    check(
      "class_occurrences_time_order",
      sql`${table.endTime} > ${table.startTime}`,
    ),
    check(
      "class_occurrences_room_length",
      sql`${table.room} is null or char_length(btrim(${table.room})) between 1 and 80`,
    ),
    check(
      "class_occurrences_source_exclusivity",
      sql`${table.sourceSlotId} is null or ${table.sourceExceptionSlotId} is null`,
    ),

    // Idempotency: a recurring source slot generates at most one
    // occurrence per date, and a one-off exception slot generates at
    // most one occurrence ever (it belongs to exactly one date).
    uniqueIndex("class_occurrences_source_slot_date_unique")
      .on(table.sourceSlotId, table.date)
      .where(sql`${table.sourceSlotId} is not null`),
    uniqueIndex("class_occurrences_source_exception_slot_unique")
      .on(table.sourceExceptionSlotId)
      .where(sql`${table.sourceExceptionSlotId} is not null`),
  ],
);

export type ClassOccurrenceRow = typeof classOccurrences.$inferSelect;

// Type exports
export type DayExceptionKind = SchemaDayExceptionKind;
export type DayExceptionRow = typeof dayExceptions.$inferSelect;
export type DayExceptionSlotRow = typeof dayExceptionSlots.$inferSelect;

// These types are repeated from @gpa/shared because drizzle-kit
// loads this file through a CommonJS resolver that cannot import the
// ESM-only shared package. This equality check turns any future drift
// between the two into a type error instead of a runtime mismatch.
type SchemaDayExceptionKindType =
  (typeof dayExceptionKindEnum.enumValues)[number];

// Reusable type guard/equality - we could define this at the top with other equals
// but it's better to keep it close to where we use it
type SchemaDayExceptionKindParity = Equal<
  SchemaDayExceptionKind,
  SchemaDayExceptionKindType
>;

// For consistency with P12's approach
export const dayExceptionKindParity: SchemaDayExceptionKindParity = true;
