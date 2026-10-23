import { describe, expect, it } from "vitest";
import {
  SemesterValidationError,
  assertSemesterInvariants,
  mergeSemesterFields,
  parseCreateSemesterInput,
  parseSemesterPatch,
} from "./semester.js";

const validCreate = {
  name: "Semester 1",
  academicYear: "2026-27",
};

function stored(
  overrides: Partial<ReturnType<typeof parseCreateSemesterInput>> = {},
) {
  return { ...parseCreateSemesterInput(validCreate), ...overrides };
}

describe("parseCreateSemesterInput", () => {
  it("fills the defaults a draft semester needs", () => {
    const parsed = parseCreateSemesterInput(validCreate);

    expect(parsed).toEqual({
      name: "Semester 1",
      academicYear: "2026-27",
      startDate: null,
      endDate: null,
      status: "setup",
    });
  });

  it("trims surrounding whitespace", () => {
    const parsed = parseCreateSemesterInput({
      name: "  Semester 2  ",
      academicYear: "  2026-27 ",
    });

    expect(parsed.name).toBe("Semester 2");
    expect(parsed.academicYear).toBe("2026-27");
  });

  it("rejects a blank or missing name and academic year", () => {
    expect(() =>
      parseCreateSemesterInput({ ...validCreate, name: "   " }),
    ).toThrow(SemesterValidationError);

    expect(() => parseCreateSemesterInput({ academicYear: "2026-27" })).toThrow(
      SemesterValidationError,
    );

    expect(() =>
      parseCreateSemesterInput({ ...validCreate, academicYear: "" }),
    ).toThrow(SemesterValidationError);
  });

  it("rejects values longer than the stored limits", () => {
    expect(() =>
      parseCreateSemesterInput({ ...validCreate, name: "a".repeat(81) }),
    ).toThrow(SemesterValidationError);

    expect(() =>
      parseCreateSemesterInput({
        ...validCreate,
        academicYear: "a".repeat(21),
      }),
    ).toThrow(SemesterValidationError);
  });

  it("rejects an impossible calendar date, not just a malformed one", () => {
    expect(() =>
      parseCreateSemesterInput({ ...validCreate, startDate: "2025-02-29" }),
    ).toThrow(SemesterValidationError);

    expect(() =>
      parseCreateSemesterInput({ ...validCreate, startDate: "2026-02-30" }),
    ).toThrow(SemesterValidationError);

    expect(() =>
      parseCreateSemesterInput({ ...validCreate, startDate: "24-01-2026" }),
    ).toThrow(SemesterValidationError);
  });

  it("accepts a leap day in a leap year", () => {
    expect(
      parseCreateSemesterInput({ ...validCreate, startDate: "2024-02-29" })
        .startDate,
    ).toBe("2024-02-29");
  });

  it("rejects an end date before the start date but allows one day", () => {
    expect(() =>
      parseCreateSemesterInput({
        ...validCreate,
        startDate: "2026-07-01",
        endDate: "2026-06-30",
      }),
    ).toThrow(SemesterValidationError);

    expect(
      parseCreateSemesterInput({
        ...validCreate,
        startDate: "2026-07-01",
        endDate: "2026-07-01",
      }).endDate,
    ).toBe("2026-07-01");
  });

  it("allows a draft without dates", () => {
    expect(
      parseCreateSemesterInput({ ...validCreate, status: "setup" }),
    ).toEqual({
      ...validCreate,
      startDate: null,
      endDate: null,
      status: "setup",
    });
  });

  it("requires both dates before a semester can be active", () => {
    expect(() =>
      parseCreateSemesterInput({ ...validCreate, status: "active" }),
    ).toThrow(/start date/);

    expect(() =>
      parseCreateSemesterInput({
        ...validCreate,
        status: "active",
        startDate: "2026-07-01",
      }),
    ).toThrow(SemesterValidationError);

    expect(
      parseCreateSemesterInput({
        ...validCreate,
        status: "active",
        startDate: "2026-07-01",
        endDate: "2026-11-30",
      }).status,
    ).toBe("active");
  });

  it("rejects an unknown status", () => {
    expect(() =>
      parseCreateSemesterInput({ ...validCreate, status: "paused" }),
    ).toThrow(SemesterValidationError);
  });

  it("names the field that failed", () => {
    try {
      parseCreateSemesterInput({
        ...validCreate,
        startDate: "2026-07-01",
        endDate: "2026-06-30",
      });
      expect.unreachable("validation should have failed");
    } catch (error) {
      expect(error).toBeInstanceOf(SemesterValidationError);
      const issues = (error as SemesterValidationError).issues;
      expect(issues.map((issue) => issue.path)).toContain("endDate");
    }
  });
});

describe("parseSemesterPatch", () => {
  it("accepts an empty patch", () => {
    expect(parseSemesterPatch({})).toEqual({});
  });

  it("accepts clearing a date with null", () => {
    expect(parseSemesterPatch({ endDate: null })).toEqual({ endDate: null });
  });

  it("rejects an invalid value in a patch", () => {
    expect(() => parseSemesterPatch({ name: " " })).toThrow(
      SemesterValidationError,
    );
    expect(() => parseSemesterPatch({ status: "done" })).toThrow(
      SemesterValidationError,
    );
  });
});

describe("mergeSemesterFields", () => {
  const current = stored({
    startDate: "2026-07-01",
    endDate: "2026-11-30",
    status: "active",
  });

  it("keeps stored values a patch omits", () => {
    expect(
      mergeSemesterFields(current, { name: "Semester 1 (renamed)" }),
    ).toEqual({
      ...current,
      name: "Semester 1 (renamed)",
    });
  });

  it("clears a date that the patch sets to null", () => {
    expect(mergeSemesterFields(current, { endDate: null })).toEqual({
      ...current,
      endDate: null,
    });
  });

  it("detects a date order broken by a patch that only moves one date", () => {
    const merged = mergeSemesterFields(current, { endDate: "2026-06-30" });

    expect(() => assertSemesterInvariants(merged)).toThrow(
      SemesterValidationError,
    );
  });

  it("detects an active semester that a patch leaves without dates", () => {
    const merged = mergeSemesterFields(current, {
      startDate: null,
      endDate: null,
    });

    expect(() => assertSemesterInvariants(merged)).toThrow(/start date/);
  });

  it("allows demoting an active semester while its dates are cleared", () => {
    const merged = mergeSemesterFields(current, {
      status: "archived",
      startDate: null,
      endDate: null,
    });

    expect(() => assertSemesterInvariants(merged)).not.toThrow();
  });
});
