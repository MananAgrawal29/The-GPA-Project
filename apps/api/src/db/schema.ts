import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { SemesterStatus } from "@gpa/shared";

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
