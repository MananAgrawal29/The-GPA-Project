import { and, eq } from "drizzle-orm";
import { semesterIdSchema, subjectIdSchema, type Subject } from "@gpa/shared";
import type { Database } from "./client.js";
import {
  SubjectOwnershipError,
  parseSubjectCreateInput,
  parseSubjectPatch,
} from "../domain/subject.js";
import { FOREIGN_KEY_VIOLATION, isConstraintViolation } from "./errors.js";
import { subjects } from "./schema.js";

const SUBJECT_OWNER_CONSTRAINT = "subjects_semester_owner_fk";

/**
 * Subject data access.
 *
 * Every query filters by `userId` and `semesterId` in SQL, not after the
 * fact, so another user's semester is reported as absent rather than read
 * or modified. The owner id always comes from a verified session.
 */

/**
 * True when the identifiers can name a subject at all.
 *
 * A malformed UUID would otherwise reach PostgreSQL and raise a syntax
 * error; treating it as absent keeps the data layer's "foreign rows read
 * as absent" behavior consistent for unparsable ids too.
 */
function canNameSubject(semesterId: string, subjectId: string): boolean {
  return (
    semesterIdSchema.safeParse(semesterId).success &&
    subjectIdSchema.safeParse(subjectId).success
  );
}

function toSubject(row: typeof subjects.$inferSelect): Subject {
  return {
    id: row.id,
    semesterId: row.semesterId,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Creates a subject owned by `userId` within the given semester. */
export async function createSubject(
  db: Database,
  userId: string,
  semesterId: string,
  input: unknown,
): Promise<Subject> {
  const { name } = parseSubjectCreateInput(input);

  try {
    const [row] = await db
      .insert(subjects)
      .values({ userId, semesterId, name })
      .returning();

    if (row === undefined) {
      throw new Error("Subject insert returned no row");
    }

    return toSubject(row);
  } catch (error) {
    // The composite foreign key is the ownership guarantee: a semester
    // that does not exist, or belongs to someone else, is rejected here.
    if (
      isConstraintViolation(
        error,
        FOREIGN_KEY_VIOLATION,
        SUBJECT_OWNER_CONSTRAINT,
      )
    ) {
      throw new SubjectOwnershipError();
    }

    throw error;
  }
}

/** Lists one semester's subjects, alphabetically. */
export async function listSubjects(
  db: Database,
  userId: string,
  semesterId: string,
): Promise<Subject[]> {
  if (!semesterIdSchema.safeParse(semesterId).success) {
    return [];
  }

  const rows = await db
    .select()
    .from(subjects)
    .where(
      and(eq(subjects.semesterId, semesterId), eq(subjects.userId, userId)),
    )
    .orderBy(subjects.name);

  return rows.map(toSubject);
}

/** Returns the subject only when it belongs to `userId`'s semester. */
export async function getSubject(
  db: Database,
  userId: string,
  semesterId: string,
  subjectId: string,
): Promise<Subject | null> {
  if (!canNameSubject(semesterId, subjectId)) {
    return null;
  }

  const [row] = await db
    .select()
    .from(subjects)
    .where(
      and(
        eq(subjects.id, subjectId),
        eq(subjects.semesterId, semesterId),
        eq(subjects.userId, userId),
      ),
    )
    .limit(1);

  return row === undefined ? null : toSubject(row);
}

/**
 * Applies a partial edit.
 *
 * A subject owned by someone else (or filed under another semester) is
 * treated as absent and is never modified.
 */
export async function updateSubject(
  db: Database,
  userId: string,
  semesterId: string,
  subjectId: string,
  patch: unknown,
): Promise<Subject | null> {
  if (!canNameSubject(semesterId, subjectId)) {
    return null;
  }

  const parsed = parseSubjectPatch(patch);

  // Nothing to change: report the stored record when it exists.
  if (parsed.name === undefined) {
    return getSubject(db, userId, semesterId, subjectId);
  }

  const [row] = await db
    .update(subjects)
    .set({ name: parsed.name, updatedAt: new Date() })
    .where(
      and(
        eq(subjects.id, subjectId),
        eq(subjects.semesterId, semesterId),
        eq(subjects.userId, userId),
      ),
    )
    .returning();

  return row === undefined ? null : toSubject(row);
}

/** Deletes a subject, but only from the caller's own semester. */
export async function deleteSubject(
  db: Database,
  userId: string,
  semesterId: string,
  subjectId: string,
): Promise<boolean> {
  if (!canNameSubject(semesterId, subjectId)) {
    return false;
  }

  const deleted = await db
    .delete(subjects)
    .where(
      and(
        eq(subjects.id, subjectId),
        eq(subjects.semesterId, semesterId),
        eq(subjects.userId, userId),
      ),
    )
    .returning({ id: subjects.id });

  return deleted.length > 0;
}
