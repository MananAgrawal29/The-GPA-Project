import { z } from "zod";
import {
  classOccurrenceSchema,
  type ClassOccurrence,
  type ClassOccurrenceRange,
  type GenerateClassOccurrencesInput,
} from "@gpa/shared";
import { request } from "./client";

const listResponseSchema = z.object({
  occurrences: z.array(classOccurrenceSchema),
});

const generateResponseSchema = z.object({
  occurrences: z.array(classOccurrenceSchema),
});

const singleResponseSchema = z.object({
  occurrence: classOccurrenceSchema,
});

function occurrencePath(semesterId: string, occurrenceId?: string): string {
  const base = `/semesters/${encodeURIComponent(semesterId)}/class-occurrences`;
  return occurrenceId === undefined
    ? base
    : `${base}/${encodeURIComponent(occurrenceId)}`;
}

export async function listClassOccurrences(
  semesterId: string,
  range: ClassOccurrenceRange = {},
  signal?: AbortSignal,
): Promise<ClassOccurrence[]> {
  const params = new URLSearchParams();

  if (range.fromDate !== undefined) {
    params.set("from", range.fromDate);
  }

  if (range.toDate !== undefined) {
    params.set("to", range.toDate);
  }

  const query = params.toString();
  const path =
    query === ""
      ? occurrencePath(semesterId)
      : `${occurrencePath(semesterId)}?${query}`;

  const body = listResponseSchema.parse(
    await request(path, { signal: signal ?? null }),
  );

  return body.occurrences;
}

export async function generateClassOccurrences(
  semesterId: string,
  input: GenerateClassOccurrencesInput = {},
): Promise<ClassOccurrence[]> {
  const body = generateResponseSchema.parse(
    await request(`${occurrencePath(semesterId)}/generate`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  );

  return body.occurrences;
}

export async function getClassOccurrence(
  semesterId: string,
  occurrenceId: string,
  signal?: AbortSignal,
): Promise<ClassOccurrence> {
  const body = singleResponseSchema.parse(
    await request(occurrencePath(semesterId, occurrenceId), {
      signal: signal ?? null,
    }),
  );

  return body.occurrence;
}
