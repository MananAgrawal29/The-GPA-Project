import type { Server } from "node:http";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  apiErrorSchema,
  dayExceptionSchema,
  dayExceptionSlotSchema,
} from "@gpa/shared";
import { createApp } from "./app.js";
import type { AuthBoundary } from "./auth/session.js";
import { createDayException } from "./db/day-exception-repository.js";
import {
  createDayExceptionSlot,
  deleteDayExceptionSlot,
} from "./db/day-exception-slot-repository.js";
import * as schema from "./db/schema.js";
import { createSemester } from "./db/semester-repository.js";
import { createSubject } from "./db/subject-repository.js";

/**
 * HTTP-level tests for the day-exception kind invariant (D033).
 *
 * Authentication note, stated plainly: no Clerk instance or keys exist in
 * this environment, so a stub boundary supplies the session. What is real
 * and covered: the repository guard runs on the PATCH path, a refused
 * transition surfaces as a 409 with a stable code, the stored exception and
 * its slots are unchanged, and the same transition succeeds once the slots
 * are gone.
 */

const MIGRATIONS_FOLDER = fileURLToPath(new URL("../drizzle", import.meta.url));

const apiBodySchema = z.object({
  error: apiErrorSchema.shape.error.optional(),
  exception: dayExceptionSchema.optional(),
  slot: dayExceptionSlotSchema.optional(),
  slots: z.array(dayExceptionSlotSchema).optional(),
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
  await client.exec(
    "truncate table day_exception_slots, day_exceptions, timetable_slots, subjects, semesters, users cascade",
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
  const body = apiBodySchema.parse(await response.json());
  return { status: response.status, body };
}

interface Fixture {
  readonly userId: string;
  readonly semesterId: string;
  readonly exceptionPath: string;
  readonly slotsPath: string;
  readonly exceptionId: string;
  readonly subjectId: string;
}

async function createFixture(kind: "special_schedule" | "holiday") {
  const userId = `user_${crypto.randomUUID()}`;
  await db.insert(schema.users).values({ id: userId });

  const semester = await createSemester(db, userId, {
    name: "Semester 1",
    academicYear: "2026-27",
    startDate: "2026-07-01",
    endDate: "2026-12-15",
  });

  const subject = await createSubject(db, userId, semester.id, {
    name: "Physics",
  });

  const exception = await createDayException(db, userId, semester.id, {
    date: "2026-11-10",
    kind,
  });

  return {
    userId,
    semesterId: semester.id,
    exceptionId: exception.id,
    subjectId: subject.id,
    exceptionPath: `/semesters/${semester.id}/day-exceptions/${exception.id}`,
    slotsPath: `/semesters/${semester.id}/day-exceptions/${exception.id}/slots`,
  } satisfies Fixture;
}

describe("day-exception kind invariant over HTTP", () => {
  it("refuses turning a special schedule with slots into a holiday", async () => {
    const fixture = await createFixture("special_schedule");

    const slot = await createDayExceptionSlot(
      db,
      fixture.userId,
      fixture.exceptionId,
      fixture.semesterId,
      { subjectId: fixture.subjectId, startTime: "09:00", endTime: "10:00" },
    );

    const patched = await call("PATCH", fixture.exceptionPath, {
      user: fixture.userId,
      body: { kind: "holiday" },
    });

    expect(patched.status).toBe(409);
    expect(patched.body.error?.code).toBe("day_exception_kind_conflict");
    expect(patched.body.error?.message).toMatch(/slots first/i);

    const stored = await call("GET", fixture.exceptionPath, {
      user: fixture.userId,
    });
    expect(stored.status).toBe(200);
    expect(stored.body.exception?.kind).toBe("special_schedule");

    const slots = await call("GET", fixture.slotsPath, {
      user: fixture.userId,
    });
    expect(slots.status).toBe(200);
    expect(slots.body.slots?.map((entry) => entry.id)).toEqual([slot.id]);
  });

  it("changes a special schedule into a holiday once its slots are deleted", async () => {
    const fixture = await createFixture("special_schedule");

    const slot = await createDayExceptionSlot(
      db,
      fixture.userId,
      fixture.exceptionId,
      fixture.semesterId,
      { subjectId: fixture.subjectId, startTime: "09:00", endTime: "10:00" },
    );

    const deleted = await deleteDayExceptionSlot(
      db,
      fixture.userId,
      fixture.exceptionId,
      fixture.semesterId,
      slot.id,
    );
    expect(deleted).toBe(true);

    const patched = await call("PATCH", fixture.exceptionPath, {
      user: fixture.userId,
      body: { kind: "holiday" },
    });

    expect(patched.status).toBe(200);
    expect(patched.body.exception?.kind).toBe("holiday");
  });

  it("keeps other partial updates working on a special schedule with slots", async () => {
    const fixture = await createFixture("special_schedule");

    await createDayExceptionSlot(
      db,
      fixture.userId,
      fixture.exceptionId,
      fixture.semesterId,
      { subjectId: fixture.subjectId, startTime: "09:00", endTime: "10:00" },
    );

    const patched = await call("PATCH", fixture.exceptionPath, {
      user: fixture.userId,
      body: { reason: "Convocation" },
    });

    expect(patched.status).toBe(200);
    expect(patched.body.exception?.kind).toBe("special_schedule");
    expect(patched.body.exception?.reason).toBe("Convocation");
  });
});

describe("day-exception shared-contract validation over HTTP", () => {
  it("accepts a well-formed create request", async () => {
    const fixture = await createFixture("holiday");

    const created = await call(
      "POST",
      `/semesters/${fixture.semesterId}/day-exceptions`,
      {
        user: fixture.userId,
        body: { date: "2026-11-20", kind: "special_schedule" },
      },
    );

    expect(created.status).toBe(201);
    expect(created.body.exception?.date).toBe("2026-11-20");
    expect(created.body.exception?.kind).toBe("special_schedule");
  });

  it.each(["2026-08-32", "2026-02-30", "20261110", "not-a-date"])(
    "rejects malformed create date %s with a date issue",
    async (date) => {
      const fixture = await createFixture("holiday");

      const created = await call(
        "POST",
        `/semesters/${fixture.semesterId}/day-exceptions`,
        { user: fixture.userId, body: { date, kind: "special_schedule" } },
      );

      expect(created.status).toBe(422);
      expect(created.body.error?.code).toBe("validation_failed");
      expect(created.body.error?.issues?.map((issue) => issue.path)).toContain(
        "date",
      );
    },
  );

  it("rejects a malformed date on update", async () => {
    const fixture = await createFixture("holiday");

    const patched = await call("PATCH", fixture.exceptionPath, {
      user: fixture.userId,
      body: { date: "2026-08-32" },
    });

    expect(patched.status).toBe(422);
    expect(patched.body.error?.code).toBe("validation_failed");
    expect(patched.body.error?.issues?.map((issue) => issue.path)).toContain(
      "date",
    );

    const stored = await call("GET", fixture.exceptionPath, {
      user: fixture.userId,
    });
    expect(stored.body.exception?.date).toBe("2026-11-10");
  });

  it.each([
    ["25:00", "26:00"],
    ["09:60", "10:00"],
    ["9am", "10am"],
    ["0900", "1000"],
  ])("rejects slot times %s-%s", async (startTime, endTime) => {
    const fixture = await createFixture("special_schedule");

    const created = await call("POST", fixture.slotsPath, {
      user: fixture.userId,
      body: { subjectId: fixture.subjectId, startTime, endTime },
    });

    expect(created.status).toBe(422);
    expect(created.body.error?.code).toBe("validation_failed");
    const paths = created.body.error?.issues?.map((issue) => issue.path) ?? [];
    expect(
      paths.some((path) => path === "startTime" || path === "endTime"),
    ).toBe(true);

    const slots = await call("GET", fixture.slotsPath, {
      user: fixture.userId,
    });
    expect(slots.body.slots).toEqual([]);
  });

  it("rejects a malformed time on slot update", async () => {
    const fixture = await createFixture("special_schedule");

    const slot = await createDayExceptionSlot(
      db,
      fixture.userId,
      fixture.exceptionId,
      fixture.semesterId,
      { subjectId: fixture.subjectId, startTime: "09:00", endTime: "10:00" },
    );

    const patched = await call("PATCH", `${fixture.slotsPath}/${slot.id}`, {
      user: fixture.userId,
      body: { startTime: "09:60" },
    });

    expect(patched.status).toBe(422);
    expect(patched.body.error?.code).toBe("validation_failed");

    const stored = await call("GET", `${fixture.slotsPath}/${slot.id}`, {
      user: fixture.userId,
    });
    expect(stored.body.slot?.startTime).toBe("09:00");
  });
});
