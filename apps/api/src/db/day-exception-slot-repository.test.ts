import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { DayExceptionConflictError } from "../domain/day-exception-repository.js";
import {
  DayExceptionSlotHolidayConflictError,
  DayExceptionSlotOverlapError,
  DayExceptionSlotOwnershipError,
  DayExceptionSlotValidationError,
} from "../domain/day-exception-repository.js";
import * as schema from "./schema.js";
import { createSemester } from "./semester-repository.js";
import {
  createDayException,
  deleteDayException,
} from "./day-exception-repository.js";
import {
  createDayExceptionSlot,
  deleteDayExceptionSlot,
  getDayExceptionSlot,
  listDayExceptionSlots,
  updateDayExceptionSlot,
} from "./day-exception-slot-repository.js";

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

async function createSubject(
  db: PgliteDatabase<typeof schema>,
  userId: string,
  semesterId: string,
  name: string,
): Promise<string> {
  const [subject] = await db
    .insert(schema.subjects)
    .values({ userId, semesterId, name })
    .returning();
  if (!subject) throw new Error("Expected subject to be created");
  return subject.id;
}

const SEMESTER_START = "2026-01-15";
const SEMESTER_END = "2026-05-30";

describe("day-exception-slot repository", () => {
  let userId: string;
  let semesterId: string;
  let exceptionId: string;
  let subjectId: string;

  beforeEach(async () => {
    userId = await createUser();
    semesterId = await createSemesterWithDates(
      db,
      userId,
      SEMESTER_START,
      SEMESTER_END,
    );
    const exception = await createDayException(db, userId, semesterId, {
      date: "2026-02-14",
      kind: "special_schedule",
    });
    exceptionId = exception.id;
    subjectId = await createSubject(db, userId, semesterId, "Test Subject");
  });

  describe("createDayExceptionSlot", () => {
    it("creates a valid slot", async () => {
      const slot = await createDayExceptionSlot(
        db,
        userId,
        exceptionId,
        semesterId,
        {
          subjectId,
          startTime: "10:00",
          endTime: "11:00",
          classType: "lecture",
        },
      );

      expect(slot).toMatchObject({
        exceptionId,
        semesterId,
        userId,
        subjectId,
        startTime: "10:00",
        endTime: "11:00",
        classType: "lecture",
        room: undefined,
      });
      expect(slot.id).toBeDefined();
      expect(slot.createdAt).toBeDefined();
      expect(slot.updatedAt).toBeDefined();
    });

    it("creates multiple non-overlapping slots", async () => {
      await createDayExceptionSlot(db, userId, exceptionId, semesterId, {
        subjectId,
        startTime: "09:00",
        endTime: "10:00",
      });
      const slot2 = await createDayExceptionSlot(
        db,
        userId,
        exceptionId,
        semesterId,
        {
          subjectId,
          startTime: "11:00",
          endTime: "12:00",
        },
      );
      const slot3 = await createDayExceptionSlot(
        db,
        userId,
        exceptionId,
        semesterId,
        {
          subjectId,
          startTime: "14:00",
          endTime: "15:00",
        },
      );

      expect(slot2.startTime).toBe("11:00");
      expect(slot3.startTime).toBe("14:00");
    });

    it("allows adjacent slots", async () => {
      await createDayExceptionSlot(db, userId, exceptionId, semesterId, {
        subjectId,
        startTime: "10:00",
        endTime: "11:00",
      });
      const slot2 = await createDayExceptionSlot(
        db,
        userId,
        exceptionId,
        semesterId,
        {
          subjectId,
          startTime: "11:00",
          endTime: "12:00",
        },
      );

      expect(slot2.startTime).toBe("11:00");
      expect(slot2.endTime).toBe("12:00");
    });

    it("rejects overlapping slots", async () => {
      await createDayExceptionSlot(db, userId, exceptionId, semesterId, {
        subjectId,
        startTime: "10:00",
        endTime: "11:00",
      });

      await expect(
        createDayExceptionSlot(db, userId, exceptionId, semesterId, {
          subjectId,
          startTime: "10:30",
          endTime: "11:30",
        }),
      ).rejects.toThrow(DayExceptionSlotOverlapError);
    });

    it("rejects a slot under a holiday exception", async () => {
      const holiday = await createDayException(db, userId, semesterId, {
        date: "2026-02-15",
        kind: "holiday",
      });
      const holidayId = holiday.id;

      await expect(
        createDayExceptionSlot(db, userId, holidayId, semesterId, {
          subjectId,
          startTime: "10:00",
          endTime: "11:00",
        }),
      ).rejects.toThrow(DayExceptionSlotHolidayConflictError);
    });

    it("rejects an invalid subject", async () => {
      await expect(
        createDayExceptionSlot(db, userId, exceptionId, semesterId, {
          subjectId: "00000000-0000-0000-0000-000000000000",
          startTime: "10:00",
          endTime: "11:00",
        }),
      ).rejects.toThrow(DayExceptionSlotOwnershipError);
    });

    it("rejects a subject belonging to another semester", async () => {
      const otherSemesterId = await createSemesterWithDates(
        db,
        userId,
        "2026-09-01",
        "2026-12-15",
        { status: "setup" },
      );
      const otherSubjectId = await createSubject(
        db,
        userId,
        otherSemesterId,
        "Other Subject",
      );

      await expect(
        createDayExceptionSlot(db, userId, exceptionId, semesterId, {
          subjectId: otherSubjectId,
          startTime: "10:00",
          endTime: "11:00",
        }),
      ).rejects.toThrow(DayExceptionSlotOwnershipError);
    });

    it("rejects a subject belonging to another user", async () => {
      const otherUserId = await createUser();
      const otherSemesterId = await createSemesterWithDates(
        db,
        otherUserId,
        "2026-01-15",
        "2026-05-30",
        { status: "setup" },
      );
      const otherSubjectId = await createSubject(
        db,
        otherUserId,
        otherSemesterId,
        "Other Subject",
      );

      await expect(
        createDayExceptionSlot(db, userId, exceptionId, semesterId, {
          subjectId: otherSubjectId,
          startTime: "10:00",
          endTime: "11:00",
        }),
      ).rejects.toThrow(DayExceptionSlotOwnershipError);
    });

    it("rejects invalid time values and end <= start", async () => {
      await expect(
        createDayExceptionSlot(db, userId, exceptionId, semesterId, {
          subjectId,
          startTime: "11:00",
          endTime: "10:00",
        }),
      ).rejects.toThrow(DayExceptionSlotValidationError);

      await expect(
        createDayExceptionSlot(db, userId, exceptionId, semesterId, {
          subjectId,
          startTime: "10:00",
          endTime: "10:00",
        }),
      ).rejects.toThrow(DayExceptionSlotValidationError);

      await expect(
        createDayExceptionSlot(db, userId, exceptionId, semesterId, {
          subjectId,
          startTime: "25:00",
          endTime: "11:00",
        }),
      ).rejects.toThrow(DayExceptionSlotValidationError);
    });

    it("requires zero-padded HH:MM times instead of normalizing them", async () => {
      for (const [startTime, endTime] of [
        ["25:00", "26:00"],
        ["09:60", "10:00"],
        ["9am", "10am"],
        ["0900", "1000"],
      ] as const) {
        await expect(
          createDayExceptionSlot(db, userId, exceptionId, semesterId, {
            subjectId,
            startTime,
            endTime,
          }),
        ).rejects.toThrow(DayExceptionSlotValidationError);
      }

      // `0900` used to be silently accepted and stored as 09:00.
      expect(
        await listDayExceptionSlots(db, userId, exceptionId, semesterId),
      ).toHaveLength(0);
    });

    it("validates optional room boundaries and trimming", async () => {
      const slot1 = await createDayExceptionSlot(
        db,
        userId,
        exceptionId,
        semesterId,
        {
          subjectId,
          startTime: "10:00",
          endTime: "11:00",
          room: "  Room 101  ",
        },
      );
      expect(slot1.room).toBe("Room 101");

      await expect(
        createDayExceptionSlot(db, userId, exceptionId, semesterId, {
          subjectId,
          startTime: "10:00",
          endTime: "11:00",
          room: "a".repeat(81),
        }),
      ).rejects.toThrow(DayExceptionSlotValidationError);
    });

    it("rejects unsupported class types", async () => {
      await expect(
        createDayExceptionSlot(db, userId, exceptionId, semesterId, {
          subjectId,
          startTime: "10:00",
          endTime: "11:00",
          classType: "invalid_type",
        }),
      ).rejects.toThrow(DayExceptionSlotValidationError);
    });
  });

  describe("listDayExceptionSlots", () => {
    it("lists slots for one exception ordered by start time", async () => {
      await createDayExceptionSlot(db, userId, exceptionId, semesterId, {
        subjectId,
        startTime: "14:00",
        endTime: "15:00",
      });
      await createDayExceptionSlot(db, userId, exceptionId, semesterId, {
        subjectId,
        startTime: "09:00",
        endTime: "10:00",
      });
      await createDayExceptionSlot(db, userId, exceptionId, semesterId, {
        subjectId,
        startTime: "11:00",
        endTime: "12:00",
      });

      const slots = await listDayExceptionSlots(
        db,
        userId,
        exceptionId,
        semesterId,
      );

      expect(slots).toHaveLength(3);
      expect(slots[0]!.startTime).toBe("09:00");
      expect(slots[1]!.startTime).toBe("11:00");
      expect(slots[2]!.startTime).toBe("14:00");
    });

    it("does not return slots from another exception", async () => {
      const otherException = await createDayException(db, userId, semesterId, {
        date: "2026-02-15",
        kind: "special_schedule",
      });
      const otherExceptionId = otherException.id;

      await createDayExceptionSlot(db, userId, exceptionId, semesterId, {
        subjectId,
        startTime: "10:00",
        endTime: "11:00",
      });
      await createDayExceptionSlot(db, userId, otherExceptionId, semesterId, {
        subjectId,
        startTime: "14:00",
        endTime: "15:00",
      });

      const slots = await listDayExceptionSlots(
        db,
        userId,
        exceptionId,
        semesterId,
      );

      expect(slots).toHaveLength(1);
      expect(slots[0]!.startTime).toBe("10:00");
    });

    it("does not return slots for an exception owned by another user", async () => {
      const otherUserId = await createUser();
      const otherSemesterId = await createSemesterWithDates(
        db,
        otherUserId,
        "2026-01-15",
        "2026-05-30",
        { status: "setup" },
      );
      const otherException = await createDayException(
        db,
        otherUserId,
        otherSemesterId,
        {
          date: "2026-02-14",
          kind: "special_schedule",
        },
      );
      const otherExceptionId = otherException.id;
      const otherSubjectId = await createSubject(
        db,
        otherUserId,
        otherSemesterId,
        "Other Subject",
      );

      await createDayExceptionSlot(db, userId, exceptionId, semesterId, {
        subjectId,
        startTime: "10:00",
        endTime: "11:00",
      });
      await createDayExceptionSlot(
        db,
        otherUserId,
        otherExceptionId,
        otherSemesterId,
        {
          subjectId: otherSubjectId,
          startTime: "14:00",
          endTime: "15:00",
        },
      );

      const slots = await listDayExceptionSlots(
        db,
        userId,
        exceptionId,
        semesterId,
      );
      expect(slots).toHaveLength(1);
    });
  });

  describe("getDayExceptionSlot", () => {
    it("gets a slot within its correct parent and owner scope", async () => {
      const created = await createDayExceptionSlot(
        db,
        userId,
        exceptionId,
        semesterId,
        {
          subjectId,
          startTime: "10:00",
          endTime: "11:00",
          room: "Room 101",
          classType: "lecture",
        },
      );

      const slot = await getDayExceptionSlot(
        db,
        userId,
        exceptionId,
        semesterId,
        created.id,
      );

      expect(slot).not.toBeNull();
      expect(slot?.id).toBe(created.id);
      expect(slot?.startTime).toBe("10:00");
      expect(slot?.endTime).toBe("11:00");
      expect(slot?.room).toBe("Room 101");
      expect(slot?.classType).toBe("lecture");
    });

    it("returns null for a slot from another exception", async () => {
      const created = await createDayExceptionSlot(
        db,
        userId,
        exceptionId,
        semesterId,
        {
          subjectId,
          startTime: "10:00",
          endTime: "11:00",
        },
      );

      const otherException = await createDayException(db, userId, semesterId, {
        date: "2026-02-15",
        kind: "special_schedule",
      });
      const otherExceptionId = otherException.id;

      const slot = await getDayExceptionSlot(
        db,
        userId,
        otherExceptionId,
        semesterId,
        created.id,
      );
      expect(slot).toBeNull();
    });

    it("returns null for a slot owned by another user", async () => {
      const created = await createDayExceptionSlot(
        db,
        userId,
        exceptionId,
        semesterId,
        {
          subjectId,
          startTime: "10:00",
          endTime: "11:00",
        },
      );

      const otherUserId = await createUser();

      const slot = await getDayExceptionSlot(
        db,
        otherUserId,
        exceptionId,
        semesterId,
        created.id,
      );
      expect(slot).toBeNull();
    });

    it("returns null for a non-existent slot", async () => {
      const slot = await getDayExceptionSlot(
        db,
        userId,
        exceptionId,
        semesterId,
        "00000000-0000-0000-0000-000000000000",
      );
      expect(slot).toBeNull();
    });
  });

  describe("updateDayExceptionSlot", () => {
    it("updates supported fields", async () => {
      const created = await createDayExceptionSlot(
        db,
        userId,
        exceptionId,
        semesterId,
        {
          subjectId,
          startTime: "10:00",
          endTime: "11:00",
          room: "Room 101",
          classType: "lecture",
        },
      );

      const updated = await updateDayExceptionSlot(
        db,
        userId,
        exceptionId,
        semesterId,
        created.id,
        {
          room: "Room 202",
          classType: "tutorial",
        },
      );

      expect(updated).not.toBeNull();
      expect(updated?.room).toBe("Room 202");
      expect(updated?.classType).toBe("tutorial");
      expect(updated?.startTime).toBe("10:00");
      expect(updated?.endTime).toBe("11:00");
    });

    it("preserves omitted fields", async () => {
      const created = await createDayExceptionSlot(
        db,
        userId,
        exceptionId,
        semesterId,
        {
          subjectId,
          startTime: "10:00",
          endTime: "11:00",
          room: "Room 101",
          classType: "lecture",
        },
      );

      const updated = await updateDayExceptionSlot(
        db,
        userId,
        exceptionId,
        semesterId,
        created.id,
        {
          room: "Room 202",
        },
      );

      expect(updated?.room).toBe("Room 202");
      expect(updated?.classType).toBe("lecture");
      expect(updated?.startTime).toBe("10:00");
      expect(updated?.endTime).toBe("11:00");
    });

    it("rejects invalid time ranges", async () => {
      const created = await createDayExceptionSlot(
        db,
        userId,
        exceptionId,
        semesterId,
        {
          subjectId,
          startTime: "10:00",
          endTime: "11:00",
        },
      );

      await expect(
        updateDayExceptionSlot(
          db,
          userId,
          exceptionId,
          semesterId,
          created.id,
          {
            startTime: "11:00",
            endTime: "10:00",
          },
        ),
      ).rejects.toThrow(DayExceptionSlotValidationError);

      await expect(
        updateDayExceptionSlot(
          db,
          userId,
          exceptionId,
          semesterId,
          created.id,
          {
            startTime: "10:00",
            endTime: "10:00",
          },
        ),
      ).rejects.toThrow(DayExceptionSlotValidationError);
    });

    it("requires zero-padded HH:MM times on update", async () => {
      const created = await createDayExceptionSlot(
        db,
        userId,
        exceptionId,
        semesterId,
        { subjectId, startTime: "10:00", endTime: "11:00" },
      );

      for (const startTime of ["09:60", "0900"]) {
        await expect(
          updateDayExceptionSlot(
            db,
            userId,
            exceptionId,
            semesterId,
            created.id,
            { startTime },
          ),
        ).rejects.toThrow(DayExceptionSlotValidationError);
      }

      const stored = await getDayExceptionSlot(
        db,
        userId,
        exceptionId,
        semesterId,
        created.id,
      );
      expect(stored?.startTime).toBe("10:00");
    });

    it("rejects overlap with another slot", async () => {
      await createDayExceptionSlot(db, userId, exceptionId, semesterId, {
        subjectId,
        startTime: "09:00",
        endTime: "10:00",
      });
      const created = await createDayExceptionSlot(
        db,
        userId,
        exceptionId,
        semesterId,
        {
          subjectId,
          startTime: "11:00",
          endTime: "12:00",
        },
      );

      await expect(
        updateDayExceptionSlot(
          db,
          userId,
          exceptionId,
          semesterId,
          created.id,
          {
            startTime: "09:30",
            endTime: "10:30",
          },
        ),
      ).rejects.toThrow(DayExceptionSlotOverlapError);
    });

    it("allows adjacency after update", async () => {
      await createDayExceptionSlot(db, userId, exceptionId, semesterId, {
        subjectId,
        startTime: "09:00",
        endTime: "10:00",
      });
      const created = await createDayExceptionSlot(
        db,
        userId,
        exceptionId,
        semesterId,
        {
          subjectId,
          startTime: "11:00",
          endTime: "12:00",
        },
      );

      const updated = await updateDayExceptionSlot(
        db,
        userId,
        exceptionId,
        semesterId,
        created.id,
        {
          startTime: "10:00",
          endTime: "11:00",
        },
      );

      expect(updated?.startTime).toBe("10:00");
      expect(updated?.endTime).toBe("11:00");
    });

    it("excludes the current slot from its own overlap check", async () => {
      const created = await createDayExceptionSlot(
        db,
        userId,
        exceptionId,
        semesterId,
        {
          subjectId,
          startTime: "10:00",
          endTime: "11:00",
        },
      );

      // Update with the same time range - should not conflict with itself
      const updated = await updateDayExceptionSlot(
        db,
        userId,
        exceptionId,
        semesterId,
        created.id,
        {
          room: "Room 202",
        },
      );

      expect(updated?.startTime).toBe("10:00");
      expect(updated?.room).toBe("Room 202");
    });

    it("rejects update when the parent is a holiday", async () => {
      const holiday = await createDayException(db, userId, semesterId, {
        date: "2026-02-15",
        kind: "holiday",
      });
      const holidayId = holiday.id;

      // Manually insert a slot for the holiday (bypassing the create validation)
      // This simulates a slot that existed before the exception became a holiday
      const subjectId2 = await createSubject(
        db,
        userId,
        semesterId,
        "Another Subject",
      );
      await db.insert(schema.dayExceptionSlots).values({
        exceptionId: holidayId,
        semesterId,
        userId,
        subjectId: subjectId2,
        startTime: "10:00",
        endTime: "11:00",
        classType: "lecture",
      });

      const [slot] = await db
        .select()
        .from(schema.dayExceptionSlots)
        .where(eq(schema.dayExceptionSlots.exceptionId, holidayId))
        .limit(1);

      // slot must exist because we just inserted it
      if (!slot) throw new Error("Expected slot to exist");

      await expect(
        updateDayExceptionSlot(db, userId, holidayId, semesterId, slot.id, {
          room: "Room 202",
        }),
      ).rejects.toThrow(DayExceptionSlotHolidayConflictError);
    });

    it("rejects update when the parent is inaccessible", async () => {
      const created = await createDayExceptionSlot(
        db,
        userId,
        exceptionId,
        semesterId,
        {
          subjectId,
          startTime: "10:00",
          endTime: "11:00",
        },
      );

      const otherUserId = await createUser();

      const updated = await updateDayExceptionSlot(
        db,
        otherUserId,
        exceptionId,
        semesterId,
        created.id,
        {
          room: "Room 202",
        },
      );
      expect(updated).toBeNull();
    });

    it("validates changed subjects against semester and user ownership", async () => {
      const created = await createDayExceptionSlot(
        db,
        userId,
        exceptionId,
        semesterId,
        {
          subjectId,
          startTime: "10:00",
          endTime: "11:00",
        },
      );

      const otherSemesterId = await createSemesterWithDates(
        db,
        userId,
        "2026-09-01",
        "2026-12-15",
        { status: "setup" },
      );
      const otherSubjectId = await createSubject(
        db,
        userId,
        otherSemesterId,
        "Other Subject",
      );

      await expect(
        updateDayExceptionSlot(
          db,
          userId,
          exceptionId,
          semesterId,
          created.id,
          {
            subjectId: otherSubjectId,
          },
        ),
      ).rejects.toThrow(DayExceptionSlotOwnershipError);
    });

    it("allows changing subject within the same semester and user", async () => {
      const created = await createDayExceptionSlot(
        db,
        userId,
        exceptionId,
        semesterId,
        {
          subjectId,
          startTime: "10:00",
          endTime: "11:00",
        },
      );

      const subjectId2 = await createSubject(
        db,
        userId,
        semesterId,
        "Another Subject",
      );

      const updated = await updateDayExceptionSlot(
        db,
        userId,
        exceptionId,
        semesterId,
        created.id,
        {
          subjectId: subjectId2,
        },
      );

      expect(updated?.subjectId).toBe(subjectId2);
    });
  });

  describe("deleteDayExceptionSlot", () => {
    it("deletes a slot successfully", async () => {
      const created = await createDayExceptionSlot(
        db,
        userId,
        exceptionId,
        semesterId,
        {
          subjectId,
          startTime: "10:00",
          endTime: "11:00",
        },
      );

      const deleted = await deleteDayExceptionSlot(
        db,
        userId,
        exceptionId,
        semesterId,
        created.id,
      );

      expect(deleted).toBe(true);

      const slot = await getDayExceptionSlot(
        db,
        userId,
        exceptionId,
        semesterId,
        created.id,
      );
      expect(slot).toBeNull();
    });

    it("does not delete a slot outside the supplied scope", async () => {
      const created = await createDayExceptionSlot(
        db,
        userId,
        exceptionId,
        semesterId,
        {
          subjectId,
          startTime: "10:00",
          endTime: "11:00",
        },
      );

      const otherUserId = await createUser();
      const deleted = await deleteDayExceptionSlot(
        db,
        otherUserId,
        exceptionId,
        semesterId,
        created.id,
      );
      expect(deleted).toBe(false);

      const otherException = await createDayException(db, userId, semesterId, {
        date: "2026-02-15",
        kind: "special_schedule",
      });
      const otherExceptionId = otherException.id;
      const deleted2 = await deleteDayExceptionSlot(
        db,
        userId,
        otherExceptionId,
        semesterId,
        created.id,
      );
      expect(deleted2).toBe(false);
    });

    it("returns false for a missing slot", async () => {
      const deleted = await deleteDayExceptionSlot(
        db,
        userId,
        exceptionId,
        semesterId,
        "00000000-0000-0000-0000-000000000000",
      );
      expect(deleted).toBe(false);
    });
  });
});

describe("day-exception-slot repository: parent deletion restriction", () => {
  let userId: string;
  let semesterId: string;
  let exceptionId: string;
  let subjectId: string;

  beforeEach(async () => {
    userId = await createUser();
    semesterId = await createSemesterWithDates(
      db,
      userId,
      SEMESTER_START,
      SEMESTER_END,
    );
    const exception = await createDayException(db, userId, semesterId, {
      date: "2026-02-14",
      kind: "special_schedule",
    });
    exceptionId = exception.id;
    subjectId = await createSubject(db, userId, semesterId, "Test Subject");
  });

  it("parent deletion remains restricted while slots exist", async () => {
    await createDayExceptionSlot(db, userId, exceptionId, semesterId, {
      subjectId,
      startTime: "10:00",
      endTime: "11:00",
    });

    await expect(
      deleteDayException(db, userId, semesterId, exceptionId),
    ).rejects.toThrow(DayExceptionConflictError);
  });

  it("parent can be deleted after all slots are removed", async () => {
    const slot = await createDayExceptionSlot(
      db,
      userId,
      exceptionId,
      semesterId,
      {
        subjectId,
        startTime: "10:00",
        endTime: "11:00",
      },
    );

    await deleteDayExceptionSlot(db, userId, exceptionId, semesterId, slot.id);

    const deleted = await deleteDayException(
      db,
      userId,
      semesterId,
      exceptionId,
    );
    expect(deleted).toBe(true);
  });
});
