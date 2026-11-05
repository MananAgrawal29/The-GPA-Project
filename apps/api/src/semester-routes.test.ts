import type { Server } from "node:http";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  apiErrorSchema,
  healthResponseSchema,
  semesterSchema,
} from "@gpa/shared";
import { createApp } from "./app.js";
import {
  createAuthBoundary,
  unconfiguredAuth,
  type AuthBoundary,
} from "./auth/session.js";
import * as schema from "./db/schema.js";
import { getSemester } from "./db/semester-repository.js";

/**
 * HTTP-level tests for the first endpoints that touch user data.
 *
 * Authentication note, stated plainly: no Clerk instance or keys exist in
 * this environment, so `clerkMiddleware` itself is never executed here.
 * A stub boundary supplies the session instead. What is real and covered:
 * the guard order (configured -> database -> session), the fact that the
 * owner id comes from the session and from nowhere else, and the
 * isolation of two users through the same code path a request would use.
 * Clerk's own token verification remains unverified (D015).
 */

const MIGRATIONS_FOLDER = fileURLToPath(new URL("../drizzle", import.meta.url));

const apiBodySchema = z.object({
  error: apiErrorSchema.shape.error.optional(),
  semester: semesterSchema.optional(),
  semesters: z.array(semesterSchema).optional(),
});

type ApiBody = z.infer<typeof apiBodySchema>;

let client: PGlite;
let db: PgliteDatabase<typeof schema>;
let server: Server;
let baseUrl: string;

/**
 * Test double standing in for a verified Clerk session. Only this stub
 * reads the header; no application code accepts an owner id from a
 * request.
 */
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
  await client.exec("truncate table semesters, users cascade");
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

async function createUser(label: string): Promise<string> {
  const id = `user_${label}_${crypto.randomUUID()}`;
  await db.insert(schema.users).values({ id });
  return id;
}

const draft = {
  name: "Semester 1",
  academicYear: "2026-27",
} as const;

describe("availability guards", () => {
  it("keeps /health public and unchanged", async () => {
    const response = await fetch(`${baseUrl}/health`);

    expect(response.status).toBe(200);
    healthResponseSchema.parse(await response.json());
  });

  it("refuses every data route when sign-in is not configured", async () => {
    const app = createApp({ auth: unconfiguredAuth, database: db });
    const other = app.listen(0);
    await new Promise<void>((resolve) => other.once("listening", resolve));
    const address = other.address();

    if (address === null || typeof address === "string") {
      throw new Error("API test server did not expose a TCP port");
    }

    const url = `http://127.0.0.1:${address.port}`;

    for (const [method, path] of [
      ["GET", "/semesters"],
      ["POST", "/semesters"],
      ["GET", "/semesters/00000000-0000-4000-8000-000000000000"],
      ["PATCH", "/semesters/00000000-0000-4000-8000-000000000000"],
      ["POST", "/semesters/00000000-0000-4000-8000-000000000000/activate"],
    ] as const) {
      const response = await fetch(`${url}${path}`, {
        method,
        headers: { "content-type": "application/json" },
        ...(method === "GET" ? {} : { body: "{}" }),
      });

      expect(response.status).toBe(503);

      const body = apiErrorSchema.parse(await response.json());
      expect(body.error.code).toBe("auth_not_configured");
    }

    const rows = await client.query<{ count: string }>(
      "select count(*)::text as count from semesters",
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

    const response = await fetch(`http://127.0.0.1:${address.port}/semesters`, {
      headers: { "x-test-user": "user_any" },
    });

    expect(response.status).toBe(503);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe(
      "database_not_configured",
    );

    await new Promise<void>((resolve) => other.close(() => resolve()));
  });

  it("refuses a request with no session", async () => {
    const listed = await call("GET", "/semesters");
    expect(listed.status).toBe(401);
    expect(listed.body.error?.code).toBe("unauthenticated");

    const created = await call("POST", "/semesters", { body: draft });
    expect(created.status).toBe(401);
  });

  it("refuses an empty session header as unauthenticated", async () => {
    const response = await fetch(`${baseUrl}/semesters`, {
      headers: { "x-test-user": "" },
    });

    expect(response.status).toBe(401);
  });
});

describe("semester routes", () => {
  it("creates a semester for the signed-in owner only", async () => {
    const user = await createUser("owner");

    const created = await call("POST", "/semesters", { user, body: draft });

    expect(created.status).toBe(201);

    const semester = created.body.semester;
    expect(semester).toBeDefined();
    expect(semester?.name).toBe("Semester 1");
    expect(semester?.status).toBe("setup");

    // The record carries no owner field at all: an API consumer has no
    // way to ask for someone else's data.
    expect(semester && "userId" in semester).toBe(false);
    expect(semester && "user_id" in semester).toBe(false);
  });

  it("rejects an invalid payload with per-field issues", async () => {
    const user = await createUser("owner");

    const created = await call("POST", "/semesters", {
      user,
      body: {
        name: "   ",
        academicYear: "2026-27",
        startDate: "2026-07-01",
        endDate: "2026-06-30",
      },
    });

    expect(created.status).toBe(422);
    expect(created.body.error?.code).toBe("validation_failed");
    expect(created.body.error?.issues?.map((issue) => issue.path)).toContain(
      "name",
    );
    expect(created.body.error?.issues?.map((issue) => issue.path)).toContain(
      "endDate",
    );
  });

  it("lists only the caller's semesters", async () => {
    const alice = await createUser("alice");
    const bob = await createUser("bob");

    await call("POST", "/semesters", { user: alice, body: draft });
    await call("POST", "/semesters", {
      user: bob,
      body: { name: "Bob's semester", academicYear: "2026-27" },
    });

    const listed = await call("GET", "/semesters", { user: alice });

    expect(listed.status).toBe(200);
    expect(listed.body.semesters).toHaveLength(1);
    expect(listed.body.semesters?.[0]?.name).toBe("Semester 1");
  });

  it("reports another owner's semester as not found", async () => {
    const alice = await createUser("alice");
    const bob = await createUser("bob");

    const created = await call("POST", "/semesters", {
      user: alice,
      body: draft,
    });
    const id = created.body.semester?.id;
    expect(id).toBeDefined();

    const read = await call("GET", `/semesters/${id}`, { user: bob });
    expect(read.status).toBe(404);
    expect(read.body.error?.code).toBe("semester_not_found");
  });

  it("cannot modify another owner's semester", async () => {
    const alice = await createUser("alice");
    const bob = await createUser("bob");

    const created = await call("POST", "/semesters", {
      user: alice,
      body: draft,
    });
    const id = created.body.semester?.id;
    expect(id).toBeDefined();

    const patched = await call("PATCH", `/semesters/${id}`, {
      user: bob,
      body: { name: "Hijacked" },
    });

    expect(patched.status).toBe(404);

    const stored = await getSemester(db, alice, id ?? "");
    expect(stored?.name).toBe("Semester 1");
  });

  it("validates an edit before it reaches the database", async () => {
    const user = await createUser("owner");

    const created = await call("POST", "/semesters", {
      user,
      body: {
        ...draft,
        startDate: "2026-07-01",
        endDate: "2026-11-30",
      },
    });
    const id = created.body.semester?.id;
    expect(id).toBeDefined();

    const patched = await call("PATCH", `/semesters/${id}`, {
      user,
      body: { endDate: "2026-06-30" },
    });

    expect(patched.status).toBe(422);
    expect(patched.body.error?.issues?.[0]?.path).toBe("endDate");

    const stored = await getSemester(db, user, id ?? "");
    expect(stored?.endDate).toBe("2026-11-30");
  });

  it("treats a malformed id as not found rather than a server error", async () => {
    const user = await createUser("owner");

    const read = await call("GET", "/semesters/not-a-uuid", { user });
    expect(read.status).toBe(404);

    const activated = await call("POST", "/semesters/not-a-uuid/activate", {
      user,
      body: { demoteActiveTo: "archived" },
    });
    expect(activated.status).toBe(404);
  });

  it("reports a second active semester as a conflict", async () => {
    const user = await createUser("owner");

    await call("POST", "/semesters", {
      user,
      body: {
        ...draft,
        status: "active",
        startDate: "2026-07-01",
        endDate: "2026-11-30",
      },
    });

    const second = await call("POST", "/semesters", {
      user,
      body: {
        name: "Semester 2",
        academicYear: "2026-27",
        status: "active",
        startDate: "2027-01-05",
        endDate: "2027-05-30",
      },
    });

    expect(second.status).toBe(409);
    expect(second.body.error?.code).toBe("active_semester_conflict");
  });

  it("activates one semester and demotes the current one atomically", async () => {
    const user = await createUser("owner");

    const first = await call("POST", "/semesters", {
      user,
      body: {
        ...draft,
        status: "active",
        startDate: "2026-07-01",
        endDate: "2026-11-30",
      },
    });
    const second = await call("POST", "/semesters", {
      user,
      body: {
        name: "Semester 2",
        academicYear: "2026-27",
        startDate: "2027-01-05",
        endDate: "2027-05-30",
      },
    });

    const activated = await call(
      "POST",
      `/semesters/${second.body.semester?.id}/activate`,
      { user, body: { demoteActiveTo: "completed" } },
    );

    expect(activated.status).toBe(200);
    expect(activated.body.semester?.status).toBe("active");

    const listed = await call("GET", "/semesters", { user });
    const byId = new Map(
      (listed.body.semesters ?? []).map((semester) => [semester.id, semester]),
    );

    expect(byId.get(first.body.semester?.id ?? "")?.status).toBe("completed");
    expect(byId.get(second.body.semester?.id ?? "")?.status).toBe("active");
  });

  it("rejects an activation that does not say what the current one becomes", async () => {
    const user = await createUser("owner");

    const created = await call("POST", "/semesters", {
      user,
      body: {
        ...draft,
        startDate: "2026-07-01",
        endDate: "2026-11-30",
      },
    });
    const id = created.body.semester?.id;

    for (const body of [
      {},
      { demoteActiveTo: "active" },
      { demoteActiveTo: "finished" },
    ]) {
      const activated = await call("POST", `/semesters/${id}/activate`, {
        user,
        body,
      });

      expect(activated.status).toBe(422);
      expect(activated.body.error?.code).toBe("validation_failed");
    }

    const stored = await getSemester(db, user, id ?? "");
    expect(stored?.status).toBe("setup");
  });

  it("cannot activate another owner's semester", async () => {
    const alice = await createUser("alice");
    const bob = await createUser("bob");

    const created = await call("POST", "/semesters", {
      user: alice,
      body: {
        ...draft,
        startDate: "2026-07-01",
        endDate: "2026-11-30",
      },
    });
    const id = created.body.semester?.id;

    const activated = await call("POST", `/semesters/${id}/activate`, {
      user: bob,
      body: { demoteActiveTo: "archived" },
    });

    expect(activated.status).toBe(404);

    const stored = await getSemester(db, alice, id ?? "");
    expect(stored?.status).toBe("setup");
  });
});

describe("createAuthBoundary", () => {
  it("reports unconfigured and resolves nobody without both keys", () => {
    expect(createAuthBoundary({})).toMatchObject({
      configured: false,
      middleware: null,
    });

    expect(createAuthBoundary({ secretKey: "sk_test_x" })).toMatchObject({
      configured: false,
    });

    expect(createAuthBoundary({ publishableKey: "pk_test_x" })).toMatchObject({
      configured: false,
    });
  });
});
