import {
  createDayExceptionInputSchema,
  createDayExceptionSlotInputSchema,
  dayExceptionPatchSchema,
} from "@gpa/shared";

/**
 * Maps Zod's issues onto the domain's field-issue shape.
 *
 * A root-level issue (an object was expected but a scalar arrived) has an
 * empty path; it is reported against `input`, matching how the other
 * domains describe a malformed body.
 */
function toFieldIssues(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): DayExceptionFieldIssue[] {
  return issues.map((issue) => ({
    path: String(issue.path[0] ?? "input"),
    message: issue.message,
  }));
}

/** One rejected field, reported alongside the error. */
export interface DayExceptionFieldIssue {
  readonly path: string;
  readonly message: string;
}

/** One rejected field, reported alongside the error. */
export interface DayExceptionSlotFieldIssue {
  readonly path: string;
  readonly message: string;
}

/**
 * The semester or subject does not exist, or it belongs to another owner.
 *
 * Raised by the repository both when a lookup fails and when the database
 * rejects a composite foreign key, so a direct caller cannot file a slot
 * under a term its owner does not own.
 */
export class DayExceptionOwnershipError extends Error {
  constructor() {
    super(
      "That semester or subject does not exist, or it belongs to someone else.",
    );
    this.name = "DayExceptionOwnershipError";
  }
}

export class DayExceptionSlotOwnershipError extends Error {
  constructor() {
    super(
      "That semester or subject does not exist, or it belongs to someone else.",
    );
    this.name = "DayExceptionSlotOwnershipError";
  }
}

/** Holiday exceptions cannot contain special schedule slots. */
export class DayExceptionSlotHolidayConflictError extends Error {
  constructor() {
    super(
      "A holiday exception cannot have class slots. This violates the invariant that holidays are class-free days.",
    );
    this.name = "DayExceptionSlotHolidayConflictError";
  }
}

/** Two slots would overlap on the same calendar date within one exception. */
export class DayExceptionSlotOverlapError extends Error {
  /** The slot that already covers the time, when the repository saw it. */
  readonly conflictingSlotId: string | null;

  constructor(conflictingSlotId: string | null) {
    super("Slots within the same date exception cannot overlap.");
    this.name = "DayExceptionSlotOverlapError";
    this.conflictingSlotId = conflictingSlotId;
  }
}

/**
 * A day exception could not be deleted because it has dependent special-schedule
 * slots. The exception must be cleared of slots first, or the slots moved.
 */
export class DayExceptionConflictError extends Error {
  readonly exceptionId: string;

  constructor(exceptionId: string) {
    super("Cannot delete exception with dependent slots.");
    this.name = "DayExceptionConflictError";
    this.exceptionId = exceptionId;
  }
}

/**
 * A special schedule that still owns class slots cannot become a holiday.
 *
 * A holiday is a class-free day, so the two states would contradict each
 * other. The slots must be deleted first; they are never cascaded away.
 */
export class DayExceptionKindConflictError extends Error {
  readonly exceptionId: string;

  constructor(exceptionId: string) {
    super(
      "Cannot change a special schedule with class slots into a holiday. Delete its slots first.",
    );
    this.name = "DayExceptionKindConflictError";
    this.exceptionId = exceptionId;
  }
}

/** Exception date must fall within semester's active range. */
export class DayExceptionDateBoundsError extends Error {
  constructor() {
    super("The exception date must fall within the semester's active range.");
    this.name = "DayExceptionDateBoundsError";
  }
}

export class DayExceptionSlotValidationError extends Error {
  readonly issues: readonly DayExceptionSlotFieldIssue[];

  constructor(issues: readonly DayExceptionSlotFieldIssue[]) {
    super(
      issues.length > 0
        ? issues.map((issue) => issue.message).join(" ")
        : "Invalid exception slot details.",
    );
    this.name = "DayExceptionSlotValidationError";
    this.issues = issues;
  }
}

export class DayExceptionValidationError extends Error {
  readonly issues: readonly DayExceptionFieldIssue[];

  constructor(issues: readonly DayExceptionFieldIssue[]) {
    super(
      issues.length > 0
        ? issues.map((issue) => issue.message).join(" ")
        : "Invalid exception details.",
    );
    this.name = "DayExceptionValidationError";
    this.issues = issues;
  }
}

/**
 * Validates a create payload at the server boundary.
 *
 * The shared contract owns the request shape, so a date that is not a real
 * calendar date (`2026-02-30`, `2026-08-32`, `20261110`, `not-a-date`) is
 * rejected here with a field issue instead of reaching PostgreSQL's `date`
 * column and surfacing as a 500.
 */
export function validateCreateDayException(input: unknown): void {
  const result = createDayExceptionInputSchema.safeParse(input);

  if (!result.success) {
    throw new DayExceptionValidationError(toFieldIssues(result.error.issues));
  }
}

/**
 * Validates a partial update at the server boundary.
 *
 * Runs before the repository's no-op short-circuit so an invalid patch can
 * never slip through as "nothing to change". Absent fields stay absent.
 */
export function validateDayExceptionPatch(input: unknown): void {
  const result = dayExceptionPatchSchema.safeParse(input);

  if (!result.success) {
    throw new DayExceptionValidationError(toFieldIssues(result.error.issues));
  }
}

/**
 * Refuses a slot whose end is not strictly after its start.
 *
 * Formats are canonical by now (the shared schema enforces zero-padded
 * `HH:MM`), so this is a real time comparison rather than the accidental
 * lexicographic one the hand-written validator used.
 */
function assertSlotTimeOrder(startTime: string, endTime: string): void {
  if (endTime <= startTime) {
    throw new DayExceptionSlotValidationError([
      { path: "endTime", message: "End time must be after start time." },
    ]);
  }
}

/**
 * Validates a slot create payload at the server boundary.
 *
 * The shared contract owns the shape, so times such as `25:00`, `09:60`,
 * `9am`, and `0900` are rejected instead of being handed to a `time`
 * column (where `0900` used to be silently normalized to `09:00`).
 */
export function validateCreateDayExceptionSlot(input: unknown): void {
  const result = createDayExceptionSlotInputSchema.safeParse(input);

  if (!result.success) {
    throw new DayExceptionSlotValidationError(
      toFieldIssues(result.error.issues),
    );
  }

  assertSlotTimeOrder(result.data.startTime, result.data.endTime);
}

/**
 * Parses and validates a slot create payload, returning the validated data.
 *
 * Update paths merge a patch over the stored fields and call this, so a
 * partial edit is validated as the complete record it will become.
 */
export function parseCreateDayExceptionSlotInput(input: unknown) {
  const result = createDayExceptionSlotInputSchema.safeParse(input);

  if (!result.success) {
    throw new DayExceptionSlotValidationError(
      toFieldIssues(result.error.issues),
    );
  }

  assertSlotTimeOrder(result.data.startTime, result.data.endTime);

  return {
    exceptionId: result.data.exceptionId,
    subjectId: result.data.subjectId,
    startTime: result.data.startTime,
    endTime: result.data.endTime,
    room: result.data.room,
    classType: result.data.classType,
  };
}
