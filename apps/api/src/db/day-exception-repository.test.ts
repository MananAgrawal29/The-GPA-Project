import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  DayExceptionConflictError,
  DayExceptionDateBoundsError,
  DayExceptionKindConflictError,
  DayExceptionOwnershipError,
  DayExceptionValidationError,
} from "../domain/day-exception-repository.js";
import * as schema from "./schema.js";
import { createSemester } from "./semester-repository.js";
import {
  createDayException,
  deleteDayException,
  getDayException,
  listDayExceptions,
  updateDayException,
} from "./day-exception-repository.js";

const MIGRATIONS_FOLDER = fileURLToPath(
  new URL("../../drizzle", import.meta.url),
);

let client: PGlite;
let db: PgliteDatabase<typeof schema>;

beforeAll(async () => {
  client = new PGlite();
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
});

afterAll(async () => {
  await client.close();
});

beforeEach(async () => {
  await client.exec(
    "truncate table day_exception_slots, day_exceptions, timetable_slots, subjects, semesters, users cascade",
  );
});

async function createUser(): Promise<string> {
  const id = `user_${crypto.randomUUID()}`;
  await db.insert(schema.users).values({ id });
  return id;
}

async function createSemesterWithDates(
  db: PgliteDatabase<typeof schema>,
  userId: string,
  startDate: string,
  endDate: string,
  options?: { status?: "setup" | "active" | "completed" | "archived" },
): Promise<string> {
  const sem = await createSemester(db, userId, {
    name: "Test Semester",
    academicYear: "2024-2025",
    startDate,
    endDate,
    status: options?.status ?? "setup",
  });
  return sem.id;
}

describe("day-exception repository", () => {
  let userId: string;
  let semesterId: string;
  const SEMESTER_START = "2026-01-15";
  const SEMESTER_END = "2026-05-30";

  beforeEach(async () => {
    userId = await createUser();
    semesterId = await createSemesterWithDates(
      db,
      userId,
      SEMESTER_START,
      SEMESTER_END,
    );
  });

  describe("createDayException", () => {
    it("creates a holiday", async () => {
      const exception = await createDayException(db, userId, semesterId, {
        date: "2026-02-14",
        kind: "holiday",
        reason: "Valentine's Day",
      });

      expect(exception).toMatchObject({
        semesterId,
        userId,
        date: "2026-02-14",
        kind: "holiday",
        reason: "Valentine's Day",
      });
      expect(exception.id).toBeDefined();
      expect(exception.createdAt).toBeDefined();
      expect(exception.updatedAt).toBeDefined();
    });

    it("creates a special_schedule", async () => {
      const exception = await createDayException(db, userId, semesterId, {
        date: "2026-03-01",
        kind: "special_schedule",
      });

      expect(exception.kind).toBe("special_schedule");
      expect(exception.reason).toBeUndefined();
    });

    it("rejects unsupported exception kinds", async () => {
      await expect(
        createDayException(db, userId, semesterId, {
          date: "2026-02-14",
          kind: "invalid_kind",
        }),
      ).rejects.toThrow(DayExceptionValidationError);
    });

    it("rejects missing date", async () => {
      await expect(
        createDayException(db, userId, semesterId, {
          kind: "holiday",
        }),
      ).rejects.toThrow(DayExceptionValidationError);
    });

    it("rejects missing kind", async () => {
      await expect(
        createDayException(db, userId, semesterId, {
          date: "2026-02-14",
        }),
      ).rejects.toThrow(DayExceptionValidationError);
    });

    it("rejects reason longer than 200 characters", async () => {
      const longReason = "a".repeat(201);
      await expect(
        createDayException(db, userId, semesterId, {
          date: "2026-02-14",
          kind: "holiday",
          reason: longReason,
        }),
      ).rejects.toThrow(DayExceptionValidationError);
    });

    it("accepts reason exactly 200 characters", async () => {
      const maxReason = "a".repeat(200);
      const exception = await createDayException(db, userId, semesterId, {
        date: "2026-02-14",
        kind: "holiday",
        reason: maxReason,
      });
      expect(exception.reason).toBe(maxReason);
    });

    it("rejects date before semester start", async () => {
      await expect(
        createDayException(db, userId, semesterId, {
          date: "2026-01-10",
          kind: "holiday",
        }),
      ).rejects.toThrow(DayExceptionDateBoundsError);
    });

    it("rejects date after semester end", async () => {
      await expect(
        createDayException(db, userId, semesterId, {
          date: "2026-06-01",
          kind: "holiday",
        }),
      ).rejects.toThrow(DayExceptionDateBoundsError);
    });

    it("accepts date exactly on semester start", async () => {
      const exception = await createDayException(db, userId, semesterId, {
        date: SEMESTER_START,
        kind: "holiday",
      });
      expect(exception.date).toBe(SEMESTER_START);
    });

    it("accepts date exactly on semester end", async () => {
      const exception = await createDayException(db, userId, semesterId, {
        date: SEMESTER_END,
        kind: "holiday",
      });
      expect(exception.date).toBe(SEMESTER_END);
    });

    it("rejects duplicate date for same semester", async () => {
      await createDayException(db, userId, semesterId, {
        date: "2026-02-14",
        kind: "holiday",
      });

      await expect(
        createDayException(db, userId, semesterId, {
          date: "2026-02-14",
          kind: "special_schedule",
        }),
      ).rejects.toThrow(DayExceptionValidationError);
    });

    it("rejects operations for semester owned by another user", async () => {
      const otherUserId = await createUser();
      await expect(
        createDayException(db, otherUserId, semesterId, {
          date: "2026-02-14",
          kind: "holiday",
        }),
      ).rejects.toThrow(DayExceptionOwnershipError);
    });

    it("rejects operations for non-existent semester", async () => {
      await expect(
        createDayException(db, userId, "00000000-0000-0000-0000-000000000000", {
          date: "2026-02-14",
          kind: "holiday",
        }),
      ).rejects.toThrow(DayExceptionOwnershipError);
    });

    it("trims reason whitespace", async () => {
      const exception = await createDayException(db, userId, semesterId, {
        date: "2026-02-14",
        kind: "holiday",
        reason: "  Valentine's Day  ",
      });
      expect(exception.reason).toBe("Valentine's Day");
    });
  });

  describe("listDayExceptions", () => {
    it("lists exceptions within the correct semester ordered by date", async () => {
      await createDayException(db, userId, semesterId, {
        date: "2026-03-01",
        kind: "holiday",
      });
      await createDayException(db, userId, semesterId, {
        date: "2026-02-14",
        kind: "holiday",
      });
      await createDayException(db, userId, semesterId, {
        date: "2026-04-01",
        kind: "special_schedule",
      });

      const exceptions = await listDayExceptions(db, userId, semesterId);

      expect(exceptions).toHaveLength(3);
      expect(exceptions[0]!.date).toBe("2026-02-14");
      expect(exceptions[1]!.date).toBe("2026-03-01");
      expect(exceptions[2]!.date).toBe("2026-04-01");
    });

    it("returns empty array for semester with no exceptions", async () => {
      const exceptions = await listDayExceptions(db, userId, semesterId);
      expect(exceptions).toEqual([]);
    });

    it("does not return exceptions from another semester", async () => {
      const otherSemesterId = await createSemesterWithDates(
        db,
        userId,
        "2026-09-01",
        "2026-12-15",
        { status: "setup" },
      );
      await createDayException(db, userId, semesterId, {
        date: "2026-02-14",
        kind: "holiday",
      });
      await createDayException(db, userId, otherSemesterId, {
        date: "2026-10-15",
        kind: "holiday",
      });

      const exceptions = await listDayExceptions(db, userId, semesterId);
      expect(exceptions).toHaveLength(1);
      expect(exceptions[0]!.date).toBe("2026-02-14");
    });

    it("does not return exceptions owned by another user", async () => {
      const otherUserId = await createUser();
      const otherSemesterId = await createSemesterWithDates(
        db,
        otherUserId,
        "2026-01-15",
        "2026-05-30",
        { status: "setup" },
      );
      await createDayException(db, userId, semesterId, {
        date: "2026-02-14",
        kind: "holiday",
      });
      await createDayException(db, otherUserId, otherSemesterId, {
        date: "2026-02-14",
        kind: "holiday",
      });

      const exceptions = await listDayExceptions(db, userId, semesterId);
      expect(exceptions).toHaveLength(1);
    });
  });

  describe("getDayException", () => {
    it("retrieves an exception within its semester", async () => {
      const created = await createDayException(db, userId, semesterId, {
        date: "2026-02-14",
        kind: "holiday",
        reason: "Valentine's Day",
      });

      const exception = await getDayException(
        db,
        userId,
        semesterId,
        created.id,
      );

      expect(exception).not.toBeNull();
      expect(exception?.id).toBe(created.id);
      expect(exception?.date).toBe("2026-02-14");
      expect(exception?.reason).toBe("Valentine's Day");
    });

    it("returns null for non-existent exception", async () => {
      const exception = await getDayException(
        db,
        userId,
        semesterId,
        "00000000-0000-0000-0000-000000000000",
      );
      expect(exception).toBeNull();
    });

    it("rejects retrieval from another semester", async () => {
      const created = await createDayException(db, userId, semesterId, {
        date: "2026-02-14",
        kind: "holiday",
      });

      const otherSemesterId = await createSemesterWithDates(
        db,
        userId,
        "2026-09-01",
        "2026-12-15",
        { status: "setup" },
      );

      const exception = await getDayException(
        db,
        userId,
        otherSemesterId,
        created.id,
      );
      expect(exception).toBeNull();
    });

    it("rejects operations for a semester owned by another user", async () => {
      const created = await createDayException(db, userId, semesterId, {
        date: "2026-02-14",
        kind: "holiday",
      });

      const otherUserId = await createUser();
      const exception = await getDayException(
        db,
        otherUserId,
        semesterId,
        created.id,
      );
      expect(exception).toBeNull();
    });
  });

  describe("updateDayException", () => {
    it("updates supported fields", async () => {
      const created = await createDayException(db, userId, semesterId, {
        date: "2026-02-14",
        kind: "holiday",
        reason: "Original reason",
      });

      const updated = await updateDayException(
        db,
        userId,
        semesterId,
        created.id,
        {
          reason: "Updated reason",
        },
      );

      expect(updated).not.toBeNull();
      expect(updated?.reason).toBe("Updated reason");
      expect(updated?.date).toBe("2026-02-14");
      expect(updated?.kind).toBe("holiday");
    });

    it("preserves omitted fields during partial updates", async () => {
      const created = await createDayException(db, userId, semesterId, {
        date: "2026-02-14",
        kind: "holiday",
        reason: "Original reason",
      });

      const updated = await updateDayException(
        db,
        userId,
        semesterId,
        created.id,
        {
          kind: "special_schedule",
        },
      );

      expect(updated?.kind).toBe("special_schedule");
      expect(updated?.reason).toBe("Original reason");
      expect(updated?.date).toBe("2026-02-14");
    });

    it("updates date within semester bounds", async () => {
      const created = await createDayException(db, userId, semesterId, {
        date: "2026-02-14",
        kind: "holiday",
      });

      const updated = await updateDayException(
        db,
        userId,
        semesterId,
        created.id,
        {
          date: "2026-03-01",
        },
      );

      expect(updated?.date).toBe("2026-03-01");
    });

    it("rejects date before semester start", async () => {
      const created = await createDayException(db, userId, semesterId, {
        date: "2026-02-14",
        kind: "holiday",
      });

      await expect(
        updateDayException(db, userId, semesterId, created.id, {
          date: "2026-01-10",
        }),
      ).rejects.toThrow(DayExceptionDateBoundsError);
    });

    it("rejects date after semester end", async () => {
      const created = await createDayException(db, userId, semesterId, {
        date: "2026-02-14",
        kind: "holiday",
      });

      await expect(
        updateDayException(db, userId, semesterId, created.id, {
          date: "2026-06-01",
        }),
      ).rejects.toThrow(DayExceptionDateBoundsError);
    });

    it("accepts date exactly on semester boundaries", async () => {
      const created = await createDayException(db, userId, semesterId, {
        date: "2026-02-14",
        kind: "holiday",
      });

      const updated = await updateDayException(
        db,
        userId,
        semesterId,
        created.id,
        {
          date: SEMESTER_START,
        },
      );
      expect(updated?.date).toBe(SEMESTER_START);
    });

    it("rejects invalid exception kinds", async () => {
      const created = await createDayException(db, userId, semesterId, {
        date: "2026-02-14",
        kind: "holiday",
      });

      await expect(
        updateDayException(db, userId, semesterId, created.id, {
          kind: "invalid_kind",
        }),
      ).rejects.toThrow(DayExceptionValidationError);
    });

    it("rejects reason longer than 200 characters", async () => {
      const created = await createDayException(db, userId, semesterId, {
        date: "2026-02-14",
        kind: "holiday",
      });

      await expect(
        updateDayException(db, userId, semesterId, created.id, {
          reason: "a".repeat(201),
        }),
      ).rejects.toThrow(DayExceptionValidationError);
    });

    it("rejects duplicate date for same semester", async () => {
      await createDayException(db, userId, semesterId, {
        date: "2026-03-01",
        kind: "holiday",
      });

      const created = await createDayException(db, userId, semesterId, {
        date: "2026-02-14",
        kind: "holiday",
      });

      await expect(
        updateDayException(db, userId, semesterId, created.id, {
          date: "2026-03-01",
        }),
      ).rejects.toThrow(DayExceptionValidationError);
    });

    it("allows updating to the same date (no conflict)", async () => {
      const created = await createDayException(db, userId, semesterId, {
        date: "2026-02-14",
        kind: "holiday",
      });

      const updated = await updateDayException(
        db,
        userId,
        semesterId,
        created.id,
        {
          reason: "Updated reason",
        },
      );

      expect(updated?.date).toBe("2026-02-14");
    });

    it("rejects operations for a semester owned by another user", async () => {
      const created = await createDayException(db, userId, semesterId, {
        date: "2026-02-14",
        kind: "holiday",
      });

      const otherUserId = await createUser();

      const updated = await updateDayException(
        db,
        otherUserId,
        semesterId,
        created.id,
        {
          reason: "Should fail",
        },
      );
      expect(updated).toBeNull();
    });

    it("returns null for missing or out-of-scope exceptions", async () => {
      const updated = await updateDayException(
        db,
        userId,
        semesterId,
        "00000000-0000-0000-0000-000000000000",
        { reason: "Should fail" },
      );
      expect(updated).toBeNull();
    });

    it("preserves omitted fields during partial updates", async () => {
      const created = await createDayException(db, userId, semesterId, {
        date: "2026-02-14",
        kind: "holiday",
        reason: "Original reason",
      });

      // Empty update should return the existing record
      const updated = await updateDayException(
        db,
        userId,
        semesterId,
        created.id,
        {},
      );

      expect(updated?.id).toBe(created.id);
      expect(updated?.reason).toBe("Original reason");
    });
  });

  describe("deleteDayException", () => {
    it("deletes an exception without dependent slots", async () => {
      const created = await createDayException(db, userId, semesterId, {
        date: "2026-02-14",
        kind: "holiday",
      });

      const deleted = await deleteDayException(
        db,
        userId,
        semesterId,
        created.id,
      );

      expect(deleted).toBe(true);

      const exception = await getDayException(
        db,
        userId,
        semesterId,
        created.id,
      );
      expect(exception).toBeNull();
    });

    it("returns false for non-existent exception", async () => {
      const deleted = await deleteDayException(
        db,
        userId,
        semesterId,
        "00000000-0000-0000-0000-000000000000",
      );
      expect(deleted).toBe(false);
    });

    it("rejects operations for a semester owned by another user", async () => {
      const created = await createDayException(db, userId, semesterId, {
        date: "2026-02-14",
        kind: "holiday",
      });

      const otherUserId = await createUser();
      const deleted = await deleteDayException(
        db,
        otherUserId,
        semesterId,
        created.id,
      );
      expect(deleted).toBe(false);
    });

    it("rejects operations for another semester", async () => {
      const created = await createDayException(db, userId, semesterId, {
        date: "2026-02-14",
        kind: "holiday",
      });

      const otherSemesterId = await createSemesterWithDates(
        db,
        userId,
        "2026-09-01",
        "2026-12-15",
        { status: "setup" },
      );

      const deleted = await deleteDayException(
        db,
        userId,
        otherSemesterId,
        created.id,
      );
      expect(deleted).toBe(false);
    });
  });
});

describe("day-exception repository: dependent slot deletion conflict", () => {
  let userId: string;
  let semesterId: string;
  const SEMESTER_START = "2026-01-15";
  const SEMESTER_END = "2026-05-30";

  beforeEach(async () => {
    userId = await createUser();
    semesterId = await createSemesterWithDates(
      db,
      userId,
      SEMESTER_START,
      SEMESTER_END,
    );
  });

  it("returns a stable conflict when dependent slots prevent deletion", async () => {
    // Create a special_schedule exception
    const exception = await createDayException(db, userId, semesterId, {
      date: "2026-02-14",
      kind: "special_schedule",
    });

    // Create a subject for the slot
    const subject = await db
      .insert(schema.subjects)
      .values({
        userId,
        semesterId,
        name: "Test Subject",
      })
      .returning();

    // Create a dependent slot
    await db.insert(schema.dayExceptionSlots).values({
      exceptionId: exception.id,
      semesterId,
      userId,
      subjectId: subject[0]!.id,
      startTime: "10:00",
      endTime: "11:00",
      classType: "lecture",
    });

    // Attempt to delete the exception - should fail with conflict
    await expect(
      deleteDayException(db, userId, semesterId, exception.id),
    ).rejects.toThrow(DayExceptionConflictError);
  });

  it("refuses turning a special schedule with slots into a holiday", async () => {
    const exception = await createDayException(db, userId, semesterId, {
      date: "2026-02-14",
      kind: "special_schedule",
    });

    const subject = await db
      .insert(schema.subjects)
      .values({ userId, semesterId, name: "Test Subject" })
      .returning();

    await db.insert(schema.dayExceptionSlots).values({
      exceptionId: exception.id,
      semesterId,
      userId,
      subjectId: subject[0]!.id,
      startTime: "10:00",
      endTime: "11:00",
      classType: "lecture",
    });

    await expect(
      updateDayException(db, userId, semesterId, exception.id, {
        kind: "holiday",
      }),
    ).rejects.toThrow(DayExceptionKindConflictError);

    // The exception stays a special schedule and its slot is not cascaded away.
    const stored = await getDayException(db, userId, semesterId, exception.id);
    expect(stored?.kind).toBe("special_schedule");

    const remainingSlots = await db
      .select({ id: schema.dayExceptionSlots.id })
      .from(schema.dayExceptionSlots)
      .where(eq(schema.dayExceptionSlots.exceptionId, exception.id));
    expect(remainingSlots).toHaveLength(1);
  });

  it("turns a special schedule without slots into a holiday", async () => {
    const exception = await createDayException(db, userId, semesterId, {
      date: "2026-03-01",
      kind: "special_schedule",
      reason: "Open day",
    });

    const updated = await updateDayException(
      db,
      userId,
      semesterId,
      exception.id,
      { kind: "holiday" },
    );

    expect(updated?.kind).toBe("holiday");
    expect(updated?.reason).toBe("Open day");
  });
});

describe("day-exception repository: shared-contract validation", () => {
  let userId: string;
  let semesterId: string;

  beforeEach(async () => {
    userId = await createUser();
    semesterId = await createSemesterWithDates(
      db,
      userId,
      "2026-01-15",
      "2026-05-30",
    );
  });

  it("rejects malformed dates on create", async () => {
    for (const date of ["2026-08-32", "2026-02-30", "20261110", "not-a-date"]) {
      await expect(
        createDayException(db, userId, semesterId, { date, kind: "holiday" }),
      ).rejects.toThrow(DayExceptionValidationError);
    }
  });

  it("reports the date field for a malformed create date", async () => {
    const error = await createDayException(db, userId, semesterId, {
      date: "2026-08-32",
      kind: "holiday",
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(DayExceptionValidationError);
    expect(
      (error as DayExceptionValidationError).issues.map((issue) => issue.path),
    ).toContain("date");
  });

  it("rejects malformed dates on update without touching the row", async () => {
    const created = await createDayException(db, userId, semesterId, {
      date: "2026-02-14",
      kind: "holiday",
    });

    for (const date of ["2026-08-32", "2026-02-30", "20261110", "not-a-date"]) {
      await expect(
        updateDayException(db, userId, semesterId, created.id, { date }),
      ).rejects.toThrow(DayExceptionValidationError);
    }

    const stored = await getDayException(db, userId, semesterId, created.id);
    expect(stored?.date).toBe("2026-02-14");
  });
});
