import { describe, expect, it } from "vitest";
import {
  timetableSlotInvariantIssues,
  timetableSlotSemesterIssues,
} from "@gpa/shared";
import {
  TimetableSlotValidationError,
  assertSlotFitsSemester,
  assertTimetableSlotInvariants,
  mergeTimetableSlotFields,
  parseCreateTimetableSlotInput,
  parseTimetableSlotPatch,
} from "./timetable.js";

const SUBJECT_ID = "0b9a1c2e-3f4a-4b5c-8d6e-7f8091a2b3c4";
const SEMESTER = { startDate: "2026-07-01", endDate: "2026-12-15" };

function input(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    subjectId: SUBJECT_ID,
    dayOfWeek: 1,
    startTime: "09:00",
    endTime: "10:00",
    ...overrides,
  };
}

function issuePaths(error: unknown): string[] {
  if (!(error instanceof TimetableSlotValidationError)) {
    throw error;
  }

  return error.issues.map((issue) => issue.path);
}

describe("parseCreateTimetableSlotInput", () => {
  it("applies defaults for an ordinary lecture slot", () => {
    const parsed = parseCreateTimetableSlotInput(input());

    expect(parsed).toEqual({
      subjectId: SUBJECT_ID,
      dayOfWeek: 1,
      startTime: "09:00",
      endTime: "10:00",
      room: null,
      classType: "lecture",
      activeFrom: null,
      activeTo: null,
    });
  });

  it("trims the room and keeps an explicit class type", () => {
    const parsed = parseCreateTimetableSlotInput(
      input({ room: "  Lab 2  ", classType: "practical" }),
    );

    expect(parsed.room).toBe("Lab 2");
    expect(parsed.classType).toBe("practical");
  });

  it("accepts an active range with equal boundary dates", () => {
    const parsed = parseCreateTimetableSlotInput(
      input({ activeFrom: "2026-08-01", activeTo: "2026-08-01" }),
    );

    expect(parsed.activeFrom).toBe("2026-08-01");
    expect(parsed.activeTo).toBe("2026-08-01");
  });

  it.each([0, 8, 1.5, -1])("rejects dayOfWeek %s", (dayOfWeek) => {
    expect(() =>
      parseCreateTimetableSlotInput(input({ dayOfWeek })),
    ).toThrowError(TimetableSlotValidationError);

    try {
      parseCreateTimetableSlotInput(input({ dayOfWeek }));
    } catch (error) {
      expect(issuePaths(error)).toContain("dayOfWeek");
    }
  });

  it("rejects a weekday sent as a string", () => {
    expect(() =>
      parseCreateTimetableSlotInput(input({ dayOfWeek: "1" })),
    ).toThrowError(TimetableSlotValidationError);
  });

  it.each(["9:00", "24:00", "09:60", "", "0900", "09:00:00"])(
    "rejects the malformed time %s",
    (startTime) => {
      expect(() =>
        parseCreateTimetableSlotInput(input({ startTime })),
      ).toThrowError(TimetableSlotValidationError);
    },
  );

  it("rejects an end time equal to the start time", () => {
    try {
      parseCreateTimetableSlotInput(input({ endTime: "09:00" }));
      throw new Error("expected validation to fail");
    } catch (error) {
      expect(issuePaths(error)).toEqual(["endTime"]);
    }
  });

  it("rejects an end time before the start time", () => {
    expect(() =>
      parseCreateTimetableSlotInput(input({ endTime: "08:30" })),
    ).toThrowError(TimetableSlotValidationError);
  });

  it("rejects an inverted active range", () => {
    try {
      parseCreateTimetableSlotInput(
        input({ activeFrom: "2026-09-01", activeTo: "2026-08-01" }),
      );
      throw new Error("expected validation to fail");
    } catch (error) {
      expect(issuePaths(error)).toEqual(["activeTo"]);
    }
  });

  it("rejects an impossible calendar date", () => {
    expect(() =>
      parseCreateTimetableSlotInput(input({ activeFrom: "2026-02-30" })),
    ).toThrowError(TimetableSlotValidationError);
  });

  it("rejects an unknown class type", () => {
    expect(() =>
      parseCreateTimetableSlotInput(input({ classType: "seminar" })),
    ).toThrowError(TimetableSlotValidationError);
  });

  it("rejects a blank or overlong room", () => {
    for (const room of ["   ", "R".repeat(81)]) {
      expect(() => parseCreateTimetableSlotInput(input({ room }))).toThrowError(
        TimetableSlotValidationError,
      );
    }
  });

  it("rejects a missing or non-object payload", () => {
    for (const payload of [null, undefined, "slot", []]) {
      expect(() => parseCreateTimetableSlotInput(payload)).toThrowError(
        TimetableSlotValidationError,
      );
    }
  });
});

describe("parseTimetableSlotPatch", () => {
  it("accepts an empty patch", () => {
    expect(parseTimetableSlotPatch({})).toEqual({});
  });

  it("accepts null to clear the room and an active date", () => {
    expect(
      parseTimetableSlotPatch({
        room: null,
        activeFrom: null,
        activeTo: null,
      }),
    ).toEqual({ room: null, activeFrom: null, activeTo: null });
  });

  it("rejects an invalid field", () => {
    expect(() => parseTimetableSlotPatch({ dayOfWeek: 8 })).toThrowError(
      TimetableSlotValidationError,
    );
  });
});

describe("mergeTimetableSlotFields", () => {
  const stored = parseCreateTimetableSlotInput(
    input({
      room: "Room 12",
      classType: "tutorial",
      activeFrom: "2026-08-01",
      activeTo: "2026-09-01",
    }),
  );

  it("keeps stored values for omitted fields", () => {
    const merged = mergeTimetableSlotFields(stored, { dayOfWeek: 3 });

    expect(merged).toEqual({ ...stored, dayOfWeek: 3 });
  });

  it("clears a nullable field when the patch says null", () => {
    const merged = mergeTimetableSlotFields(stored, {
      room: null,
      activeFrom: null,
    });

    expect(merged.room).toBeNull();
    expect(merged.activeFrom).toBeNull();
    expect(merged.activeTo).toBe("2026-09-01");
  });

  it("merges before checking a cross-field rule", () => {
    const merged = mergeTimetableSlotFields(stored, {
      startTime: "10:00",
    });

    const issues = timetableSlotInvariantIssues(merged);

    expect(issues).toEqual([
      {
        path: "endTime",
        message:
          "End time must be after the start time. Classes may not cross midnight.",
      },
    ]);
    expect(() => assertTimetableSlotInvariants(merged)).toThrowError(
      TimetableSlotValidationError,
    );
  });
});

describe("semester bounds", () => {
  it("accepts a range inside the semester", () => {
    const fields = parseCreateTimetableSlotInput(
      input({ activeFrom: "2026-07-01", activeTo: "2026-12-15" }),
    );

    expect(() => assertSlotFitsSemester(fields, SEMESTER)).not.toThrow();
    expect(timetableSlotSemesterIssues(fields, SEMESTER)).toEqual([]);
  });

  it("accepts a whole-semester slot without semester dates", () => {
    const fields = parseCreateTimetableSlotInput(input());

    expect(() =>
      assertSlotFitsSemester(fields, { startDate: null, endDate: null }),
    ).not.toThrow();
  });

  it("rejects an active range when the semester has no dates", () => {
    const fields = parseCreateTimetableSlotInput(
      input({ activeFrom: "2026-08-01" }),
    );

    const issues = timetableSlotSemesterIssues(fields, {
      startDate: null,
      endDate: null,
    });

    expect(issues).toEqual([
      {
        path: "activeFrom",
        message:
          "Set the semester start date before giving a slot an active-from date.",
      },
    ]);
    expect(() =>
      assertSlotFitsSemester(fields, { startDate: null, endDate: null }),
    ).toThrowError(TimetableSlotValidationError);
  });

  it("rejects a range before the semester start", () => {
    const fields = parseCreateTimetableSlotInput(
      input({ activeFrom: "2026-06-30", activeTo: "2026-08-01" }),
    );

    expect(issuePathsOf(fields, SEMESTER)).toEqual(["activeFrom"]);
  });

  it("rejects a range after the semester end", () => {
    const fields = parseCreateTimetableSlotInput(
      input({ activeFrom: "2026-08-01", activeTo: "2026-12-16" }),
    );

    expect(issuePathsOf(fields, SEMESTER)).toEqual(["activeTo"]);
  });
});

function issuePathsOf(
  fields: Parameters<typeof timetableSlotSemesterIssues>[0],
  semester: Parameters<typeof timetableSlotSemesterIssues>[1],
): string[] {
  return timetableSlotSemesterIssues(fields, semester).map(
    (issue) => issue.path,
  );
}
