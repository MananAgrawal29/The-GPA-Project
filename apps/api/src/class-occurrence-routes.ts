import { and, eq } from "drizzle-orm";
import type { Express, Request, RequestHandler, Response } from "express";
import type { FieldIssue } from "@gpa/shared";
import { semesterIdSchema, classOccurrenceIdSchema } from "@gpa/shared";
import type { AuthBoundary } from "./auth/session.js";
import type { Database } from "./db/client.js";
import {
  generateClassOccurrences,
  getClassOccurrence,
  listClassOccurrences,
} from "./db/class-occurrence-repository.js";
import { semesters } from "./db/schema.js";
import {
  ClassOccurrenceOwnershipError,
  ClassOccurrenceValidationError,
} from "./domain/class-occurrence-repository.js";

interface RequestContext {
  readonly userId: string;
  readonly database: Database;
}

type Handler = (
  request: Request,
  response: Response,
  context: RequestContext,
) => Promise<void>;

export interface ClassOccurrenceRoutesOptions {
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

function sendOccurrenceNotFound(response: Response): void {
  sendError(
    response,
    404,
    "class_occurrence_not_found",
    "That class occurrence does not exist, or it belongs to someone else.",
  );
}

function pathParam(request: Request, name: string): string {
  const value = request.params[name];
  return typeof value === "string" ? value : "";
}

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

export function registerClassOccurrenceRoutes(
  app: Express,
  options: ClassOccurrenceRoutesOptions,
): void {
  const { auth, database } = options;

  const guarded =
    (handler: Handler): RequestHandler =>
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
        if (error instanceof ClassOccurrenceValidationError) {
          sendError(
            response,
            422,
            "validation_failed",
            "Some of those details are not valid.",
            error.issues,
          );
          return;
        }

        if (error instanceof ClassOccurrenceOwnershipError) {
          sendSemesterNotFound(response);
          return;
        }

        throw error;
      }
    };

  app.post(
    "/semesters/:semesterId/class-occurrences/generate",
    guarded(async (request, response, { userId, database }) => {
      const semesterId = pathParam(request, "semesterId");

      if (!(await ownsSemester(database, userId, semesterId))) {
        sendSemesterNotFound(response);
        return;
      }

      const body = (request.body ?? {}) as Record<string, unknown>;
      const occurrences = await generateClassOccurrences(
        database,
        userId,
        semesterId,
        body,
      );

      response.status(200).json({ occurrences });
    }),
  );

  // Compatibility alias for callers that POST the range directly to the
  // collection instead of the explicit generate action.
  app.post(
    "/semesters/:semesterId/class-occurrences",
    guarded(async (request, response, { userId, database }) => {
      const semesterId = pathParam(request, "semesterId");

      if (!(await ownsSemester(database, userId, semesterId))) {
        sendSemesterNotFound(response);
        return;
      }

      const body = (request.body ?? {}) as Record<string, unknown>;
      const occurrences = await generateClassOccurrences(
        database,
        userId,
        semesterId,
        body,
      );

      response.status(200).json({ occurrences });
    }),
  );

  app.get(
    "/semesters/:semesterId/class-occurrences",
    guarded(async (request, response, { userId, database }) => {
      const semesterId = pathParam(request, "semesterId");

      if (!(await ownsSemester(database, userId, semesterId))) {
        sendSemesterNotFound(response);
        return;
      }

      const query = request.query as Record<string, unknown>;
      const occurrences = await listClassOccurrences(
        database,
        userId,
        semesterId,
        {
          fromDate: typeof query.from === "string" ? query.from : undefined,
          toDate: typeof query.to === "string" ? query.to : undefined,
        },
      );

      response.status(200).json({ occurrences });
    }),
  );

  app.get(
    "/semesters/:semesterId/class-occurrences/:occurrenceId",
    guarded(async (request, response, { userId, database }) => {
      const semesterId = pathParam(request, "semesterId");
      const occurrenceId = pathParam(request, "occurrenceId");

      if (!classOccurrenceIdSchema.safeParse(occurrenceId).success) {
        sendOccurrenceNotFound(response);
        return;
      }

      if (!(await ownsSemester(database, userId, semesterId))) {
        sendSemesterNotFound(response);
        return;
      }

      const occurrence = await getClassOccurrence(
        database,
        userId,
        semesterId,
        occurrenceId,
      );

      if (occurrence === null) {
        sendOccurrenceNotFound(response);
        return;
      }

      response.status(200).json({ occurrence });
    }),
  );
}
