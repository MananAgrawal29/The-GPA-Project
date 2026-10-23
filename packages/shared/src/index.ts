import { z } from "zod";

export {
  SEMESTER_STATUSES,
  createSemesterInputSchema,
  semesterFieldsSchema,
  semesterIdSchema,
  semesterInvariantIssues,
  semesterPatchSchema,
  semesterSchema,
  semesterStatusSchema,
} from "./semester.js";

export type {
  CreateSemesterInput,
  Semester,
  SemesterFields,
  SemesterInvariantIssue,
  SemesterPatch,
  SemesterStatus,
} from "./semester.js";

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

/** Uniform error envelope used by every API route. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
