import { z } from "zod";

/**
 * Semester lifecycle.
 *
 * `setup` is a draft that can be created before the term dates are known.
 * `active` is the current context (at most one per user, enforced by the
 * database as a partial unique index). `completed` and `archived` keep a
 * finished term readable, which is how semester history survives.
 */
export const SEMESTER_STATUSES = [
  "setup",
  "active",
  "completed",
  "archived",
] as const;

export type SemesterStatus = (typeof SEMESTER_STATUSES)[number];

export const semesterStatusSchema = z.enum(SEMESTER_STATUSES);

/**
 * A calendar date, not an instant.
 *
 * Dates are stored and compared as `YYYY-MM-DD` with no time zone, so a
 * semester boundary cannot drift by a day depending on where the server
 * or the browser is. `z.iso.date()` also rejects impossible calendar
 * dates such as `2026-02-30`.
 */
const calendarDateSchema = z.iso.date();

const nameSchema = z
  .string()
  .trim()
  .min(1, "Name is required.")
  .max(80, "Name must be 80 characters or fewer.");

const academicYearSchema = z
  .string()
  .trim()
  .min(1, "Academic year is required.")
  .max(20, "Academic year must be 20 characters or fewer.");

const nullableCalendarDateSchema = calendarDateSchema.nullable();

/** Fields a user can set on a semester. */
export const semesterFieldsSchema = z.object({
  name: nameSchema,
  academicYear: academicYearSchema,
  startDate: nullableCalendarDateSchema.default(null),
  endDate: nullableCalendarDateSchema.default(null),
  status: semesterStatusSchema.default("setup"),
});

export type SemesterFields = z.infer<typeof semesterFieldsSchema>;

/** One invariant violation, addressable to the field that caused it. */
export interface SemesterInvariantIssue {
  readonly path: "startDate" | "endDate" | "status";
  readonly message: string;
}

/**
 * Rules that span more than one field.
 *
 * Kept as a plain function so the API (validating a full record or a
 * merged patch) and the browser (previewing a form) apply exactly the
 * same rules. The database repeats both rules as `CHECK` constraints, so
 * a record cannot reach these states through any path, not just this one.
 */
export function semesterInvariantIssues(
  fields: Pick<SemesterFields, "startDate" | "endDate" | "status">,
): SemesterInvariantIssue[] {
  const issues: SemesterInvariantIssue[] = [];

  if (
    fields.startDate !== null &&
    fields.endDate !== null &&
    fields.endDate < fields.startDate
  ) {
    issues.push({
      path: "endDate",
      message: "End date must be on or after the start date.",
    });
  }

  if (
    fields.status === "active" &&
    (fields.startDate === null || fields.endDate === null)
  ) {
    issues.push({
      path: "status",
      message: "An active semester needs both a start date and an end date.",
    });
  }

  return issues;
}

function addInvariantIssues(
  fields: Pick<SemesterFields, "startDate" | "endDate" | "status">,
  context: z.RefinementCtx,
): void {
  for (const issue of semesterInvariantIssues(fields)) {
    context.addIssue({
      code: "custom",
      path: [issue.path],
      message: issue.message,
    });
  }
}

/** Payload accepted when creating a semester. */
export const createSemesterInputSchema =
  semesterFieldsSchema.superRefine(addInvariantIssues);

export type CreateSemesterInput = z.infer<typeof createSemesterInputSchema>;

/**
 * Payload accepted when editing a semester.
 *
 * Written out rather than derived with `.partial()`: a partial schema
 * still applies each field's default, so an empty patch would silently
 * reset dates and status instead of changing nothing.
 *
 * Cross-field rules cannot be checked on a patch alone (a patch that only
 * moves `endDate` needs the stored `startDate`), so the caller merges the
 * patch first and then validates the result with
 * `semesterInvariantIssues`.
 */
export const semesterPatchSchema = z.object({
  name: nameSchema.optional(),
  academicYear: academicYearSchema.optional(),
  startDate: nullableCalendarDateSchema.optional(),
  endDate: nullableCalendarDateSchema.optional(),
  status: semesterStatusSchema.optional(),
});

export type SemesterPatch = z.infer<typeof semesterPatchSchema>;

/** Identifier format for a semester, validated before it reaches SQL. */
export const semesterIdSchema = z.uuid();

/** A semester as stored and returned by the API. */
export const semesterSchema = semesterFieldsSchema.extend({
  id: semesterIdSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Semester = z.infer<typeof semesterSchema>;
