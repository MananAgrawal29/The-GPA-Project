import {
  classOccurrenceRangeSchema,
  generateClassOccurrencesInputSchema,
} from "@gpa/shared";

/** One rejected field, reported alongside an error. */
export interface ClassOccurrenceFieldIssue {
  readonly path: string;
  readonly message: string;
}

/** The semester does not exist, or it belongs to someone else. */
export class ClassOccurrenceOwnershipError extends Error {
  constructor() {
    super("That semester does not exist, or it belongs to someone else.");
    this.name = "ClassOccurrenceOwnershipError";
  }
}

/** A generation request or occurrence payload is invalid. */
export class ClassOccurrenceValidationError extends Error {
  readonly issues: readonly ClassOccurrenceFieldIssue[];

  constructor(issues: readonly ClassOccurrenceFieldIssue[]) {
    super(
      issues.length > 0
        ? issues.map((issue) => issue.message).join(" ")
        : "Invalid class occurrence details.",
    );
    this.name = "ClassOccurrenceValidationError";
    this.issues = issues;
  }
}

function toFieldIssues(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): ClassOccurrenceFieldIssue[] {
  return issues.map((issue) => ({
    path: String(issue.path[0] ?? "input"),
    message: issue.message,
  }));
}

export function validateGenerateClassOccurrencesInput(input: unknown): void {
  const result = generateClassOccurrencesInputSchema.safeParse(input);

  if (!result.success) {
    throw new ClassOccurrenceValidationError(
      toFieldIssues(result.error.issues),
    );
  }
}

export function parseClassOccurrenceRange(input: unknown) {
  const result = classOccurrenceRangeSchema.safeParse(input);

  if (!result.success) {
    throw new ClassOccurrenceValidationError(
      toFieldIssues(result.error.issues),
    );
  }

  return result.data;
}
