import type { Server } from "node:http";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { apiErrorSchema, semesterSchema, subjectSchema } from "@gpa/shared";
import { createApp } from "./app.js";
import { unconfiguredAuth, type AuthBoundary } from "./auth/session.js";
import * as schema from "./db/schema.js";

/**
 * HTTP-level tests for the subject endpoints.
 *
 * Authentication note, stated plainly: no Clerk instance or keys exist in
 * this environment, so `clerkMiddleware` itself is never executed here.
 * A stub boundary supplies the session instead. What is real and covered:
 * the guard order (configured -> database -> session), the fact that the
 * owner id comes from the session and from nowhere else, and two-owner
 * isolation through the same code path a request would use. Clerk's own
 * token verification remains unverified (D025).
 */
const MIGRATIONS_FOLDER = fileURLToPath(new URL("../drizzle", import.meta.url));

const apiBodySchema = z.object({
  error: apiErrorSchema.shape.error.optional(),
  semester: semesterSchema.optional(),
  subject: subjectSchema.optional(),
  subjects: z.array(subjectSchema).optional(),
});

type ApiBody = z.infer<typeof apiBodySchema>;

let client: PGlite;
let db: PgliteDatabase<typeof schema>;
let server: Server;
let baseUrl: string;

const stubAuth: AuthBoundary = {
  configured: true,
  middleware: null,
  resolveUserId: (request) => request.header("x-test-user") ?? null,
};

beforeAll(async () => {
  client = new PGlite();
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

  server = createApp({ auth: stubAuth, database: db }).listen(0);
  await new Promise<void>((resolve) => {
    server.once("listening", resolve);
  });

  const address = server.address();

  if (address === null || typeof address === "string") {
    throw new Error("API test server did not expose a TCP port");
  }

  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
  await client.close();
});

afterEach(async () => {
  await client.exec("truncate table subjects, semesters, users cascade");
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

  const text = await response.text();
  const body =
    text === "" ? {} : apiBodySchema.parse(JSON.parse(text) as unknown);

  return { status: response.status, body };
}

async function createUser(label: string): Promise<string> {
  const id = `user_${label}_${crypto.randomUUID()}`;
  await db.insert(schema.users).values({ id });
  return id;
}

async function createSemesterFor(
  user: string,
  name = "Semester 1",
): Promise<string> {
  const created = await call("POST", "/semesters", {
    user,
    body: { name, academicYear: "2026-27" },
  });

  expect(created.status).toBe(201);

  const id = created.body.semester?.id;

  if (id === undefined) {
    throw new Error("Semester creation returned no id");
  }

  return id;
}

async function createSubjectFor(
  user: string,
  semesterId: string,
  name = "Physics",
): Promise<z.infer<typeof subjectSchema>> {
  const created = await call("POST", `/semesters/${semesterId}/subjects`, {
    user,
    body: { name },
  });

  expect(created.status).toBe(201);

  const subject = created.body.subject;

  if (subject === undefined) {
    throw new Error("Subject creation returned no subject");
  }

  return subject;
}

function subjectPath(semesterId: string, subjectId?: string): string {
  const base = `/semesters/${semesterId}/subjects`;
  return subjectId === undefined ? base : `${base}/${subjectId}`;
}

describe("availability guards", () => {
  it("refuses every subject route when sign-in is not configured", async () => {
    const app = createApp({ auth: unconfiguredAuth, database: db });
    const other = app.listen(0);
    await new Promise<void>((resolve) => other.once("listening", resolve));
    const address = other.address();

    if (address === null || typeof address === "string") {
      throw new Error("API test server did not expose a TCP port");
    }

    const url = `http://127.0.0.1:${address.port}`;
    const semesterId = "00000000-0000-4000-8000-000000000000";
    const subjectId = "00000000-0000-4000-8000-000000000001";

    for (const [method, path] of [
      ["GET", subjectPath(semesterId)],
      ["POST", subjectPath(semesterId)],
      ["GET", subjectPath(semesterId, subjectId)],
      ["PATCH", subjectPath(semesterId, subjectId)],
      ["DELETE", subjectPath(semesterId, subjectId)],
    ] as const) {
      const response = await fetch(`${url}${path}`, {
        method,
        headers: { "content-type": "application/json" },
        ...(method === "GET" || method === "DELETE" ? {} : { body: "{}" }),
      });

      expect(response.status).toBe(503);

      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe("auth_not_configured");
    }

    const rows = await client.query<{ count: string }>(
      "select count(*)::text as count from subjects",
    );
    expect(rows.rows[0]?.count).toBe("0");

    await new Promise<void>((resolve) => other.close(() => resolve()));
  });

  it("refuses when no database is configured", async () => {
    const app = createApp({ auth: stubAuth });
    const other = app.listen(0);
    await new Promise<void>((resolve) => other.once("listening", resolve));
    const address = other.address();

    if (address === null || typeof address === "string") {
      throw new Error("API test server did not expose a TCP port");
    }

    const response = await fetch(
      `http://127.0.0.1:${address.port}/semesters/00000000-0000-4000-8000-000000000000/subjects`,
      { headers: { "x-test-user": "user_any" } },
    );

    expect(response.status).toBe(503);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe(
      "database_not_configured",
    );

    await new Promise<void>((resolve) => other.close(() => resolve()));
  });

  it("refuses every subject route with no session", async () => {
    const semesterId = "00000000-0000-4000-8000-000000000000";
    const subjectId = "00000000-0000-4000-8000-000000000001";

    for (const [method, path] of [
      ["GET", subjectPath(semesterId)],
      ["POST", subjectPath(semesterId)],
      ["GET", subjectPath(semesterId, subjectId)],
      ["PATCH", subjectPath(semesterId, subjectId)],
      ["DELETE", subjectPath(semesterId, subjectId)],
    ] as const) {
      const result = await call(method, path, {
        ...(method === "GET" || method === "DELETE" ? {} : { body: {} }),
      });

      expect(result.status).toBe(401);
      expect(result.body.error?.code).toBe("unauthenticated");
    }
  });

  it("refuses an empty session header as unauthenticated", async () => {
    const response = await fetch(
      `${baseUrl}/semesters/00000000-0000-4000-8000-000000000000/subjects`,
      { headers: { "x-test-user": "" } },
    );

    expect(response.status).toBe(401);
  });
});

describe("subject routes", () => {
  it("creates a subject within an owned semester", async () => {
    const user = await createUser("owner");
    const semesterId = await createSemesterFor(user);

    const created = await call("POST", subjectPath(semesterId), {
      user,
      body: { name: "  Data Structures  " },
    });

    expect(created.status).toBe(201);
    expect(created.body.subject).toMatchObject({
      semesterId,
      name: "Data Structures",
    });
    expect(created.body.subject && "userId" in created.body.subject).toBe(
      false,
    );
    expect(created.body.subject && "user_id" in created.body.subject).toBe(
      false,
    );
  });

  it("rejects invalid payloads with per-field issues", async () => {
    const user = await createUser("owner");
    const semesterId = await createSemesterFor(user);

    for (const body of [
      {},
      { name: "" },
      { name: "   " },
      { name: "x".repeat(81) },
    ]) {
      const created = await call("POST", subjectPath(semesterId), {
        user,
        body,
      });

      expect(created.status).toBe(422);
      expect(created.body.error?.code).toBe("validation_failed");
      expect(created.body.error?.issues?.map((issue) => issue.path)).toContain(
        "name",
      );
    }

    const rows = await client.query<{ count: string }>(
      "select count(*)::text as count from subjects",
    );
    expect(rows.rows[0]?.count).toBe("0");
  });

  it("cannot be given an owner or semester through the body", async () => {
    const alice = await createUser("alice");
    const bob = await createUser("bob");
    const alicesSemester = await createSemesterFor(alice, "Semester 1");
    const otherSemester = await createSemesterFor(alice, "Semester 2");

    const created = await call("POST", subjectPath(alicesSemester), {
      user: alice,
      body: {
        name: "Physics",
        userId: bob,
        user_id: bob,
        ownerId: bob,
        semesterId: otherSemester,
      },
    });

    expect(created.status).toBe(201);

    const rows = await client.query<{
      user_id: string;
      semester_id: string;
    }>("select user_id, semester_id from subjects where name = 'Physics'");

    expect(rows.rows[0]).toEqual({
      user_id: alice,
      semester_id: alicesSemester,
    });
  });

  it("lists only the requested semester's subjects", async () => {
    const user = await createUser("owner");
    const firstSemester = await createSemesterFor(user, "Semester 1");
    const secondSemester = await createSemesterFor(user, "Semester 2");

    await createSubjectFor(user, firstSemester, "Physics");
    await createSubjectFor(user, firstSemester, "Algorithms");
    await createSubjectFor(user, secondSemester, "Chemistry");

    const listed = await call("GET", subjectPath(firstSemester), { user });

    expect(listed.status).toBe(200);
    expect(listed.body.subjects?.map((subject) => subject.name)).toEqual([
      "Algorithms",
      "Physics",
    ]);
  });

  it("returns an empty list for an owned semester with no subjects", async () => {
    const user = await createUser("owner");
    const semesterId = await createSemesterFor(user);

    const listed = await call("GET", subjectPath(semesterId), { user });

    expect(listed.status).toBe(200);
    expect(listed.body.subjects).toEqual([]);
  });

  it("reports another owner's semester as not found", async () => {
    const alice = await createUser("alice");
    const bob = await createUser("bob");
    const alicesSemester = await createSemesterFor(alice);
    const alicesSubject = await createSubjectFor(
      alice,
      alicesSemester,
      "Physics",
    );

    const listed = await call("GET", subjectPath(alicesSemester), {
      user: bob,
    });
    expect(listed.status).toBe(404);
    expect(listed.body.error?.code).toBe("semester_not_found");

    const created = await call("POST", subjectPath(alicesSemester), {
      user: bob,
      body: { name: "Hijacked" },
    });
    expect(created.status).toBe(404);

    const patched = await call(
      "PATCH",
      subjectPath(alicesSemester, alicesSubject.id),
      { user: bob, body: { name: "Hijacked" } },
    );
    expect(patched.status).toBe(404);

    const deleted = await call(
      "DELETE",
      subjectPath(alicesSemester, alicesSubject.id),
      { user: bob },
    );
    expect(deleted.status).toBe(404);

    const rows = await client.query<{ count: string; name: string }>(
      "select count(*)::text as count, max(name) as name from subjects",
    );
    expect(rows.rows[0]?.count).toBe("1");
    expect(rows.rows[0]?.name).toBe("Physics");
  });

  it("reports a missing semester as not found", async () => {
    const user = await createUser("owner");
    const missingSemester = crypto.randomUUID();

    const listed = await call("GET", subjectPath(missingSemester), { user });
    expect(listed.status).toBe(404);
    expect(listed.body.error?.code).toBe("semester_not_found");

    const created = await call("POST", subjectPath(missingSemester), {
      user,
      body: { name: "Physics" },
    });
    expect(created.status).toBe(404);
  });

  it("treats a malformed semester id as not found", async () => {
    const user = await createUser("owner");

    for (const [method, path, body] of [
      ["GET", "/semesters/not-a-uuid/subjects", undefined],
      ["POST", "/semesters/not-a-uuid/subjects", { name: "Physics" }],
    ] as const) {
      const result = await call(method, path, {
        user,
        ...(body === undefined ? {} : { body }),
      });

      expect(result.status).toBe(404);
      expect(result.body.error?.code).toBe("semester_not_found");
    }
  });

  it("reads one subject from its semester", async () => {
    const user = await createUser("owner");
    const semesterId = await createSemesterFor(user);
    const subject = await createSubjectFor(user, semesterId, "Physics");

    const read = await call("GET", subjectPath(semesterId, subject.id), {
      user,
    });

    expect(read.status).toBe(200);
    expect(read.body.subject).toEqual(subject);
  });

  it("reports another owner's subject as not found", async () => {
    const alice = await createUser("alice");
    const bob = await createUser("bob");
    const alicesSemester = await createSemesterFor(alice);
    const alicesSubject = await createSubjectFor(
      alice,
      alicesSemester,
      "Physics",
    );

    const read = await call(
      "GET",
      subjectPath(alicesSemester, alicesSubject.id),
      { user: bob },
    );

    expect(read.status).toBe(404);
    expect(read.body.error?.code).toBe("subject_not_found");
  });

  it("reports a subject under a different semester as not found", async () => {
    const user = await createUser("owner");
    const firstSemester = await createSemesterFor(user, "Semester 1");
    const secondSemester = await createSemesterFor(user, "Semester 2");
    const subject = await createSubjectFor(user, firstSemester, "Physics");

    const read = await call("GET", subjectPath(secondSemester, subject.id), {
      user,
    });

    expect(read.status).toBe(404);
    expect(read.body.error?.code).toBe("subject_not_found");
  });

  it("treats a malformed subject id as not found", async () => {
    const user = await createUser("owner");
    const semesterId = await createSemesterFor(user);
    const path = subjectPath(semesterId, "not-a-uuid");

    for (const [method, body] of [
      ["GET", undefined],
      ["PATCH", { name: "Physics" }],
      ["DELETE", undefined],
    ] as const) {
      const result = await call(method, path, {
        user,
        ...(body === undefined ? {} : { body }),
      });

      expect(result.status).toBe(404);
      expect(result.body.error?.code).toBe("subject_not_found");
    }
  });

  it("updates a subject within its semester", async () => {
    const user = await createUser("owner");
    const semesterId = await createSemesterFor(user);
    const subject = await createSubjectFor(user, semesterId, "Physics");

    const patched = await call("PATCH", subjectPath(semesterId, subject.id), {
      user,
      body: { name: "  Applied Physics  ", userId: "user_attacker" },
    });

    expect(patched.status).toBe(200);
    expect(patched.body.subject?.name).toBe("Applied Physics");

    const rows = await client.query<{ user_id: string; name: string }>(
      "select user_id, name from subjects where id = $1",
      [subject.id],
    );
    expect(rows.rows[0]).toEqual({
      user_id: user,
      name: "Applied Physics",
    });
  });

  it("treats an empty patch as a no-op", async () => {
    const user = await createUser("owner");
    const semesterId = await createSemesterFor(user);
    const subject = await createSubjectFor(user, semesterId, "Physics");

    const patched = await call("PATCH", subjectPath(semesterId, subject.id), {
      user,
      body: {},
    });

    expect(patched.status).toBe(200);
    expect(patched.body.subject).toEqual(subject);
  });

  it("rejects an invalid subject name on update", async () => {
    const user = await createUser("owner");
    const semesterId = await createSemesterFor(user);
    const subject = await createSubjectFor(user, semesterId, "Physics");

    const patched = await call("PATCH", subjectPath(semesterId, subject.id), {
      user,
      body: { name: "   " },
    });

    expect(patched.status).toBe(422);
    expect(patched.body.error?.code).toBe("validation_failed");
    expect(patched.body.error?.issues?.[0]?.path).toBe("name");

    const stored = await call("GET", subjectPath(semesterId, subject.id), {
      user,
    });
    expect(stored.body.subject?.name).toBe("Physics");
  });

  it("deletes a subject and reports it as gone afterwards", async () => {
    const user = await createUser("owner");
    const semesterId = await createSemesterFor(user);
    const subject = await createSubjectFor(user, semesterId, "Physics");

    const deleted = await call("DELETE", subjectPath(semesterId, subject.id), {
      user,
    });
    expect(deleted.status).toBe(204);

    const read = await call("GET", subjectPath(semesterId, subject.id), {
      user,
    });
    expect(read.status).toBe(404);
    expect(read.body.error?.code).toBe("subject_not_found");

    const again = await call("DELETE", subjectPath(semesterId, subject.id), {
      user,
    });
    expect(again.status).toBe(404);
  });

  it("allows the same name in different semesters", async () => {
    const user = await createUser("owner");
    const firstSemester = await createSemesterFor(user, "Semester 1");
    const secondSemester = await createSemesterFor(user, "Semester 2");

    await createSubjectFor(user, firstSemester, "Engineering Mathematics");
    await createSubjectFor(user, secondSemester, "Engineering Mathematics");

    const first = await call("GET", subjectPath(firstSemester), { user });
    const second = await call("GET", subjectPath(secondSemester), { user });

    expect(first.body.subjects).toHaveLength(1);
    expect(second.body.subjects).toHaveLength(1);
  });

  it("allows duplicate names within one semester", async () => {
    const user = await createUser("owner");
    const semesterId = await createSemesterFor(user);

    await createSubjectFor(user, semesterId, "Physics");
    await createSubjectFor(user, semesterId, "Physics");

    const listed = await call("GET", subjectPath(semesterId), { user });

    expect(listed.body.subjects).toHaveLength(2);
  });
});
