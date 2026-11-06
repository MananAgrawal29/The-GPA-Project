import { z } from "zod";
import {
  timetableSlotSchema,
  type TimetableSlot,
  type TimetableSlotCreateInput,
  type TimetableSlotPatch,
} from "@gpa/shared";
import { request } from "./client";

/**
 * The browser's view of the timetable slot API.
 *
 * Every path is nested under a semester id. A slot is addressed by its id,
 * never by a day or time, and no request carries an owner id: the API
 * derives the owner from the verified session.
 */
const listResponseSchema = z.object({ slots: z.array(timetableSlotSchema) });
const singleResponseSchema = z.object({ slot: timetableSlotSchema });

function slotPath(semesterId: string, slotId?: string): string {
  const base = `/semesters/${encodeURIComponent(semesterId)}/timetable-slots`;
  return slotId === undefined ? base : `${base}/${encodeURIComponent(slotId)}`;
}

export async function listTimetableSlots(
  semesterId: string,
  signal?: AbortSignal,
): Promise<TimetableSlot[]> {
  const body = listResponseSchema.parse(
    await request(slotPath(semesterId), { signal: signal ?? null }),
  );

  return body.slots;
}

export async function getTimetableSlot(
  semesterId: string,
  slotId: string,
  signal?: AbortSignal,
): Promise<TimetableSlot> {
  const body = singleResponseSchema.parse(
    await request(slotPath(semesterId, slotId), {
      signal: signal ?? null,
    }),
  );

  return body.slot;
}

export async function createTimetableSlot(
  semesterId: string,
  input: TimetableSlotCreateInput,
): Promise<TimetableSlot> {
  const body = singleResponseSchema.parse(
    await request(slotPath(semesterId), {
      method: "POST",
      body: JSON.stringify(input),
    }),
  );

  return body.slot;
}

export async function updateTimetableSlot(
  semesterId: string,
  slotId: string,
  patch: TimetableSlotPatch,
): Promise<TimetableSlot> {
  const body = singleResponseSchema.parse(
    await request(slotPath(semesterId, slotId), {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  );

  return body.slot;
}

export async function deleteTimetableSlot(
  semesterId: string,
  slotId: string,
): Promise<void> {
  await request(slotPath(semesterId, slotId), {
    method: "DELETE",
  });
}
