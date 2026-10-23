import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SemesterValidationError } from "../domain/semester.js";
import * as schema from "./schema.js";
import {
  ActiveSemesterConflictError,
  activateSemester,
  createSemester,
  getSemester,
  listSemesters,
  updateSemester,
} from "./semester-repository.js";

/**
 * These tests run the committed SQL migration against a real PostgreSQL
 * engine (PGlite, PostgreSQL 18 compiled to WebAssembly) in memory. The
 * database is disposable and created by the test run itself, so no
 * external server or credentials are involved.
 *
 * PGlite is the same engine and SQL semantics as a server, but it is not
 * the managed server this project will deploy against; that remains
 * unverified until a real PostgreSQL instance is available.
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
  await client.exec("truncate table semesters, users cascade");
});

async function createUser(): Promise<string> {
  const id = `user_${crypto.randomUUID()}`;
  await db.insert(schema.users).values({ id });
  return id;
}

const activeTerm = {
  startDate: "2026-07-01",
  endDate: "2026-11-30",
} as const;

describe("semester migration", () => {
  it("creates the tables the schema describes", async () => {
    const tables = await client.query<{ table_name: string }>(
      `select table_name
         from information_schema.tables
        where table_schema = 'public'
        order by table_name`,
    );

    expect(tables.rows.map((row) => row.table_name)).toEqual([
      "semesters",
      "users",
    ]);
  });

  it("creates the status enum in its declared order", async () => {
    const labels = await client.query<{ label: string }>(
      `select e.enumlabel as label
         from pg_enum e
         join pg_type t on t.oid = e.enumtypid
        where t.typname = 'semester_status'
        order by e.enumsortorder`,
    );

    expect(labels.rows.map((row) => row.label)).toEqual([
      "setup",
      "active",
      "completed",
      "archived",
    ]);
  });

  it("creates the partial unique index and the check constraints", async () => {
    const index = await client.query<{ indexdef: string }>(
      `select indexdef from pg_indexes
        where indexname = 'semesters_one_active_per_user'`,
    );

    expect(index.rows[0]?.indexdef).toContain("WHERE");
    expect(index.rows[0]?.indexdef).toContain("active");

    const checks = await client.query<{ conname: string }>(
      `select conname
         from pg_constraint
        where conrelid = 'semesters'::regclass and contype = 'c'
        order by conname`,
    );

    expect(checks.rows.map((row) => row.conname)).toEqual([
      "semesters_academic_year_length",
      "semesters_active_has_dates",
      "semesters_date_order",
      "semesters_name_length",
    ]);
  });

  it("can be applied twice without effect", async () => {
    await expect(
      migrate(db, { migrationsFolder: MIGRATIONS_FOLDER }),
    ).resolves.toBeUndefined();
  });
});

describe("createSemester", () => {
  it("stores a draft with defaults and trims the input", async () => {
    const userId = await createUser();

    const semester = await createSemester(db, userId, {
      name: "  Semester 1  ",
      academicYear: " 2026-27 ",
    });

    expect(semester).toMatchObject({
      name: "Semester 1",
      academicYear: "2026-27",
      startDate: null,
      endDate: null,
      status: "setup",
    });
    expect(semester.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(new Date(semester.createdAt).toISOString()).toBe(semester.createdAt);
  });

  it("rejects invalid input without writing a row", async () => {
    const userId = await createUser();

    await expect(
      createSemester(db, userId, { name: "   ", academicYear: "2026-27" }),
    ).rejects.toBeInstanceOf(SemesterValidationError);

    await expect(
      createSemester(db, userId, {
        name: "Semester 1",
        academicYear: "2026-27",
        startDate: "2026-07-01",
        endDate: "2026-06-30",
      }),
    ).rejects.toBeInstanceOf(SemesterValidationError);

    const count = await client.query<{ count: string }>(
      "select count(*)::text as count from semesters",
    );

    expect(count.rows[0]?.count).toBe("0");
  });

  it("allows the same name in two different semesters", async () => {
    const userId = await createUser();

    const first = await createSemester(db, userId, {
      name: "Semester 1",
      academicYear: "2025-26",
    });
    const second = await createSemester(db, userId, {
      name: "Semester 1",
      academicYear: "2026-27",
    });

    expect(first.id).not.toBe(second.id);
    expect(await listSemesters(db, userId)).toHaveLength(2);
  });

  it("refuses a second active semester for the same user", async () => {
    const userId = await createUser();

    await createSemester(db, userId, {
      name: "Semester 1",
      academicYear: "2026-27",
      status: "active",
      ...activeTerm,
    });

    await expect(
      createSemester(db, userId, {
        name: "Semester 2",
        academicYear: "2026-27",
        status: "active",
        startDate: "2027-01-05",
        endDate: "2027-05-30",
      }),
    ).rejects.toBeInstanceOf(ActiveSemesterConflictError);

    expect(await listSemesters(db, userId)).toHaveLength(1);
  });

  it("allows one active semester per user, for different users", async () => {
    const firstUser = await createUser();
    const secondUser = await createUser();

    for (const userId of [firstUser, secondUser]) {
      await createSemester(db, userId, {
        name: "Semester 1",
        academicYear: "2026-27",
        status: "active",
        ...activeTerm,
      });
    }

    expect(await listSemesters(db, firstUser)).toHaveLength(1);
    expect(await listSemesters(db, secondUser)).toHaveLength(1);
  });
});

describe("listSemesters and getSemester", () => {
  it("returns only the owner's semesters, newest term first", async () => {
    const owner = await createUser();
    const other = await createUser();

    const draft = await createSemester(db, owner, {
      name: "Draft",
      academicYear: "2027-28",
    });
    const later = await createSemester(db, owner, {
      name: "Semester 2",
      academicYear: "2026-27",
      startDate: "2027-01-05",
      endDate: "2027-05-30",
    });
    const earlier = await createSemester(db, owner, {
      name: "Semester 1",
      academicYear: "2026-27",
      startDate: "2026-07-01",
      endDate: "2026-11-30",
    });
    const stranger = await createSemester(db, other, {
      name: "Someone else",
      academicYear: "2026-27",
      startDate: "2026-08-01",
    });

    const listed = await listSemesters(db, owner);

    expect(listed.map((semester) => semester.id)).toEqual([
      later.id,
      earlier.id,
      draft.id,
    ]);
    expect(listed.map((semester) => semester.id)).not.toContain(stranger.id);
  });

  it("treats another user's semester as absent", async () => {
    const owner = await createUser();
    const other = await createUser();

    const semester = await createSemester(db, owner, {
      name: "Semester 1",
      academicYear: "2026-27",
    });

    expect(await getSemester(db, other, semester.id)).toBeNull();
    expect(await listSemesters(db, other)).toEqual([]);
  });

  it("treats a malformed identifier as absent", async () => {
    const userId = await createUser();

    expect(await getSemester(db, userId, "not-a-uuid")).toBeNull();
    expect(await updateSemester(db, userId, "not-a-uuid", {})).toBeNull();
  });
});

describe("updateSemester", () => {
  it("merges a patch and moves updatedAt", async () => {
    const userId = await createUser();

    const semester = await createSemester(db, userId, {
      name: "Semester 1",
      academicYear: "2026-27",
      status: "completed",
      ...activeTerm,
    });

    await client.query(
      "update semesters set updated_at = timestamptz '2000-01-01 00:00:00+00' where id = $1",
      [semester.id],
    );

    const updated = await updateSemester(db, userId, semester.id, {
      name: "  Semester 1 (renamed) ",
      endDate: null,
    });

    expect(updated).toMatchObject({
      name: "Semester 1 (renamed)",
      startDate: "2026-07-01",
      endDate: null,
      status: "completed",
    });
    expect(updated?.updatedAt.startsWith("2000-")).toBe(false);
  });

  it("rejects a patch that would invert the term and keeps the row", async () => {
    const userId = await createUser();

    const semester = await createSemester(db, userId, {
      name: "Semester 1",
      academicYear: "2026-27",
      ...activeTerm,
    });

    await expect(
      updateSemester(db, userId, semester.id, { endDate: "2026-06-30" }),
    ).rejects.toBeInstanceOf(SemesterValidationError);

    expect(await getSemester(db, userId, semester.id)).toMatchObject({
      endDate: "2026-11-30",
    });
  });

  it("cannot modify another user's semester", async () => {
    const owner = await createUser();
    const other = await createUser();

    const semester = await createSemester(db, owner, {
      name: "Semester 1",
      academicYear: "2026-27",
    });

    const result = await updateSemester(db, other, semester.id, {
      name: "Hijacked",
    });

    expect(result).toBeNull();
    expect(await getSemester(db, owner, semester.id)).toMatchObject({
      name: "Semester 1",
    });
  });

  it("reports a conflict when a patch activates a second semester", async () => {
    const userId = await createUser();

    await createSemester(db, userId, {
      name: "Semester 1",
      academicYear: "2026-27",
      status: "active",
      ...activeTerm,
    });
    const second = await createSemester(db, userId, {
      name: "Semester 2",
      academicYear: "2026-27",
      startDate: "2027-01-05",
      endDate: "2027-05-30",
    });

    await expect(
      updateSemester(db, userId, second.id, { status: "active" }),
    ).rejects.toBeInstanceOf(ActiveSemesterConflictError);
  });
});

describe("activateSemester", () => {
  it("demotes the previous active semester and activates the target", async () => {
    const userId = await createUser();

    const first = await createSemester(db, userId, {
      name: "Semester 1",
      academicYear: "2026-27",
      status: "active",
      ...activeTerm,
    });
    const second = await createSemester(db, userId, {
      name: "Semester 2",
      academicYear: "2026-27",
      startDate: "2027-01-05",
      endDate: "2027-05-30",
    });

    const activated = await activateSemester(db, userId, second.id, {
      demoteActiveTo: "completed",
    });

    expect(activated?.status).toBe("active");
    expect(await getSemester(db, userId, first.id)).toMatchObject({
      status: "completed",
    });
  });

  it("honours the requested demotion status", async () => {
    const userId = await createUser();

    const first = await createSemester(db, userId, {
      name: "Semester 1",
      academicYear: "2026-27",
      status: "active",
      ...activeTerm,
    });
    const second = await createSemester(db, userId, {
      name: "Semester 2",
      academicYear: "2026-27",
      startDate: "2027-01-05",
      endDate: "2027-05-30",
    });

    await activateSemester(db, userId, second.id, {
      demoteActiveTo: "archived",
    });

    expect(await getSemester(db, userId, first.id)).toMatchObject({
      status: "archived",
    });
  });

  it("refuses to activate a semester without dates", async () => {
    const userId = await createUser();

    const draft = await createSemester(db, userId, {
      name: "Semester 1",
      academicYear: "2026-27",
    });

    await expect(
      activateSemester(db, userId, draft.id, { demoteActiveTo: "archived" }),
    ).rejects.toBeInstanceOf(SemesterValidationError);

    expect(await getSemester(db, userId, draft.id)).toMatchObject({
      status: "setup",
    });
  });

  it("refuses to demote the outgoing semester to active", async () => {
    const userId = await createUser();

    const semester = await createSemester(db, userId, {
      name: "Semester 1",
      academicYear: "2026-27",
      ...activeTerm,
    });

    await expect(
      activateSemester(db, userId, semester.id, {
        demoteActiveTo: "active" as never,
      }),
    ).rejects.toBeInstanceOf(SemesterValidationError);
  });

  it("is a no-op for the semester that is already active", async () => {
    const userId = await createUser();

    const semester = await createSemester(db, userId, {
      name: "Semester 1",
      academicYear: "2026-27",
      status: "active",
      ...activeTerm,
    });

    const activated = await activateSemester(db, userId, semester.id, {
      demoteActiveTo: "archived",
    });

    expect(activated?.status).toBe("active");
    expect(activated?.updatedAt).toBe(semester.updatedAt);
  });

  it("does not disturb another user's active semester", async () => {
    const owner = await createUser();
    const other = await createUser();

    const othersActive = await createSemester(db, other, {
      name: "Other semester",
      academicYear: "2026-27",
      status: "active",
      ...activeTerm,
    });
    const targets = await createSemester(db, owner, {
      name: "Semester 1",
      academicYear: "2026-27",
      ...activeTerm,
    });

    await activateSemester(db, owner, targets.id, {
      demoteActiveTo: "archived",
    });

    expect(await getSemester(db, other, othersActive.id)).toMatchObject({
      status: "active",
    });
  });

  it("returns null for another user's semester", async () => {
    const owner = await createUser();
    const other = await createUser();

    const semester = await createSemester(db, owner, {
      name: "Semester 1",
      academicYear: "2026-27",
      ...activeTerm,
    });

    expect(
      await activateSemester(db, other, semester.id, {
        demoteActiveTo: "archived",
      }),
    ).toBeNull();
    expect(await getSemester(db, owner, semester.id)).toMatchObject({
      status: "setup",
    });
  });
});

describe("database constraints", () => {
  it("rejects a blank name written behind the repository", async () => {
    const userId = await createUser();

    await expect(
      client.query(
        "insert into semesters (user_id, name, academic_year) values ($1, '   ', '2026-27')",
        [userId],
      ),
    ).rejects.toThrow(/semesters_name_length/);
  });

  it("rejects an inverted term", async () => {
    const userId = await createUser();

    await expect(
      client.query(
        "insert into semesters (user_id, name, academic_year, start_date, end_date) values ($1, 'Semester 1', '2026-27', '2026-11-30', '2026-07-01')",
        [userId],
      ),
    ).rejects.toThrow(/semesters_date_order/);
  });

  it("rejects an active semester without dates", async () => {
    const userId = await createUser();

    await expect(
      client.query(
        "insert into semesters (user_id, name, academic_year, status) values ($1, 'Semester 1', '2026-27', 'active')",
        [userId],
      ),
    ).rejects.toThrow(/semesters_active_has_dates/);
  });

  it("rejects a second active row per user at the index level", async () => {
    const userId = await createUser();

    await client.query(
      "insert into semesters (user_id, name, academic_year, status, start_date, end_date) values ($1, 'Semester 1', '2026-27', 'active', '2026-07-01', '2026-11-30')",
      [userId],
    );

    await expect(
      client.query(
        "insert into semesters (user_id, name, academic_year, status, start_date, end_date) values ($1, 'Semester 2', '2026-27', 'active', '2027-01-05', '2027-05-30')",
        [userId],
      ),
    ).rejects.toThrow(/semesters_one_active_per_user/);
  });

  it("refuses to delete an owner who still has semesters", async () => {
    const userId = await createUser();

    await createSemester(db, userId, {
      name: "Semester 1",
      academicYear: "2026-27",
    });

    await expect(
      client.query("delete from users where id = $1", [userId]),
    ).rejects.toThrow(/foreign key/i);
  });

  it("rejects a semester for a non-existent owner", async () => {
    await expect(
      client.query(
        "insert into semesters (user_id, name, academic_year) values ('user_missing', 'Semester 1', '2026-27')",
      ),
    ).rejects.toThrow(/foreign key/i);
  });
});
