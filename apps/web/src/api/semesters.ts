import { z } from "zod";
import { semesterSchema, type Semester, type SemesterPatch } from "@gpa/shared";
import { request } from "./client";

export { ApiRequestError } from "./client";

/**
 * The browser's view of the semester API.
 *
 * Two rules hold for everything here: the server is the only source of
 * truth about who the caller is, so no request ever carries an owner id;
 * and every response is parsed against the shared contract, so a shape
 * change fails loudly instead of rendering a wrong value.
 */
const listResponseSchema = z.object({ semesters: z.array(semesterSchema) });
const singleResponseSchema = z.object({ semester: semesterSchema });

export async function listSemesters(): Promise<Semester[]> {
  const body = listResponseSchema.parse(await request("/semesters"));
  return body.semesters;
}

export interface SemesterInput {
  readonly name: string;
  readonly academicYear: string;
  readonly startDate: string | null;
  readonly endDate: string | null;
}

export async function createSemester(input: SemesterInput): Promise<Semester> {
  const body = singleResponseSchema.parse(
    await request("/semesters", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  );

  return body.semester;
}

export async function updateSemester(
  id: string,
  patch: SemesterPatch,
): Promise<Semester> {
  const body = singleResponseSchema.parse(
    await request(`/semesters/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  );

  return body.semester;
}

export async function activateSemester(
  id: string,
  demoteActiveTo: "setup" | "completed" | "archived",
): Promise<Semester> {
  const body = singleResponseSchema.parse(
    await request(`/semesters/${id}/activate`, {
      method: "POST",
      body: JSON.stringify({ demoteActiveTo }),
    }),
  );

  return body.semester;
}
