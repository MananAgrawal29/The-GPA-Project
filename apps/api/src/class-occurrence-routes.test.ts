import type { Server } from "node:http";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { apiErrorSchema, classOccurrenceSchema } from "@gpa/shared";
import { createApp } from "./app.js";
import type { AuthBoundary } from "./auth/session.js";
import * as schema from "./db/schema.js";
import { createSemester } from "./db/semester-repository.js";
import { createSubject } from "./db/subject-repository.js";
import { createTimetableSlot } from "./db/timetable-slot-repository.js";

const MIGRATIONS_FOLDER = fileURLToPath(new URL("../drizzle", import.meta.url));

const apiBodySchema = z.object({
  error: apiErrorSchema.shape.error.optional(),
  occurrences: z.array(classOccurrenceSchema).optional(),
  occurrence: classOccurrenceSchema.optional(),
});

type ApiBody = z.infer<typeof apiBodySchema>;

let client: PGlite;
let db: PgliteDatabase<typeof schema>;
let server: Server | null = null;
let baseUrl = "";

const stubAuth: AuthBoundary = {
  configured: true,
  middleware: null,
  resolveUserId: (request) => request.header("x-test-user") ?? null,
};

beforeAll(async () => {
  client = new PGlite();
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

  const app = createApp({ auth: stubAuth, database: db });
  server = app.listen(0);
  await new Promise<void>((resolve) => {
    server!.once("listening", resolve);
  });

  const address = server!.address();
  if (address === null || typeof address === "string") {
    throw new Error("API test server did not expose a TCP port");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server?.close(() => resolve());
  });
  await client.close();
});

async function call(
  method: string,
  path: string,
  options: { readonly user?: string; readonly body?: unknown } = {},
): Promise<{ readonly status: number; readonly body: ApiBody }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(options.user === undefined ? {} : { "x-test-user": options.user }),
    },
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  });
  const body = apiBodySchema.parse(await response.json());
  return { status: response.status, body };
}

describe("class occurrence routes", () => {
  it("requires authentication", async () => {
    const response = await call(
      "POST",
      "/semesters/00000000-0000-0000-0000-000000000000/class-occurrences/generate",
    );
    expect(response.status).toBe(401);
  });

  it("returns 503 without a database", async () => {
    const app = createApp({ auth: stubAuth });
    const noDbServer = app.listen(0);
    await new Promise<void>((resolve) => noDbServer.once("listening", resolve));
    const address = noDbServer.address();
    const port =
      typeof address === "string" || address === null ? 0 : address.port;
    const response = await fetch(
      `http://127.0.0.1:${port}/semesters/00000000-0000-0000-0000-000000000000/class-occurrences/generate`,
      { method: "POST", headers: { "x-test-user": "u" } },
    );
    expect(response.status).toBe(503);
    await new Promise<void>((resolve) => noDbServer.close(() => resolve()));
  });

  it("generates occurrences for a semester", async () => {
    const userId = `user_${crypto.randomUUID()}`;
    await db.insert(schema.users).values({ id: userId });

    const semester = await createSemester(db, userId, {
      name: "Semester 1",
      academicYear: "2026-27",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
    });

    const subject = await createSubject(db, userId, semester.id, {
      name: "Physics",
    });

    await createTimetableSlot(db, userId, semester.id, {
      subjectId: subject.id,
      dayOfWeek: 3,
      startTime: "09:00",
      endTime: "10:00",
    });

    const generated = await call(
      "POST",
      `/semesters/${semester.id}/class-occurrences/generate`,
      {
        user: userId,
        body: { fromDate: "2026-07-01", toDate: "2026-07-31" },
      },
    );

    expect(generated.status).toBe(200);
    expect(generated.body.occurrences).toHaveLength(5);

    const listed = await call(
      "GET",
      `/semesters/${semester.id}/class-occurrences?from=2026-07-01&to=2026-07-31`,
      { user: userId },
    );
    expect(listed.status).toBe(200);
    expect(listed.body.occurrences).toHaveLength(5);
  });

  it("rejects an inverted range", async () => {
    const userId = `user_${crypto.randomUUID()}`;
    await db.insert(schema.users).values({ id: userId });

    const semester = await createSemester(db, userId, {
      name: "Semester 1",
      academicYear: "2026-27",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
    });

    const response = await call(
      "POST",
      `/semesters/${semester.id}/class-occurrences/generate`,
      {
        user: userId,
        body: { fromDate: "2026-07-10", toDate: "2026-07-01" },
      },
    );

    expect(response.status).toBe(422);
    expect(response.body.error?.code).toBe("validation_failed");
  });

  it("returns 404 for another user's semester", async () => {
    const owner = `user_${crypto.randomUUID()}`;
    const other = `user_${crypto.randomUUID()}`;
    await db.insert(schema.users).values([{ id: owner }, { id: other }]);

    const semester = await createSemester(db, owner, {
      name: "Semester 1",
      academicYear: "2026-27",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
    });

    const response = await call(
      "POST",
      `/semesters/${semester.id}/class-occurrences/generate`,
      { user: other, body: {} },
    );

    expect(response.status).toBe(404);
  });
});
