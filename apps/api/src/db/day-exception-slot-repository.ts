import { and, eq, gt, lt, ne } from "drizzle-orm";
import { semesterIdSchema } from "@gpa/shared";
import type { Database } from "./client.js";
import { FOREIGN_KEY_VIOLATION, isConstraintViolation } from "./errors.js";
import {
  DayExceptionSlotConflictError,
  DayExceptionSlotHolidayConflictError,
  DayExceptionSlotOverlapError,
  DayExceptionSlotOwnershipError,
  DayExceptionSlotValidationError,
  parseCreateDayExceptionSlotInput,
} from "../domain/day-exception-repository.js";
import {
  classOccurrences,
  dayExceptions,
  dayExceptionSlots,
  subjects,
  type DayExceptionSlotRow,
} from "./schema.js";

const EXCEPTION_SLOT_OWNER_CONSTRAINT =
  "day_exception_slots_exception_owner_fk";
const SUBJECT_SLOT_OWNER_CONSTRAINT = "day_exception_slots_subject_owner_fk";
const SEMESTER_SLOT_OWNER_CONSTRAINT = "day_exception_slots_semester_owner_fk";

/**
 * Converts a database row to the domain slot type.
 */
function toDayExceptionSlot(row: DayExceptionSlotRow) {
  return {
    id: row.id,
    exceptionId: row.exceptionId,
    semesterId: row.semesterId,
    userId: row.userId,
    subjectId: row.subjectId,
    startTime: row.startTime.slice(0, 5),
    endTime: row.endTime.slice(0, 5),
    room: row.room ?? undefined,
    classType: row.classType,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type DayExceptionSlot = ReturnType<typeof toDayExceptionSlot>;

/**
 * Locks and returns the parent exception, or null when it is not the caller's.
 *
 * The lock is scoped by exception ID, semester ID, and user ID, which is
 * the exact composite key that links the slot to its parent exception.
 */
async function lockOwnedException(
  db: Database,
  userId: string,
  exceptionId: string,
  semesterId: string,
): Promise<{ id: string; kind: string; date: string } | null> {
  const [row] = await db
    .select({
      id: dayExceptions.id,
      kind: dayExceptions.kind,
      date: dayExceptions.date,
    })
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

  return row ?? null;
}

/**
 * Refuses a subject that is not part of this exact semester and owner.
 */
async function assertSubjectInSemester(
  db: Database,
  userId: string,
  semesterId: string,
  subjectId: string,
): Promise<void> {
  const [row] = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(
      and(
        eq(subjects.id, subjectId),
        eq(subjects.semesterId, semesterId),
        eq(subjects.userId, userId),
      ),
    )
    .limit(1);

  if (row === undefined) {
    throw new DayExceptionSlotOwnershipError();
  }
}

/**
 * Refuses a slot that overlaps another slot within the same exception.
 *
 * Half-open ranges are used: `[start, end)`. A slot ending at 10:00 and one
 * starting at 10:00 are adjacent, not overlapping.
 */
async function assertNoOverlap(
  db: Database,
  exceptionId: string,
  startTime: string,
  endTime: string,
  excludedSlotId: string | null,
): Promise<void> {
  const conditions = [
    eq(dayExceptionSlots.exceptionId, exceptionId),
    lt(dayExceptionSlots.startTime, endTime),
    gt(dayExceptionSlots.endTime, startTime),
  ];

  if (excludedSlotId !== null) {
    conditions.push(ne(dayExceptionSlots.id, excludedSlotId));
  }

  const [conflict] = await db
    .select({ id: dayExceptionSlots.id })
    .from(dayExceptionSlots)
    .where(and(...conditions))
    .limit(1);

  if (conflict !== undefined) {
    throw new DayExceptionSlotOverlapError(conflict.id);
  }
}

/**
 * Maps a constraint rejection to the error the API will turn into a
 * response. Known domain errors pass through unchanged.
 */
function mapSlotWriteError(error: unknown): Error {
  if (
    error instanceof DayExceptionSlotValidationError ||
    error instanceof DayExceptionSlotOwnershipError ||
    error instanceof DayExceptionSlotHolidayConflictError ||
    error instanceof DayExceptionSlotOverlapError
  ) {
    return error;
  }

  if (
    isConstraintViolation(
      error,
      FOREIGN_KEY_VIOLATION,
      EXCEPTION_SLOT_OWNER_CONSTRAINT,
    ) ||
    isConstraintViolation(
      error,
      FOREIGN_KEY_VIOLATION,
      SUBJECT_SLOT_OWNER_CONSTRAINT,
    ) ||
    isConstraintViolation(
      error,
      FOREIGN_KEY_VIOLATION,
      SEMESTER_SLOT_OWNER_CONSTRAINT,
    )
  ) {
    return new DayExceptionSlotOwnershipError();
  }

  return error instanceof Error ? error : new Error("Database write failed");
}

/**
 * Creates a slot inside a special_schedule exception.
 *
 * The operation locks the parent exception row first, then validates the
 * subject and overlap, and inserts the slot. All checks happen inside a
 * single transaction so a concurrent write for the same exception cannot
 * race the overlap check.
 */
export async function createDayExceptionSlot(
  db: Database,
  userId: string,
  exceptionId: string,
  semesterId: string,
  input: unknown,
): Promise<DayExceptionSlot> {
  // Include ownership fields in the input for validation
  const validationInput = {
    ...(input as Record<string, unknown>),
    exceptionId,
    semesterId,
    userId,
  };
  const data = parseCreateDayExceptionSlotInput(validationInput);

  try {
    return await db.transaction(async (tx) => {
      // Lock the parent exception first
      const parent = await lockOwnedException(
        tx,
        userId,
        exceptionId,
        semesterId,
      );

      if (parent === null) {
        throw new DayExceptionSlotOwnershipError();
      }

      // Reject slots under holiday exceptions
      if (parent.kind === "holiday") {
        throw new DayExceptionSlotHolidayConflictError();
      }

      // Validate subject belongs to the same semester and user
      await assertSubjectInSemester(tx, userId, semesterId, data.subjectId);

      // Check for overlaps
      await assertNoOverlap(
        tx,
        exceptionId,
        data.startTime,
        data.endTime,
        null,
      );

      // Insert the slot
      const [row] = await tx
        .insert(dayExceptionSlots)
        .values({
          exceptionId,
          semesterId,
          userId,
          subjectId: data.subjectId,
          startTime: data.startTime,
          endTime: data.endTime,
          room: data.room?.trim() ?? null,
          classType: data.classType,
        })
        .returning();

      if (row === undefined) {
        throw new Error("Day exception slot insert returned no row");
      }

      return toDayExceptionSlot(row);
    });
  } catch (error) {
    throw mapSlotWriteError(error);
  }
}

/**
 * Lists all slots belonging to a specific exception, ordered by start time.
 */
export async function listDayExceptionSlots(
  db: Database,
  userId: string,
  exceptionId: string,
  semesterId: string,
): Promise<DayExceptionSlot[]> {
  if (!semesterIdSchema.safeParse(exceptionId).success) {
    return [];
  }

  // Verify the parent exception belongs to the user
  const [parent] = await db
    .select({ id: dayExceptions.id })
    .from(dayExceptions)
    .where(
      and(
        eq(dayExceptions.id, exceptionId),
        eq(dayExceptions.semesterId, semesterId),
        eq(dayExceptions.userId, userId),
      ),
    )
    .limit(1);

  if (parent === undefined) {
    return [];
  }

  const rows = await db
    .select()
    .from(dayExceptionSlots)
    .where(
      and(
        eq(dayExceptionSlots.exceptionId, exceptionId),
        eq(dayExceptionSlots.semesterId, semesterId),
        eq(dayExceptionSlots.userId, userId),
      ),
    )
    .orderBy(dayExceptionSlots.startTime);

  return rows.map(toDayExceptionSlot);
}

/**
 * Returns one slot belonging to the given exception and owner scope.
 */
export async function getDayExceptionSlot(
  db: Database,
  userId: string,
  exceptionId: string,
  semesterId: string,
  slotId: string,
): Promise<DayExceptionSlot | null> {
  if (
    !semesterIdSchema.safeParse(exceptionId).success ||
    !semesterIdSchema.safeParse(slotId).success
  ) {
    return null;
  }

  const [row] = await db
    .select()
    .from(dayExceptionSlots)
    .where(
      and(
        eq(dayExceptionSlots.id, slotId),
        eq(dayExceptionSlots.exceptionId, exceptionId),
        eq(dayExceptionSlots.semesterId, semesterId),
        eq(dayExceptionSlots.userId, userId),
      ),
    )
    .limit(1);

  return row === undefined ? null : toDayExceptionSlot(row);
}

/**
 * Updates a slot belonging to a specific exception.
 *
 * The operation locks the parent exception row first, then validates the
 * updated fields, checks for overlaps (excluding the current slot), and
 * updates the slot. All checks happen inside a single transaction.
 */
export async function updateDayExceptionSlot(
  db: Database,
  userId: string,
  exceptionId: string,
  semesterId: string,
  slotId: string,
  patch: unknown,
): Promise<DayExceptionSlot | null> {
  if (
    !semesterIdSchema.safeParse(exceptionId).success ||
    !semesterIdSchema.safeParse(slotId).success
  ) {
    return null;
  }

  try {
    return await db.transaction(async (tx) => {
      // Lock the parent exception first
      const parent = await lockOwnedException(
        tx,
        userId,
        exceptionId,
        semesterId,
      );

      if (parent === null) {
        return null;
      }

      // Reject updates on slots under holiday exceptions
      if (parent.kind === "holiday") {
        throw new DayExceptionSlotHolidayConflictError();
      }

      // Lock the existing slot
      const [existing] = await tx
        .select()
        .from(dayExceptionSlots)
        .where(
          and(
            eq(dayExceptionSlots.id, slotId),
            eq(dayExceptionSlots.exceptionId, exceptionId),
            eq(dayExceptionSlots.semesterId, semesterId),
            eq(dayExceptionSlots.userId, userId),
          ),
        )
        .for("update")
        .limit(1);

      if (existing === undefined) {
        return null;
      }

      // Validate and merge the patch
      const { startTime, endTime, room, classType, subjectId } =
        parseCreateDayExceptionSlotInput({
          ...{
            exceptionId,
            semesterId,
            userId,
            subjectId: existing.subjectId,
            startTime: existing.startTime.slice(0, 5),
            endTime: existing.endTime.slice(0, 5),
            room: existing.room ?? undefined,
            classType: existing.classType,
          },
          ...(patch as Record<string, unknown>),
        });

      // Check for overlaps with other slots in the same exception
      await assertNoOverlap(tx, exceptionId, startTime, endTime, slotId);

      // Validate subject if changed
      if (subjectId !== existing.subjectId) {
        await assertSubjectInSemester(tx, userId, semesterId, subjectId);
      }

      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (subjectId !== existing.subjectId) updateData.subjectId = subjectId;
      if (startTime !== existing.startTime.slice(0, 5))
        updateData.startTime = startTime;
      if (endTime !== existing.endTime.slice(0, 5))
        updateData.endTime = endTime;
      if (room !== (existing.room ?? undefined))
        updateData.room = room?.trim() ?? null;
      if (classType !== existing.classType) updateData.classType = classType;

      // Nothing to change
      if (Object.keys(updateData).length === 1) {
        return toDayExceptionSlot(existing);
      }

      const [row] = await tx
        .update(dayExceptionSlots)
        .set(updateData)
        .where(
          and(
            eq(dayExceptionSlots.id, slotId),
            eq(dayExceptionSlots.exceptionId, exceptionId),
            eq(dayExceptionSlots.semesterId, semesterId),
            eq(dayExceptionSlots.userId, userId),
          ),
        )
        .returning();

      return row === undefined ? null : toDayExceptionSlot(row);
    });
  } catch (error) {
    throw mapSlotWriteError(error);
  }
}

/**
 * Deletes a slot belonging to a specific exception and owner scope.
 */
export async function deleteDayExceptionSlot(
  db: Database,
  userId: string,
  exceptionId: string,
  semesterId: string,
  slotId: string,
): Promise<boolean> {
  if (
    !semesterIdSchema.safeParse(exceptionId).success ||
    !semesterIdSchema.safeParse(slotId).success
  ) {
    return false;
  }

  // Verify the parent exception belongs to the user
  const [parent] = await db
    .select({ id: dayExceptions.id })
    .from(dayExceptions)
    .where(
      and(
        eq(dayExceptions.id, exceptionId),
        eq(dayExceptions.semesterId, semesterId),
        eq(dayExceptions.userId, userId),
      ),
    )
    .limit(1);

  if (parent === undefined) {
    return false;
  }

  // A slot that dated history points at cannot be hard-deleted (D035).
  const [referenced] = await db
    .select({ id: classOccurrences.id })
    .from(classOccurrences)
    .where(eq(classOccurrences.sourceExceptionSlotId, slotId))
    .limit(1);

  if (referenced !== undefined) {
    throw new DayExceptionSlotConflictError(slotId);
  }

  const deleted = await db
    .delete(dayExceptionSlots)
    .where(
      and(
        eq(dayExceptionSlots.id, slotId),
        eq(dayExceptionSlots.exceptionId, exceptionId),
        eq(dayExceptionSlots.semesterId, semesterId),
        eq(dayExceptionSlots.userId, userId),
      ),
    )
    .returning({ id: dayExceptionSlots.id });

  return deleted.length > 0;
}

// Re-export types and validation from domain
export {
  DayExceptionSlotConflictError,
  DayExceptionSlotHolidayConflictError,
  DayExceptionSlotOverlapError,
  DayExceptionSlotOwnershipError,
  DayExceptionSlotValidationError,
  type DayExceptionSlotFieldIssue,
  validateCreateDayExceptionSlot,
} from "../domain/day-exception-repository.js";
