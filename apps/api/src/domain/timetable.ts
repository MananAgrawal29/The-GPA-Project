import {
  createTimetableSlotInputSchema,
  timetableSlotInvariantIssues,
  timetableSlotPatchSchema,
  timetableSlotSemesterIssues,
  type SemesterDateWindow,
  type TimetableSlotCreateInput,
  type TimetableSlotFields,
  type TimetableSlotPatch,
} from "@gpa/shared";

/** One rejected field, reported alongside the error. */
export interface TimetableSlotFieldIssue {
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
export class TimetableSlotOwnershipError extends Error {
  constructor() {
    super(
      "That semester or subject does not exist, or it belongs to someone else.",
    );
    this.name = "TimetableSlotOwnershipError";
  }
}

/** Two slots would cover the same weekday and time in one semester. */
export class TimetableSlotOverlapError extends Error {
  /** The slot that already covers the time, when the repository saw it. */
  readonly conflictingSlotId: string | null;

  constructor(conflictingSlotId: string | null) {
    super(
      "Another slot already covers that weekday and time in this semester.",
    );
    this.name = "TimetableSlotOverlapError";
    this.conflictingSlotId = conflictingSlotId;
  }
}

export class TimetableSlotValidationError extends Error {
  readonly issues: readonly TimetableSlotFieldIssue[];

  constructor(issues: readonly TimetableSlotFieldIssue[]) {
    super(
      issues.length > 0
        ? issues.map((issue) => issue.message).join(" ")
        : "Invalid timetable slot details.",
    );
    this.name = "TimetableSlotValidationError";
    this.issues = issues;
  }
}

function toValidationError(error: {
  issues: readonly { path: readonly PropertyKey[]; message: string }[];
}): TimetableSlotValidationError {
  return new TimetableSlotValidationError(
    error.issues.map((issue) => ({
      // A field-level issue starts with the field it belongs to.
      path: String(issue.path[0] ?? "slot"),
      message: issue.message,
    })),
  );
}

/** Validates a create payload at the server boundary. */
export function parseCreateTimetableSlotInput(
  input: unknown,
): TimetableSlotCreateInput {
  const result = createTimetableSlotInputSchema.safeParse(input);

  if (!result.success) {
    throw toValidationError(result.error);
  }

  return result.data;
}

/** Validates the shape of an edit payload. Cross-field rules run after merge. */
export function parseTimetableSlotPatch(input: unknown): TimetableSlotPatch {
  const result = timetableSlotPatchSchema.safeParse(input);

  if (!result.success) {
    throw toValidationError(result.error);
  }

  return result.data;
}

/**
 * Applies a validated patch to the stored fields.
 *
 * `null` clears the room or an active date and must not fall back to the
 * stored value, so the check is against `undefined` rather than a nullish
 * coalesce. This matches the semester read-merge-write rule.
 */
export function mergeTimetableSlotFields(
  current: TimetableSlotFields,
  patch: TimetableSlotPatch,
): TimetableSlotFields {
  return {
    subjectId: patch.subjectId ?? current.subjectId,
    dayOfWeek: patch.dayOfWeek ?? current.dayOfWeek,
    startTime: patch.startTime ?? current.startTime,
    endTime: patch.endTime ?? current.endTime,
    room: patch.room === undefined ? current.room : patch.room,
    classType: patch.classType ?? current.classType,
    activeFrom:
      patch.activeFrom === undefined ? current.activeFrom : patch.activeFrom,
    activeTo: patch.activeTo === undefined ? current.activeTo : patch.activeTo,
  };
}

/** Throws unless the complete record satisfies every cross-field rule. */
export function assertTimetableSlotInvariants(
  fields: TimetableSlotFields,
): void {
  const issues = timetableSlotInvariantIssues(fields);

  if (issues.length > 0) {
    throw new TimetableSlotValidationError(issues);
  }
}

/** Throws unless any explicit active range fits inside the semester. */
export function assertSlotFitsSemester(
  fields: TimetableSlotFields,
  semester: SemesterDateWindow,
): void {
  const issues = timetableSlotSemesterIssues(fields, semester);

  if (issues.length > 0) {
    throw new TimetableSlotValidationError(issues);
  }
}
