import { z } from "zod";
import {
  dayExceptionSchema,
  dayExceptionSlotSchema,
  type DayException,
  type DayExceptionSlot,
  type CreateDayExceptionInput,
  type DayExceptionPatch,
  type CreateDayExceptionSlotInput,
  type DayExceptionSlotPatch,
} from "@gpa/shared";
import { request } from "./client";

/**
 * The browser's view of the day-exception API.
 *
 * Every path is nested under a semester id. An exception is addressed by its id,
 * and slots are addressed by their id. No request carries an owner id: the API
 * derives the owner from the verified session.
 */
const listResponseSchema = z.object({
  exceptions: z.array(dayExceptionSchema),
});
const singleResponseSchema = z.object({ exception: dayExceptionSchema });
const slotListResponseSchema = z.object({
  slots: z.array(dayExceptionSlotSchema),
});
const slotSingleResponseSchema = z.object({ slot: dayExceptionSlotSchema });

function exceptionPath(semesterId: string, exceptionId?: string): string {
  const base = `/semesters/${encodeURIComponent(semesterId)}/day-exceptions`;
  return exceptionId === undefined
    ? base
    : `${base}/${encodeURIComponent(exceptionId)}`;
}

function slotPath(
  semesterId: string,
  exceptionId: string,
  slotId?: string,
): string {
  const base = `/semesters/${encodeURIComponent(semesterId)}/day-exceptions/${encodeURIComponent(exceptionId)}/slots`;
  return slotId === undefined ? base : `${base}/${encodeURIComponent(slotId)}`;
}

export async function listDayExceptions(
  semesterId: string,
  signal?: AbortSignal,
): Promise<DayException[]> {
  const body = listResponseSchema.parse(
    await request(exceptionPath(semesterId), { signal: signal ?? null }),
  );

  return body.exceptions;
}

export async function getDayException(
  semesterId: string,
  exceptionId: string,
  signal?: AbortSignal,
): Promise<DayException> {
  const body = singleResponseSchema.parse(
    await request(exceptionPath(semesterId, exceptionId), {
      signal: signal ?? null,
    }),
  );

  return body.exception;
}

export async function createDayException(
  semesterId: string,
  input: CreateDayExceptionInput,
): Promise<DayException> {
  const body = singleResponseSchema.parse(
    await request(exceptionPath(semesterId), {
      method: "POST",
      body: JSON.stringify(input),
    }),
  );

  return body.exception;
}

export async function updateDayException(
  semesterId: string,
  exceptionId: string,
  patch: DayExceptionPatch,
): Promise<DayException> {
  const body = singleResponseSchema.parse(
    await request(exceptionPath(semesterId, exceptionId), {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  );

  return body.exception;
}

export async function deleteDayException(
  semesterId: string,
  exceptionId: string,
): Promise<void> {
  await request(exceptionPath(semesterId, exceptionId), {
    method: "DELETE",
  });
}

export async function listDayExceptionSlots(
  semesterId: string,
  exceptionId: string,
  signal?: AbortSignal,
): Promise<DayExceptionSlot[]> {
  const body = slotListResponseSchema.parse(
    await request(slotPath(semesterId, exceptionId), {
      signal: signal ?? null,
    }),
  );

  return body.slots;
}

export async function getDayExceptionSlot(
  semesterId: string,
  exceptionId: string,
  slotId: string,
  signal?: AbortSignal,
): Promise<DayExceptionSlot> {
  const body = slotSingleResponseSchema.parse(
    await request(slotPath(semesterId, exceptionId, slotId), {
      signal: signal ?? null,
    }),
  );

  return body.slot;
}

export async function createDayExceptionSlot(
  semesterId: string,
  exceptionId: string,
  input: CreateDayExceptionSlotInput,
): Promise<DayExceptionSlot> {
  const body = slotSingleResponseSchema.parse(
    await request(slotPath(semesterId, exceptionId), {
      method: "POST",
      body: JSON.stringify(input),
    }),
  );

  return body.slot;
}

export async function updateDayExceptionSlot(
  semesterId: string,
  exceptionId: string,
  slotId: string,
  patch: DayExceptionSlotPatch,
): Promise<DayExceptionSlot> {
  const body = slotSingleResponseSchema.parse(
    await request(slotPath(semesterId, exceptionId, slotId), {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  );

  return body.slot;
}

export async function deleteDayExceptionSlot(
  semesterId: string,
  exceptionId: string,
  slotId: string,
): Promise<void> {
  await request(slotPath(semesterId, exceptionId, slotId), {
    method: "DELETE",
  });
}
