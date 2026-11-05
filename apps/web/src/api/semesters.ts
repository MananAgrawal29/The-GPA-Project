import { z } from "zod";
import {
  apiErrorSchema,
  semesterSchema,
  type FieldIssue,
  type Semester,
  type SemesterPatch,
} from "@gpa/shared";

/**
 * The browser's view of the semester API.
 *
 * Two rules hold for everything here: the server is the only source of
 * truth about who the caller is, so no request ever carries an owner id;
 * and every response is parsed against the shared contract, so a shape
 * change fails loudly instead of rendering a wrong value.
 *
 * `VITE_API_BASE_URL` is public by construction (D016). Leaving it empty
 * makes the client call same-origin paths, which is what the Vite dev
 * server proxy does in development.
 */
const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? "";

/** A server-refused request, carrying the code and field issues. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly issues: readonly FieldIssue[];

  constructor(
    status: number,
    code: string,
    message: string,
    issues: readonly FieldIssue[],
  ) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

async function request(path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(body);

    if (parsed.success) {
      throw new ApiRequestError(
        response.status,
        parsed.data.error.code,
        parsed.data.error.message,
        parsed.data.error.issues ?? [],
      );
    }

    throw new ApiRequestError(
      response.status,
      `http_${response.status}`,
      "The server sent a response this app does not understand.",
      [],
    );
  }

  return body;
}

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
