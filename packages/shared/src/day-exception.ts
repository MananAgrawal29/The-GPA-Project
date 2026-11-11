import { z } from "zod";

/**
 * The kind of day exception.
 */
export const DAY_EXCEPTION_KINDS = ["holiday", "special_schedule"] as const;

export type DayExceptionKind = (typeof DAY_EXCEPTION_KINDS)[number];

export const dayExceptionKindSchema = z.enum(DAY_EXCEPTION_KINDS);

/** A calendar date, not an instant. */
const _calendarDateSchema = z.iso.date();

const _reasonSchema = z
  .string()
  .trim()
  .min(1, "Reason must not be blank.")
  .max(200, "Reason must be 200 characters or fewer.");

/** Fields a user can set on a day exception. */
export const dayExceptionFieldsSchema = z.object({
  date: z.iso.date(),
  kind: dayExceptionKindSchema,
  reason: z.string().trim().min(1).max(200).optional().nullable().default(null),
});

export type DayExceptionFields = z.infer<typeof dayExceptionFieldsSchema>;

/** Payload accepted when creating a day exception. */
export const createDayExceptionInputSchema = dayExceptionFieldsSchema;

export type CreateDayExceptionInput = z.infer<
  typeof createDayExceptionInputSchema
>;

/** Payload accepted when editing a day exception. */
export const dayExceptionPatchSchema = z.object({
  date: z.iso.date().optional(),
  kind: dayExceptionKindSchema.optional(),
  reason: z.string().trim().min(1).max(200).optional().nullable(),
});

export type DayExceptionPatch = z.infer<typeof dayExceptionPatchSchema>;

/** Identifier format for a day exception. */
export const dayExceptionIdSchema = z.uuid();

/** A day exception as stored and returned by the API. */
export const dayExceptionSchema = dayExceptionFieldsSchema.extend({
  id: z.uuid(),
  semesterId: z.uuid(),
  userId: z.string().min(1),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type DayException = z.infer<typeof dayExceptionSchema>;

export const dayExceptionKindSchemaRef = dayExceptionKindSchema;

/**
 * A wall-clock time on a 24-hour clock, with no date and no time zone.
 */
const _wallClockTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a 24-hour time such as 09:00.");

/** The fields a user sets on a day exception slot. */
export const dayExceptionSlotFieldsSchema = z.object({
  exceptionId: z.uuid(),
  subjectId: z.uuid(),
  startTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a 24-hour time such as 09:00."),
  endTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a 24-hour time such as 09:00."),
  room: z.string().trim().min(1).max(80).optional().nullable().default(null),
  classType: z
    .enum(["lecture", "practical", "tutorial", "other"])
    .default("lecture"),
});

export type DayExceptionSlotFields = z.infer<
  typeof dayExceptionSlotFieldsSchema
>;

/** Payload accepted when creating a day exception slot. */
export const createDayExceptionSlotInputSchema = dayExceptionSlotFieldsSchema;

export type CreateDayExceptionSlotInput = z.infer<
  typeof createDayExceptionSlotInputSchema
>;

/** Payload accepted when editing a day exception slot. */
export const dayExceptionSlotPatchSchema = z.object({
  subjectId: z.uuid().optional(),
  startTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  endTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  room: z.string().trim().min(1).max(80).optional().nullable(),
  classType: z.enum(["lecture", "practical", "tutorial", "other"]).optional(),
});

export type DayExceptionSlotPatch = z.infer<typeof dayExceptionSlotPatchSchema>;

/** Identifier format for a day exception slot. */
export const dayExceptionSlotIdSchema = z.uuid();

/** A day exception slot as stored and returned by the API. */
export const dayExceptionSlotSchema = dayExceptionSlotFieldsSchema.extend({
  id: z.uuid(),
  semesterId: z.uuid(),
  userId: z.string().min(1),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type DayExceptionSlot = z.infer<typeof dayExceptionSlotSchema>;
