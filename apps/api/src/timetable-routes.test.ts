import type { Server } from "node:http";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { apiErrorSchema, timetableSlotSchema } from "@gpa/shared";
import { createApp } from "./app.js";
import { unconfiguredAuth, type AuthBoundary } from "./auth/session.js";
import * as schema from "./db/schema.js";
import { getTimetableSlot } from "./db/timetable-slot-repository.js";
import { createSemester } from "./db/semester-repository.js";
import { createSubject } from "./db/subject-repository.js";

/**
 * HTTP-level tests for the timetable slot endpoints.
 *
 * Authentication note, stated plainly: no Clerk instance or keys exist in
 * this environment, so `clerkMiddleware` itself is never executed here.
 * A stub boundary supplies the session instead. What is real and covered:
 * the guard order, ownership and semester scoping, validation, overlap
 * rejection, adjacency acceptance, archived-slot behaviour, and two-user
 * isolation through the same code path a request would use. Clerk's own
 * token verification remains unverified (D015).
 */

const MIGRATIONS_FOLDER = fileURLToPath(new URL("../drizzle", import.meta.url));

const apiBodySchema = z.object({
  error: apiErrorSchema.shape.error.optional(),
  slot: timetableSlotSchema.optional(),
  slots: z.array(timetableSlotSchema).optional(),
});

type ApiBody = z.infer<typeof apiBodySchema>;

let client: PGlite;
let db: PgliteDatabase<typeof schema>;
let server: Server;
let baseUrl: string;

/** Test double standing in for a verified Clerk session. */
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
  await client.exec(
    "truncate table timetable_slots, subjects, semesters, users cascade",
  );
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
  const body =
    response.status === 204
      ? ({} as ApiBody)
      : apiBodySchema.parse(await response.json());
  return { status: response.status, body };
}

async function createUser(label: string): Promise<string> {
  const id = `user_${label}_${crypto.randomUUID()}`;
  await db.insert(schema.users).values({ id });
  return id;
}

async function createSemesterFor(
  userId: string,
  options: {
    name?: string;
    startDate?: string | null;
    endDate?: string | null;
  } = {},
): Promise<string> {
  const semester = await createSemester(db, userId, {
    name: options.name ?? "Semester 1",
    academicYear: "2026-27",
    startDate: options.startDate ?? null,
    endDate: options.endDate ?? null,
  });

  return semester.id;
}

async function createDatedSemester(userId: string): Promise<string> {
  return createSemesterFor(userId, {
    startDate: "2026-07-01",
    endDate: "2026-12-15",
  });
}

async function createSubjectFor(
  userId: string,
  semesterId: string,
  name = "Physics",
) {
  return createSubject(db, userId, semesterId, { name });
}

function slotInput(subjectId: string) {
  return {
    subjectId,
    dayOfWeek: 1,
    startTime: "09:00",
    endTime: "10:00",
  };
}

describe("availability guards", () => {
  it("refuses every timetable route when sign-in is not configured", async () => {
    const app = createApp({ auth: unconfiguredAuth, database: db });
    const other = app.listen(0);
    await new Promise<void>((resolve) => other.once("listening", resolve));
    const address = other.address();

    if (address === null || typeof address === "string") {
      throw new Error("API test server did not expose a TCP port");
    }

    const url = `http://127.0.0.1:${address.port}`;

    for (const [method, path] of [
      [
        "GET",
        "/semesters/00000000-0000-4000-8000-000000000000/timetable-slots",
      ],
      [
        "POST",
        "/semesters/00000000-0000-4000-8000-000000000000/timetable-slots",
      ],
      [
        "GET",
        "/semesters/00000000-0000-4000-8000-000000000000/timetable-slots/00000000-0000-4000-8000-000000000000",
      ],
      [
        "PATCH",
        "/semesters/00000000-0000-4000-8000-000000000000/timetable-slots/00000000-0000-4000-8000-000000000000",
      ],
      [
        "DELETE",
        "/semesters/00000000-0000-4000-8000-000000000000/timetable-slots/00000000-0000-4000-8000-000000000000",
      ],
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

    const url = `http://127.0.0.1:${address.port}`;

    const response = await fetch(`${url}/semesters`, {
      headers: { "x-test-user": "user_any" },
    });

    expect(response.status).toBe(503);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe(
      "database_not_configured",
    );

    await new Promise<void>((resolve) => other.close(() => resolve()));
  });

  it("refuses a request with no session", async () => {
    const listed = await call(
      "GET",
      "/semesters/00000000-0000-4000-8000-000000000000/timetable-slots",
    );
    expect(listed.status).toBe(401);
    expect(listed.body.error?.code).toBe("unauthenticated");

    const created = await call("POST", "/semesters", { body: {} });
    expect(created.status).toBe(401);
  });
});

describe("timetable slot routes", () => {
  it("creates a slot for the signed-in owner only", async () => {
    const user = await createUser("owner");
    const semesterId = await createDatedSemester(user);
    const subject = await createSubjectFor(user, semesterId);

    const created = await call(
      "POST",
      `/semesters/${semesterId}/timetable-slots`,
      {
        user,
        body: slotInput(subject.id),
      },
    );

    expect(created.status).toBe(201);
    const slot = created.body.slot;
    expect(slot).toBeDefined();
    expect(slot?.subjectId).toBe(subject.id);
    expect(slot?.dayOfWeek).toBe(1);
    expect(slot?.startTime).toBe("09:00");
    expect(slot?.endTime).toBe("10:00");
    expect(slot?.archivedAt).toBeNull();
    expect(slot && "userId" in slot).toBe(false);
    expect(slot && "user_id" in slot).toBe(false);
  });

  it("rejects an invalid payload with per-field issues", async () => {
    const user = await createUser("owner");
    const semesterId = await createDatedSemester(user);
    const subject = await createSubjectFor(user, semesterId);

    const created = await call(
      "POST",
      `/semesters/${semesterId}/timetable-slots`,
      {
        user,
        body: {
          ...slotInput(subject.id),
          endTime: "08:00",
          dayOfWeek: 9,
        },
      },
    );

    expect(created.status).toBe(422);
    expect(created.body.error?.code).toBe("validation_failed");
    const paths = created.body.error?.issues?.map((issue) => issue.path) ?? [];
    expect(paths).toContain("endTime");
    expect(paths).toContain("dayOfWeek");
  });

  it("rejects a slot for a missing semester", async () => {
    const user = await createUser("owner");

    const created = await call(
      "POST",
      "/semesters/00000000-0000-4000-8000-000000000000/timetable-slots",
      { user, body: slotInput("00000000-0000-4000-8000-000000000000") },
    );

    expect(created.status).toBe(404);
    expect(created.body.error?.code).toBe("semester_not_found");
  });

  it("rejects a slot under a foreign semester", async () => {
    const alice = await createUser("alice");
    const bob = await createUser("bob");
    const semesterId = await createDatedSemester(alice);
    const subject = await createSubjectFor(alice, semesterId);

    const created = await call(
      "POST",
      `/semesters/${semesterId}/timetable-slots`,
      { user: bob, body: slotInput(subject.id) },
    );

    expect(created.status).toBe(404);
    expect(created.body.error?.code).toBe("semester_not_found");
  });

  it("rejects a slot whose subject is not in the semester", async () => {
    const user = await createUser("owner");
    const semesterId = await createDatedSemester(user);
    const otherSemesterId = await createDatedSemester(user);
    const subject = await createSubjectFor(user, otherSemesterId, "Chemistry");

    const created = await call(
      "POST",
      `/semesters/${semesterId}/timetable-slots`,
      {
        user,
        body: slotInput(subject.id),
      },
    );

    expect(created.status).toBe(404);
  });

  it("rejects a malformed subject id with a validation error", async () => {
    const user = await createUser("owner");
    const semesterId = await createDatedSemester(user);

    const created = await call(
      "POST",
      `/semesters/${semesterId}/timetable-slots`,
      {
        user,
        body: { ...slotInput("not-a-uuid") },
      },
    );

    expect(created.status).toBe(422);
    expect(created.body.error?.code).toBe("validation_failed");
  });

  it("lists only the live slots of the caller's semester", async () => {
    const alice = await createUser("alice");
    const bob = await createUser("bob");
    const semesterId = await createDatedSemester(alice);
    const subject = await createSubjectFor(alice, semesterId);

    await call("POST", `/semesters/${semesterId}/timetable-slots`, {
      user: alice,
      body: {
        ...slotInput(subject.id),
        dayOfWeek: 1,
        startTime: "09:00",
        endTime: "10:00",
      },
    });
    await call("POST", `/semesters/${semesterId}/timetable-slots`, {
      user: alice,
      body: {
        ...slotInput(subject.id),
        dayOfWeek: 3,
        startTime: "11:00",
        endTime: "12:00",
      },
    });
    await call("POST", `/semesters/${semesterId}/timetable-slots`, {
      user: bob,
      body: {
        ...slotInput(subject.id),
        dayOfWeek: 1,
        startTime: "09:00",
        endTime: "10:00",
      },
    });

    const listed = await call(
      "GET",
      `/semesters/${semesterId}/timetable-slots`,
      {
        user: alice,
      },
    );

    expect(listed.status).toBe(200);
    expect(listed.body.slots).toHaveLength(2);
    expect(listed.body.slots?.map((slot) => slot.dayOfWeek).sort()).toEqual([
      1, 3,
    ]);
  });

  it("reports a foreign semester's timetable as not found", async () => {
    const alice = await createUser("alice");
    const bob = await createUser("bob");
    const semesterId = await createDatedSemester(alice);

    const listed = await call(
      "GET",
      `/semesters/${semesterId}/timetable-slots`,
      {
        user: bob,
      },
    );

    expect(listed.status).toBe(404);
    expect(listed.body.error?.code).toBe("semester_not_found");
  });

  it("gets one live slot", async () => {
    const user = await createUser("owner");
    const semesterId = await createDatedSemester(user);
    const subject = await createSubjectFor(user, semesterId);

    const created = await call(
      "POST",
      `/semesters/${semesterId}/timetable-slots`,
      {
        user,
        body: slotInput(subject.id),
      },
    );
    const id = created.body.slot?.id;
    expect(id).toBeDefined();

    const read = await call(
      "GET",
      `/semesters/${semesterId}/timetable-slots/${id}`,
      {
        user,
      },
    );

    expect(read.status).toBe(200);
    expect(read.body.slot?.id).toBe(id);
    expect(read.body.slot?.subjectId).toBe(subject.id);
  });

  it("reads an archived slot by id", async () => {
    const user = await createUser("owner");
    const semesterId = await createDatedSemester(user);
    const subject = await createSubjectFor(user, semesterId);

    const [archived] = await db
      .insert(schema.timetableSlots)
      .values({
        semesterId,
        userId: user,
        subjectId: subject.id,
        dayOfWeek: 2,
        startTime: "09:00:00",
        endTime: "10:00:00",
        archivedAt: new Date(),
      })
      .returning();

    expect(archived).toBeDefined();

    const read = await call(
      "GET",
      `/semesters/${semesterId}/timetable-slots/${archived!.id}`,
      { user },
    );

    expect(read.status).toBe(200);
    expect(read.body.slot?.archivedAt).not.toBeNull();
  });

  it("does not list archived slots", async () => {
    const user = await createUser("owner");
    const semesterId = await createDatedSemester(user);
    const subject = await createSubjectFor(user, semesterId);

    await call("POST", `/semesters/${semesterId}/timetable-slots`, {
      user,
      body: slotInput(subject.id),
    });
    await db.insert(schema.timetableSlots).values({
      semesterId,
      userId: user,
      subjectId: subject.id,
      dayOfWeek: 4,
      startTime: "14:00:00",
      endTime: "15:00:00",
      archivedAt: new Date(),
    });

    const listed = await call(
      "GET",
      `/semesters/${semesterId}/timetable-slots`,
      {
        user,
      },
    );

    expect(listed.status).toBe(200);
    expect(listed.body.slots).toHaveLength(1);
  });

  it("reports a missing slot as not found", async () => {
    const user = await createUser("owner");
    const semesterId = await createDatedSemester(user);

    const read = await call(
      "GET",
      `/semesters/${semesterId}/timetable-slots/00000000-0000-4000-8000-000000000000`,
      { user },
    );

    expect(read.status).toBe(404);
    expect(read.body.error?.code).toBe("timetable_slot_not_found");
  });

  it("rejects a malformed slot id as not found", async () => {
    const user = await createUser("owner");
    const semesterId = await createDatedSemester(user);

    const read = await call(
      "GET",
      `/semesters/${semesterId}/timetable-slots/not-a-uuid`,
      { user },
    );

    expect(read.status).toBe(404);
    expect(read.body.error?.code).toBe("timetable_slot_not_found");
  });

  it("rejects a foreign slot as not found without revealing ownership", async () => {
    const alice = await createUser("alice");
    const bob = await createUser("bob");
    const semesterId = await createDatedSemester(alice);
    const subject = await createSubjectFor(alice, semesterId);

    const created = await call(
      "POST",
      `/semesters/${semesterId}/timetable-slots`,
      {
        user: alice,
        body: slotInput(subject.id),
      },
    );
    const id = created.body.slot?.id;
    expect(id).toBeDefined();

    const read = await call(
      "GET",
      `/semesters/${semesterId}/timetable-slots/${id}`,
      { user: bob },
    );

    expect(read.status).toBe(404);
    expect(read.body.error?.code).toBe("semester_not_found");
  });

  it("updates a slot", async () => {
    const user = await createUser("owner");
    const semesterId = await createDatedSemester(user);
    const subject = await createSubjectFor(user, semesterId);

    const created = await call(
      "POST",
      `/semesters/${semesterId}/timetable-slots`,
      {
        user,
        body: slotInput(subject.id),
      },
    );
    const id = created.body.slot?.id;
    expect(id).toBeDefined();

    const updated = await call(
      "PATCH",
      `/semesters/${semesterId}/timetable-slots/${id}`,
      { user, body: { dayOfWeek: 5, startTime: "13:00", endTime: "14:00" } },
    );

    expect(updated.status).toBe(200);
    expect(updated.body.slot?.dayOfWeek).toBe(5);
    expect(updated.body.slot?.startTime).toBe("13:00");
    expect(updated.body.slot?.endTime).toBe("14:00");
  });

  it("rejects an invalid patch with per-field issues", async () => {
    const user = await createUser("owner");
    const semesterId = await createDatedSemester(user);
    const subject = await createSubjectFor(user, semesterId);

    const created = await call(
      "POST",
      `/semesters/${semesterId}/timetable-slots`,
      {
        user,
        body: slotInput(subject.id),
      },
    );
    const id = created.body.slot?.id;
    expect(id).toBeDefined();

    const patched = await call(
      "PATCH",
      `/semesters/${semesterId}/timetable-slots/${id}`,
      { user, body: { endTime: "08:00" } },
    );

    expect(patched.status).toBe(422);
    expect(patched.body.error?.code).toBe("validation_failed");
    expect(patched.body.error?.issues?.map((issue) => issue.path)).toContain(
      "endTime",
    );
  });

  it("rejects an overlapping slot on creation", async () => {
    const user = await createUser("owner");
    const semesterId = await createDatedSemester(user);
    const subject = await createSubjectFor(user, semesterId);

    await call("POST", `/semesters/${semesterId}/timetable-slots`, {
      user,
      body: {
        ...slotInput(subject.id),
        dayOfWeek: 1,
        startTime: "09:00",
        endTime: "10:00",
      },
    });

    const overlapping = await call(
      "POST",
      `/semesters/${semesterId}/timetable-slots`,
      {
        user,
        body: {
          ...slotInput(subject.id),
          dayOfWeek: 1,
          startTime: "09:30",
          endTime: "10:30",
        },
      },
    );

    expect(overlapping.status).toBe(409);
    expect(overlapping.body.error?.code).toBe("timetable_slot_overlap");
  });

  it("accepts an adjacent slot on the same weekday", async () => {
    const user = await createUser("owner");
    const semesterId = await createDatedSemester(user);
    const subject = await createSubjectFor(user, semesterId);

    await call("POST", `/semesters/${semesterId}/timetable-slots`, {
      user,
      body: {
        ...slotInput(subject.id),
        dayOfWeek: 1,
        startTime: "09:00",
        endTime: "10:00",
      },
    });

    const adjacent = await call(
      "POST",
      `/semesters/${semesterId}/timetable-slots`,
      {
        user,
        body: {
          ...slotInput(subject.id),
          dayOfWeek: 1,
          startTime: "10:00",
          endTime: "11:00",
        },
      },
    );

    expect(adjacent.status).toBe(201);
  });

  it("allows updating a slot to its own previous time", async () => {
    const user = await createUser("owner");
    const semesterId = await createDatedSemester(user);
    const subject = await createSubjectFor(user, semesterId);

    const created = await call(
      "POST",
      `/semesters/${semesterId}/timetable-slots`,
      {
        user,
        body: {
          ...slotInput(subject.id),
          dayOfWeek: 2,
          startTime: "09:00",
          endTime: "10:00",
        },
      },
    );
    const id = created.body.slot?.id;
    expect(id).toBeDefined();

    const updated = await call(
      "PATCH",
      `/semesters/${semesterId}/timetable-slots/${id}`,
      { user, body: { room: "Room 101" } },
    );

    expect(updated.status).toBe(200);
    expect(updated.body.slot?.room).toBe("Room 101");
    expect(updated.body.slot?.startTime).toBe("09:00");
  });

  it("rejects an update that would overlap another slot", async () => {
    const user = await createUser("owner");
    const semesterId = await createDatedSemester(user);
    const subject = await createSubjectFor(user, semesterId);

    await call("POST", `/semesters/${semesterId}/timetable-slots`, {
      user,
      body: {
        ...slotInput(subject.id),
        dayOfWeek: 3,
        startTime: "09:00",
        endTime: "10:00",
      },
    });
    const created = await call(
      "POST",
      `/semesters/${semesterId}/timetable-slots`,
      {
        user,
        body: {
          ...slotInput(subject.id),
          dayOfWeek: 3,
          startTime: "11:00",
          endTime: "12:00",
        },
      },
    );
    const id = created.body.slot?.id;
    expect(id).toBeDefined();

    const overlapping = await call(
      "PATCH",
      `/semesters/${semesterId}/timetable-slots/${id}`,
      { user, body: { startTime: "09:30", endTime: "10:30" } },
    );

    expect(overlapping.status).toBe(409);
    expect(overlapping.body.error?.code).toBe("timetable_slot_overlap");
  });

  it("deletes a slot", async () => {
    const user = await createUser("owner");
    const semesterId = await createDatedSemester(user);
    const subject = await createSubjectFor(user, semesterId);

    const created = await call(
      "POST",
      `/semesters/${semesterId}/timetable-slots`,
      {
        user,
        body: slotInput(subject.id),
      },
    );
    const id = created.body.slot?.id;
    expect(id).toBeDefined();

    const deleted = await call(
      "DELETE",
      `/semesters/${semesterId}/timetable-slots/${id}`,
      {
        user,
      },
    );

    expect(deleted.status).toBe(204);

    const gone = await getTimetableSlot(db, user, semesterId, id ?? "");
    expect(gone).toBeNull();
  });

  it("rejects deleting a missing slot", async () => {
    const user = await createUser("owner");
    const semesterId = await createDatedSemester(user);

    const deleted = await call(
      "DELETE",
      `/semesters/${semesterId}/timetable-slots/00000000-0000-4000-8000-000000000000`,
      { user },
    );

    expect(deleted.status).toBe(404);
    expect(deleted.body.error?.code).toBe("timetable_slot_not_found");
  });

  it("rejects deleting a foreign slot", async () => {
    const alice = await createUser("alice");
    const bob = await createUser("bob");
    const semesterId = await createDatedSemester(alice);
    const subject = await createSubjectFor(alice, semesterId);

    const created = await call(
      "POST",
      `/semesters/${semesterId}/timetable-slots`,
      {
        user: alice,
        body: slotInput(subject.id),
      },
    );
    const id = created.body.slot?.id;
    expect(id).toBeDefined();

    const deleted = await call(
      "DELETE",
      `/semesters/${semesterId}/timetable-slots/${id}`,
      { user: bob },
    );

    expect(deleted.status).toBe(404);
    expect(deleted.body.error?.code).toBe("semester_not_found");

    const stillThere = await getTimetableSlot(db, alice, semesterId, id ?? "");
    expect(stillThere).not.toBeNull();
  });

  it("keeps two users' timetables isolated", async () => {
    const alice = await createUser("alice");
    const bob = await createUser("bob");
    const aliceSemester = await createDatedSemester(alice);
    const bobSemester = await createDatedSemester(bob);
    const aliceSubject = await createSubjectFor(
      alice,
      aliceSemester,
      "Alice Physics",
    );
    const bobSubject = await createSubjectFor(bob, bobSemester, "Bob Physics");

    await call("POST", `/semesters/${aliceSemester}/timetable-slots`, {
      user: alice,
      body: {
        ...slotInput(aliceSubject.id),
        dayOfWeek: 1,
        startTime: "09:00",
        endTime: "10:00",
      },
    });
    await call("POST", `/semesters/${bobSemester}/timetable-slots`, {
      user: bob,
      body: {
        ...slotInput(bobSubject.id),
        dayOfWeek: 1,
        startTime: "09:00",
        endTime: "10:00",
      },
    });

    const aliceListed = await call(
      "GET",
      `/semesters/${aliceSemester}/timetable-slots`,
      {
        user: alice,
      },
    );
    const bobListed = await call(
      "GET",
      `/semesters/${bobSemester}/timetable-slots`,
      {
        user: bob,
      },
    );

    expect(aliceListed.body.slots).toHaveLength(1);
    expect(bobListed.body.slots).toHaveLength(1);
  });
});
