import { z } from "zod";

import { classTypeSchema } from "./timetable.js";

/**
 * The status of a dated class occurrence.
 *
 * Only `scheduled` and `cancelled` are stored. Whether a class was held
 * is an attendance fact (P17) and must not be duplicated here (D032).
 */
export const CLASS_OCCURRENCE_STATUSES = ["scheduled", "cancelled"] as const;

export type ClassOccurrenceStatus = (typeof CLASS_OCCURRENCE_STATUSES)[number];

export const classOccurrenceStatusSchema = z.enum(CLASS_OCCURRENCE_STATUSES);

/** A calendar date, never an instant (D024). */
const calendarDateSchema = z.iso.date();

/** A wall-clock time with no date and no time zone (D034). */
const wallClockTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a 24-hour time such as 09:00.");

const roomSchema = z
  .string()
  .trim()
  .min(1, "Room must not be blank.")
  .max(80, "Room must be 80 characters or fewer.");

/**
 * The fields of a dated class occurrence.
 *
 * Date, times, room, class type, and subject are copied from the rule or
 * one-off slot when the row is created, so a later edit of the source
 * cannot rewrite what was planned for that day (D032).
 */
export const classOccurrenceFieldsSchema = z.object({
  semesterId: z.uuid(),
  subjectId: z.uuid(),
  sourceSlotId: z.uuid().nullable().default(null),
  sourceExceptionSlotId: z.uuid().nullable().default(null),
  date: calendarDateSchema,
  startTime: wallClockTimeSchema,
  endTime: wallClockTimeSchema,
  room: roomSchema.nullable().default(null),
  classType: classTypeSchema.default("lecture"),
  status: classOccurrenceStatusSchema.default("scheduled"),
});

export type ClassOccurrenceFields = z.infer<typeof classOccurrenceFieldsSchema>;

/** Identifier format for a class occurrence. */
export const classOccurrenceIdSchema = z.uuid();

/** A class occurrence as stored and returned by the API. */
export const classOccurrenceSchema = classOccurrenceFieldsSchema.extend({
  id: classOccurrenceIdSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type ClassOccurrence = z.infer<typeof classOccurrenceSchema>;

/**
 * An explicit date range for generation or resolution. Both bounds are
 * optional; when omitted the semester's own dates are used (D032).
 */
export const classOccurrenceRangeSchema = z
  .object({
    fromDate: calendarDateSchema.optional(),
    toDate: calendarDateSchema.optional(),
  })
  .refine(
    (value) =>
      value.fromDate === undefined ||
      value.toDate === undefined ||
      value.fromDate <= value.toDate,
    {
      path: ["toDate"],
      message: "The from date must be on or before the to date.",
    },
  );

export type ClassOccurrenceRange = z.infer<typeof classOccurrenceRangeSchema>;

/** Alias used by callers that name the operation rather than the resource. */
export const generateClassOccurrencesInputSchema = classOccurrenceRangeSchema;

export type GenerateClassOccurrencesInput = z.infer<
  typeof generateClassOccurrencesInputSchema
>;
