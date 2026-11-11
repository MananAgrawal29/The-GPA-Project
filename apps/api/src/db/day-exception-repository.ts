import { and, eq } from "drizzle-orm";
import { semesterIdSchema } from "@gpa/shared";
import type { Database } from "./client.js";
import {
  FOREIGN_KEY_VIOLATION,
  RESTRICT_VIOLATION,
  UNIQUE_VIOLATION,
  isConstraintViolation,
} from "./errors.js";
import {
  dayExceptionSlots,
  dayExceptions,
  semesters,
  type DayExceptionRow,
} from "./schema.js";
import {
  DayExceptionConflictError,
  DayExceptionDateBoundsError,
  DayExceptionKindConflictError,
  DayExceptionOwnershipError,
  DayExceptionValidationError,
  validateCreateDayException,
  validateDayExceptionPatch,
} from "../domain/day-exception-repository.js";

const EXCEPTION_DATE_UNIQUE_CONSTRAINT = "day_exceptions_semester_date_unique";
const EXCEPTION_OWNER_CONSTRAINT = "day_exceptions_semester_owner_fk";
const SLOT_OWNER_CONSTRAINT = "day_exception_slots_exception_owner_fk";

type DayExceptionKind = "holiday" | "special_schedule";

/**
 * Concurrency note, stated plainly: PGlite is a single-connection engine,
 * so two writes cannot actually contend here. The repository still takes
 * application-level prechecks for uniqueness and date bounds, but these
 * are not atomic with the subsequent write. The database unique constraint
 * on (semester_id, date) remains the final integrity safeguard. Under
 * true concurrency (real PostgreSQL), a TOCTOU window exists between the
 * application-level precheck and the write; the database unique constraint
 * is the authoritative guard.
 */

function canNameSemester(semesterId: string): boolean {
  return semesterIdSchema.safeParse(semesterId).success;
}

function toDayException(row: DayExceptionRow) {
  return {
    id: row.id,
    semesterId: row.semesterId,
    userId: row.userId,
    date: row.date,
    kind: row.kind,
    reason: row.reason ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type DayException = ReturnType<typeof toDayException>;

/**
 * Creates a day exception owned by `userId` within the given semester.
 */
export async function createDayException(
  db: Database,
  userId: string,
  semesterId: string,
  input: unknown,
): Promise<DayException> {
  if (!canNameSemester(semesterId)) {
    throw new DayExceptionValidationError([
      { path: "semesterId", message: "Semester ID is required." },
    ]);
  }

  // Validate and sanitize input
  validateCreateDayException({
    semesterId,
    userId,
    ...(input as Record<string, unknown>),
  });

  const data = input as Record<string, unknown>;
  const { date, kind, reason } = data as {
    date: string;
    kind: DayExceptionKind;
    reason?: string;
  };

  // Validate date bounds against semester
  const [semester] = await db
    .select({ startDate: semesters.startDate, endDate: semesters.endDate })
    .from(semesters)
    .where(eq(semesters.id, semesterId))
    .limit(1);

  if (semester === undefined) {
    throw new DayExceptionOwnershipError();
  }

  if (semester.startDate && date < semester.startDate) {
    throw new DayExceptionDateBoundsError();
  }
  if (semester.endDate && date > semester.endDate) {
    throw new DayExceptionDateBoundsError();
  }

  try {
    const [row] = await db
      .insert(dayExceptions)
      .values({ semesterId, userId, date, kind, reason: reason?.trim() })
      .returning();

    if (row === undefined) {
      throw new Error("Day exception insert returned no row");
    }

    return toDayException(row);
  } catch (error) {
    // The composite foreign key is the ownership guarantee: a semester
    // that does not exist, or belongs to someone else, is rejected here.
    if (
      isConstraintViolation(
        error,
        FOREIGN_KEY_VIOLATION,
        EXCEPTION_OWNER_CONSTRAINT,
      )
    ) {
      throw new DayExceptionOwnershipError();
    }

    // Unique constraint on (semester_id, date)
    if (
      isConstraintViolation(
        error,
        UNIQUE_VIOLATION,
        EXCEPTION_DATE_UNIQUE_CONSTRAINT,
      )
    ) {
      throw new DayExceptionValidationError([
        {
          path: "date",
          message: "An exception already exists for this semester date.",
        },
      ]);
    }

    throw error;
  }
}

/**
 * Lists one semester's day exceptions, ordered by date.
 */
export async function listDayExceptions(
  db: Database,
  userId: string,
  semesterId: string,
): Promise<DayException[]> {
  if (!canNameSemester(semesterId)) {
    return [];
  }

  const rows = await db
    .select()
    .from(dayExceptions)
    .where(
      and(
        eq(dayExceptions.semesterId, semesterId),
        eq(dayExceptions.userId, userId),
      ),
    )
    .orderBy(dayExceptions.date);

  return rows.map(toDayException);
}

/**
 * Returns the day exception only when it belongs to `userId`'s semester.
 */
export async function getDayException(
  db: Database,
  userId: string,
  semesterId: string,
  exceptionId: string,
): Promise<DayException | null> {
  if (!canNameSemester(semesterId)) {
    return null;
  }

  const [row] = await db
    .select()
    .from(dayExceptions)
    .where(
      and(
        eq(dayExceptions.id, exceptionId),
        eq(dayExceptions.semesterId, semesterId),
        eq(dayExceptions.userId, userId),
      ),
    )
    .limit(1);

  return row === undefined ? null : toDayException(row);
}

/**
 * Applies a partial edit.
 *
 * A day exception owned by someone else (or filed under another semester) is
 * treated as absent and is never modified.
 */
export async function updateDayException(
  db: Database,
  userId: string,
  semesterId: string,
  exceptionId: string,
  patch: unknown,
): Promise<DayException | null> {
  if (!canNameSemester(semesterId)) {
    return null;
  }

  // The shared patch contract owns the shape, so a malformed date or a blank
  // reason is rejected here instead of reaching a date column, and a bad
  // patch cannot pass as "nothing to change".
  validateDayExceptionPatch(patch);

  const data = patch as Record<string, unknown>;

  // Nothing to change: report the stored record when it exists.
  if (
    data.date === undefined &&
    data.kind === undefined &&
    data.reason === undefined
  ) {
    return getDayException(db, userId, semesterId, exceptionId);
  }

  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(dayExceptions)
        .where(
          and(
            eq(dayExceptions.id, exceptionId),
            eq(dayExceptions.semesterId, semesterId),
            eq(dayExceptions.userId, userId),
          ),
        )
        .for("update")
        .limit(1);

      if (existing === undefined) {
        return null;
      }

      // A holiday is a class-free day (D033). Refuse to turn a special
      // schedule that still owns slots into a holiday; the slots must be
      // deleted first and are never cascaded away. The parent row is locked
      // above, and slot writes lock it first too, so this reads a stable
      // state rather than racing a concurrent insert.
      if (data.kind === "holiday" && existing.kind !== "holiday") {
        const [slot] = await tx
          .select({ id: dayExceptionSlots.id })
          .from(dayExceptionSlots)
          .where(
            and(
              eq(dayExceptionSlots.exceptionId, exceptionId),
              eq(dayExceptionSlots.semesterId, semesterId),
              eq(dayExceptionSlots.userId, userId),
            ),
          )
          .limit(1);

        if (slot !== undefined) {
          throw new DayExceptionKindConflictError(exceptionId);
        }
      }

      // Check if the new date would conflict with another exception
      if (data.date !== undefined && data.date !== existing.date) {
        const newDateStr = data.date as string;
        const [conflict] = await tx
          .select({ id: dayExceptions.id })
          .from(dayExceptions)
          .where(
            and(
              eq(dayExceptions.semesterId, semesterId),
              eq(dayExceptions.userId, userId),
              eq(dayExceptions.date, newDateStr),
            ),
          )
          .limit(1);

        if (conflict !== undefined) {
          throw new DayExceptionValidationError([
            {
              path: "date",
              message: "An exception already exists for this semester date.",
            },
          ]);
        }
      }

      // Validate date bounds against semester
      if (data.date !== undefined) {
        const [semester] = await tx
          .select({
            startDate: semesters.startDate,
            endDate: semesters.endDate,
          })
          .from(semesters)
          .where(eq(semesters.id, semesterId))
          .limit(1);

        if (semester !== undefined) {
          const newDateStr = data.date as string;
          if (semester.startDate && newDateStr < semester.startDate) {
            throw new DayExceptionDateBoundsError();
          }
          if (semester.endDate && newDateStr > semester.endDate) {
            throw new DayExceptionDateBoundsError();
          }
        }
      }

      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (data.date !== undefined) updateData.date = data.date;
      if (data.kind !== undefined) updateData.kind = data.kind;
      if (data.reason !== undefined) updateData.reason = data.reason;

      const updated = await tx
        .update(dayExceptions)
        .set(updateData)
        .where(
          and(
            eq(dayExceptions.id, exceptionId),
            eq(dayExceptions.semesterId, semesterId),
            eq(dayExceptions.userId, userId),
          ),
        )
        .returning();

      return updated[0] === undefined ? null : toDayException(updated[0]);
    });
  } catch (error) {
    if (
      isConstraintViolation(
        error,
        UNIQUE_VIOLATION,
        EXCEPTION_DATE_UNIQUE_CONSTRAINT,
      )
    ) {
      throw new DayExceptionValidationError([
        {
          path: "date",
          message: "An exception already exists for this semester date.",
        },
      ]);
    }
    throw error;
  }
}

/**
 * Deletes a day exception, but only from the caller's own semester.
 *
 * Returns true if deleted, false if not found. If dependent slots prevent
 * deletion, throws a stable conflict error.
 */
export async function deleteDayException(
  db: Database,
  userId: string,
  semesterId: string,
  exceptionId: string,
): Promise<boolean> {
  if (!canNameSemester(semesterId)) {
    return false;
  }

  try {
    const deleted = await db
      .delete(dayExceptions)
      .where(
        and(
          eq(dayExceptions.id, exceptionId),
          eq(dayExceptions.semesterId, semesterId),
          eq(dayExceptions.userId, userId),
        ),
      )
      .returning({ id: dayExceptions.id });

    return deleted.length > 0;
  } catch (error) {
    if (
      isConstraintViolation(
        error,
        FOREIGN_KEY_VIOLATION,
        SLOT_OWNER_CONSTRAINT,
      ) ||
      isConstraintViolation(error, RESTRICT_VIOLATION, SLOT_OWNER_CONSTRAINT)
    ) {
      throw new DayExceptionConflictError(exceptionId);
    }
    throw error;
  }
}

// Re-export types and validation from domain
export {
  DayExceptionConflictError,
  DayExceptionValidationError,
  DayExceptionOwnershipError,
  DayExceptionDateBoundsError,
  type DayExceptionFieldIssue,
  validateCreateDayException,
} from "../domain/day-exception-repository.js";
