import { and, eq, ne, sql } from "drizzle-orm";
import {
  semesterIdSchema,
  type Semester,
  type SemesterFields,
  type SemesterStatus,
} from "@gpa/shared";
import {
  SemesterValidationError,
  assertSemesterInvariants,
  mergeSemesterFields,
  parseCreateSemesterInput,
  parseSemesterPatch,
} from "../domain/semester.js";
import type { Database } from "./client.js";
import { UNIQUE_VIOLATION, isConstraintViolation } from "./errors.js";
import { semesters, type SemesterRow } from "./schema.js";

const ONE_ACTIVE_CONSTRAINT = "semesters_one_active_per_user";

/** Status the previously active semester takes when another is activated. */
export type ActiveDemotionStatus = Exclude<SemesterStatus, "active">;

/** A user already has a different active semester. */
export class ActiveSemesterConflictError extends Error {
  constructor() {
    super(
      "Another semester is already active. Choose what the current active semester becomes before activating this one.",
    );
    this.name = "ActiveSemesterConflictError";
  }
}

function mapWriteError(error: unknown): Error {
  if (isConstraintViolation(error, UNIQUE_VIOLATION, ONE_ACTIVE_CONSTRAINT)) {
    return new ActiveSemesterConflictError();
  }

  return error instanceof Error ? error : new Error("Database write failed");
}

function toFields(row: SemesterRow): SemesterFields {
  return {
    name: row.name,
    academicYear: row.academicYear,
    startDate: row.startDate,
    endDate: row.endDate,
    status: row.status,
  };
}

function toSemester(row: SemesterRow): Semester {
  return {
    id: row.id,
    ...toFields(row),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Creates a semester owned by `userId`.
 *
 * The payload is validated here rather than trusted from the caller, so
 * an endpoint added later cannot persist an invalid record by
 * forgetting to validate. The database repeats the same rules as
 * constraints.
 */
export async function createSemester(
  db: Database,
  userId: string,
  input: unknown,
): Promise<Semester> {
  const fields = parseCreateSemesterInput(input);

  try {
    const [row] = await db
      .insert(semesters)
      .values({ userId, ...fields })
      .returning();

    if (row === undefined) {
      throw new Error("Semester insert returned no row");
    }

    return toSemester(row);
  } catch (error) {
    throw mapWriteError(error);
  }
}

/**
 * Lists one user's semesters, most recent term first.
 *
 * The `userId` predicate is part of the query, not a post-filter, so
 * another user's rows are never read into application memory.
 */
export async function listSemesters(
  db: Database,
  userId: string,
): Promise<Semester[]> {
  const rows = await db
    .select()
    .from(semesters)
    .where(eq(semesters.userId, userId))
    .orderBy(
      sql`${semesters.startDate} desc nulls last`,
      sql`${semesters.createdAt} desc`,
    );

  return rows.map(toSemester);
}

/** Returns the semester only when it belongs to `userId`. */
export async function getSemester(
  db: Database,
  userId: string,
  semesterId: string,
): Promise<Semester | null> {
  if (!semesterIdSchema.safeParse(semesterId).success) {
    return null;
  }

  const [row] = await db
    .select()
    .from(semesters)
    .where(and(eq(semesters.id, semesterId), eq(semesters.userId, userId)))
    .limit(1);

  return row === undefined ? null : toSemester(row);
}

/**
 * Applies a partial edit.
 *
 * Read, merge, and write share one transaction with the row locked, so a
 * concurrent edit cannot be merged against stale dates. A row owned by
 * someone else is treated as absent and is never modified.
 */
export async function updateSemester(
  db: Database,
  userId: string,
  semesterId: string,
  patch: unknown,
): Promise<Semester | null> {
  if (!semesterIdSchema.safeParse(semesterId).success) {
    return null;
  }

  const parsed = parseSemesterPatch(patch);

  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(semesters)
        .where(and(eq(semesters.id, semesterId), eq(semesters.userId, userId)))
        .for("update");

      if (existing === undefined) {
        return null;
      }

      const merged = mergeSemesterFields(toFields(existing), parsed);
      assertSemesterInvariants(merged);

      const [row] = await tx
        .update(semesters)
        .set({ ...merged, updatedAt: new Date() })
        .where(and(eq(semesters.id, semesterId), eq(semesters.userId, userId)))
        .returning();

      return row === undefined ? null : toSemester(row);
    });
  } catch (error) {
    throw mapWriteError(error);
  }
}

/**
 * Makes one semester current.
 *
 * At most one semester per user can be active, so the outgoing active
 * semester leaves that status in the same transaction. Its new status is
 * the caller's choice: demoting to `completed` asserts the term finished,
 * while `archived` only takes it out of the current context. The
 * repository refuses to guess.
 */
export async function activateSemester(
  db: Database,
  userId: string,
  semesterId: string,
  options: { readonly demoteActiveTo: ActiveDemotionStatus },
): Promise<Semester | null> {
  if (!semesterIdSchema.safeParse(semesterId).success) {
    return null;
  }

  if ((options.demoteActiveTo as SemesterStatus) === "active") {
    throw new SemesterValidationError([
      {
        path: "status",
        message: "The outgoing semester cannot be demoted to active.",
      },
    ]);
  }

  try {
    return await db.transaction(async (tx) => {
      const [target] = await tx
        .select()
        .from(semesters)
        .where(and(eq(semesters.id, semesterId), eq(semesters.userId, userId)))
        .for("update");

      if (target === undefined) {
        return null;
      }

      // Already current: report success without touching timestamps.
      if (target.status === "active") {
        return toSemester(target);
      }

      // An active semester has to be date-bounded, or "today" has no
      // term to belong to.
      assertSemesterInvariants({ ...toFields(target), status: "active" });

      // Demote before promoting: the partial unique index is immediate,
      // not deferrable, so both rows cannot be active at any instant.
      await tx
        .update(semesters)
        .set({ status: options.demoteActiveTo, updatedAt: new Date() })
        .where(
          and(
            eq(semesters.userId, userId),
            eq(semesters.status, "active"),
            ne(semesters.id, semesterId),
          ),
        );

      const [row] = await tx
        .update(semesters)
        .set({ status: "active", updatedAt: new Date() })
        .where(and(eq(semesters.id, semesterId), eq(semesters.userId, userId)))
        .returning();

      if (row === undefined) {
        throw new Error("Semester activation returned no row");
      }

      return toSemester(row);
    });
  } catch (error) {
    throw mapWriteError(error);
  }
}
