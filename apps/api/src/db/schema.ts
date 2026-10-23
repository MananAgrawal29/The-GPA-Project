import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
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
