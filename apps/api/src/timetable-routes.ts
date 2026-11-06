import { and, eq } from "drizzle-orm";
import type { Express, Request, RequestHandler, Response } from "express";
import type { FieldIssue } from "@gpa/shared";
import { semesterIdSchema, timetableSlotIdSchema } from "@gpa/shared";
import type { AuthBoundary } from "./auth/session.js";
import type { Database } from "./db/client.js";
import {
  createTimetableSlot,
  deleteTimetableSlot,
  getTimetableSlot,
  listTimetableSlots,
  updateTimetableSlot,
} from "./db/timetable-slot-repository.js";
import { semesters } from "./db/schema.js";
import {
  TimetableSlotOverlapError,
  TimetableSlotOwnershipError,
  TimetableSlotValidationError,
} from "./domain/timetable.js";

/**
 * The timetable slot endpoints.
 *
 * Every route is nested under a semester and reuses the same guard as the
 * semester and subject routes: a verified session supplies the only owner
 * id, and a slot is reachable only when its semester belongs to that
 * owner. The repository repeats the scope in SQL rather than trusting a
 * prior check (D009, D022, D035).
 *
 * Until Clerk is configured, the routes refuse with 503 instead of
 * trusting an unverified caller (D015).
 */

interface RequestContext {
  readonly userId: string;
  readonly database: Database;
}

type TimetableSlotHandler = (
  request: Request,
  response: Response,
  context: RequestContext,
) => Promise<void>;

export interface TimetableSlotRoutesOptions {
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

function sendSlotNotFound(response: Response): void {
  sendError(
    response,
    404,
    "timetable_slot_not_found",
    "That timetable slot does not exist, or it belongs to someone else.",
  );
}

/** Reads one named path segment. */
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

export function registerTimetableSlotRoutes(
  app: Express,
  options: TimetableSlotRoutesOptions,
): void {
  const { auth, database } = options;

  const guarded =
    (handler: TimetableSlotHandler): RequestHandler =>
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
        if (error instanceof TimetableSlotValidationError) {
          sendError(
            response,
            422,
            "validation_failed",
            "Some of those details are not valid.",
            error.issues,
          );
          return;
        }

        // A missing or foreign semester, or a subject that is not part of
        // this semester, reads as absent rather than revealing which one.
        if (error instanceof TimetableSlotOwnershipError) {
          sendSlotNotFound(response);
          return;
        }

        // Two live slots cannot cover the same weekday and time.
        if (error instanceof TimetableSlotOverlapError) {
          sendError(response, 409, "timetable_slot_overlap", error.message);
          return;
        }

        throw error;
      }
    };

  app.get(
    "/semesters/:semesterId/timetable-slots",
    guarded(async (request, response, { userId, database }) => {
      const semesterId = pathParam(request, "semesterId");

      if (!(await ownsSemester(database, userId, semesterId))) {
        sendSemesterNotFound(response);
        return;
      }

      const slots = await listTimetableSlots(database, userId, semesterId);
      response.status(200).json({ slots });
    }),
  );

  app.post(
    "/semesters/:semesterId/timetable-slots",
    guarded(async (request, response, { userId, database }) => {
      const semesterId = pathParam(request, "semesterId");

      if (!(await ownsSemester(database, userId, semesterId))) {
        sendSemesterNotFound(response);
        return;
      }

      const slot = await createTimetableSlot(
        database,
        userId,
        semesterId,
        request.body,
      );
      response.status(201).json({ slot });
    }),
  );

  app.get(
    "/semesters/:semesterId/timetable-slots/:slotId",
    guarded(async (request, response, { userId, database }) => {
      const semesterId = pathParam(request, "semesterId");
      const slotId = pathParam(request, "slotId");

      if (
        !semesterIdSchema.safeParse(semesterId).success ||
        !timetableSlotIdSchema.safeParse(slotId).success
      ) {
        sendSlotNotFound(response);
        return;
      }

      if (!(await ownsSemester(database, userId, semesterId))) {
        sendSemesterNotFound(response);
        return;
      }

      const slot = await getTimetableSlot(database, userId, semesterId, slotId);

      if (slot === null) {
        sendSlotNotFound(response);
        return;
      }

      response.status(200).json({ slot });
    }),
  );

  app.patch(
    "/semesters/:semesterId/timetable-slots/:slotId",
    guarded(async (request, response, { userId, database }) => {
      const semesterId = pathParam(request, "semesterId");
      const slotId = pathParam(request, "slotId");

      if (
        !semesterIdSchema.safeParse(semesterId).success ||
        !timetableSlotIdSchema.safeParse(slotId).success
      ) {
        sendSlotNotFound(response);
        return;
      }

      if (!(await ownsSemester(database, userId, semesterId))) {
        sendSemesterNotFound(response);
        return;
      }

      const slot = await updateTimetableSlot(
        database,
        userId,
        semesterId,
        slotId,
        request.body,
      );

      if (slot === null) {
        sendSlotNotFound(response);
        return;
      }

      response.status(200).json({ slot });
    }),
  );

  app.delete(
    "/semesters/:semesterId/timetable-slots/:slotId",
    guarded(async (request, response, { userId, database }) => {
      const semesterId = pathParam(request, "semesterId");
      const slotId = pathParam(request, "slotId");

      if (
        !semesterIdSchema.safeParse(semesterId).success ||
        !timetableSlotIdSchema.safeParse(slotId).success
      ) {
        sendSlotNotFound(response);
        return;
      }

      if (!(await ownsSemester(database, userId, semesterId))) {
        sendSemesterNotFound(response);
        return;
      }

      const deleted = await deleteTimetableSlot(
        database,
        userId,
        semesterId,
        slotId,
      );

      if (!deleted) {
        sendSlotNotFound(response);
        return;
      }

      response.status(204).send();
    }),
  );
}
