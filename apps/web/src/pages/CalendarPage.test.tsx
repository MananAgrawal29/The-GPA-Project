import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  DayException,
  DayExceptionSlot,
  Semester,
  Subject,
  ClassOccurrence,
} from "@gpa/shared";
import CalendarPage from "./CalendarPage";

/**
 * Browser-side tests for the date-exception calendar.
 *
 * `fetch` is stubbed with a small in-memory API, so these cover the
 * requests and rendering the page controls. They do not exercise the
 * Express API, PostgreSQL, or a real Clerk session; those boundaries are
 * covered by the API suite and documented limitations.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function errorBody(
  code: string,
  message: string,
  issues?: readonly { path: string; message: string }[],
): unknown {
  return {
    error: { code, message, ...(issues === undefined ? {} : { issues }) },
  };
}

function errorResponse(
  code: string,
  message: string,
  issues?: readonly { path: string; message: string }[],
  status = 422,
): Response {
  return jsonResponse(errorBody(code, message, issues), status);
}

function makeSemester(overrides: Partial<Semester> = {}): Semester {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Semester 1",
    academicYear: "2026-27",
    startDate: "2026-07-01",
    endDate: "2026-12-15",
    status: "active",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeSubject(
  semesterId: string,
  name: string,
  overrides: Partial<Subject> = {},
): Subject {
  return {
    id: "00000000-0000-4000-8000-000000000101",
    semesterId,
    name,
    createdAt: "2026-11-05T10:00:00.000Z",
    updatedAt: "2026-11-05T10:00:00.000Z",
    ...overrides,
  };
}

function makeDayException(
  semesterId: string,
  overrides: Partial<DayException> = {},
): DayException {
  return {
    id: "00000000-0000-4000-8000-000000000301",
    semesterId,
    userId: "user_test",
    date: overrides.date ?? "2026-10-15",
    kind: overrides.kind ?? "holiday",
    reason: overrides.reason ?? null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeDayExceptionSlot(
  exceptionId: string,
  semesterId: string,
  subjectId: string,
  overrides: Partial<DayExceptionSlot> = {},
): DayExceptionSlot {
  return {
    id: "00000000-0000-4000-8000-000000000401",
    exceptionId,
    semesterId,
    userId: "user_test",
    subjectId,
    startTime: overrides.startTime ?? "10:00",
    endTime: overrides.endTime ?? "11:00",
    room: overrides.room ?? null,
    classType: (overrides.classType ?? "lecture") as
      "lecture" | "practical" | "tutorial" | "other",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

interface FakeApiOptions {
  readonly semesters?: readonly Semester[];
  readonly exceptions?: readonly DayException[];
  readonly slots?: readonly DayExceptionSlot[];
  readonly subjects?: readonly Subject[];
  readonly failSemesters?: Response;
  readonly failExceptions?: Response;
  readonly failSlots?: Response;
  readonly failSubjects?: Response;
  readonly failCreateException?: Response;
  readonly failCreateSlot?: Response;
  readonly failUpdateException?: Response;
  readonly failUpdateSlot?: Response;
  readonly failDeleteException?: Response;
  readonly failDeleteSlot?: Response;
  readonly occurrences?: readonly ClassOccurrence[];
  readonly failOccurrences?: Response;
  readonly failGenerateOccurrences?: Response;
}

interface RecordedCall {
  readonly url: string;
  readonly method: string;
  readonly body: unknown;
}

function installFakeApi(options: FakeApiOptions = {}) {
  const calls: RecordedCall[] = [];
  const semesters = [...(options.semesters ?? [])];
  const exceptions = [...(options.exceptions ?? [])];
  let slots = [...(options.slots ?? [])];
  const subjects = [...(options.subjects ?? [])];

  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body: unknown =
        init?.body === undefined
          ? undefined
          : (JSON.parse(String(init.body)) as unknown);

      calls.push({ url, method, body });

      if (url === "/semesters") {
        if (options.failSemesters !== undefined) {
          return options.failSemesters;
        }
        return jsonResponse({ semesters });
      }

      const exceptionsListMatch = /^\/semesters\/([^/]+)\/day-exceptions$/.exec(
        url,
      );

      if (exceptionsListMatch !== null) {
        const semesterId = decodeURIComponent(exceptionsListMatch[1] ?? "");

        if (method === "GET") {
          if (options.failExceptions !== undefined) {
            return options.failExceptions;
          }
          return jsonResponse({
            exceptions: exceptions.filter(
              (exc) => exc.semesterId === semesterId,
            ),
          });
        }

        if (method === "POST") {
          if (options.failCreateException !== undefined) {
            return options.failCreateException;
          }

          const inputBody = body as
            | {
                readonly date?: string;
                readonly kind?: string;
                readonly reason?: string | null;
              }
            | undefined;

          const created: DayException = makeDayException(semesterId, {
            id: crypto.randomUUID(),
            date: inputBody?.date ?? "2026-10-15",
            kind: (inputBody?.kind ?? "holiday") as
              "holiday" | "special_schedule",
            reason: inputBody?.reason ?? null,
          });

          exceptions.push(created);

          return jsonResponse({ exception: created }, 201);
        }

        return jsonResponse(
          errorBody(
            "unexpected_request",
            `Unexpected request: ${method} ${url}`,
          ),
          500,
        );
      }

      const exceptionMatch =
        /^\/semesters\/([^/]+)\/day-exceptions\/([^/]+)$/.exec(url);

      if (exceptionMatch !== null) {
        const semesterId = decodeURIComponent(exceptionMatch[1] ?? "");
        const exceptionId = decodeURIComponent(exceptionMatch[2] ?? "");
        const index = exceptions.findIndex(
          (exc) => exc.id === exceptionId && exc.semesterId === semesterId,
        );
        const existing = exceptions[index];

        if (method === "GET") {
          if (existing === undefined) {
            return jsonResponse(
              errorBody(
                "day_exception_not_found",
                "That day exception does not exist, or it belongs to someone else.",
              ),
              404,
            );
          }
          return jsonResponse({ exception: existing });
        }

        if (method === "PATCH") {
          if (options.failUpdateException !== undefined) {
            return options.failUpdateException;
          }

          if (existing === undefined) {
            return jsonResponse(
              errorBody(
                "day_exception_not_found",
                "That day exception does not exist, or it belongs to someone else.",
              ),
              404,
            );
          }

          const inputBody = body as
            | {
                readonly date?: string;
                readonly kind?: string;
                readonly reason?: string | null;
              }
            | undefined;

          const updated: DayException = {
            ...existing,
            ...(inputBody?.date !== undefined ? { date: inputBody.date } : {}),
            ...(inputBody?.kind !== undefined
              ? { kind: inputBody.kind as "holiday" | "special_schedule" }
              : {}),
            ...(inputBody?.reason !== undefined
              ? { reason: inputBody.reason }
              : {}),
            updatedAt: "2026-11-06T10:00:00.000Z",
          };

          exceptions[index] = updated;

          return jsonResponse({ exception: updated });
        }

        if (method === "DELETE") {
          if (options.failDeleteException !== undefined) {
            return options.failDeleteException;
          }

          if (existing === undefined) {
            return jsonResponse(
              errorBody(
                "day_exception_not_found",
                "That day exception does not exist, or it belongs to someone else.",
              ),
              404,
            );
          }

          // Check for dependent slots
          const hasSlots = slots.some(
            (slot) => slot.exceptionId === exceptionId,
          );
          if (hasSlots) {
            return jsonResponse(
              errorBody(
                "day_exception_conflict",
                "Cannot delete exception with dependent slots.",
              ),
              409,
            );
          }

          exceptions.splice(index, 1);

          return jsonResponse(null, 204);
        }

        return jsonResponse(
          errorBody(
            "unexpected_request",
            `Unexpected request: ${method} ${url}`,
          ),
          500,
        );
      }

      const slotsListMatch =
        /^\/semesters\/([^/]+)\/day-exceptions\/([^/]+)\/slots$/.exec(url);

      if (slotsListMatch !== null) {
        const semesterId = decodeURIComponent(slotsListMatch[1] ?? "");
        const exceptionId = decodeURIComponent(slotsListMatch[2] ?? "");

        if (method === "GET") {
          if (options.failSlots !== undefined) {
            return options.failSlots;
          }
          return jsonResponse({
            slots: slots.filter(
              (slot) =>
                slot.exceptionId === exceptionId &&
                slot.semesterId === semesterId,
            ),
          });
        }

        if (method === "POST") {
          if (options.failCreateSlot !== undefined) {
            return options.failCreateSlot;
          }

          const inputBody = body as
            | {
                readonly exceptionId?: string;
                readonly subjectId?: string;
                readonly startTime?: string;
                readonly endTime?: string;
                readonly room?: string | null;
                readonly classType?: string;
              }
            | undefined;

          // Check if parent exception is a holiday
          const parentExc = exceptions.find(
            (exc) => exc.id === exceptionId && exc.semesterId === semesterId,
          );
          if (parentExc !== undefined && parentExc.kind === "holiday") {
            return jsonResponse(
              errorBody(
                "day_exception_slot_holiday_conflict",
                "A holiday exception cannot have class slots. This violates the invariant that holidays are class-free days.",
              ),
              422,
            );
          }

          // Check for overlapping slots
          const newStart = inputBody?.startTime ?? "";
          const newEnd = inputBody?.endTime ?? "";
          const hasOverlap = slots.some(
            (slot) =>
              slot.exceptionId === exceptionId &&
              slot.startTime < newEnd &&
              slot.endTime > newStart,
          );
          if (hasOverlap) {
            return jsonResponse(
              errorBody(
                "day_exception_slot_overlap",
                "Slots within the same date exception cannot overlap.",
                [{ path: "startTime", message: "Overlaps with existing slot" }],
              ),
              409,
            );
          }

          const created: DayExceptionSlot = makeDayExceptionSlot(
            exceptionId,
            semesterId,
            inputBody?.subjectId ?? "00000000-0000-4000-8000-000000000101",
            {
              id: crypto.randomUUID(),
              startTime: inputBody?.startTime ?? "10:00",
              endTime: inputBody?.endTime ?? "11:00",
              room: inputBody?.room ?? null,
              classType: (inputBody?.classType ?? "lecture") as
                "lecture" | "practical" | "tutorial" | "other",
            },
          );

          slots.push(created);

          return jsonResponse({ slot: created }, 201);
        }

        return jsonResponse(
          errorBody(
            "unexpected_request",
            `Unexpected request: ${method} ${url}`,
          ),
          500,
        );
      }

      const slotMatch =
        /^\/semesters\/([^/]+)\/day-exceptions\/([^/]+)\/slots\/([^/]+)$/.exec(
          url,
        );

      if (slotMatch !== null) {
        const semesterId = decodeURIComponent(slotMatch[1] ?? "");
        const exceptionId = decodeURIComponent(slotMatch[2] ?? "");
        const slotId = decodeURIComponent(slotMatch[3] ?? "");
        const index = slots.findIndex(
          (slot) =>
            slot.id === slotId &&
            slot.exceptionId === exceptionId &&
            slot.semesterId === semesterId,
        );
        const existing = slots[index];

        if (method === "GET") {
          if (existing === undefined) {
            return jsonResponse(
              errorBody(
                "day_exception_slot_not_found",
                "That day exception slot does not exist, or it belongs to someone else.",
              ),
              404,
            );
          }
          return jsonResponse({ slot: existing });
        }

        if (method === "PATCH") {
          if (options.failUpdateSlot !== undefined) {
            return options.failUpdateSlot;
          }

          if (existing === undefined) {
            return jsonResponse(
              errorBody(
                "day_exception_slot_not_found",
                "That day exception slot does not exist, or it belongs to someone else.",
              ),
              404,
            );
          }

          const inputBody = body as
            | {
                readonly subjectId?: string;
                readonly startTime?: string;
                readonly endTime?: string;
                readonly room?: string | null;
                readonly classType?: string;
              }
            | undefined;

          // Check for overlaps with other slots in the same exception
          if (
            inputBody?.startTime !== undefined ||
            inputBody?.endTime !== undefined
          ) {
            const newStart = inputBody?.startTime ?? existing.startTime;
            const newEnd = inputBody?.endTime ?? existing.endTime;
            const hasOverlap = slots.some(
              (slot) =>
                slot.exceptionId === exceptionId &&
                slot.id !== slotId &&
                slot.startTime < newEnd &&
                slot.endTime > newStart,
            );
            if (hasOverlap) {
              return jsonResponse(
                errorBody(
                  "day_exception_slot_overlap",
                  "Slots within the same date exception cannot overlap.",
                  [
                    {
                      path: "startTime",
                      message: "Overlaps with existing slot",
                    },
                  ],
                ),
                409,
              );
            }
          }

          // Validate subject if changed
          if (
            inputBody?.subjectId !== undefined &&
            inputBody.subjectId !== existing.subjectId
          ) {
            const subject = subjects.find(
              (sub) =>
                sub.id === inputBody.subjectId && sub.semesterId === semesterId,
            );
            if (!subject) {
              return jsonResponse(
                errorBody(
                  "day_exception_slot_ownership",
                  "That semester or subject does not exist, or it belongs to someone else.",
                ),
                404,
              );
            }
          }

          const updated: DayExceptionSlot = {
            ...existing,
            ...(inputBody?.subjectId !== undefined
              ? { subjectId: inputBody.subjectId }
              : {}),
            ...(inputBody?.startTime !== undefined
              ? { startTime: inputBody.startTime }
              : {}),
            ...(inputBody?.endTime !== undefined
              ? { endTime: inputBody.endTime }
              : {}),
            ...(inputBody?.room !== undefined ? { room: inputBody.room } : {}),
            ...(inputBody?.classType !== undefined
              ? {
                  classType: inputBody.classType as
                    "lecture" | "practical" | "tutorial" | "other",
                }
              : {}),
            updatedAt: "2026-11-06T10:00:00.000Z",
          };

          slots[index] = updated;

          return jsonResponse({ slot: updated });
        }

        if (method === "DELETE") {
          if (options.failDeleteSlot !== undefined) {
            return options.failDeleteSlot;
          }

          if (existing === undefined) {
            return jsonResponse(
              errorBody(
                "day_exception_slot_not_found",
                "That day exception slot does not exist, or it belongs to someone else.",
              ),
              404,
            );
          }

          slots.splice(index, 1);

          return jsonResponse(null, 204);
        }

        return jsonResponse(
          errorBody(
            "unexpected_request",
            `Unexpected request: ${method} ${url}`,
          ),
          500,
        );
      }

      const occurrencesGenerateMatch =
        /^\/semesters\/([^/]+)\/class-occurrences\/generate$/.exec(url);

      if (occurrencesGenerateMatch !== null && method === "POST") {
        const semesterId = decodeURIComponent(
          occurrencesGenerateMatch[1] ?? "",
        );

        if (options.failGenerateOccurrences !== undefined) {
          return options.failGenerateOccurrences;
        }

        return jsonResponse({
          occurrences: (options.occurrences ?? []).filter(
            (occurrence) => occurrence.semesterId === semesterId,
          ),
        });
      }

      const occurrencesListMatch =
        /^\/semesters\/([^/]+)\/class-occurrences(?:\?.*)?$/.exec(url);

      if (occurrencesListMatch !== null) {
        const semesterId = decodeURIComponent(occurrencesListMatch[1] ?? "");

        if (method === "GET") {
          if (options.failOccurrences !== undefined) {
            return options.failOccurrences;
          }

          return jsonResponse({
            occurrences: (options.occurrences ?? []).filter(
              (occurrence) => occurrence.semesterId === semesterId,
            ),
          });
        }

        if (method === "POST" && url.endsWith("/generate")) {
          if (options.failGenerateOccurrences !== undefined) {
            return options.failGenerateOccurrences;
          }

          return jsonResponse({
            occurrences: (options.occurrences ?? []).filter(
              (occurrence) => occurrence.semesterId === semesterId,
            ),
          });
        }
      }

      const subjectsMatch = /^\/semesters\/([^/]+)\/subjects$/.exec(url);

      if (subjectsMatch !== null) {
        const semesterId = decodeURIComponent(subjectsMatch[1] ?? "");

        if (method === "GET") {
          if (options.failSubjects !== undefined) {
            return options.failSubjects;
          }
          return jsonResponse({
            subjects: subjects.filter(
              (subject) => subject.semesterId === semesterId,
            ),
          });
        }
      }

      return jsonResponse(
        errorBody("unexpected_request", `Unexpected request: ${method} ${url}`),
        500,
      );
    },
  );

  vi.stubGlobal("fetch", fetchMock);

  return {
    calls,
    setSlots: (next: readonly DayExceptionSlot[]) => {
      slots = [...next];
    },
    setExceptions: (next: readonly DayException[]) => {
      exceptions.length = 0;
      exceptions.push(...next);
    },
  };
}

function renderCalendar(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/calendar" element={<CalendarPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function monthLabel(date: Date): string {
  return `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * The page opens on the month containing the browser's current date, and its
 * Prev/Next controls are the only way to change it. A fixture dated in another
 * month therefore has to be reached through those real controls instead of
 * assuming which month a run starts in.
 */
async function showMonthOf(dateIso: string): Promise<void> {
  const target = new Date(`${dateIso}T00:00:00`);
  const shown = screen.getByRole("heading", { level: 2 }).textContent ?? "";
  const [shownMonth = "", shownYear = ""] = shown.split(" ");
  const shownIndex =
    Number(shownYear) * 12 +
    MONTH_NAMES.indexOf(shownMonth as (typeof MONTH_NAMES)[number]);
  const targetIndex = target.getFullYear() * 12 + target.getMonth();
  const offset = targetIndex - shownIndex;

  if (offset !== 0) {
    const direction = offset < 0 ? /Prev/ : /Next/;

    for (let index = 0; index < Math.abs(offset); index += 1) {
      fireEvent.click(screen.getByRole("button", { name: direction }));
    }
  }

  const expected = `Calendar for ${monthLabel(target)}`;

  await waitFor(() =>
    expect(screen.getByRole("grid").getAttribute("aria-label")).toBe(expected),
  );
}

const SEMESTER_ONE = makeSemester({
  id: "00000000-0000-4000-8000-000000000001",
  name: "Semester 1",
  academicYear: "2026-27",
  startDate: "2026-09-01",
  endDate: "2026-12-20",
  status: "active",
});

const SEMESTER_TWO = makeSemester({
  id: "00000000-0000-4000-8000-000000000002",
  name: "Semester 2",
  startDate: "2026-01-15",
  endDate: "2026-05-15",
  status: "setup",
});

const PHYSICS = makeSubject(SEMESTER_ONE.id, "Physics", {
  id: "00000000-0000-4000-8000-000000000101",
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("calendar page", () => {
  it("shows a loading state before semesters arrive", async () => {
    let resolveSemesters: ((value: Response) => void) | undefined;

    const fetchMock = vi.fn((input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);

      if (url === "/semesters") {
        return new Promise<Response>((resolve) => {
          resolveSemesters = resolve;
        });
      }

      if (url === `/semesters/${SEMESTER_ONE.id}/day-exceptions`) {
        return Promise.resolve(jsonResponse({ exceptions: [] }));
      }

      if (url === `/semesters/${SEMESTER_ONE.id}/subjects`) {
        return Promise.resolve(jsonResponse({ subjects: [] }));
      }

      return Promise.resolve(
        jsonResponse(
          errorBody("unexpected_request", "Unexpected request"),
          500,
        ),
      );
    });

    vi.stubGlobal("fetch", fetchMock);
    renderCalendar(`/calendar?semester=${SEMESTER_ONE.id}`);

    expect(await screen.findByText("Loading semesters…")).toBeTruthy();
    await waitFor(() => expect(resolveSemesters).toBeTypeOf("function"));

    resolveSemesters?.(
      jsonResponse({
        semesters: [
          makeSemester({
            id: "00000000-0000-4000-8000-000000000311",
            name: "Test",
            academicYear: "2026-27",
            startDate: "2026-01-01",
            endDate: "2026-06-30",
            status: "active",
          }),
        ],
      }),
    );
  });

  it("shows an empty calendar when there are no exceptions", async () => {
    installFakeApi({
      semesters: [SEMESTER_ONE],
      exceptions: [],
      subjects: [],
    });

    renderCalendar(`/calendar?semester=${SEMESTER_ONE.id}`);

    await screen.findByText("Calendar");
    expect(screen.getByText("Semester 1")).toBeTruthy();
  });

  it("displays a holiday on the calendar", async () => {
    const holiday = makeDayException(SEMESTER_ONE.id, {
      id: "00000000-0000-4000-8000-000000000303",
      date: "2026-10-14",
      kind: "holiday",
      reason: "Fall Break",
    });

    installFakeApi({
      semesters: [SEMESTER_ONE],
      exceptions: [holiday],
      subjects: [],
    });

    renderCalendar(`/calendar?semester=${SEMESTER_ONE.id}`);

    await screen.findByText("Calendar");
    await showMonthOf(holiday.date);

    const holidayBadge = await screen.findByText("Holiday");
    expect(holidayBadge.closest("div[role='gridcell']")).not.toBeNull();
    expect(screen.getByText("Fall Break")).toBeTruthy();
  });

  it("displays a special schedule on the calendar", async () => {
    const special = makeDayException(SEMESTER_ONE.id, {
      id: "00000000-0000-4000-8000-000000000302",
      date: "2026-10-20",
      kind: "special_schedule",
      reason: "Exam Day",
    });

    installFakeApi({
      semesters: [SEMESTER_ONE],
      exceptions: [special],
      subjects: [PHYSICS],
    });

    renderCalendar(`/calendar?semester=${SEMESTER_ONE.id}`);

    await screen.findByText("Calendar");
    await showMonthOf(special.date);

    const specialBadge = await screen.findByText("Special Schedule");
    expect(specialBadge.closest("div[role='gridcell']")).not.toBeNull();
  });

  it("creates a holiday exception", async () => {
    installFakeApi({
      semesters: [SEMESTER_ONE],
      subjects: [PHYSICS],
      exceptions: [],
    });

    renderCalendar(`/calendar?semester=${SEMESTER_ONE.id}`);

    await screen.findByText("Calendar");
    await showMonthOf("2026-10-31");

    fireEvent.click(screen.getByRole("button", { name: "Add Exception" }));
    const dialog = await screen.findByRole("dialog", { name: "Add Exception" });

    fireEvent.change(within(dialog).getByLabelText("Date"), {
      target: { value: "2026-10-31" },
    });
    fireEvent.change(within(dialog).getByLabelText("Type"), {
      target: { value: "holiday" },
    });
    fireEvent.change(within(dialog).getByLabelText(/Reason/), {
      target: { value: "Halloween" },
    });

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Add Exception" }),
    );

    expect(await screen.findByText("Exception was added.")).toBeTruthy();
    expect(await screen.findByText("Halloween")).toBeTruthy();
    expect(screen.getByText("Holiday")).toBeTruthy();
  });

  it("creates a special_schedule exception", async () => {
    installFakeApi({
      semesters: [SEMESTER_ONE],
      subjects: [PHYSICS],
      exceptions: [],
    });

    renderCalendar(`/calendar?semester=${SEMESTER_ONE.id}`);

    await screen.findByText("Calendar");
    await showMonthOf("2026-11-01");

    fireEvent.click(screen.getByRole("button", { name: "Add Exception" }));
    const dialog = await screen.findByRole("dialog", { name: "Add Exception" });

    fireEvent.change(within(dialog).getByLabelText("Date"), {
      target: { value: "2026-11-01" },
    });
    fireEvent.change(within(dialog).getByLabelText("Type"), {
      target: { value: "special_schedule" },
    });

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Add Exception" }),
    );

    expect(await screen.findByText("Exception was added.")).toBeTruthy();
    expect(await screen.findByText("Special Schedule")).toBeTruthy();
  });

  it("rejects an exception date outside semester bounds", async () => {
    installFakeApi({
      semesters: [SEMESTER_ONE],
      subjects: [PHYSICS],
      exceptions: [],
      failCreateException: errorResponse(
        "day_exception_date_bounds",
        "The exception date must fall within the semester's active range.",
      ),
    });

    renderCalendar(`/calendar?semester=${SEMESTER_ONE.id}`);

    await screen.findByText("Calendar");

    fireEvent.click(screen.getByRole("button", { name: "Add Exception" }));
    const dialog = await screen.findByRole("dialog", { name: "Add Exception" });

    fireEvent.change(within(dialog).getByLabelText("Date"), {
      target: { value: "2026-08-01" },
    });
    fireEvent.change(within(dialog).getByLabelText("Type"), {
      target: { value: "holiday" },
    });

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Add Exception" }),
    );

    expect(
      await screen.findByText(
        "The exception date must fall within the semester's active range.",
      ),
    ).toBeTruthy();
  });

  it("prevents duplicate exceptions on the same date", async () => {
    const existing = makeDayException(SEMESTER_ONE.id, {
      id: "00000000-0000-4000-8000-000000000306",
      date: "2026-10-15",
      kind: "holiday",
    });

    const failCreateExceptionResponse = errorResponse(
      "validation_failed",
      "Some of those details are not valid.",
      [
        {
          path: "date",
          message: "An exception already exists for this semester date.",
        },
      ],
      422,
    );

    installFakeApi({
      semesters: [SEMESTER_ONE],
      subjects: [PHYSICS],
      exceptions: [existing],
      failCreateException: failCreateExceptionResponse,
    });

    renderCalendar(`/calendar?semester=${SEMESTER_ONE.id}`);

    await screen.findByText("Calendar");

    fireEvent.click(screen.getByRole("button", { name: "Add Exception" }));
    const dialog = await screen.findByRole("dialog", { name: "Add Exception" });

    fireEvent.change(within(dialog).getByLabelText("Date"), {
      target: { value: "2026-10-15" },
    });
    fireEvent.change(within(dialog).getByLabelText("Type"), {
      target: { value: "holiday" },
    });

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Add Exception" }),
    );

    expect(
      await screen.findByText(
        "An exception already exists for this semester date.",
      ),
    ).toBeTruthy();
  });

  it("rejects creating a slot under a holiday exception", async () => {
    const holiday = makeDayException(SEMESTER_ONE.id, {
      id: "00000000-0000-4000-8000-000000000304",
      date: "2026-10-14",
      kind: "holiday",
    });

    installFakeApi({
      semesters: [SEMESTER_ONE],
      exceptions: [holiday],
      subjects: [PHYSICS],
    });

    renderCalendar(`/calendar?semester=${SEMESTER_ONE.id}`);
    await screen.findByText("Calendar");
    await showMonthOf(holiday.date);

    // The detail panel for a holiday offers no way to add a class slot.
    fireEvent.click(await screen.findByText("Holiday"));

    expect(
      await screen.findByText("Holiday — no classes scheduled for this date."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add Slot" })).toBeNull();
  });

  it("shows the weekday of a date-only value without timezone drift", async () => {
    const holiday = makeDayException(SEMESTER_ONE.id, {
      id: "00000000-0000-4000-8000-000000000306",
      date: "2026-11-10",
      kind: "holiday",
    });

    installFakeApi({ semesters: [SEMESTER_ONE], exceptions: [holiday] });

    renderCalendar(`/calendar?semester=${SEMESTER_ONE.id}`);
    await screen.findByText("Calendar");
    await showMonthOf(holiday.date);

    fireEvent.click(await screen.findByText("Holiday"));

    // 2026-11-10 is a Tuesday. Parsing it as an instant shifts the weekday
    // onto the previous day west of UTC, which is what D034 forbids.
    expect(await screen.findByText("Tuesday")).toBeTruthy();
  });

  it("creates a slot for a special schedule", async () => {
    const special = makeDayException(SEMESTER_ONE.id, {
      id: "00000000-0000-4000-8000-000000000305",
      date: "2026-10-20",
      kind: "special_schedule",
    });

    installFakeApi({
      semesters: [SEMESTER_ONE],
      subjects: [PHYSICS],
      exceptions: [special],
    });

    renderCalendar(`/calendar?semester=${SEMESTER_ONE.id}`);

    await screen.findByText("Calendar");
    await showMonthOf(special.date);

    fireEvent.click(await screen.findByText("Special Schedule"));
    fireEvent.click(await screen.findByRole("button", { name: "Add Slot" }));

    const dialog = await screen.findByRole("dialog", { name: "Add Slot" });

    expect(within(dialog).getByLabelText("Subject")).toBeTruthy();
    expect(within(dialog).getByLabelText("Start time")).toBeTruthy();
  });

  it("rejects overlapping slots in the same exception", async () => {
    const special = makeDayException(SEMESTER_ONE.id, {
      id: "00000000-0000-4000-8000-000000000305",
      date: "2026-10-20",
      kind: "special_schedule",
    });

    const existingSlot = makeDayExceptionSlot(
      "00000000-0000-4000-8000-000000000305",
      SEMESTER_ONE.id,
      PHYSICS.id,
      {
        id: "00000000-0000-4000-8000-000000000401",
        startTime: "10:00",
        endTime: "11:00",
        subjectId: PHYSICS.id,
      },
    );

    installFakeApi({
      semesters: [SEMESTER_ONE],
      subjects: [PHYSICS],
      exceptions: [special],
      slots: [existingSlot],
      failCreateSlot: errorResponse(
        "day_exception_slot_overlap",
        "Slots within the same date exception cannot overlap.",
        undefined,
        409,
      ),
    });

    renderCalendar(`/calendar?semester=${SEMESTER_ONE.id}`);

    await screen.findByText("Calendar");
    await showMonthOf(special.date);

    fireEvent.click(await screen.findByText("Special Schedule"));
    fireEvent.click(await screen.findByRole("button", { name: "Add Slot" }));
    const dialog = await screen.findByRole("dialog", { name: "Add Slot" });

    fireEvent.change(within(dialog).getByLabelText("Subject"), {
      target: { value: PHYSICS.id },
    });
    fireEvent.change(within(dialog).getByLabelText("Start time"), {
      target: { value: "10:30" },
    });
    fireEvent.change(within(dialog).getByLabelText("End time"), {
      target: { value: "11:30" },
    });

    fireEvent.click(within(dialog).getByRole("button", { name: "Add Slot" }));

    expect(
      await screen.findByText(
        "Slots within the same date exception cannot overlap.",
      ),
    ).toBeTruthy();
    // The dialog stays open so the conflicting times can be corrected.
    expect(screen.getByRole("dialog", { name: "Add Slot" })).toBeTruthy();
  });

  it("allows adjacent slots", async () => {
    const special = makeDayException(SEMESTER_ONE.id, {
      id: "00000000-0000-4000-8000-000000000305",
      date: "2026-10-20",
      kind: "special_schedule",
    });

    const existingSlot = makeDayExceptionSlot(
      "00000000-0000-4000-8000-000000000305",
      SEMESTER_ONE.id,
      PHYSICS.id,
      {
        id: "00000000-0000-4000-8000-000000000401",
        startTime: "10:00",
        endTime: "11:00",
        subjectId: PHYSICS.id,
      },
    );

    installFakeApi({
      semesters: [SEMESTER_ONE],
      subjects: [PHYSICS],
      exceptions: [special],
      slots: [existingSlot],
    });

    renderCalendar(`/calendar?semester=${SEMESTER_ONE.id}`);

    await screen.findByText("Calendar");
    await showMonthOf(special.date);

    fireEvent.click(await screen.findByText("Special Schedule"));
    fireEvent.click(await screen.findByRole("button", { name: "Add Slot" }));
    const dialog = await screen.findByRole("dialog", { name: "Add Slot" });

    fireEvent.change(within(dialog).getByLabelText("Subject"), {
      target: { value: PHYSICS.id },
    });
    fireEvent.change(within(dialog).getByLabelText("Start time"), {
      target: { value: "11:00" },
    });
    fireEvent.change(within(dialog).getByLabelText("End time"), {
      target: { value: "12:00" },
    });

    fireEvent.click(within(dialog).getByRole("button", { name: "Add Slot" }));

    expect(await screen.findByText("Slot was added.")).toBeTruthy();
    expect(await screen.findByText("11:00 – 12:00")).toBeTruthy();
    expect(screen.getByText("10:00 – 11:00")).toBeTruthy();
  });

  it("rejects slots with end time not after start time", async () => {
    const special = makeDayException(SEMESTER_ONE.id, {
      id: "00000000-0000-4000-8000-000000000305",
      date: "2026-10-20",
      kind: "special_schedule",
    });

    const failCreateSlotResponse = errorResponse(
      "validation_failed",
      "Some of those details are not valid.",
      [{ path: "endTime", message: "End time must be after start time." }],
      422,
    );

    installFakeApi({
      semesters: [SEMESTER_ONE],
      subjects: [PHYSICS],
      exceptions: [special],
      failCreateSlot: failCreateSlotResponse,
    });

    renderCalendar(`/calendar?semester=${SEMESTER_ONE.id}`);

    await screen.findByText("Calendar");
    await showMonthOf(special.date);

    fireEvent.click(await screen.findByText("Special Schedule"));
    fireEvent.click(await screen.findByRole("button", { name: "Add Slot" }));
    const dialog = await screen.findByRole("dialog", { name: "Add Slot" });

    fireEvent.change(within(dialog).getByLabelText("Subject"), {
      target: { value: PHYSICS.id },
    });
    fireEvent.change(within(dialog).getByLabelText("Start time"), {
      target: { value: "11:00" },
    });
    fireEvent.change(within(dialog).getByLabelText("End time"), {
      target: { value: "10:00" },
    });

    fireEvent.click(within(dialog).getByRole("button", { name: "Add Slot" }));

    expect(
      await screen.findByText("End time must be after start time."),
    ).toBeTruthy();
  });

  it("deletes an exception with confirmation dialog", async () => {
    const exception = makeDayException(SEMESTER_ONE.id, {
      id: "00000000-0000-4000-8000-000000000308",
      date: "2026-10-15",
      kind: "holiday",
      reason: "Test Holiday",
    });

    installFakeApi({
      semesters: [SEMESTER_ONE],
      exceptions: [exception],
      subjects: [],
    });

    renderCalendar(`/calendar?semester=${SEMESTER_ONE.id}`);
    await screen.findByText("Calendar");
    await showMonthOf(exception.date);

    fireEvent.click(await screen.findByText("Holiday"));
    fireEvent.click(
      await screen.findByRole("button", { name: "Delete exception" }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Delete Exception",
    });
    expect(dialog.textContent).toContain("Test Holiday");

    // Cancel deletion
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(
      screen.queryByRole("dialog", { name: "Delete Exception" }),
    ).toBeNull();

    // Open again and confirm
    fireEvent.click(screen.getByRole("button", { name: "Delete exception" }));
    const reopened = await screen.findByRole("dialog", {
      name: "Delete Exception",
    });

    fireEvent.click(
      within(reopened).getByRole("button", { name: "Delete Exception" }),
    );

    expect(await screen.findByText("Exception was removed.")).toBeTruthy();
    expect(screen.queryByText("Holiday")).toBeNull();
  });

  it("prevents deleting exception with slots", async () => {
    const special = makeDayException(SEMESTER_ONE.id, {
      id: "00000000-0000-4000-8000-000000000307",
      date: "2026-10-20",
      kind: "special_schedule",
    });

    installFakeApi({
      semesters: [SEMESTER_ONE],
      subjects: [PHYSICS],
      exceptions: [special],
      slots: [
        makeDayExceptionSlot(
          "00000000-0000-4000-8000-000000000307",
          SEMESTER_ONE.id,
          PHYSICS.id,
          {
            id: "00000000-0000-4000-8000-000000000401",
            startTime: "10:00",
            endTime: "11:00",
          },
        ),
      ],
      failDeleteException: errorResponse(
        "day_exception_conflict",
        "Cannot delete exception with dependent slots.",
        undefined,
        409,
      ),
    });
    renderCalendar(`/calendar?semester=${SEMESTER_ONE.id}`);
    await screen.findByText("Calendar");
    await showMonthOf(special.date);

    fireEvent.click(await screen.findByText("Special Schedule"));
    fireEvent.click(
      await screen.findByRole("button", { name: "Delete exception" }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Delete Exception",
    });
    expect(
      screen.getByText(
        "A special schedule can only be deleted once all of its class slots are deleted. Remove its slots first, then delete the exception.",
      ),
    ).toBeTruthy();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Delete Exception" }),
    );

    expect(
      await screen.findByText("Cannot delete exception with dependent slots."),
    ).toBeTruthy();
  });

  it("deletes a slot with confirmation dialog", async () => {
    const special = makeDayException(SEMESTER_ONE.id, {
      id: "00000000-0000-4000-8000-000000000305",
      date: "2026-10-20",
      kind: "special_schedule",
    });

    installFakeApi({
      semesters: [SEMESTER_ONE],
      subjects: [PHYSICS],
      exceptions: [special],
      slots: [
        makeDayExceptionSlot(
          "00000000-0000-4000-8000-000000000305",
          SEMESTER_ONE.id,
          PHYSICS.id,
          {
            id: "00000000-0000-4000-8000-000000000401",
            startTime: "10:00",
            endTime: "11:00",
          },
        ),
      ],
    });

    renderCalendar(`/calendar?semester=${SEMESTER_ONE.id}`);
    await screen.findByText("Calendar");
    await showMonthOf(special.date);

    fireEvent.click(await screen.findByText("Special Schedule"));
    fireEvent.click(await screen.findByRole("button", { name: "Delete slot" }));

    const dialog = await screen.findByRole("dialog", { name: "Delete Slot" });
    expect(dialog.textContent).toContain(
      "Are you sure you want to delete this slot?",
    );

    // Cancel deletion
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Delete Slot" })).toBeNull();

    // Open again and confirm
    fireEvent.click(screen.getByRole("button", { name: "Delete slot" }));
    const reopened = await screen.findByRole("dialog", { name: "Delete Slot" });

    fireEvent.click(
      within(reopened).getByRole("button", { name: "Delete Slot" }),
    );

    expect(await screen.findByText("Slot was removed.")).toBeTruthy();
    expect(screen.queryByText(/10:00 – 11:00/)).toBeNull();
  });
});

function makeClassOccurrence(
  overrides: Partial<ClassOccurrence> = {},
): ClassOccurrence {
  return {
    id: "00000000-0000-4000-8000-000000000501",
    semesterId: SEMESTER_ONE.id,
    subjectId: PHYSICS.id,
    sourceSlotId: null,
    sourceExceptionSlotId: null,
    date: overrides.date ?? "2026-10-15",
    startTime: "09:00",
    endTime: "10:00",
    room: null,
    classType: "lecture",
    status: "scheduled",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("calendar page: dated classes", () => {
  it("displays dated classes on the calendar", async () => {
    installFakeApi({
      semesters: [SEMESTER_ONE],
      exceptions: [],
      subjects: [PHYSICS],
      occurrences: [makeClassOccurrence({ date: "2026-10-15" })],
    });

    renderCalendar(`/calendar?semester=${SEMESTER_ONE.id}`);

    await screen.findByText("Calendar");
    await showMonthOf("2026-10-15");

    expect(await screen.findByText("1 dated class")).toBeTruthy();
  });

  it("generates dated classes on request", async () => {
    installFakeApi({
      semesters: [SEMESTER_ONE],
      exceptions: [],
      subjects: [PHYSICS],
      occurrences: [makeClassOccurrence({ date: "2026-10-15" })],
    });

    renderCalendar(`/calendar?semester=${SEMESTER_ONE.id}`);

    await screen.findByText("Calendar");
    await showMonthOf("2026-10-15");

    fireEvent.click(
      screen.getByRole("button", { name: "Generate dated classes" }),
    );

    expect(
      await screen.findByText(/Generated or confirmed 1 dated class/),
    ).toBeTruthy();
    expect(await screen.findByText("1 dated class")).toBeTruthy();
  });

  it("shows an error state when dated classes cannot load", async () => {
    installFakeApi({
      semesters: [SEMESTER_ONE],
      exceptions: [],
      subjects: [],
      failOccurrences: errorResponse(
        "unavailable",
        "Dated classes are unavailable",
        undefined,
        503,
      ),
    });

    renderCalendar(`/calendar?semester=${SEMESTER_ONE.id}`);

    expect(
      (await screen.findAllByText("Dated classes are unavailable")).length,
    ).toBeGreaterThan(0);
  });
});

describe("calendar page: stale dated classes", () => {
  it("clears stale dated-class badges while a semester switch is pending", async () => {
    installFakeApi({
      semesters: [SEMESTER_ONE, SEMESTER_TWO],
      exceptions: [],
      subjects: [],
      occurrences: [makeClassOccurrence({ date: "2026-10-15" })],
    });

    const baseFetch = globalThis.fetch as (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => Promise<Response>;
    let resolveSecondOccurrences: ((response: Response) => void) | undefined;

    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (
          url.includes(SEMESTER_TWO.id) &&
          url.includes("/class-occurrences")
        ) {
          return new Promise<Response>((resolve) => {
            resolveSecondOccurrences = resolve;
          });
        }

        return baseFetch(input, init);
      }),
    );

    renderCalendar(`/calendar?semester=${SEMESTER_ONE.id}`);

    await screen.findByText("Calendar");
    await showMonthOf("2026-10-15");
    expect(await screen.findByText("1 dated class")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Semester"), {
      target: { value: SEMESTER_TWO.id },
    });

    expect(screen.queryByText("1 dated class")).toBeNull();
    expect(screen.getByText("Loading dated classes…")).toBeTruthy();

    resolveSecondOccurrences?.(jsonResponse({ occurrences: [] }));

    await waitFor(() =>
      expect(screen.queryByText("Loading dated classes…")).toBeNull(),
    );
  });
});

describe("calendar page: navigation and date handling", () => {
  it("navigates months and shows today", async () => {
    installFakeApi({
      semesters: [SEMESTER_ONE],
      exceptions: [],
      subjects: [],
    });

    renderCalendar(`/calendar?semester=${SEMESTER_ONE.id}`);

    await screen.findByText("Calendar");

    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const heading = () => screen.getByRole("heading", { level: 2 }).textContent;

    expect(heading()).toBe(monthLabel(thisMonth));

    // Next month
    fireEvent.click(screen.getByRole("button", { name: "Next →" }));
    expect(heading()).toBe(
      monthLabel(
        new Date(thisMonth.getFullYear(), thisMonth.getMonth() + 1, 1),
      ),
    );

    // Previous month, twice, from the following month
    fireEvent.click(screen.getByRole("button", { name: "← Prev" }));
    fireEvent.click(screen.getByRole("button", { name: "← Prev" }));
    expect(heading()).toBe(
      monthLabel(
        new Date(thisMonth.getFullYear(), thisMonth.getMonth() - 1, 1),
      ),
    );

    // Today returns to the month the page opened on
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(heading()).toBe(monthLabel(thisMonth));
  });

  it("switches semesters correctly", async () => {
    installFakeApi({
      semesters: [SEMESTER_ONE, SEMESTER_TWO],
      exceptions: [
        makeDayException(SEMESTER_ONE.id, {
          id: "00000000-0000-4000-8000-000000000309",
          date: "2026-10-15",
          kind: "holiday",
        }),
        makeDayException(SEMESTER_TWO.id, {
          id: "00000000-0000-4000-8000-000000000310",
          date: "2026-02-15",
          kind: "holiday",
        }),
      ],
      subjects: [],
    });

    renderCalendar(`/calendar?semester=${SEMESTER_ONE.id}`);
    await screen.findByText("Calendar");
    await showMonthOf("2026-10-15");

    expect(await screen.findByText("Holiday")).toBeTruthy();
    expect(screen.getByText(/2026-09-01 → 2026-12-20/)).toBeTruthy();

    // Switch semester
    fireEvent.change(screen.getByLabelText("Semester"), {
      target: { value: SEMESTER_TWO.id },
    });

    // The date range shown is the selected semester's, not the previous one's.
    await screen.findByText(/2026-01-15 → 2026-05-15/);
    expect(screen.queryByText(/2026-09-01 → 2026-12-20/)).toBeNull();

    // The other semester's own holidays are what the calendar renders.
    await showMonthOf("2026-02-15");
    expect(await screen.findByText("Holiday")).toBeTruthy();
  });

  it("shows loading and error states", async () => {
    const failExceptions = errorResponse(
      "unavailable",
      "Exceptions are unavailable",
      undefined,
      503,
    );

    installFakeApi({
      semesters: [SEMESTER_ONE],
      exceptions: [],
      subjects: [],
      failExceptions,
    });

    renderCalendar(`/calendar?semester=${SEMESTER_ONE.id}`);

    // A failed exceptions load must not be presented as an empty calendar: the
    // page shows a status panel with the server's message and a Retry control.
    const retry = await screen.findByRole("button", { name: "Retry" });
    const statusPanel = retry.closest("[role='status']");

    expect(statusPanel).not.toBeNull();
    expect(statusPanel?.textContent).toContain("unavailable");
    expect(screen.queryByRole("grid")).toBeNull();
  });
});
