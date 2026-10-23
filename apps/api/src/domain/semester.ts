import {
  createSemesterInputSchema,
  semesterInvariantIssues,
  semesterPatchSchema,
  type CreateSemesterInput,
  type SemesterFields,
  type SemesterPatch,
} from "@gpa/shared";

/**
 * A rejected semester payload: either a field rule from the shared
 * contract or a cross-field rule that needs the merged record.
 *
 * Carries the issues, not just a message, so an API caller can attach
 * each problem to the field that caused it.
 */
export interface SemesterFieldIssue {
  readonly path: string;
  readonly message: string;
}

export class SemesterValidationError extends Error {
  readonly issues: readonly SemesterFieldIssue[];

  constructor(issues: readonly SemesterFieldIssue[]) {
    super(
      issues.length > 0
        ? issues.map((issue) => issue.message).join(" ")
        : "Invalid semester details.",
    );
    this.name = "SemesterValidationError";
    this.issues = issues;
  }
}

function toValidationError(error: {
  issues: readonly { path: readonly PropertyKey[]; message: string }[];
}): SemesterValidationError {
  return new SemesterValidationError(
    error.issues.map((issue) => ({
      // A field-level issue starts with the field it belongs to.
      path: String(issue.path[0] ?? "semester"),
      message: issue.message,
    })),
  );
}

/** Validates a create payload at the server boundary. */
export function parseCreateSemesterInput(input: unknown): CreateSemesterInput {
  const result = createSemesterInputSchema.safeParse(input);

  if (!result.success) {
    throw toValidationError(result.error);
  }

  return result.data;
}

/** Validates the shape of an edit payload. Cross-field rules run after merge. */
export function parseSemesterPatch(input: unknown): SemesterPatch {
  const result = semesterPatchSchema.safeParse(input);

  if (!result.success) {
    throw toValidationError(result.error);
  }

  return result.data;
}

/**
 * Applies a validated patch to the stored fields.
 *
 * `null` clears a date and must not fall back to the stored value, so the
 * check is against `undefined` rather than a nullish coalesce.
 */
export function mergeSemesterFields(
  current: SemesterFields,
  patch: SemesterPatch,
): SemesterFields {
  return {
    name: patch.name ?? current.name,
    academicYear: patch.academicYear ?? current.academicYear,
    startDate:
      patch.startDate === undefined ? current.startDate : patch.startDate,
    endDate: patch.endDate === undefined ? current.endDate : patch.endDate,
    status: patch.status ?? current.status,
  };
}

/** Throws unless the complete record satisfies every cross-field rule. */
export function assertSemesterInvariants(fields: SemesterFields): void {
  const issues = semesterInvariantIssues(fields);

  if (issues.length > 0) {
    throw new SemesterValidationError(issues);
  }
}
