import {
  subjectCreateInputSchema,
  subjectPatchSchema,
  type Subject,
  type SubjectCreateInput,
  type SubjectPatch,
} from "@gpa/shared";

export type { Subject, SubjectCreateInput, SubjectPatch };

/** A rejected subject payload, addressable to the field that caused it. */
export interface SubjectFieldIssue {
  readonly path: string;
  readonly message: string;
}

/**
 * The semester does not exist, or it belongs to another owner.
 *
 * Raised by the repository when the database rejects the composite
 * `(semester_id, user_id)` foreign key, so a direct caller cannot file a
 * subject under a term its owner does not own.
 */
export class SubjectOwnershipError extends Error {
  constructor() {
    super("That semester does not exist, or it belongs to someone else.");
    this.name = "SubjectOwnershipError";
  }
}

export class SubjectValidationError extends Error {
  readonly issues: readonly SubjectFieldIssue[];

  constructor(issues: readonly SubjectFieldIssue[]) {
    super(
      issues.length > 0
        ? issues.map((issue) => issue.message).join(" ")
        : "Invalid subject details.",
    );
    this.name = "SubjectValidationError";
    this.issues = issues;
  }
}

function toValidationError(error: {
  issues: readonly { path: readonly PropertyKey[]; message: string }[];
}): SubjectValidationError {
  return new SubjectValidationError(
    error.issues.map((issue) => ({
      path: String(issue.path[0] ?? "subject"),
      message: issue.message,
    })),
  );
}

/** Validates a subject create payload at the server boundary. */
export function parseSubjectCreateInput(input: unknown): SubjectCreateInput {
  const result = subjectCreateInputSchema.safeParse(input);

  if (!result.success) {
    throw toValidationError(result.error);
  }

  return result.data;
}

/** Validates the shape of a subject edit payload. */
export function parseSubjectPatch(input: unknown): SubjectPatch {
  const result = subjectPatchSchema.safeParse(input);

  if (!result.success) {
    throw toValidationError(result.error);
  }

  return result.data;
}
