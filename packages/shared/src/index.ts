import { z } from "zod";

export {
  SEMESTER_STATUSES,
  activateSemesterInputSchema,
  createSemesterInputSchema,
  semesterFieldsSchema,
  semesterIdSchema,
  semesterInvariantIssues,
  semesterPatchSchema,
  semesterSchema,
  semesterStatusSchema,
  subjectCreateInputSchema,
  subjectIdSchema,
  subjectPatchSchema,
  subjectSchema,
} from "./semester.js";

export type {
  ActivateSemesterInput,
  CreateSemesterInput,
  Semester,
  SemesterFields,
  SemesterInvariantIssue,
  SemesterPatch,
  SemesterStatus,
  Subject,
  SubjectCreateInput,
  SubjectPatch,
} from "./semester.js";

export {
  CLASS_TYPES,
  classTypeSchema,
  createTimetableSlotInputSchema,
  timetableSlotFieldsSchema,
  timetableSlotIdSchema,
  timetableSlotInvariantIssues,
  timetableSlotPatchSchema,
  timetableSlotSchema,
  timetableSlotSemesterIssues,
} from "./timetable.js";

export type {
  ClassType,
  SemesterDateWindow,
  TimetableSlot,
  TimetableSlotCreateInput,
  TimetableSlotFields,
  TimetableSlotInvariantIssue,
  TimetableSlotPatch,
} from "./timetable.js";

export {
  dayExceptionKindSchema,
  dayExceptionFieldsSchema,
  dayExceptionPatchSchema,
  dayExceptionSchema,
  createDayExceptionInputSchema,
  dayExceptionIdSchema,
  DAY_EXCEPTION_KINDS,
  type DayExceptionKind,
  type DayException,
  type DayExceptionFields,
  type CreateDayExceptionInput,
  type DayExceptionPatch,
  dayExceptionSlotFieldsSchema,
  dayExceptionSlotSchema,
  dayExceptionSlotPatchSchema,
  dayExceptionSlotIdSchema,
  createDayExceptionSlotInputSchema,
  type DayExceptionSlotFields,
  type DayExceptionSlot,
  type DayExceptionSlotPatch,
  type CreateDayExceptionSlotInput,
} from "./day-exception.js";

export {
  CLASS_OCCURRENCE_STATUSES,
  classOccurrenceStatusSchema,
  classOccurrenceFieldsSchema,
  classOccurrenceIdSchema,
  classOccurrenceSchema,
  classOccurrenceRangeSchema,
  generateClassOccurrencesInputSchema,
  type ClassOccurrenceStatus,
  type ClassOccurrenceFields,
  type ClassOccurrence,
  type ClassOccurrenceRange,
  type GenerateClassOccurrencesInput,
} from "./class-occurrence.js";

/** Product identity shared by every workspace package. */
export const APP_NAME = "The GPA Project";

export const APP_TAGLINE = "Set up the semester once. Keep the history.";

/**
 * Contract for `GET /health`.
 *
 * The API and its tests both derive from this schema, so the shape cannot
 * drift between the producer and the consumer without a type error.
 */
export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("api"),
  version: z.string().min(1),
  timestamp: z.iso.datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

/** One problem with a named field, reported alongside an error. */
export const fieldIssueSchema = z.object({
  path: z.string().min(1),
  message: z.string().min(1),
});

export type FieldIssue = z.infer<typeof fieldIssueSchema>;

/**
 * Uniform error envelope used by every API route.
 *
 * `issues` appears only on validation failures, so the same envelope can
 * report a 404 and a 422 without the client guessing which shape it has.
 */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    issues: z.array(fieldIssueSchema).optional(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
