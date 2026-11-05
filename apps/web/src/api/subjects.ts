import { z } from "zod";
import {
  subjectSchema,
  type Subject,
  type SubjectCreateInput,
  type SubjectPatch,
} from "@gpa/shared";
import { request } from "./client";

/**
 * The browser's view of the subject API.
 *
 * Every path is nested under a semester id. A subject is never addressed
 * by its name, and no request carries an owner id: the API derives the
 * owner from the verified session.
 */
const listResponseSchema = z.object({ subjects: z.array(subjectSchema) });
const singleResponseSchema = z.object({ subject: subjectSchema });

function subjectPath(semesterId: string, subjectId?: string): string {
  const base = `/semesters/${encodeURIComponent(semesterId)}/subjects`;
  return subjectId === undefined
    ? base
    : `${base}/${encodeURIComponent(subjectId)}`;
}

export async function listSubjects(
  semesterId: string,
  signal?: AbortSignal,
): Promise<Subject[]> {
  const body = listResponseSchema.parse(
    await request(subjectPath(semesterId), { signal: signal ?? null }),
  );

  return body.subjects;
}

export async function getSubject(
  semesterId: string,
  subjectId: string,
  signal?: AbortSignal,
): Promise<Subject> {
  const body = singleResponseSchema.parse(
    await request(subjectPath(semesterId, subjectId), {
      signal: signal ?? null,
    }),
  );

  return body.subject;
}

export async function createSubject(
  semesterId: string,
  input: SubjectCreateInput,
): Promise<Subject> {
  const body = singleResponseSchema.parse(
    await request(subjectPath(semesterId), {
      method: "POST",
      body: JSON.stringify(input),
    }),
  );

  return body.subject;
}

export async function updateSubject(
  semesterId: string,
  subjectId: string,
  patch: SubjectPatch,
): Promise<Subject> {
  const body = singleResponseSchema.parse(
    await request(subjectPath(semesterId, subjectId), {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  );

  return body.subject;
}
