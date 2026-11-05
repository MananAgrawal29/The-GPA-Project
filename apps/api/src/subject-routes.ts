import type { Express, Request, RequestHandler, Response } from "express";
import type { FieldIssue } from "@gpa/shared";
import { semesterIdSchema, subjectIdSchema } from "@gpa/shared";
import { and, eq } from "drizzle-orm";
import type { AuthBoundary } from "./auth/session.js";
import type { Database } from "./db/client.js";
import {
  createSubject,
  deleteSubject,
  getSubject,
  listSubjects,
  updateSubject,
} from "./db/subject-repository.js";
import { semesters } from "./db/schema.js";
import {
  SubjectOwnershipError,
  SubjectValidationError,
} from "./domain/subject.js";

/**
 * The subject endpoints.
 *
 * Every route is nested under a semester and reuses the same guard as the
 * semester routes: a verified session supplies the only owner id, and a
 * subject is reachable only when its semester belongs to that owner. The
 * repository repeats the scope in SQL rather than trusting a prior check.
 */

interface RequestContext {
  readonly userId: string;
  readonly database: Database;
}

type SubjectHandler = (
  request: Request,
  response: Response,
  context: RequestContext,
) => Promise<void>;

export interface SubjectRoutesOptions {
  readonly auth: AuthBoundary;
  readonly database: Database | undefined;
}

function sendError(
  response: Response,
  status: number,
  code: string,
  message: string,
  issues?: readonly FieldIssue[],
): void {
  response.status(status).json({
    error: {
      code,
      message,
      ...(issues === undefined ? {} : { issues }),
    },
  });
}

function sendSemesterNotFound(response: Response): void {
  sendError(
    response,
    404,
    "semester_not_found",
    "That semester does not exist, or it belongs to someone else.",
  );
}

function sendSubjectNotFound(response: Response): void {
  sendError(
    response,
    404,
    "subject_not_found",
    "That subject does not exist, or it belongs to another user's semester.",
  );
}

/**
 * Reads one named path segment.
 *
 * A malformed or missing id cannot name a record, so the route resolves
 * it to 404 before touching SQL rather than letting PostgreSQL reject an
 * unparsable UUID.
 */
function pathParam(request: Request, name: string): string {
  const value = request.params[name];
  return typeof value === "string" ? value : "";
}

/** True when the semester exists and belongs to `userId`. */
async function ownsSemester(
  db: Database,
  userId: string,
  semesterId: string,
): Promise<boolean> {
  if (!semesterIdSchema.safeParse(semesterId).success) {
    return false;
  }

  const [row] = await db
    .select({ id: semesters.id })
    .from(semesters)
    .where(and(eq(semesters.id, semesterId), eq(semesters.userId, userId)))
    .limit(1);

  return row !== undefined;
}

export function registerSubjectRoutes(
  app: Express,
  options: SubjectRoutesOptions,
): void {
  const { auth, database } = options;

  const guarded =
    (handler: SubjectHandler): RequestHandler =>
    async (request, response) => {
      if (!auth.configured) {
        sendError(
          response,
          503,
          "auth_not_configured",
          "Sign-in is not configured on this server, so personal data is unavailable.",
        );
        return;
      }

      if (database === undefined) {
        sendError(
          response,
          503,
          "database_not_configured",
          "No database is configured on this server, so personal data is unavailable.",
        );
        return;
      }

      const resolved = auth.resolveUserId(request);
      const userId = resolved?.trim() ?? "";

      if (userId === "") {
        sendError(response, 401, "unauthenticated", "Sign in to continue.");
        return;
      }

      try {
        await handler(request, response, { userId, database });
      } catch (error) {
        // Known problems get their own status; anything else falls
        // through to the app-wide handler, which logs the fact and
        // returns a generic envelope without leaking details.
        if (error instanceof SubjectValidationError) {
          sendError(
            response,
            422,
            "validation_failed",
            "Some of those details are not valid.",
            error.issues,
          );
          return;
        }

        // A semester deleted between the ownership check and the insert
        // is reported the same way a missing semester always is.
        if (error instanceof SubjectOwnershipError) {
          sendSemesterNotFound(response);
          return;
        }

        throw error;
      }
    };

  app.get(
    "/semesters/:semesterId/subjects",
    guarded(async (request, response, { userId, database }) => {
      const semesterId = pathParam(request, "semesterId");

      if (!(await ownsSemester(database, userId, semesterId))) {
        sendSemesterNotFound(response);
        return;
      }

      const subjects = await listSubjects(database, userId, semesterId);
      response.status(200).json({ subjects });
    }),
  );

  app.post(
    "/semesters/:semesterId/subjects",
    guarded(async (request, response, { userId, database }) => {
      const semesterId = pathParam(request, "semesterId");

      if (!(await ownsSemester(database, userId, semesterId))) {
        sendSemesterNotFound(response);
        return;
      }

      const subject = await createSubject(
        database,
        userId,
        semesterId,
        request.body,
      );
      response.status(201).json({ subject });
    }),
  );

  app.get(
    "/semesters/:semesterId/subjects/:subjectId",
    guarded(async (request, response, { userId, database }) => {
      const semesterId = pathParam(request, "semesterId");
      const subjectId = pathParam(request, "subjectId");

      if (
        !semesterIdSchema.safeParse(semesterId).success ||
        !subjectIdSchema.safeParse(subjectId).success
      ) {
        sendSubjectNotFound(response);
        return;
      }

      const subject = await getSubject(database, userId, semesterId, subjectId);

      if (subject === null) {
        sendSubjectNotFound(response);
        return;
      }

      response.status(200).json({ subject });
    }),
  );

  app.patch(
    "/semesters/:semesterId/subjects/:subjectId",
    guarded(async (request, response, { userId, database }) => {
      const semesterId = pathParam(request, "semesterId");
      const subjectId = pathParam(request, "subjectId");

      if (
        !semesterIdSchema.safeParse(semesterId).success ||
        !subjectIdSchema.safeParse(subjectId).success
      ) {
        sendSubjectNotFound(response);
        return;
      }

      const subject = await updateSubject(
        database,
        userId,
        semesterId,
        subjectId,
        request.body,
      );

      if (subject === null) {
        sendSubjectNotFound(response);
        return;
      }

      response.status(200).json({ subject });
    }),
  );

  app.delete(
    "/semesters/:semesterId/subjects/:subjectId",
    guarded(async (request, response, { userId, database }) => {
      const semesterId = pathParam(request, "semesterId");
      const subjectId = pathParam(request, "subjectId");

      if (
        !semesterIdSchema.safeParse(semesterId).success ||
        !subjectIdSchema.safeParse(subjectId).success
      ) {
        sendSubjectNotFound(response);
        return;
      }

      const deleted = await deleteSubject(
        database,
        userId,
        semesterId,
        subjectId,
      );

      if (!deleted) {
        sendSubjectNotFound(response);
        return;
      }

      response.status(204).send();
    }),
  );
}
