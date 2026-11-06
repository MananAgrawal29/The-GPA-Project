import { and, eq, gt, isNull, lt, ne } from "drizzle-orm";
import {
  semesterIdSchema,
  timetableSlotIdSchema,
  type SemesterDateWindow,
  type TimetableSlot,
  type TimetableSlotFields,
} from "@gpa/shared";
import type { Database } from "./client.js";
import {
  FOREIGN_KEY_VIOLATION,
  UNIQUE_VIOLATION,
  isConstraintViolation,
} from "./errors.js";
import {
  TimetableSlotOwnershipError,
  TimetableSlotOverlapError,
  TimetableSlotValidationError,
  assertSlotFitsSemester,
  assertTimetableSlotInvariants,
  mergeTimetableSlotFields,
  parseCreateTimetableSlotInput,
  parseTimetableSlotPatch,
} from "../domain/timetable.js";
import {
  semesters,
  subjects,
  timetableSlots,
  type TimetableSlotRow,
} from "./schema.js";

const SEMESTER_OWNER_CONSTRAINT = "timetable_slots_semester_owner_fk";
const SUBJECT_OWNER_CONSTRAINT = "timetable_slots_subject_owner_fk";
const EXACT_DUPLICATE_CONSTRAINT = "timetable_slots_exact_duplicate";

/**
 * Recurring timetable slot data access.
 *
 * Every query filters by `userId` and `semesterId` in SQL, so another
 * user's term is reported as absent rather than read or modified. Writes
 * take a row lock on the owning semester before checking for overlaps, so
 * two concurrent inserts cannot both pass the same check (D031).
 *
 * P12 persists rules only. Dated occurrences arrive in P15, which is also
 * when a slot referenced by history must be archived instead of deleted
 * (D035); nothing here cascades.
 */

/**
 * Keeps a `time` value as the `HH:MM` string the contract transports.
 *
 * PostgreSQL returns `HH:MM:SS`, while the shared schema and the browser
 * speak `HH:MM` (D034). Nothing is parsed into a `Date`.
 */
function toWallClock(value: string): string {
  return value.slice(0, 5);
}

function toFields(row: TimetableSlotRow): TimetableSlotFields {
  return {
    subjectId: row.subjectId,
    dayOfWeek: row.dayOfWeek,
    startTime: toWallClock(row.startTime),
    endTime: toWallClock(row.endTime),
    room: row.room,
    classType: row.classType,
    activeFrom: row.activeFrom,
    activeTo: row.activeTo,
  };
}

function toTimetableSlot(row: TimetableSlotRow): TimetableSlot {
  return {
    id: row.id,
    semesterId: row.semesterId,
    ...toFields(row),
    archivedAt: row.archivedAt === null ? null : row.archivedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * True when the identifiers can name a slot at all.
 *
 * A malformed UUID would otherwise reach PostgreSQL and raise a syntax
 * error; treating it as absent keeps the data layer's "foreign rows read
 * as absent" behavior consistent for unparsable ids too.
 */
function canNameTimetableSlot(semesterId: string, slotId: string): boolean {
  return (
    semesterIdSchema.safeParse(semesterId).success &&
    timetableSlotIdSchema.safeParse(slotId).success
  );
}

/** Locks and returns the semester window, or null when it is not the caller's. */
async function lockOwnedSemester(
  db: Database,
  userId: string,
  semesterId: string,
): Promise<SemesterDateWindow | null> {
  const [row] = await db
    .select({
      startDate: semesters.startDate,
      endDate: semesters.endDate,
    })
    .from(semesters)
    .where(and(eq(semesters.id, semesterId), eq(semesters.userId, userId)))
    .for("update");

  return row ?? null;
}

/** Refuses a subject that is not part of this exact semester and owner. */
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
    throw new TimetableSlotOwnershipError();
  }
}

/**
 * Refuses a slot that covers time already covered on the same weekday.
 *
 * Half-open ranges are used: `[start, end)`. A slot ending at 10:00 and one
 * starting at 10:00 are adjacent, not overlapping. Archived slots are
 * ignored because they are history, not part of the live timetable (D035).
 */
async function assertNoOverlap(
  db: Database,
  semesterId: string,
  fields: TimetableSlotFields,
  excludedSlotId: string | null,
): Promise<void> {
  const conditions = [
    eq(timetableSlots.semesterId, semesterId),
    eq(timetableSlots.dayOfWeek, fields.dayOfWeek),
    isNull(timetableSlots.archivedAt),
    lt(timetableSlots.startTime, fields.endTime),
    gt(timetableSlots.endTime, fields.startTime),
  ];

  if (excludedSlotId !== null) {
    conditions.push(ne(timetableSlots.id, excludedSlotId));
  }

  const [conflict] = await db
    .select({ id: timetableSlots.id })
    .from(timetableSlots)
    .where(and(...conditions))
    .limit(1);

  if (conflict !== undefined) {
    throw new TimetableSlotOverlapError(conflict.id);
  }
}

/**
 * Maps a constraint rejection to the error the API will turn into a
 * response. Known domain errors pass through unchanged.
 */
function mapSlotWriteError(error: unknown): Error {
  if (
    error instanceof TimetableSlotValidationError ||
    error instanceof TimetableSlotOwnershipError ||
    error instanceof TimetableSlotOverlapError
  ) {
    return error;
  }

  if (
    isConstraintViolation(error, UNIQUE_VIOLATION, EXACT_DUPLICATE_CONSTRAINT)
  ) {
    return new TimetableSlotOverlapError(null);
  }

  if (
    isConstraintViolation(
      error,
      FOREIGN_KEY_VIOLATION,
      SEMESTER_OWNER_CONSTRAINT,
    ) ||
    isConstraintViolation(
      error,
      FOREIGN_KEY_VIOLATION,
      SUBJECT_OWNER_CONSTRAINT,
    )
  ) {
    return new TimetableSlotOwnershipError();
  }

  return error instanceof Error ? error : new Error("Database write failed");
}

/** Creates a recurring slot inside the caller's own semester. */
export async function createTimetableSlot(
  db: Database,
  userId: string,
  semesterId: string,
  input: unknown,
): Promise<TimetableSlot> {
  const fields = parseCreateTimetableSlotInput(input);

  if (!semesterIdSchema.safeParse(semesterId).success) {
    throw new TimetableSlotOwnershipError();
  }

  try {
    return await db.transaction(async (tx) => {
      // The lock is what makes the overlap check meaningful: a competing
      // write for the same semester waits here instead of racing the read.
      const semester = await lockOwnedSemester(tx, userId, semesterId);

      if (semester === null) {
        throw new TimetableSlotOwnershipError();
      }

      assertSlotFitsSemester(fields, semester);
      await assertSubjectInSemester(tx, userId, semesterId, fields.subjectId);
      await assertNoOverlap(tx, semesterId, fields, null);

      const [row] = await tx
        .insert(timetableSlots)
        .values({ userId, semesterId, ...fields })
        .returning();

      if (row === undefined) {
        throw new Error("Timetable slot insert returned no row");
      }

      return toTimetableSlot(row);
    });
  } catch (error) {
    throw mapSlotWriteError(error);
  }
}

/** Lists the live weekly slots of one semester, by weekday then start time. */
export async function listTimetableSlots(
  db: Database,
  userId: string,
  semesterId: string,
): Promise<TimetableSlot[]> {
  if (!semesterIdSchema.safeParse(semesterId).success) {
    return [];
  }

  const rows = await db
    .select()
    .from(timetableSlots)
    .where(
      and(
        eq(timetableSlots.semesterId, semesterId),
        eq(timetableSlots.userId, userId),
        isNull(timetableSlots.archivedAt),
      ),
    )
    .orderBy(timetableSlots.dayOfWeek, timetableSlots.startTime);

  return rows.map(toTimetableSlot);
}

/**
 * Returns one slot, archived or not.
 *
 * The editor lists live slots, but reading a single id still resolves an
 * archived row so later milestones can show what a dated occurrence came
 * from without a second table.
 */
export async function getTimetableSlot(
  db: Database,
  userId: string,
  semesterId: string,
  slotId: string,
): Promise<TimetableSlot | null> {
  if (!canNameTimetableSlot(semesterId, slotId)) {
    return null;
  }

  const [row] = await db
    .select()
    .from(timetableSlots)
    .where(
      and(
        eq(timetableSlots.id, slotId),
        eq(timetableSlots.semesterId, semesterId),
        eq(timetableSlots.userId, userId),
      ),
    )
    .limit(1);

  return row === undefined ? null : toTimetableSlot(row);
}

/**
 * Applies a partial edit.
 *
 * The stored row is read under the same semester lock as creation, merged,
 * re-validated, and checked against every other live slot. A slot owned by
 * someone else, or filed under another semester, is treated as absent and
 * is never modified.
 */
export async function updateTimetableSlot(
  db: Database,
  userId: string,
  semesterId: string,
  slotId: string,
  patch: unknown,
): Promise<TimetableSlot | null> {
  if (!canNameTimetableSlot(semesterId, slotId)) {
    return null;
  }

  const parsed = parseTimetableSlotPatch(patch);

  try {
    return await db.transaction(async (tx) => {
      const semester = await lockOwnedSemester(tx, userId, semesterId);

      if (semester === null) {
        return null;
      }

      // Lock order is always semester then slot, so two edits cannot
      // deadlock each other half-way through.
      const [existing] = await tx
        .select()
        .from(timetableSlots)
        .where(
          and(
            eq(timetableSlots.id, slotId),
            eq(timetableSlots.semesterId, semesterId),
            eq(timetableSlots.userId, userId),
          ),
        )
        .for("update");

      if (existing === undefined) {
        return null;
      }

      const merged = mergeTimetableSlotFields(toFields(existing), parsed);
      assertTimetableSlotInvariants(merged);
      assertSlotFitsSemester(merged, semester);
      await assertSubjectInSemester(tx, userId, semesterId, merged.subjectId);
      await assertNoOverlap(tx, semesterId, merged, existing.id);

      // Nothing to change: report the stored record without touching
      // `updatedAt`, the same behavior the semester repository has.
      if (Object.keys(parsed).length === 0) {
        return toTimetableSlot(existing);
      }

      const [row] = await tx
        .update(timetableSlots)
        .set({ ...merged, updatedAt: new Date() })
        .where(
          and(
            eq(timetableSlots.id, slotId),
            eq(timetableSlots.semesterId, semesterId),
            eq(timetableSlots.userId, userId),
          ),
        )
        .returning();

      return row === undefined ? null : toTimetableSlot(row);
    });
  } catch (error) {
    throw mapSlotWriteError(error);
  }
}

/**
 * Deletes a slot that has no dated history.
 *
 * P12 has no occurrences, so every slot is still unreferenced. P15 adds
 * the occurrence table; from then on "remove" has to archive a slot that
 * history points at rather than delete it (D035).
 */
export async function deleteTimetableSlot(
  db: Database,
  userId: string,
  semesterId: string,
  slotId: string,
): Promise<boolean> {
  if (!canNameTimetableSlot(semesterId, slotId)) {
    return false;
  }

  const deleted = await db
    .delete(timetableSlots)
    .where(
      and(
        eq(timetableSlots.id, slotId),
        eq(timetableSlots.semesterId, semesterId),
        eq(timetableSlots.userId, userId),
      ),
    )
    .returning({ id: timetableSlots.id });

  return deleted.length > 0;
}
