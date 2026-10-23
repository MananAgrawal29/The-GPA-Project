/** PostgreSQL SQLSTATE for a unique constraint violation. */
export const UNIQUE_VIOLATION = "23505";

interface PostgresErrorFields {
  readonly code?: unknown;
  readonly constraint?: unknown;
  readonly message?: unknown;
  readonly cause?: unknown;
}

const MAX_CAUSE_DEPTH = 5;

/**
 * Finds the driver error underneath any wrapper.
 *
 * Drizzle wraps a failed statement in its own `DrizzleQueryError`, whose
 * message describes the SQL rather than the constraint, so the SQLSTATE
 * lives on `cause` instead of the thrown error itself.
 */
function findDriverError(
  error: unknown,
  depth = 0,
): PostgresErrorFields | null {
  if (depth > MAX_CAUSE_DEPTH || typeof error !== "object" || error === null) {
    return null;
  }

  const candidate = error as PostgresErrorFields;

  if (typeof candidate.code === "string") {
    return candidate;
  }

  return findDriverError(candidate.cause, depth + 1);
}

/**
 * True when an error is a specific PostgreSQL constraint violation.
 *
 * `node-postgres` exposes `code` and `constraint` on the error object,
 * while the WASM test server only guarantees the message text, so both
 * are checked. Matching on the constraint name rather than the SQLSTATE
 * alone keeps an unrelated unique index from being reported as the same
 * conflict.
 */
export function isConstraintViolation(
  error: unknown,
  code: string,
  constraint: string,
): boolean {
  const driverError = findDriverError(error);

  if (driverError === null || driverError.code !== code) {
    return false;
  }

  if (driverError.constraint === constraint) {
    return true;
  }

  return (
    typeof driverError.message === "string" &&
    driverError.message.includes(constraint)
  );
}
