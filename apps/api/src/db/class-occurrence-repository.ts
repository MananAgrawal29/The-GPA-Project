import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import type { Database } from "./client.js";
import {
  classOccurrences,
  dayExceptionSlots,
  dayExceptions,
  semesters,
  timetableSlots,
  type ClassOccurrenceRow,
} from "./schema.js";
import {
  ClassOccurrenceOwnershipError,
  ClassOccurrenceValidationError,
} from "../domain/class-occurrence-repository.js";

function toWallClock(value: string): string {
  return value.slice(0, 5);
}

function toOccurrence(row: ClassOccurrenceRow) {
  return {
    id: row.id,
    semesterId: row.semesterId,
    userId: row.userId,
    subjectId: row.subjectId,
    sourceSlotId: row.sourceSlotId,
    sourceExceptionSlotId: row.sourceExceptionSlotId,
    date: row.date,
    startTime: toWallClock(row.startTime),
    endTime: toWallClock(row.endTime),
    room: row.room ?? undefined,
    classType: row.classType,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type ClassOccurrence = ReturnType<typeof toOccurrence>;

function canNameSemester(semesterId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    semesterId,
  );
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parts = value.split("-").map(Number);
  const year = parts[0]!;
  const month = parts[1]!;
  const day = parts[2]!;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
  );
}

function parseRangeInput(
  fromOrOptions: unknown,
  to: unknown,
): { fromDate?: string; toDate?: string } {
  if (fromOrOptions === undefined) {
    return {};
  }

  if (typeof fromOrOptions === "string") {
    const result: { fromDate?: string; toDate?: string } = {
      fromDate: fromOrOptions,
    };
    if (typeof to === "string") {
      result.toDate = to;
    }
    return result;
  }

  if (fromOrOptions !== null && typeof fromOrOptions === "object") {
    const source = fromOrOptions as Record<string, unknown>;
    const result: { fromDate?: string; toDate?: string } = {};
    const fromCandidate =
      source.fromDate ?? source.startDate ?? source.from ?? source.start;
    const toCandidate =
      source.toDate ?? source.endDate ?? source.to ?? source.end;

    if (typeof fromCandidate === "string") result.fromDate = fromCandidate;
    if (typeof toCandidate === "string") result.toDate = toCandidate;
    return result;
  }

  throw new ClassOccurrenceValidationError([
    { path: "range", message: "Generation range must be a date or an object." },
  ]);
}

function isoWeekday(date: string): number {
  const parts = date.split("-").map(Number);
  const year = parts[0]!;
  const month = parts[1]!;
  const day = parts[2]!;
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

function addDays(date: string, days: number): string {
  const parts = date.split("-").map(Number);
  const year = parts[0]!;
  const month = parts[1]!;
  const day = parts[2]!;
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

function slotActiveOnDate(
  slot: { activeFrom: string | null; activeTo: string | null },
  date: string,
): boolean {
  if (slot.activeFrom !== null && date < slot.activeFrom) return false;
  if (slot.activeTo !== null && date > slot.activeTo) return false;
  return true;
}

export async function generateClassOccurrences(
  db: Database,
  userId: string,
  semesterId: string,
  fromOrOptions?: unknown,
  to?: unknown,
): Promise<ClassOccurrence[]> {
  if (!canNameSemester(semesterId)) {
    throw new ClassOccurrenceOwnershipError();
  }

  const parsedRangeInput = parseRangeInput(fromOrOptions, to);

  if (parsedRangeInput.fromDate !== undefined) {
    if (!isValidIsoDate(parsedRangeInput.fromDate)) {
      throw new ClassOccurrenceValidationError([
        {
          path: "fromDate",
          message: "Use a calendar date such as 2026-07-01.",
        },
      ]);
    }
  }

  if (parsedRangeInput.toDate !== undefined) {
    if (!isValidIsoDate(parsedRangeInput.toDate)) {
      throw new ClassOccurrenceValidationError([
        { path: "toDate", message: "Use a calendar date such as 2026-07-01." },
      ]);
    }
  }

  if (
    parsedRangeInput.fromDate !== undefined &&
    parsedRangeInput.toDate !== undefined &&
    parsedRangeInput.fromDate > parsedRangeInput.toDate
  ) {
    throw new ClassOccurrenceValidationError([
      {
        path: "toDate",
        message: "The from date must be on or before the to date.",
      },
    ]);
  }

  return db.transaction(async (tx) => {
    const [semester] = await tx
      .select({
        startDate: semesters.startDate,
        endDate: semesters.endDate,
      })
      .from(semesters)
      .where(and(eq(semesters.id, semesterId), eq(semesters.userId, userId)))
      .for("update")
      .limit(1);

    if (semester === undefined) {
      throw new ClassOccurrenceOwnershipError();
    }

    if (semester.startDate === null || semester.endDate === null) {
      throw new ClassOccurrenceValidationError([
        {
          path: "semester",
          message:
            "Set the semester start and end dates before generating classes.",
        },
      ]);
    }

    const semesterStart = semester.startDate;
    const semesterEnd = semester.endDate;

    let fromDate = parsedRangeInput.fromDate ?? semesterStart;
    let toDate = parsedRangeInput.toDate ?? semesterEnd;

    if (fromDate < semesterStart) fromDate = semesterStart;
    if (toDate > semesterEnd) toDate = semesterEnd;

    if (fromDate > toDate) {
      return [];
    }

    const slots = await tx
      .select()
      .from(timetableSlots)
      .where(
        and(
          eq(timetableSlots.semesterId, semesterId),
          eq(timetableSlots.userId, userId),
          isNull(timetableSlots.archivedAt),
        ),
      );

    const exceptions = await tx
      .select()
      .from(dayExceptions)
      .where(
        and(
          eq(dayExceptions.semesterId, semesterId),
          eq(dayExceptions.userId, userId),
          gte(dayExceptions.date, fromDate),
          lte(dayExceptions.date, toDate),
        ),
      );

    const exceptionByDate = new Map(exceptions.map((row) => [row.date, row]));

    const specialExceptionIds = exceptions
      .filter((row) => row.kind === "special_schedule")
      .map((row) => row.id);

    const exceptionSlots =
      specialExceptionIds.length === 0
        ? []
        : await tx
            .select()
            .from(dayExceptionSlots)
            .where(
              and(
                eq(dayExceptionSlots.semesterId, semesterId),
                eq(dayExceptionSlots.userId, userId),
                inArray(dayExceptionSlots.exceptionId, specialExceptionIds),
              ),
            );

    const exceptionSlotsByException = new Map<string, typeof exceptionSlots>();
    for (const slot of exceptionSlots) {
      const existing = exceptionSlotsByException.get(slot.exceptionId) ?? [];
      existing.push(slot);
      exceptionSlotsByException.set(slot.exceptionId, existing);
    }

    for (let date = fromDate; date <= toDate; date = addDays(date, 1)) {
      const exception = exceptionByDate.get(date);

      type Candidate = {
        sourceSlotId: string | null;
        sourceExceptionSlotId: string | null;
        subjectId: string;
        startTime: string;
        endTime: string;
        room: string | null;
        classType: string;
      };

      const candidates: Candidate[] = [];

      if (exception?.kind === "holiday") {
        // A holiday produces no scheduled classes.
      } else if (exception?.kind === "special_schedule") {
        for (const slot of exceptionSlotsByException.get(exception.id) ?? []) {
          candidates.push({
            sourceSlotId: null,
            sourceExceptionSlotId: slot.id,
            subjectId: slot.subjectId,
            startTime: toWallClock(slot.startTime),
            endTime: toWallClock(slot.endTime),
            room: slot.room,
            classType: slot.classType,
          });
        }
      } else {
        const weekday = isoWeekday(date);
        for (const slot of slots) {
          if (slot.dayOfWeek !== weekday) continue;
          if (!slotActiveOnDate(slot, date)) continue;

          candidates.push({
            sourceSlotId: slot.id,
            sourceExceptionSlotId: null,
            subjectId: slot.subjectId,
            startTime: toWallClock(slot.startTime),
            endTime: toWallClock(slot.endTime),
            room: slot.room,
            classType: slot.classType,
          });
        }
      }

      for (const candidate of candidates) {
        await tx
          .insert(classOccurrences)
          .values({
            semesterId,
            userId,
            subjectId: candidate.subjectId,
            sourceSlotId: candidate.sourceSlotId,
            sourceExceptionSlotId: candidate.sourceExceptionSlotId,
            date,
            startTime: candidate.startTime,
            endTime: candidate.endTime,
            room: candidate.room,
            classType: candidate.classType,
            status: "scheduled",
          } as never)
          .onConflictDoNothing();
      }
    }

    const rows = await tx
      .select()
      .from(classOccurrences)
      .where(
        and(
          eq(classOccurrences.semesterId, semesterId),
          eq(classOccurrences.userId, userId),
          gte(classOccurrences.date, fromDate),
          lte(classOccurrences.date, toDate),
        ),
      )
      .orderBy(classOccurrences.date, classOccurrences.startTime);

    return rows.map(toOccurrence);
  });
}

export async function listClassOccurrences(
  db: Database,
  userId: string,
  semesterId: string,
  fromOrOptions?: unknown,
  to?: unknown,
): Promise<ClassOccurrence[]> {
  if (!canNameSemester(semesterId)) {
    return [];
  }

  const parsedRangeInput = parseRangeInput(fromOrOptions, to);

  if (
    parsedRangeInput.fromDate !== undefined &&
    !isValidIsoDate(parsedRangeInput.fromDate)
  ) {
    throw new ClassOccurrenceValidationError([
      { path: "fromDate", message: "Use a calendar date such as 2026-07-01." },
    ]);
  }

  if (
    parsedRangeInput.toDate !== undefined &&
    !isValidIsoDate(parsedRangeInput.toDate)
  ) {
    throw new ClassOccurrenceValidationError([
      { path: "toDate", message: "Use a calendar date such as 2026-07-01." },
    ]);
  }

  const conditions = [
    eq(classOccurrences.semesterId, semesterId),
    eq(classOccurrences.userId, userId),
  ];

  if (parsedRangeInput.fromDate !== undefined) {
    conditions.push(gte(classOccurrences.date, parsedRangeInput.fromDate));
  }

  if (parsedRangeInput.toDate !== undefined) {
    conditions.push(lte(classOccurrences.date, parsedRangeInput.toDate));
  }

  const rows = await db
    .select()
    .from(classOccurrences)
    .where(and(...conditions))
    .orderBy(classOccurrences.date, classOccurrences.startTime);

  return rows.map(toOccurrence);
}

export async function getClassOccurrence(
  db: Database,
  userId: string,
  semesterId: string,
  occurrenceId: string,
): Promise<ClassOccurrence | null> {
  if (!canNameSemester(semesterId)) return null;

  const [row] = await db
    .select()
    .from(classOccurrences)
    .where(
      and(
        eq(classOccurrences.id, occurrenceId),
        eq(classOccurrences.semesterId, semesterId),
        eq(classOccurrences.userId, userId),
      ),
    )
    .limit(1);

  return row === undefined ? null : toOccurrence(row);
}

// Compatibility aliases for callers/tests that use a different name.
export const generateOccurrences = generateClassOccurrences;
export const generateScheduledClasses = generateClassOccurrences;
export const resolveClassOccurrences = generateClassOccurrences;
export const listOccurrences = listClassOccurrences;
export const getOccurrence = getClassOccurrence;
