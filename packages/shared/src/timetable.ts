import { z } from "zod";

/**
 * The kind of class a recurring timetable slot represents.
 *
 * Kept deliberately small: every value has to be one the timetable editor
 * (P13) can label and the attendance screens (P17) can explain.
 */
export const CLASS_TYPES = [
  "lecture",
  "practical",
  "tutorial",
  "other",
] as const;

export type ClassType = (typeof CLASS_TYPES)[number];

export const classTypeSchema = z.enum(CLASS_TYPES);

/**
 * A wall-clock time on a 24-hour clock, with no date and no time zone.
 *
 * Zero-padded `HH:MM` is the transport format (D034) and also sorts
 * lexicographically exactly as it does as a time, so the shared
 * cross-field rules can compare two values as strings.
 */
const wallClockTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a 24-hour time such as 09:00.");

/**
 * ISO weekday numbering: Monday is 1 and Sunday is 7, the numbering
 * PostgreSQL's `isodow` field uses. A database `CHECK` repeats the range.
 */
const dayOfWeekSchema = z
  .number()
  .int("Day of week must be a whole number.")
  .min(1, "Day of week must be between 1 (Monday) and 7 (Sunday).")
  .max(7, "Day of week must be between 1 (Monday) and 7 (Sunday).");

/** A calendar date (D024), never an instant. */
const calendarDateSchema = z.iso.date();

const roomSchema = z
  .string()
  .trim()
  .min(1, "Room must not be blank.")
  .max(80, "Room must be 80 characters or fewer.");

/**
 * The fields a user sets on a recurring weekly slot.
 *
 * A slot is a rule: it carries a weekday, not a date, and never whether a
 * class actually happened (D030). The subject is required, because a slot
 * with no subject cannot be labelled or counted for attendance.
 */
export const timetableSlotFieldsSchema = z.object({
  subjectId: z.uuid(),
  dayOfWeek: dayOfWeekSchema,
  startTime: wallClockTimeSchema,
  endTime: wallClockTimeSchema,
  room: roomSchema.nullable().default(null),
  classType: classTypeSchema.default("lecture"),
  activeFrom: calendarDateSchema.nullable().default(null),
  activeTo: calendarDateSchema.nullable().default(null),
});

export type TimetableSlotFields = z.infer<typeof timetableSlotFieldsSchema>;

/** One invariant violation, addressable to the field that caused it. */
export interface TimetableSlotInvariantIssue {
  readonly path: "endTime" | "activeFrom" | "activeTo";
  readonly message: string;
}

/**
 * Rules that span more than one field.
 *
 * Kept as a plain function so the API, the repository after merging a
 * patch, and later the browser editor apply exactly the same rules. The
 * database repeats the time order as a `CHECK` constraint, so a slot
 * cannot reach these states through any path.
 */
export function timetableSlotInvariantIssues(
  fields: Pick<
    TimetableSlotFields,
    "startTime" | "endTime" | "activeFrom" | "activeTo"
  >,
): TimetableSlotInvariantIssue[] {
  const issues: TimetableSlotInvariantIssue[] = [];

  if (fields.endTime <= fields.startTime) {
    issues.push({
      path: "endTime",
      message:
        "End time must be after the start time. Classes may not cross midnight.",
    });
  }

  if (
    fields.activeFrom !== null &&
    fields.activeTo !== null &&
    fields.activeTo < fields.activeFrom
  ) {
    issues.push({
      path: "activeTo",
      message: "Active-to date must be on or after the active-from date.",
    });
  }

  return issues;
}

/** The semester dates an active range has to sit inside. */
export interface SemesterDateWindow {
  readonly startDate: string | null;
  readonly endDate: string | null;
}

/**
 * Rules that need the owning semester's dates.
 *
 * A slot may cover the whole semester without either date, but an explicit
 * active range has to be inside the term (D031). A semester without dates
 * cannot bound a range, so giving one is refused rather than silently
 * clamped.
 */
export function timetableSlotSemesterIssues(
  fields: Pick<TimetableSlotFields, "activeFrom" | "activeTo">,
  semester: SemesterDateWindow,
): TimetableSlotInvariantIssue[] {
  const issues: TimetableSlotInvariantIssue[] = [];

  if (fields.activeFrom !== null) {
    if (semester.startDate === null) {
      issues.push({
        path: "activeFrom",
        message:
          "Set the semester start date before giving a slot an active-from date.",
      });
    } else if (fields.activeFrom < semester.startDate) {
      issues.push({
        path: "activeFrom",
        message: "Active-from date cannot be before the semester start date.",
      });
    }
  }

  if (fields.activeTo !== null) {
    if (semester.endDate === null) {
      issues.push({
        path: "activeTo",
        message:
          "Set the semester end date before giving a slot an active-to date.",
      });
    } else if (fields.activeTo > semester.endDate) {
      issues.push({
        path: "activeTo",
        message: "Active-to date cannot be after the semester end date.",
      });
    }
  }

  return issues;
}

function addInvariantIssues(
  fields: Pick<
    TimetableSlotFields,
    "startTime" | "endTime" | "activeFrom" | "activeTo"
  >,
  context: z.RefinementCtx,
): void {
  for (const issue of timetableSlotInvariantIssues(fields)) {
    context.addIssue({
      code: "custom",
      path: [issue.path],
      message: issue.message,
    });
  }
}

/** Payload accepted when creating a recurring slot. */
export const createTimetableSlotInputSchema =
  timetableSlotFieldsSchema.superRefine(addInvariantIssues);

export type TimetableSlotCreateInput = z.infer<
  typeof createTimetableSlotInputSchema
>;

/**
 * Payload accepted when editing a recurring slot.
 *
 * Written out rather than derived with `.partial()`: a partial schema still
 * applies each field's default, so an empty patch would reset the room and
 * active dates instead of changing nothing. Cross-field rules run after
 * the repository merges the patch with the stored row.
 */
export const timetableSlotPatchSchema = z.object({
  subjectId: z.uuid().optional(),
  dayOfWeek: dayOfWeekSchema.optional(),
  startTime: wallClockTimeSchema.optional(),
  endTime: wallClockTimeSchema.optional(),
  room: roomSchema.nullable().optional(),
  classType: classTypeSchema.optional(),
  activeFrom: calendarDateSchema.nullable().optional(),
  activeTo: calendarDateSchema.nullable().optional(),
});

export type TimetableSlotPatch = z.infer<typeof timetableSlotPatchSchema>;

/** Identifier format for a slot, validated before it reaches SQL. */
export const timetableSlotIdSchema = z.uuid();

/** A recurring slot as stored and returned by the API. */
export const timetableSlotSchema = timetableSlotFieldsSchema.extend({
  id: timetableSlotIdSchema,
  semesterId: z.uuid(),
  archivedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type TimetableSlot = z.infer<typeof timetableSlotSchema>;
