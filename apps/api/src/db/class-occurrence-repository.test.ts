import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "./schema.js";
import { createSemester } from "./semester-repository.js";
import { createSubject } from "./subject-repository.js";
import { createTimetableSlot } from "./timetable-slot-repository.js";
import { createDayException } from "./day-exception-repository.js";
import { createDayExceptionSlot } from "./day-exception-slot-repository.js";
import {
  generateClassOccurrences,
  listClassOccurrences,
} from "./class-occurrence-repository.js";
import {
  ClassOccurrenceOwnershipError,
  ClassOccurrenceValidationError,
} from "../domain/class-occurrence-repository.js";

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

async function seedSemester(userId: string) {
  const semester = await createSemester(db, userId, {
    name: "Semester 1",
    academicYear: "2026-27",
    startDate: "2026-07-01",
    endDate: "2026-07-31",
  });

  const subject = await createSubject(db, userId, semester.id, {
    name: "Physics",
  });

  return { semester, subject };
}

describe("class occurrence generation", () => {
  it("generates one occurrence per matching weekday in the range", async () => {
    const userId = `user_${crypto.randomUUID()}`;
    await db.insert(schema.users).values({ id: userId });

    const { semester, subject } = await seedSemester(userId);

    await createTimetableSlot(db, userId, semester.id, {
      subjectId: subject.id,
      dayOfWeek: 3, // Wednesday
      startTime: "09:00",
      endTime: "10:00",
      room: "A1",
      classType: "lecture",
    });

    const occurrences = await generateClassOccurrences(
      db,
      userId,
      semester.id,
      "2026-07-01",
      "2026-07-31",
    );

    expect(occurrences).toHaveLength(5);
    expect(occurrences.map((entry) => entry.date)).toEqual([
      "2026-07-01",
      "2026-07-08",
      "2026-07-15",
      "2026-07-22",
      "2026-07-29",
    ]);
    expect(occurrences[0]).toMatchObject({
      subjectId: subject.id,
      startTime: "09:00",
      endTime: "10:00",
      room: "A1",
      classType: "lecture",
      status: "scheduled",
      sourceSlotId: expect.any(String),
      sourceExceptionSlotId: null,
    });
  });

  it("clamps the requested range to the semester dates", async () => {
    const userId = `user_${crypto.randomUUID()}`;
    await db.insert(schema.users).values({ id: userId });

    const { semester, subject } = await seedSemester(userId);

    await createTimetableSlot(db, userId, semester.id, {
      subjectId: subject.id,
      dayOfWeek: 3,
      startTime: "09:00",
      endTime: "10:00",
    });

    const occurrences = await generateClassOccurrences(
      db,
      userId,
      semester.id,
      {
        fromDate: "2026-06-15",
        toDate: "2026-08-15",
      },
    );

    expect(occurrences[0]?.date).toBe("2026-07-01");
    expect(occurrences[occurrences.length - 1]?.date).toBe("2026-07-29");
  });

  it("respects active_from and active_to on recurring slots", async () => {
    const userId = `user_${crypto.randomUUID()}`;
    await db.insert(schema.users).values({ id: userId });

    const { semester, subject } = await seedSemester(userId);

    await createTimetableSlot(db, userId, semester.id, {
      subjectId: subject.id,
      dayOfWeek: 3,
      startTime: "09:00",
      endTime: "10:00",
      activeFrom: "2026-07-15",
      activeTo: "2026-07-31",
    });

    const occurrences = await generateClassOccurrences(
      db,
      userId,
      semester.id,
      "2026-07-01",
      "2026-07-31",
    );

    expect(occurrences.map((entry) => entry.date)).toEqual([
      "2026-07-15",
      "2026-07-22",
      "2026-07-29",
    ]);
  });

  it("produces no classes on a holiday", async () => {
    const userId = `user_${crypto.randomUUID()}`;
    await db.insert(schema.users).values({ id: userId });

    const { semester, subject } = await seedSemester(userId);

    await createTimetableSlot(db, userId, semester.id, {
      subjectId: subject.id,
      dayOfWeek: 3,
      startTime: "09:00",
      endTime: "10:00",
    });

    await createDayException(db, userId, semester.id, {
      date: "2026-07-08",
      kind: "holiday",
      reason: "Break",
    });

    const occurrences = await generateClassOccurrences(
      db,
      userId,
      semester.id,
      "2026-07-01",
      "2026-07-31",
    );

    expect(occurrences.map((entry) => entry.date)).not.toContain("2026-07-08");
    expect(occurrences).toHaveLength(4);
  });

  it("generates a special schedule's own classes instead of the recurring slot", async () => {
    const userId = `user_${crypto.randomUUID()}`;
    await db.insert(schema.users).values({ id: userId });

    const { semester, subject } = await seedSemester(userId);

    await createTimetableSlot(db, userId, semester.id, {
      subjectId: subject.id,
      dayOfWeek: 3,
      startTime: "09:00",
      endTime: "10:00",
    });

    const exception = await createDayException(db, userId, semester.id, {
      date: "2026-07-15",
      kind: "special_schedule",
    });

    await createDayExceptionSlot(db, userId, exception.id, semester.id, {
      subjectId: subject.id,
      startTime: "11:00",
      endTime: "12:00",
      room: "Lab",
      classType: "practical",
    });

    const occurrences = await generateClassOccurrences(
      db,
      userId,
      semester.id,
      "2026-07-15",
      "2026-07-15",
    );

    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]).toMatchObject({
      date: "2026-07-15",
      startTime: "11:00",
      endTime: "12:00",
      room: "Lab",
      classType: "practical",
      sourceSlotId: null,
      sourceExceptionSlotId: expect.any(String),
    });
  });

  it("is idempotent when generation runs twice", async () => {
    const userId = `user_${crypto.randomUUID()}`;
    await db.insert(schema.users).values({ id: userId });

    const { semester, subject } = await seedSemester(userId);

    await createTimetableSlot(db, userId, semester.id, {
      subjectId: subject.id,
      dayOfWeek: 3,
      startTime: "09:00",
      endTime: "10:00",
    });

    const first = await generateClassOccurrences(
      db,
      userId,
      semester.id,
      "2026-07-01",
      "2026-07-31",
    );
    const second = await generateClassOccurrences(
      db,
      userId,
      semester.id,
      "2026-07-01",
      "2026-07-31",
    );

    expect(second).toHaveLength(first.length);
    expect(second.map((entry) => entry.id)).toEqual(
      first.map((entry) => entry.id),
    );

    const listed = await listClassOccurrences(db, userId, semester.id);
    expect(listed).toHaveLength(first.length);
  });

  it("does not rewrite an existing occurrence when the source slot changes", async () => {
    const userId = `user_${crypto.randomUUID()}`;
    await db.insert(schema.users).values({ id: userId });

    const { semester, subject } = await seedSemester(userId);

    const slot = await createTimetableSlot(db, userId, semester.id, {
      subjectId: subject.id,
      dayOfWeek: 3,
      startTime: "09:00",
      endTime: "10:00",
    });

    const first = await generateClassOccurrences(
      db,
      userId,
      semester.id,
      "2026-07-01",
      "2026-07-01",
    );
    expect(first[0]?.startTime).toBe("09:00");

    // Edit the recurring rule after the occurrence exists.
    const { updateTimetableSlot } =
      await import("./timetable-slot-repository.js");
    await updateTimetableSlot(db, userId, semester.id, slot.id, {
      startTime: "10:00",
      endTime: "11:00",
    });

    const second = await generateClassOccurrences(
      db,
      userId,
      semester.id,
      "2026-07-01",
      "2026-07-01",
    );

    expect(second[0]?.id).toBe(first[0]?.id);
    expect(second[0]?.startTime).toBe("09:00");
    expect(second[0]?.endTime).toBe("10:00");
  });

  it("keeps occurrences isolated by user", async () => {
    const userA = `user_${crypto.randomUUID()}`;
    const userB = `user_${crypto.randomUUID()}`;
    await db.insert(schema.users).values([{ id: userA }, { id: userB }]);

    const { semester: semesterA, subject: subjectA } =
      await seedSemester(userA);
    const { semester: semesterB, subject: subjectB } =
      await seedSemester(userB);

    await createTimetableSlot(db, userA, semesterA.id, {
      subjectId: subjectA.id,
      dayOfWeek: 3,
      startTime: "09:00",
      endTime: "10:00",
    });

    await createTimetableSlot(db, userB, semesterB.id, {
      subjectId: subjectB.id,
      dayOfWeek: 3,
      startTime: "13:00",
      endTime: "14:00",
    });

    await generateClassOccurrences(
      db,
      userA,
      semesterA.id,
      "2026-07-01",
      "2026-07-01",
    );

    expect(await listClassOccurrences(db, userB, semesterB.id)).toHaveLength(0);

    const bOccurrences = await generateClassOccurrences(
      db,
      userB,
      semesterB.id,
      "2026-07-01",
      "2026-07-01",
    );
    expect(bOccurrences).toHaveLength(1);
    expect(bOccurrences[0]?.startTime).toBe("13:00");
  });

  it("rejects an inverted range", async () => {
    const userId = `user_${crypto.randomUUID()}`;
    await db.insert(schema.users).values({ id: userId });

    const { semester } = await seedSemester(userId);

    await expect(
      generateClassOccurrences(
        db,
        userId,
        semester.id,
        "2026-07-10",
        "2026-07-01",
      ),
    ).rejects.toBeInstanceOf(ClassOccurrenceValidationError);
  });

  it("rejects a malformed date", async () => {
    const userId = `user_${crypto.randomUUID()}`;
    await db.insert(schema.users).values({ id: userId });

    const { semester } = await seedSemester(userId);

    await expect(
      generateClassOccurrences(
        db,
        userId,
        semester.id,
        "2026-07-40",
        "2026-07-31",
      ),
    ).rejects.toBeInstanceOf(ClassOccurrenceValidationError);
  });

  it("refuses to generate for a semester without dates", async () => {
    const userId = `user_${crypto.randomUUID()}`;
    await db.insert(schema.users).values({ id: userId });

    const semester = await createSemester(db, userId, {
      name: "No dates",
      academicYear: "2026-27",
    });

    await expect(
      generateClassOccurrences(
        db,
        userId,
        semester.id,
        "2026-07-01",
        "2026-07-02",
      ),
    ).rejects.toBeInstanceOf(ClassOccurrenceValidationError);
  });

  it("refuses a foreign semester", async () => {
    const userId = `user_${crypto.randomUUID()}`;
    await db.insert(schema.users).values({ id: userId });

    await expect(
      generateClassOccurrences(
        db,
        userId,
        "00000000-0000-0000-0000-000000000000",
        "2026-07-01",
        "2026-07-02",
      ),
    ).rejects.toBeInstanceOf(ClassOccurrenceOwnershipError);
  });

  it("preserves date-only values without shifting the day", async () => {
    const userId = `user_${crypto.randomUUID()}`;
    await db.insert(schema.users).values({ id: userId });

    const { semester, subject } = await seedSemester(userId);

    await createTimetableSlot(db, userId, semester.id, {
      subjectId: subject.id,
      dayOfWeek: 3,
      startTime: "09:00",
      endTime: "10:00",
    });

    const occurrences = await generateClassOccurrences(
      db,
      userId,
      semester.id,
      "2026-07-01",
      "2026-07-01",
    );

    expect(occurrences[0]?.date).toBe("2026-07-01");
  });
});
