import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  SubjectOwnershipError,
  SubjectValidationError,
} from "../domain/subject.js";
import * as schema from "./schema.js";
import { createSemester } from "./semester-repository.js";
import {
  createSubject,
  deleteSubject,
  getSubject,
  listSubjects,
  updateSubject,
} from "./subject-repository.js";

/**
 * These tests run the committed SQL migrations against a real PostgreSQL
 * engine (PGlite, PostgreSQL 18 compiled to WebAssembly) in memory. The
 * database is disposable and created by the test run itself, so no
 * external server or credentials are involved.
 */
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
  await client.exec("truncate table subjects, semesters, users cascade");
});

async function createUser(): Promise<string> {
  const id = `user_${crypto.randomUUID()}`;
  await db.insert(schema.users).values({ id });
  return id;
}

async function createSemesterFor(
  userId: string,
  name = "Semester 1",
): Promise<string> {
  const semester = await createSemester(db, userId, {
    name,
    academicYear: "2026-27",
  });
  return semester.id;
}

function uuid(): string {
  return crypto.randomUUID();
}

describe("subject migration", () => {
  it("creates the tables the schema describes", async () => {
    const tables = await client.query<{ table_name: string }>(
      `select table_name
         from information_schema.tables
        where table_schema = 'public'
        order by table_name`,
    );

    expect(tables.rows.map((row) => row.table_name)).toEqual([
      "day_exception_slots",
      "day_exceptions",
      "semesters",
      "subjects",
      "timetable_slots",
      "users",
    ]);
  });

  it("enforces semester ownership with a composite foreign key", async () => {
    const foreignKeys = await client.query<{
      conname: string;
      definition: string;
    }>(
      `select conname, pg_get_constraintdef(oid) as definition
         from pg_constraint
        where conrelid = 'subjects'::regclass and contype = 'f'`,
    );

    expect(foreignKeys.rows.map((row) => row.conname)).toEqual([
      "subjects_semester_owner_fk",
    ]);
    expect(foreignKeys.rows[0]?.definition).toContain("(semester_id, user_id)");
    expect(foreignKeys.rows[0]?.definition).toContain("semesters(id, user_id)");
    expect(foreignKeys.rows[0]?.definition).toContain("ON DELETE RESTRICT");

    const parentUnique = await client.query<{ conname: string }>(
      `select conname
         from pg_constraint
        where conrelid = 'semesters'::regclass and contype = 'u'
        order by conname`,
    );

    expect(parentUnique.rows.map((row) => row.conname)).toEqual([
      "semesters_id_user_id_unique",
    ]);
  });

  it("creates the subject name check and indexes", async () => {
    const checks = await client.query<{ conname: string }>(
      `select conname
         from pg_constraint
        where conrelid = 'subjects'::regclass and contype = 'c'
        order by conname`,
    );

    expect(checks.rows.map((row) => row.conname)).toEqual([
      "subjects_name_length",
    ]);

    const indexes = await client.query<{ indexname: string }>(
      `select indexname
         from pg_indexes
        where tablename = 'subjects'
        order by indexname`,
    );

    expect(indexes.rows.map((row) => row.indexname)).toEqual([
      "subjects_id_semester_id_user_id_unique",
      "subjects_pkey",
      "subjects_semester_id_idx",
      "subjects_user_id_idx",
    ]);
  });

  it("can be applied twice without effect", async () => {
    await expect(
      migrate(db, { migrationsFolder: MIGRATIONS_FOLDER }),
    ).resolves.toBeUndefined();
  });
});

describe("createSubject", () => {
  it("stores a subject in its semester and trims the name", async () => {
    const userId = await createUser();
    const semesterId = await createSemesterFor(userId);

    const subject = await createSubject(db, userId, semesterId, {
      name: "  Data Structures  ",
    });

    expect(subject).toMatchObject({
      semesterId,
      name: "Data Structures",
    });
    expect(subject.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(new Date(subject.createdAt).toISOString()).toBe(subject.createdAt);
  });

  it("rejects invalid input without writing a row", async () => {
    const userId = await createUser();
    const semesterId = await createSemesterFor(userId);

    for (const input of [
      {},
      { name: "" },
      { name: "   " },
      { name: "x".repeat(81) },
      null,
    ]) {
      await expect(
        createSubject(db, userId, semesterId, input),
      ).rejects.toBeInstanceOf(SubjectValidationError);
    }

    const count = await client.query<{ count: string }>(
      "select count(*)::text as count from subjects",
    );

    expect(count.rows[0]?.count).toBe("0");
  });

  it("allows the same name in different semesters", async () => {
    const userId = await createUser();
    const firstSemester = await createSemesterFor(userId, "Semester 1");
    const secondSemester = await createSemesterFor(userId, "Semester 2");

    const first = await createSubject(db, userId, firstSemester, {
      name: "Engineering Mathematics",
    });
    const second = await createSubject(db, userId, secondSemester, {
      name: "Engineering Mathematics",
    });

    expect(first.id).not.toBe(second.id);
    expect(await listSubjects(db, userId, firstSemester)).toHaveLength(1);
    expect(await listSubjects(db, userId, secondSemester)).toHaveLength(1);
  });

  it("allows duplicate names within one semester", async () => {
    const userId = await createUser();
    const semesterId = await createSemesterFor(userId);

    const first = await createSubject(db, userId, semesterId, {
      name: "Physics",
    });
    const second = await createSubject(db, userId, semesterId, {
      name: "Physics",
    });

    expect(first.id).not.toBe(second.id);
    expect(await listSubjects(db, userId, semesterId)).toHaveLength(2);
  });

  it("refuses to file a subject under another user's semester", async () => {
    const owner = await createUser();
    const other = await createUser();
    const ownersSemester = await createSemesterFor(owner);

    await expect(
      createSubject(db, other, ownersSemester, { name: "Physics" }),
    ).rejects.toBeInstanceOf(SubjectOwnershipError);

    const count = await client.query<{ count: string }>(
      "select count(*)::text as count from subjects",
    );

    expect(count.rows[0]?.count).toBe("0");
  });

  it("refuses a subject for a nonexistent semester", async () => {
    const userId = await createUser();

    await expect(
      createSubject(db, userId, uuid(), { name: "Physics" }),
    ).rejects.toBeInstanceOf(SubjectOwnershipError);
  });

  it("refuses a subject for a nonexistent owner", async () => {
    const owner = await createUser();
    const ownersSemester = await createSemesterFor(owner);

    await expect(
      createSubject(db, "user_missing", ownersSemester, { name: "Physics" }),
    ).rejects.toBeInstanceOf(SubjectOwnershipError);
  });
});

describe("listSubjects and getSubject", () => {
  it("lists one semester's subjects alphabetically", async () => {
    const userId = await createUser();
    const firstSemester = await createSemesterFor(userId, "Semester 1");
    const secondSemester = await createSemesterFor(userId, "Semester 2");

    await createSubject(db, userId, firstSemester, { name: "Physics" });
    await createSubject(db, userId, firstSemester, {
      name: "Algorithms",
    });
    await createSubject(db, userId, secondSemester, {
      name: "Chemistry",
    });

    const listed = await listSubjects(db, userId, firstSemester);

    expect(listed.map((subject) => subject.name)).toEqual([
      "Algorithms",
      "Physics",
    ]);
  });

  it("returns only the owner's subjects for an owned semester id", async () => {
    const owner = await createUser();
    const other = await createUser();
    const ownersSemester = await createSemesterFor(owner);
    const othersSemester = await createSemesterFor(other);

    await createSubject(db, owner, ownersSemester, { name: "Physics" });
    await createSubject(db, other, othersSemester, { name: "Chemistry" });

    expect(await listSubjects(db, owner, ownersSemester)).toHaveLength(1);
    expect(await listSubjects(db, other, ownersSemester)).toEqual([]);
  });

  it("returns a subject by id within its semester", async () => {
    const userId = await createUser();
    const semesterId = await createSemesterFor(userId);
    const subject = await createSubject(db, userId, semesterId, {
      name: "Physics",
    });

    expect(await getSubject(db, userId, semesterId, subject.id)).toEqual(
      subject,
    );
  });

  it("treats another owner's subject as absent", async () => {
    const owner = await createUser();
    const other = await createUser();
    const ownersSemester = await createSemesterFor(owner);
    const subject = await createSubject(db, owner, ownersSemester, {
      name: "Physics",
    });

    expect(await getSubject(db, other, ownersSemester, subject.id)).toBeNull();
  });

  it("treats a subject under a different semester as absent", async () => {
    const userId = await createUser();
    const firstSemester = await createSemesterFor(userId, "Semester 1");
    const secondSemester = await createSemesterFor(userId, "Semester 2");
    const subject = await createSubject(db, userId, firstSemester, {
      name: "Physics",
    });

    expect(await getSubject(db, userId, secondSemester, subject.id)).toBeNull();
  });

  it("treats malformed identifiers as absent", async () => {
    const userId = await createUser();
    const semesterId = await createSemesterFor(userId);

    expect(await getSubject(db, userId, semesterId, "not-a-uuid")).toBeNull();
    expect(await getSubject(db, userId, "not-a-uuid", uuid())).toBeNull();
    expect(await listSubjects(db, userId, "not-a-uuid")).toEqual([]);
    expect(
      await updateSubject(db, userId, semesterId, "not-a-uuid", {}),
    ).toBeNull();
    expect(await deleteSubject(db, userId, semesterId, "not-a-uuid")).toBe(
      false,
    );
  });
});

describe("updateSubject", () => {
  it("updates the name and moves updatedAt", async () => {
    const userId = await createUser();
    const semesterId = await createSemesterFor(userId);
    const subject = await createSubject(db, userId, semesterId, {
      name: "Physics",
    });

    await client.query(
      "update subjects set updated_at = timestamptz '2000-01-01 00:00:00+00' where id = $1",
      [subject.id],
    );

    const updated = await updateSubject(db, userId, semesterId, subject.id, {
      name: "  Applied Physics  ",
    });

    expect(updated).toMatchObject({
      id: subject.id,
      semesterId,
      name: "Applied Physics",
    });
    expect(updated?.updatedAt.startsWith("2000-")).toBe(false);
  });

  it("returns the stored record for an empty patch", async () => {
    const userId = await createUser();
    const semesterId = await createSemesterFor(userId);
    const subject = await createSubject(db, userId, semesterId, {
      name: "Physics",
    });

    const updated = await updateSubject(db, userId, semesterId, subject.id, {});

    expect(updated).toEqual(subject);
  });

  it("rejects an invalid name and keeps the stored row", async () => {
    const userId = await createUser();
    const semesterId = await createSemesterFor(userId);
    const subject = await createSubject(db, userId, semesterId, {
      name: "Physics",
    });

    for (const patch of [{ name: "   " }, { name: "x".repeat(81) }]) {
      await expect(
        updateSubject(db, userId, semesterId, subject.id, patch),
      ).rejects.toBeInstanceOf(SubjectValidationError);
    }

    expect(await getSubject(db, userId, semesterId, subject.id)).toMatchObject({
      name: "Physics",
    });
  });

  it("cannot modify another owner's subject", async () => {
    const owner = await createUser();
    const other = await createUser();
    const ownersSemester = await createSemesterFor(owner);
    const subject = await createSubject(db, owner, ownersSemester, {
      name: "Physics",
    });

    expect(
      await updateSubject(db, other, ownersSemester, subject.id, {
        name: "Hijacked",
      }),
    ).toBeNull();
    expect(
      await getSubject(db, owner, ownersSemester, subject.id),
    ).toMatchObject({ name: "Physics" });
  });

  it("cannot modify a subject through a different semester", async () => {
    const userId = await createUser();
    const firstSemester = await createSemesterFor(userId, "Semester 1");
    const secondSemester = await createSemesterFor(userId, "Semester 2");
    const subject = await createSubject(db, userId, firstSemester, {
      name: "Physics",
    });

    expect(
      await updateSubject(db, userId, secondSemester, subject.id, {
        name: "Hijacked",
      }),
    ).toBeNull();
  });

  it("returns null for a nonexistent subject", async () => {
    const userId = await createUser();
    const semesterId = await createSemesterFor(userId);

    expect(
      await updateSubject(db, userId, semesterId, uuid(), {
        name: "Physics",
      }),
    ).toBeNull();
  });

  it("allows renaming a subject to a sibling's name", async () => {
    const userId = await createUser();
    const semesterId = await createSemesterFor(userId);
    const first = await createSubject(db, userId, semesterId, {
      name: "Physics",
    });
    const second = await createSubject(db, userId, semesterId, {
      name: "Chemistry",
    });

    const updated = await updateSubject(db, userId, semesterId, second.id, {
      name: "Physics",
    });

    expect(updated?.name).toBe("Physics");
    expect(await getSubject(db, userId, semesterId, first.id)).toMatchObject({
      name: "Physics",
    });
  });
});

describe("deleteSubject", () => {
  it("deletes only the requested subject", async () => {
    const userId = await createUser();
    const semesterId = await createSemesterFor(userId);
    const first = await createSubject(db, userId, semesterId, {
      name: "Physics",
    });
    const second = await createSubject(db, userId, semesterId, {
      name: "Chemistry",
    });

    expect(await deleteSubject(db, userId, semesterId, first.id)).toBe(true);
    expect(await getSubject(db, userId, semesterId, first.id)).toBeNull();
    expect(await getSubject(db, userId, semesterId, second.id)).not.toBeNull();
    expect(await listSubjects(db, userId, semesterId)).toHaveLength(1);
  });

  it("returns false for a nonexistent subject", async () => {
    const userId = await createUser();
    const semesterId = await createSemesterFor(userId);

    expect(await deleteSubject(db, userId, semesterId, uuid())).toBe(false);
  });

  it("cannot delete another owner's subject", async () => {
    const owner = await createUser();
    const other = await createUser();
    const ownersSemester = await createSemesterFor(owner);
    const subject = await createSubject(db, owner, ownersSemester, {
      name: "Physics",
    });

    expect(await deleteSubject(db, other, ownersSemester, subject.id)).toBe(
      false,
    );
    expect(
      await getSubject(db, owner, ownersSemester, subject.id),
    ).not.toBeNull();
  });

  it("cannot delete a subject through a different semester", async () => {
    const userId = await createUser();
    const firstSemester = await createSemesterFor(userId, "Semester 1");
    const secondSemester = await createSemesterFor(userId, "Semester 2");
    const subject = await createSubject(db, userId, firstSemester, {
      name: "Physics",
    });

    expect(await deleteSubject(db, userId, secondSemester, subject.id)).toBe(
      false,
    );
    expect(
      await getSubject(db, userId, firstSemester, subject.id),
    ).not.toBeNull();
  });
});

describe("database constraints", () => {
  it("rejects a blank name written behind the repository", async () => {
    const userId = await createUser();
    const semesterId = await createSemesterFor(userId);

    await expect(
      client.query(
        "insert into subjects (semester_id, user_id, name) values ($1, $2, '   ')",
        [semesterId, userId],
      ),
    ).rejects.toThrow(/subjects_name_length/);
  });

  it("rejects an ownership mismatch written behind the repository", async () => {
    const owner = await createUser();
    const other = await createUser();
    const ownersSemester = await createSemesterFor(owner);

    await expect(
      client.query(
        "insert into subjects (semester_id, user_id, name) values ($1, $2, 'Physics')",
        [ownersSemester, other],
      ),
    ).rejects.toThrow(/subjects_semester_owner_fk/);
  });

  it("rejects a subject without a semester", async () => {
    const userId = await createUser();

    await expect(
      client.query(
        "insert into subjects (semester_id, user_id, name) values (null, $1, 'Physics')",
        [userId],
      ),
    ).rejects.toThrow(/not-null|null value/i);
  });

  it("refuses to delete a semester that still has subjects", async () => {
    const userId = await createUser();
    const semesterId = await createSemesterFor(userId);

    await createSubject(db, userId, semesterId, { name: "Physics" });

    await expect(
      client.query("delete from semesters where id = $1", [semesterId]),
    ).rejects.toThrow(/subjects_semester_owner_fk/);
  });

  it("refuses to delete an owner who still has subjects", async () => {
    const userId = await createUser();
    const semesterId = await createSemesterFor(userId);

    await createSubject(db, userId, semesterId, { name: "Physics" });

    await expect(
      client.query("delete from users where id = $1", [userId]),
    ).rejects.toThrow(/foreign key/i);
  });
});
