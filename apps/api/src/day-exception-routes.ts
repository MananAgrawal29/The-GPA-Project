import { and, eq } from "drizzle-orm";
import type { Express, Request, RequestHandler, Response } from "express";
import type { FieldIssue } from "@gpa/shared";
import {
  semesterIdSchema,
  dayExceptionIdSchema,
  dayExceptionSlotIdSchema,
} from "@gpa/shared";
import type { AuthBoundary } from "./auth/session.js";
import type { Database } from "./db/client.js";
import {
  createDayException,
  deleteDayException,
  getDayException,
  listDayExceptions,
  updateDayException,
} from "./db/day-exception-repository.js";
import {
  createDayExceptionSlot,
  deleteDayExceptionSlot,
  getDayExceptionSlot,
  listDayExceptionSlots,
  updateDayExceptionSlot,
} from "./db/day-exception-slot-repository.js";
import { semesters } from "./db/schema.js";
import {
  DayExceptionConflictError,
  DayExceptionDateBoundsError,
  DayExceptionKindConflictError,
  DayExceptionOwnershipError,
  DayExceptionValidationError,
} from "./domain/day-exception-repository.js";
import {
  DayExceptionSlotConflictError,
  DayExceptionSlotHolidayConflictError,
  DayExceptionSlotOverlapError,
  DayExceptionSlotOwnershipError,
  DayExceptionSlotValidationError,
} from "./domain/day-exception-repository.js";

interface RequestContext {
  readonly userId: string;
  readonly database: Database;
}

type DayExceptionHandler = (
  request: Request,
  response: Response,
  context: RequestContext,
) => Promise<void>;

export interface DayExceptionRoutesOptions {
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

function sendExceptionNotFound(response: Response): void {
  sendError(
    response,
    404,
    "day_exception_not_found",
    "That day exception does not exist, or it belongs to someone else.",
  );
}

function _sendSlotNotFound(response: Response): void {
  sendError(
    response,
    404,
    "day_exception_slot_not_found",
    "That day exception slot does not exist, or it belongs to someone else.",
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

export function registerDayExceptionRoutes(
  app: Express,
  options: DayExceptionRoutesOptions,
): void {
  const { auth, database } = options;

  const guarded =
    (handler: DayExceptionHandler): RequestHandler =>
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
        if (error instanceof DayExceptionValidationError) {
          sendError(
            response,
            422,
            "validation_failed",
            "Some of those details are not valid.",
            error.issues,
          );
          return;
        }

        if (error instanceof DayExceptionSlotValidationError) {
          sendError(
            response,
            422,
            "validation_failed",
            "Some of those details are not valid.",
            error.issues,
          );
          return;
        }

        // A missing or foreign semester reads as absent.
        if (error instanceof DayExceptionOwnershipError) {
          sendSemesterNotFound(response);
          return;
        }

        if (error instanceof DayExceptionSlotOwnershipError) {
          _sendSlotNotFound(response);
          return;
        }

        // Duplicate date within the same semester.
        if (error instanceof DayExceptionValidationError) {
          // This is already handled above
          throw error;
        }

        // Date outside semester bounds.
        if (error instanceof DayExceptionDateBoundsError) {
          sendError(
            response,
            422,
            "day_exception_date_bounds",
            "The exception date must fall within the semester's active range.",
          );
          return;
        }

        // Cannot delete exception with dependent slots.
        if (error instanceof DayExceptionConflictError) {
          sendError(response, 409, "day_exception_conflict", error.message);
          return;
        }

        // A special schedule that still owns slots cannot become a holiday.
        if (error instanceof DayExceptionKindConflictError) {
          sendError(
            response,
            409,
            "day_exception_kind_conflict",
            error.message,
          );
          return;
        }

        // Holiday exceptions cannot have slots.
        if (error instanceof DayExceptionSlotHolidayConflictError) {
          sendError(
            response,
            422,
            "day_exception_slot_holiday_conflict",
            error.message,
          );
          return;
        }

        // Slot overlap conflict.
        if (error instanceof DayExceptionSlotOverlapError) {
          sendError(response, 409, "day_exception_slot_overlap", error.message);
          return;
        }

        throw error;
      }
    };

  // Day Exception Routes
  app.get(
    "/semesters/:semesterId/day-exceptions",
    guarded(async (request, response, { userId, database }) => {
      const semesterId = pathParam(request, "semesterId");

      if (!(await ownsSemester(database, userId, semesterId))) {
        sendSemesterNotFound(response);
        return;
      }

      const exceptions = await listDayExceptions(database, userId, semesterId);
      response.status(200).json({ exceptions });
    }),
  );

  app.post(
    "/semesters/:semesterId/day-exceptions",
    guarded(async (request, response, { userId, database }) => {
      const semesterId = pathParam(request, "semesterId");

      if (!(await ownsSemester(database, userId, semesterId))) {
        sendSemesterNotFound(response);
        return;
      }

      const exception = await createDayException(
        database,
        userId,
        semesterId,
        request.body,
      );
      response.status(201).json({ exception });
    }),
  );

  app.get(
    "/semesters/:semesterId/day-exceptions/:exceptionId",
    guarded(async (request, response, { userId, database }) => {
      const semesterId = pathParam(request, "semesterId");
      const exceptionId = pathParam(request, "exceptionId");

      if (
        !semesterIdSchema.safeParse(semesterId).success ||
        !dayExceptionIdSchema.safeParse(exceptionId).success
      ) {
        sendExceptionNotFound(response);
        return;
      }

      if (!(await ownsSemester(database, userId, semesterId))) {
        sendSemesterNotFound(response);
        return;
      }

      const exception = await getDayException(
        database,
        userId,
        semesterId,
        exceptionId,
      );

      if (exception === null) {
        sendExceptionNotFound(response);
        return;
      }

      response.status(200).json({ exception });
    }),
  );

  app.patch(
    "/semesters/:semesterId/day-exceptions/:exceptionId",
    guarded(async (request, response, { userId, database }) => {
      const semesterId = pathParam(request, "semesterId");
      const exceptionId = pathParam(request, "exceptionId");

      if (
        !semesterIdSchema.safeParse(semesterId).success ||
        !dayExceptionIdSchema.safeParse(exceptionId).success
      ) {
        sendExceptionNotFound(response);
        return;
      }

      if (!(await ownsSemester(database, userId, semesterId))) {
        sendSemesterNotFound(response);
        return;
      }

      const exception = await updateDayException(
        database,
        userId,
        semesterId,
        exceptionId,
        request.body,
      );

      if (exception === null) {
        sendExceptionNotFound(response);
        return;
      }

      response.status(200).json({ exception });
    }),
  );

  app.delete(
    "/semesters/:semesterId/day-exceptions/:exceptionId",
    guarded(async (request, response, { userId, database }) => {
      const semesterId = pathParam(request, "semesterId");
      const exceptionId = pathParam(request, "exceptionId");

      if (
        !semesterIdSchema.safeParse(semesterId).success ||
        !dayExceptionIdSchema.safeParse(exceptionId).success
      ) {
        sendExceptionNotFound(response);
        return;
      }

      if (!(await ownsSemester(database, userId, semesterId))) {
        sendSemesterNotFound(response);
        return;
      }

      try {
        const deleted = await deleteDayException(
          database,
          userId,
          semesterId,
          exceptionId,
        );

        if (!deleted) {
          sendExceptionNotFound(response);
          return;
        }

        response.status(204).send();
      } catch (error) {
        if (error instanceof DayExceptionConflictError) {
          sendError(response, 409, "day_exception_conflict", error.message);
          return;
        }
        throw error;
      }
    }),
  );

  // Day Exception Slot Routes
  function _sendSlotNotFound(response: Response): void {
    sendError(
      response,
      404,
      "day_exception_slot_not_found",
      "That day exception slot does not exist, or it belongs to someone else.",
    );
  }

  app.get(
    "/semesters/:semesterId/day-exceptions/:exceptionId/slots",
    guarded(async (request, response, { userId, database }) => {
      const semesterId = pathParam(request, "semesterId");
      const exceptionId = pathParam(request, "exceptionId");

      if (
        !semesterIdSchema.safeParse(semesterId).success ||
        !dayExceptionIdSchema.safeParse(exceptionId).success
      ) {
        sendExceptionNotFound(response);
        return;
      }

      if (!(await ownsSemester(database, userId, semesterId))) {
        sendSemesterNotFound(response);
        return;
      }

      const slots = await listDayExceptionSlots(
        database,
        userId,
        exceptionId,
        semesterId,
      );
      response.status(200).json({ slots });
    }),
  );

  app.post(
    "/semesters/:semesterId/day-exceptions/:exceptionId/slots",
    guarded(async (request, response, { userId, database }) => {
      const semesterId = pathParam(request, "semesterId");
      const exceptionId = pathParam(request, "exceptionId");

      if (
        !semesterIdSchema.safeParse(semesterId).success ||
        !dayExceptionIdSchema.safeParse(exceptionId).success
      ) {
        sendExceptionNotFound(response);
        return;
      }

      if (!(await ownsSemester(database, userId, semesterId))) {
        sendSemesterNotFound(response);
        return;
      }

      const slot = await createDayExceptionSlot(
        database,
        userId,
        exceptionId,
        semesterId,
        request.body,
      );
      response.status(201).json({ slot });
    }),
  );

  app.get(
    "/semesters/:semesterId/day-exceptions/:exceptionId/slots/:slotId",
    guarded(async (request, response, { userId, database }) => {
      const semesterId = pathParam(request, "semesterId");
      const exceptionId = pathParam(request, "exceptionId");
      const slotId = pathParam(request, "slotId");

      if (
        !semesterIdSchema.safeParse(semesterId).success ||
        !dayExceptionIdSchema.safeParse(exceptionId).success ||
        !dayExceptionSlotIdSchema.safeParse(slotId).success
      ) {
        _sendSlotNotFound(response);
        return;
      }

      if (!(await ownsSemester(database, userId, semesterId))) {
        sendSemesterNotFound(response);
        return;
      }

      const slot = await getDayExceptionSlot(
        database,
        userId,
        exceptionId,
        semesterId,
        slotId,
      );

      if (slot === null) {
        _sendSlotNotFound(response);
        return;
      }

      response.status(200).json({ slot });
    }),
  );

  app.patch(
    "/semesters/:semesterId/day-exceptions/:exceptionId/slots/:slotId",
    guarded(async (request, response, { userId, database }) => {
      const semesterId = pathParam(request, "semesterId");
      const exceptionId = pathParam(request, "exceptionId");
      const slotId = pathParam(request, "slotId");

      if (
        !semesterIdSchema.safeParse(semesterId).success ||
        !dayExceptionIdSchema.safeParse(exceptionId).success ||
        !dayExceptionSlotIdSchema.safeParse(slotId).success
      ) {
        _sendSlotNotFound(response);
        return;
      }

      if (!(await ownsSemester(database, userId, semesterId))) {
        sendSemesterNotFound(response);
        return;
      }

      const slot = await updateDayExceptionSlot(
        database,
        userId,
        exceptionId,
        semesterId,
        slotId,
        request.body,
      );

      if (slot === null) {
        _sendSlotNotFound(response);
        return;
      }

      response.status(200).json({ slot });
    }),
  );

  app.delete(
    "/semesters/:semesterId/day-exceptions/:exceptionId/slots/:slotId",
    guarded(async (request, response, { userId, database }) => {
      const semesterId = pathParam(request, "semesterId");
      const exceptionId = pathParam(request, "exceptionId");
      const slotId = pathParam(request, "slotId");

      if (
        !semesterIdSchema.safeParse(semesterId).success ||
        !dayExceptionIdSchema.safeParse(exceptionId).success ||
        !dayExceptionSlotIdSchema.safeParse(slotId).success
      ) {
        _sendSlotNotFound(response);
        return;
      }

      if (!(await ownsSemester(database, userId, semesterId))) {
        sendSemesterNotFound(response);
        return;
      }

      try {
        const deleted = await deleteDayExceptionSlot(
          database,
          userId,
          exceptionId,
          semesterId,
          slotId,
        );

        if (!deleted) {
          _sendSlotNotFound(response);
          return;
        }

        response.status(204).send();
      } catch (error) {
        if (error instanceof DayExceptionSlotConflictError) {
          sendError(
            response,
            409,
            "day_exception_slot_conflict",
            error.message,
          );
          return;
        }
        throw error;
      }
    }),
  );
}
