import type { Express, Request, RequestHandler, Response } from "express";
import type { FieldIssue } from "@gpa/shared";
import type { AuthBoundary } from "./auth/session.js";
import type { Database } from "./db/client.js";
import {
  ActiveSemesterConflictError,
  activateSemester,
  createSemester,
  getSemester,
  listSemesters,
  updateSemester,
} from "./db/semester-repository.js";
import {
  SemesterValidationError,
  parseActivateSemesterInput,
} from "./domain/semester.js";

/**
 * The semester endpoints.
 *
 * These are the first routes in this application that read or write user
 * data, so the guard below is deliberately in one place: a request only
 * reaches a handler after a verified session has produced a `userId`, and
 * that `userId` is the only owner value the repository ever sees. No
 * request field, header, or query parameter can name the owner.
 *
 * Until Clerk is configured, the routes refuse with 503 instead of
 * trusting an unverified caller (D015).
 */

interface RequestContext {
  readonly userId: string;
  readonly database: Database;
}

type SemesterHandler = (
  request: Request,
  response: Response,
  context: RequestContext,
) => Promise<void>;

export interface SemesterRoutesOptions {
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

/** Maps the errors the domain layer raises on purpose to HTTP. */
function sendKnownError(response: Response, error: unknown): boolean {
  if (error instanceof SemesterValidationError) {
    sendError(
      response,
      422,
      "validation_failed",
      "Some of those details are not valid.",
      error.issues,
    );
    return true;
  }

  if (error instanceof ActiveSemesterConflictError) {
    sendError(response, 409, "active_semester_conflict", error.message);
    return true;
  }

  return false;
}

function sendNotFound(response: Response): void {
  sendError(
    response,
    404,
    "semester_not_found",
    "That semester does not exist, or it belongs to someone else.",
  );
}

/**
 * The `:id` path segment.
 *
 * A malformed or missing id is treated the same way the repository
 * treats one: it cannot name a semester, so the request resolves to 404
 * rather than reaching the database with an unparsable value.
 */
function pathId(request: Request): string {
  const { id } = request.params;

  return typeof id === "string" ? id : "";
}

export function registerSemesterRoutes(
  app: Express,
  options: SemesterRoutesOptions,
): void {
  const { auth, database } = options;

  const guarded =
    (handler: SemesterHandler): RequestHandler =>
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

      // An empty identity is treated as no identity: a boundary that
      // resolves "" must never become an owner id that every query
      // silently matches.
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
        if (!sendKnownError(response, error)) {
          throw error;
        }
      }
    };

  app.get(
    "/semesters",
    guarded(async (_request, response, { userId, database }) => {
      const semesters = await listSemesters(database, userId);
      response.status(200).json({ semesters });
    }),
  );

  app.post(
    "/semesters",
    guarded(async (request, response, { userId, database }) => {
      const semester = await createSemester(database, userId, request.body);
      response.status(201).json({ semester });
    }),
  );

  app.get(
    "/semesters/:id",
    guarded(async (request, response, { userId, database }) => {
      const semester = await getSemester(database, userId, pathId(request));

      if (semester === null) {
        sendNotFound(response);
        return;
      }

      response.status(200).json({ semester });
    }),
  );

  app.patch(
    "/semesters/:id",
    guarded(async (request, response, { userId, database }) => {
      const semester = await updateSemester(
        database,
        userId,
        pathId(request),
        request.body,
      );

      if (semester === null) {
        sendNotFound(response);
        return;
      }

      response.status(200).json({ semester });
    }),
  );

  app.post(
    "/semesters/:id/activate",
    guarded(async (request, response, { userId, database }) => {
      const { demoteActiveTo } = parseActivateSemesterInput(request.body);

      const semester = await activateSemester(
        database,
        userId,
        pathId(request),
        { demoteActiveTo },
      );

      if (semester === null) {
        sendNotFound(response);
        return;
      }

      response.status(200).json({ semester });
    }),
  );
}
