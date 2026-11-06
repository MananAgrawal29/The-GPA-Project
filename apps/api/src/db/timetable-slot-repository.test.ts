import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  TimetableSlotOverlapError,
  TimetableSlotOwnershipError,
  TimetableSlotValidationError,
} from "../domain/timetable.js";
import * as schema from "./schema.js";
import { createSemester } from "./semester-repository.js";
import { createSubject, deleteSubject } from "./subject-repository.js";
import {
  createTimetableSlot,
  deleteTimetableSlot,
  getTimetableSlot,
  listTimetableSlots,
  updateTimetableSlot,
} from "./timetable-slot-repository.js";

/**
 * These tests run the committed SQL migrations against a real PostgreSQL
 * engine (PGlite, PostgreSQL 18 compiled to WebAssembly) in memory, then
 * exercise the repository through the same code paths the API will use.
 *
 * Concurrency note, stated plainly: PGlite is a single-connection engine,
 * so two writes cannot actually contend here. The repository still takes
 * a `FOR UPDATE` lock on the owning semester before checking overlaps
 * (D031); the lock's ordering is exercised by every write, but its
 * behavior under real contention remains unverified until a PostgreSQL
 * server exists.
 */
const MIGRATIONS_FOLDER = fileURLToPath(
  new URL("../../drizzle", import.meta.url),
);

const SEMESTER_START = "2026-07-01";
const SEMESTER_END = "2026-12-15";

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
    "truncate table timetable_slots, subjects, semesters, users cascade",
  );
});

async function createUser(): Promise<string> {
  const id = `user_${crypto.randomUUID()}`;
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

async function createSubjectFor(
  userId: string,
  semesterId: string,
  name = "Physics",
) {
  return createSubject(db, userId, semesterId, { name });
}

async function createDatedSemester(userId: string): Promise<string> {
  return createSemesterFor(userId, {
    startDate: SEMESTER_START,
    endDate: SEMESTER_END,
  });
}

function slotInput(
  subjectId: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    subjectId,
    dayOfWeek: 1,
    startTime: "09:00",
    endTime: "10:00",
    ...overrides,
  };
}

async function slotCount(): Promise<number> {
  const result = await client.query<{ count: string }>(
    "select count(*)::text as count from timetable_slots",
  );

  return Number(result.rows[0]?.count ?? "0");
}

function uuid(): string {
  return crypto.randomUUID();
}

describe("timetable slot migration", () => {
  it("creates the slot table alongside the existing ones", async () => {
    const tables = await client.query<{ table_name: string }>(
      `select table_name
         from information_schema.tables
        where table_schema = 'public'
        order by table_name`,
    );

    expect(tables.rows.map((row) => row.table_name)).toEqual([
      "semesters",
      "subjects",
      "timetable_slots",
      "users",
    ]);
  });

  it("creates the class type enum in the shared order", async () => {
    const values = await client.query<{ enumlabel: string }>(
      `select enumlabel
         from pg_enum
         join pg_type on pg_type.oid = pg_enum.enumtypid
        where pg_type.typname = 'class_type'
        order by enumsortorder`,
    );

    expect(values.rows.map((row) => row.enumlabel)).toEqual([
      "lecture",
      "practical",
      "tutorial",
      "other",
    ]);
  });

  it("adds the composite targets the slot keys need", async () => {
    const subjectTarget = await client.query<{ conname: string }>(
      `select conname
         from pg_constraint
        where conrelid = 'subjects'::regclass and contype = 'u'
        order by conname`,
    );
    const slotTarget = await client.query<{ conname: string }>(
      `select conname
         from pg_constraint
        where conrelid = 'timetable_slots'::regclass and contype = 'u'
        order by conname`,
    );

    expect(subjectTarget.rows.map((row) => row.conname)).toEqual([
      "subjects_id_semester_id_user_id_unique",
    ]);
    expect(slotTarget.rows.map((row) => row.conname)).toEqual([
      "timetable_slots_id_semester_id_user_id_unique",
    ]);
  });

  it("enforces both ownership foreign keys with RESTRICT", async () => {
    const foreignKeys = await client.query<{
      conname: string;
      definition: string;
    }>(
      `select conname, pg_get_constraintdef(oid) as definition
         from pg_constraint
        where conrelid = 'timetable_slots'::regclass and contype = 'f'
        order by conname`,
    );

    expect(foreignKeys.rows.map((row) => row.conname)).toEqual([
      "timetable_slots_semester_owner_fk",
      "timetable_slots_subject_owner_fk",
    ]);

    const semesterKey = foreignKeys.rows[0]?.definition ?? "";
    const subjectKey = foreignKeys.rows[1]?.definition ?? "";

    expect(semesterKey).toContain("(semester_id, user_id)");
    expect(semesterKey).toContain("semesters(id, user_id)");
    expect(semesterKey).toContain("ON DELETE RESTRICT");
    expect(subjectKey).toContain("(subject_id, semester_id, user_id)");
    expect(subjectKey).toContain("subjects(id, semester_id, user_id)");
    expect(subjectKey).toContain("ON DELETE RESTRICT");
  });

  it("repeats the weekday, time, room, and range rules as checks", async () => {
    const checks = await client.query<{ conname: string }>(
      `select conname
         from pg_constraint
        where conrelid = 'timetable_slots'::regclass and contype = 'c'
        order by conname`,
    );

    expect(checks.rows.map((row) => row.conname)).toEqual([
      "timetable_slots_active_range_order",
      "timetable_slots_day_of_week_range",
      "timetable_slots_room_length",
      "timetable_slots_time_order",
    ]);
  });

  it("creates the scan indexes and the exact duplicate backstop", async () => {
    const indexes = await client.query<{ indexname: string }>(
      `select indexname
         from pg_indexes
        where tablename = 'timetable_slots'
        order by indexname`,
    );

    expect(indexes.rows.map((row) => row.indexname)).toEqual([
      "timetable_slots_exact_duplicate",
      "timetable_slots_id_semester_id_user_id_unique",
      "timetable_slots_pkey",
      "timetable_slots_semester_id_idx",
      "timetable_slots_subject_id_idx",
    ]);
  });

  it("can be applied twice without effect", async () => {
    await expect(
      migrate(db, { migrationsFolder: MIGRATIONS_FOLDER }),
    ).resolves.toBeUndefined();
  });
});

describe("createTimetableSlot", () => {
  it("stores a whole-semester slot with defaults and trims the room", async () => {
    const userId = await createUser();
    const semesterId = await createSemesterFor(userId);
    const subject = await createSubjectFor(userId, semesterId);

    const slot = await createTimetableSlot(
      db,
      userId,
      semesterId,
      slotInput(subject.id, { room: "  Room 12  " }),
    );

    expect(slot).toMatchObject({
      semesterId,
      subjectId: subject.id,
      dayOfWeek: 1,
      startTime: "09:00",
      endTime: "10:00",
      room: "Room 12",
      classType: "lecture",
      activeFrom: null,
      activeTo: null,
      archivedAt: null,
    });
    expect(slot.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(new Date(slot.createdAt).toISOString()).toBe(slot.createdAt);
  });

  it("stores a class type and an active range inside the semester", async () => {
    const userId = await createUser();
    const semesterId = await createDatedSemester(userId);
    const subject = await createSubjectFor(userId, semesterId);

    const slot = await createTimetableSlot(
      db,
      userId,
      semesterId,
      slotInput(subject.id, {
        dayOfWeek: 7,
        startTime: "14:15",
        endTime: "15:45",
        classType: "practical",
        activeFrom: "2026-08-01",
        activeTo: "2026-09-30",
      }),
    );

    expect(slot).toMatchObject({
      dayOfWeek: 7,
      startTime: "14:15",
      endTime: "15:45",
      classType: "practical",
      activeFrom: "2026-08-01",
      activeTo: "2026-09-30",
    });
  });

  it("rejects invalid input without writing a row", async () => {
    const userId = await createUser();
    const semesterId = await createDatedSemester(userId);
    const subject = await createSubjectFor(userId, semesterId);

    const invalidInputs: unknown[] = [
      null,
      {},
      slotInput(subject.id, { dayOfWeek: 0 }),
      slotInput(subject.id, { dayOfWeek: 8 }),
      slotInput(subject.id, { startTime: "9:00" }),
      slotInput(subject.id, { endTime: "09:00" }),
      slotInput(subject.id, { endTime: "08:00" }),
      slotInput(subject.id, { classType: "seminar" }),
      slotInput(subject.id, { room: "   " }),
      slotInput(subject.id, {
        activeFrom: "2026-09-01",
        activeTo: "2026-08-01",
      }),
      slotInput(subject.id, { activeFrom: "2026-06-30" }),
      slotInput(subject.id, { activeTo: "2026-12-16" }),
    ];

    for (const invalid of invalidInputs) {
      await expect(
        createTimetableSlot(db, userId, semesterId, invalid),
      ).rejects.toBeInstanceOf(TimetableSlotValidationError);
    }

    expect(await slotCount()).toBe(0);
  });

  it("refuses an active range on a semester without dates", async () => {
    const userId = await createUser();
    const semesterId = await createSemesterFor(userId);
    const subject = await createSubjectFor(userId, semesterId);

    for (const range of [
      { activeFrom: "2026-08-01" },
      { activeTo: "2026-12-01" },
    ]) {
      await expect(
        createTimetableSlot(
          db,
          userId,
          semesterId,
          slotInput(subject.id, range),
        ),
      ).rejects.toBeInstanceOf(TimetableSlotValidationError);
    }

    expect(await slotCount()).toBe(0);
  });

  it("refuses a semester that is not the caller's", async () => {
    const owner = await createUser();
    const other = await createUser();
    const ownersSemester = await createSemesterFor(owner);
    const subject = await createSubjectFor(owner, ownersSemester);

    await expect(
      createTimetableSlot(db, other, ownersSemester, slotInput(subject.id)),
    ).rejects.toBeInstanceOf(TimetableSlotOwnershipError);

    expect(await slotCount()).toBe(0);
  });

  it("refuses a nonexistent semester or owner", async () => {
    const userId = await createUser();
    const semesterId = await createDatedSemester(userId);
    const subject = await createSubjectFor(userId, semesterId);

    await expect(
      createTimetableSlot(db, userId, uuid(), slotInput(subject.id)),
    ).rejects.toBeInstanceOf(TimetableSlotOwnershipError);
    await expect(
      createTimetableSlot(
        db,
        "user_missing",
        semesterId,
        slotInput(subject.id),
      ),
    ).rejects.toBeInstanceOf(TimetableSlotOwnershipError);
  });

  it("refuses a subject from another semester or another owner", async () => {
    const userId = await createUser();
    const semesterId = await createDatedSemester(userId);
    const otherSemester = await createDatedSemester(userId);
    const foreignSubject = await createSubjectFor(userId, otherSemester);

    await expect(
      createTimetableSlot(db, userId, semesterId, slotInput(foreignSubject.id)),
    ).rejects.toBeInstanceOf(TimetableSlotOwnershipError);

    const other = await createUser();
    const othersSemester = await createDatedSemester(other);
    const othersSubject = await createSubjectFor(other, othersSemester);

    await expect(
      createTimetableSlot(db, userId, semesterId, slotInput(othersSubject.id)),
    ).rejects.toBeInstanceOf(TimetableSlotOwnershipError);
  });

  it("refuses a nonexistent subject", async () => {
    const userId = await createUser();
    const semesterId = await createDatedSemester(userId);

    await expect(
      createTimetableSlot(db, userId, semesterId, slotInput(uuid())),
    ).rejects.toBeInstanceOf(TimetableSlotOwnershipError);
  });

  it("refuses a slot whose time overlaps another on the same weekday", async () => {
    const userId = await createUser();
    const semesterId = await createDatedSemester(userId);
    const subject = await createSubjectFor(userId, semesterId);

    await createTimetableSlot(db, userId, semesterId, slotInput(subject.id));

    for (const overlap of [
      { startTime: "09:30", endTime: "10:30" },
      { startTime: "08:30", endTime: "09:30" },
      { startTime: "09:15", endTime: "09:45" },
      { startTime: "08:00", endTime: "11:00" },
      { startTime: "09:00", endTime: "10:00" },
    ]) {
      await expect(
        createTimetableSlot(
          db,
          userId,
          semesterId,
          slotInput(subject.id, overlap),
        ),
      ).rejects.toBeInstanceOf(TimetableSlotOverlapError);
    }

    expect(await slotCount()).toBe(1);
  });

  it("allows adjacent slots, other weekdays, and other semesters", async () => {
    const userId = await createUser();
    const semesterId = await createDatedSemester(userId);
    const subject = await createSubjectFor(userId, semesterId);

    await createTimetableSlot(db, userId, semesterId, slotInput(subject.id));
    await createTimetableSlot(
      db,
      userId,
      semesterId,
      slotInput(subject.id, { startTime: "10:00", endTime: "11:00" }),
    );
    await createTimetableSlot(
      db,
      userId,
      semesterId,
      slotInput(subject.id, { startTime: "08:00", endTime: "09:00" }),
    );
    await createTimetableSlot(
      db,
      userId,
      semesterId,
      slotInput(subject.id, { dayOfWeek: 2 }),
    );

    const otherSemester = await createDatedSemester(userId);
    const otherSubject = await createSubjectFor(userId, otherSemester);
    await createTimetableSlot(
      db,
      userId,
      otherSemester,
      slotInput(otherSubject.id),
    );

    expect(await slotCount()).toBe(5);
  });

  it("treats a different subject at the same time as a conflict", async () => {
    const userId = await createUser();
    const semesterId = await createDatedSemester(userId);
    const first = await createSubjectFor(userId, semesterId, "Physics");
    const second = await createSubjectFor(userId, semesterId, "Chemistry");

    await createTimetableSlot(db, userId, semesterId, slotInput(first.id));

    await expect(
      createTimetableSlot(db, userId, semesterId, slotInput(second.id)),
    ).rejects.toBeInstanceOf(TimetableSlotOverlapError);
  });

  it("ignores archived slots for conflicts and listing", async () => {
    const userId = await createUser();
    const semesterId = await createDatedSemester(userId);
    const subject = await createSubjectFor(userId, semesterId);

    const archived = await createTimetableSlot(
      db,
      userId,
      semesterId,
      slotInput(subject.id),
    );

    await client.query(
      "update timetable_slots set archived_at = timestamptz '2026-07-01 00:00:00+00' where id = $1",
      [archived.id],
    );

    const live = await createTimetableSlot(
      db,
      userId,
      semesterId,
      slotInput(subject.id),
    );

    expect(live.id).not.toBe(archived.id);
    expect(
      (await listTimetableSlots(db, userId, semesterId)).map((slot) => slot.id),
    ).toEqual([live.id]);
    expect(
      await getTimetableSlot(db, userId, semesterId, archived.id),
    ).toMatchObject({ archivedAt: "2026-07-01T00:00:00.000Z" });
  });
});

describe("listTimetableSlots and getTimetableSlot", () => {
  it("lists one semester's slots by weekday then start time", async () => {
    const userId = await createUser();
    const semesterId = await createDatedSemester(userId);
    const otherSemester = await createDatedSemester(userId);
    const subject = await createSubjectFor(userId, semesterId);

    await createTimetableSlot(
      db,
      userId,
      semesterId,
      slotInput(subject.id, {
        dayOfWeek: 3,
        startTime: "11:00",
        endTime: "12:00",
      }),
    );
    await createTimetableSlot(
      db,
      userId,
      semesterId,
      slotInput(subject.id, {
        dayOfWeek: 1,
        startTime: "14:00",
        endTime: "15:00",
      }),
    );
    await createTimetableSlot(db, userId, semesterId, slotInput(subject.id));

    const otherSubject = await createSubjectFor(userId, otherSemester);
    await createTimetableSlot(
      db,
      userId,
      otherSemester,
      slotInput(otherSubject.id),
    );

    const listed = await listTimetableSlots(db, userId, semesterId);

    expect(listed.map((slot) => [slot.dayOfWeek, slot.startTime])).toEqual([
      [1, "09:00"],
      [1, "14:00"],
      [3, "11:00"],
    ]);
  });

  it("returns no slots for another owner, another semester, or a bad id", async () => {
    const owner = await createUser();
    const other = await createUser();
    const semesterId = await createDatedSemester(owner);
    const subject = await createSubjectFor(owner, semesterId);
    const slot = await createTimetableSlot(
      db,
      owner,
      semesterId,
      slotInput(subject.id),
    );

    expect(await listTimetableSlots(db, other, semesterId)).toEqual([]);
    expect(await listTimetableSlots(db, owner, uuid())).toEqual([]);
    expect(await listTimetableSlots(db, owner, "not-a-uuid")).toEqual([]);
    expect(await getTimetableSlot(db, owner, semesterId, slot.id)).toEqual(
      slot,
    );
    expect(await getTimetableSlot(db, other, semesterId, slot.id)).toBeNull();
    expect(await getTimetableSlot(db, owner, uuid(), slot.id)).toBeNull();
    expect(
      await getTimetableSlot(db, owner, semesterId, "not-a-uuid"),
    ).toBeNull();
  });
});

describe("updateTimetableSlot", () => {
  it("moves the time and changes the room and class type", async () => {
    const userId = await createUser();
    const semesterId = await createDatedSemester(userId);
    const subject = await createSubjectFor(userId, semesterId);
    const slot = await createTimetableSlot(
      db,
      userId,
      semesterId,
      slotInput(subject.id, { room: "Room 1" }),
    );

    const updated = await updateTimetableSlot(db, userId, semesterId, slot.id, {
      startTime: "13:00",
      endTime: "14:30",
      room: "  Lab 4  ",
      classType: "tutorial",
    });

    expect(updated).toMatchObject({
      id: slot.id,
      startTime: "13:00",
      endTime: "14:30",
      room: "Lab 4",
      classType: "tutorial",
    });
  });

  it("clears the room and active dates with null", async () => {
    const userId = await createUser();
    const semesterId = await createDatedSemester(userId);
    const subject = await createSubjectFor(userId, semesterId);
    const slot = await createTimetableSlot(
      db,
      userId,
      semesterId,
      slotInput(subject.id, {
        room: "Room 1",
        activeFrom: "2026-08-01",
        activeTo: "2026-09-01",
      }),
    );

    const updated = await updateTimetableSlot(db, userId, semesterId, slot.id, {
      room: null,
      activeFrom: null,
      activeTo: null,
    });

    expect(updated).toMatchObject({
      room: null,
      activeFrom: null,
      activeTo: null,
    });
  });

  it("returns the stored record for an empty patch", async () => {
    const userId = await createUser();
    const semesterId = await createDatedSemester(userId);
    const subject = await createSubjectFor(userId, semesterId);
    const slot = await createTimetableSlot(
      db,
      userId,
      semesterId,
      slotInput(subject.id),
    );

    expect(
      await updateTimetableSlot(db, userId, semesterId, slot.id, {}),
    ).toEqual(slot);
  });

  it("allows saving unchanged values", async () => {
    const userId = await createUser();
    const semesterId = await createDatedSemester(userId);
    const subject = await createSubjectFor(userId, semesterId);
    const slot = await createTimetableSlot(
      db,
      userId,
      semesterId,
      slotInput(subject.id),
    );

    const updated = await updateTimetableSlot(db, userId, semesterId, slot.id, {
      dayOfWeek: slot.dayOfWeek,
      startTime: slot.startTime,
    });

    expect(updated).toMatchObject({ id: slot.id, startTime: "09:00" });
  });

  it("rejects an edit that would overlap another slot and keeps the row", async () => {
    const userId = await createUser();
    const semesterId = await createDatedSemester(userId);
    const subject = await createSubjectFor(userId, semesterId);
    await createTimetableSlot(db, userId, semesterId, slotInput(subject.id));
    const second = await createTimetableSlot(
      db,
      userId,
      semesterId,
      slotInput(subject.id, { startTime: "11:00", endTime: "12:00" }),
    );

    await expect(
      updateTimetableSlot(db, userId, semesterId, second.id, {
        startTime: "09:30",
        endTime: "10:30",
      }),
    ).rejects.toBeInstanceOf(TimetableSlotOverlapError);

    expect(
      await getTimetableSlot(db, userId, semesterId, second.id),
    ).toMatchObject({ startTime: "11:00", endTime: "12:00" });
  });

  it("rejects a merged time order that is invalid and keeps the row", async () => {
    const userId = await createUser();
    const semesterId = await createDatedSemester(userId);
    const subject = await createSubjectFor(userId, semesterId);
    const slot = await createTimetableSlot(
      db,
      userId,
      semesterId,
      slotInput(subject.id),
    );

    for (const patch of [{ startTime: "10:00" }, { endTime: "08:00" }]) {
      await expect(
        updateTimetableSlot(db, userId, semesterId, slot.id, patch),
      ).rejects.toBeInstanceOf(TimetableSlotValidationError);
    }

    expect(await getTimetableSlot(db, userId, semesterId, slot.id)).toEqual(
      slot,
    );
  });

  it("rejects an invalid or out-of-semester active range", async () => {
    const userId = await createUser();
    const semesterId = await createDatedSemester(userId);
    const subject = await createSubjectFor(userId, semesterId);
    const slot = await createTimetableSlot(
      db,
      userId,
      semesterId,
      slotInput(subject.id),
    );

    await expect(
      updateTimetableSlot(db, userId, semesterId, slot.id, {
        activeFrom: "2026-09-01",
        activeTo: "2026-08-01",
      }),
    ).rejects.toBeInstanceOf(TimetableSlotValidationError);
    await expect(
      updateTimetableSlot(db, userId, semesterId, slot.id, {
        activeFrom: "2026-06-30",
      }),
    ).rejects.toBeInstanceOf(TimetableSlotValidationError);
  });

  it("refuses a subject from another semester", async () => {
    const userId = await createUser();
    const semesterId = await createDatedSemester(userId);
    const otherSemester = await createDatedSemester(userId);
    const subject = await createSubjectFor(userId, semesterId);
    const foreignSubject = await createSubjectFor(userId, otherSemester);
    const slot = await createTimetableSlot(
      db,
      userId,
      semesterId,
      slotInput(subject.id),
    );

    await expect(
      updateTimetableSlot(db, userId, semesterId, slot.id, {
        subjectId: foreignSubject.id,
      }),
    ).rejects.toBeInstanceOf(TimetableSlotOwnershipError);
  });

  it("moves a slot to another subject in the same semester", async () => {
    const userId = await createUser();
    const semesterId = await createDatedSemester(userId);
    const first = await createSubjectFor(userId, semesterId, "Physics");
    const second = await createSubjectFor(userId, semesterId, "Chemistry");
    const slot = await createTimetableSlot(
      db,
      userId,
      semesterId,
      slotInput(first.id),
    );

    const updated = await updateTimetableSlot(db, userId, semesterId, slot.id, {
      subjectId: second.id,
    });

    expect(updated).toMatchObject({ subjectId: second.id });
  });

  it("cannot modify another owner's slot or address a malformed id", async () => {
    const owner = await createUser();
    const other = await createUser();
    const semesterId = await createDatedSemester(owner);
    const subject = await createSubjectFor(owner, semesterId);
    const slot = await createTimetableSlot(
      db,
      owner,
      semesterId,
      slotInput(subject.id),
    );

    expect(
      await updateTimetableSlot(db, other, semesterId, slot.id, {
        startTime: "08:00",
      }),
    ).toBeNull();
    expect(
      await updateTimetableSlot(db, owner, semesterId, uuid(), {}),
    ).toBeNull();
    expect(
      await updateTimetableSlot(db, owner, semesterId, "not-a-uuid", {}),
    ).toBeNull();
    expect(
      await getTimetableSlot(db, owner, semesterId, slot.id),
    ).toMatchObject({ startTime: "09:00" });
  });
});

describe("deleteTimetableSlot", () => {
  it("deletes an unreferenced slot", async () => {
    const userId = await createUser();
    const semesterId = await createDatedSemester(userId);
    const subject = await createSubjectFor(userId, semesterId);
    const slot = await createTimetableSlot(
      db,
      userId,
      semesterId,
      slotInput(subject.id),
    );

    expect(await deleteTimetableSlot(db, userId, semesterId, slot.id)).toBe(
      true,
    );
    expect(await getTimetableSlot(db, userId, semesterId, slot.id)).toBeNull();
    expect(await listTimetableSlots(db, userId, semesterId)).toEqual([]);
  });

  it("returns false for another owner, another semester, or a bad id", async () => {
    const owner = await createUser();
    const other = await createUser();
    const semesterId = await createDatedSemester(owner);
    const otherSemester = await createDatedSemester(owner);
    const subject = await createSubjectFor(owner, semesterId);
    const slot = await createTimetableSlot(
      db,
      owner,
      semesterId,
      slotInput(subject.id),
    );

    expect(await deleteTimetableSlot(db, other, semesterId, slot.id)).toBe(
      false,
    );
    expect(await deleteTimetableSlot(db, owner, otherSemester, slot.id)).toBe(
      false,
    );
    expect(await deleteTimetableSlot(db, owner, semesterId, "not-a-uuid")).toBe(
      false,
    );
    expect(
      await getTimetableSlot(db, owner, semesterId, slot.id),
    ).not.toBeNull();
  });

  it("protects a subject that a slot still uses", async () => {
    const userId = await createUser();
    const semesterId = await createDatedSemester(userId);
    const subject = await createSubjectFor(userId, semesterId);

    await createTimetableSlot(db, userId, semesterId, slotInput(subject.id));

    await expect(
      deleteSubject(db, userId, semesterId, subject.id),
    ).rejects.toThrow();
  });
});
