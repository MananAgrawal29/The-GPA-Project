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
import type { Semester, Subject, TimetableSlot } from "@gpa/shared";
import TimetablePage from "./TimetablePage";

/**
 * Browser-side tests for the weekly timetable editor.
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

function makeSlot(
  semesterId: string,
  subjectId: string,
  overrides: Partial<TimetableSlot> = {},
): TimetableSlot {
  return {
    id: "00000000-0000-4000-8000-000000000201",
    semesterId,
    subjectId,
    dayOfWeek: overrides.dayOfWeek ?? 1,
    startTime: overrides.startTime ?? "09:00",
    endTime: overrides.endTime ?? "10:00",
    room: overrides.room ?? null,
    classType: (overrides.classType ?? "lecture") as
      "lecture" | "practical" | "tutorial" | "other",
    archivedAt: overrides.archivedAt ?? null,
    activeFrom: overrides.activeFrom ?? null,
    activeTo: overrides.activeTo ?? null,
    createdAt: "2026-07-01T09:00:00.000Z",
    updatedAt: "2026-07-01T09:00:00.000Z",
  };
}

interface FakeApiOptions {
  readonly semesters?: readonly Semester[];
  readonly subjects?: readonly Subject[];
  readonly slots?: readonly TimetableSlot[];
  readonly failSemesters?: Response;
  readonly failSlots?: Response;
  readonly failCreate?: Response;
}

interface RecordedCall {
  readonly url: string;
  readonly method: string;
  readonly body: unknown;
}

function installFakeApi(options: FakeApiOptions = {}) {
  const calls: RecordedCall[] = [];
  const semesters = [...(options.semesters ?? [])];
  const subjects = [...(options.subjects ?? [])];
  let slots = [...(options.slots ?? [])];

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

      const slotsListMatch = /^\/semesters\/([^/]+)\/timetable-slots$/.exec(
        url,
      );

      if (slotsListMatch !== null) {
        const semesterId = decodeURIComponent(slotsListMatch[1] ?? "");

        if (method === "GET") {
          if (options.failSlots !== undefined) {
            return options.failSlots;
          }
          return jsonResponse({
            slots: slots.filter(
              (slot) =>
                slot.semesterId === semesterId && slot.archivedAt === null,
            ),
          });
        }

        if (method === "POST") {
          if (options.failCreate !== undefined) {
            return options.failCreate;
          }

          const inputBody = body as
            | {
                readonly subjectId?: string;
                readonly dayOfWeek?: number;
                readonly startTime?: string;
                readonly endTime?: string;
                readonly room?: string | null;
                readonly classType?: string;
                readonly activeFrom?: string | null;
                readonly activeTo?: string | null;
              }
            | undefined;

          const created: TimetableSlot = makeSlot(
            semesterId,
            inputBody?.subjectId ?? "00000000-0000-4000-8000-000000000101",
            {
              id: crypto.randomUUID(),
              dayOfWeek: inputBody?.dayOfWeek ?? 1,
              startTime: inputBody?.startTime ?? "09:00",
              endTime: inputBody?.endTime ?? "10:00",
              room: inputBody?.room ?? null,
              classType: (inputBody?.classType ?? "lecture") as
                "lecture" | "practical" | "tutorial" | "other",
              activeFrom: inputBody?.activeFrom ?? null,
              activeTo: inputBody?.activeTo ?? null,
            },
          );

          slots = [...slots, created];

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

      const slotMatch = /^\/semesters\/([^/]+)\/timetable-slots\/([^/]+)$/.exec(
        url,
      );

      if (slotMatch !== null) {
        const semesterId = decodeURIComponent(slotMatch[1] ?? "");
        const slotId = decodeURIComponent(slotMatch[2] ?? "");
        const index = slots.findIndex(
          (slot) => slot.id === slotId && slot.semesterId === semesterId,
        );
        const existing = slots[index];

        if (method === "GET") {
          if (existing === undefined) {
            return jsonResponse(
              errorBody(
                "timetable_slot_not_found",
                "That timetable slot does not exist, or it belongs to someone else.",
              ),
              404,
            );
          }
          return jsonResponse({ slot: existing });
        }

        if (method === "PATCH") {
          if (existing === undefined) {
            return jsonResponse(
              errorBody(
                "timetable_slot_not_found",
                "That timetable slot does not exist, or it belongs to someone else.",
              ),
              404,
            );
          }

          const inputBody = body as
            | {
                readonly dayOfWeek?: number;
                readonly startTime?: string;
                readonly endTime?: string;
                readonly room?: string | null;
              }
            | undefined;

          const updated: TimetableSlot = {
            ...existing,
            ...(inputBody?.dayOfWeek !== undefined
              ? { dayOfWeek: inputBody.dayOfWeek }
              : {}),
            ...(inputBody?.startTime !== undefined
              ? { startTime: inputBody.startTime }
              : {}),
            ...(inputBody?.endTime !== undefined
              ? { endTime: inputBody.endTime }
              : {}),
            ...(inputBody?.room !== undefined ? { room: inputBody.room } : {}),
            updatedAt: "2026-11-06T10:00:00.000Z",
          };

          slots = slots.map((slot, slotIndex) =>
            slotIndex === index ? updated : slot,
          );

          return jsonResponse({ slot: updated });
        }

        if (method === "DELETE") {
          if (existing === undefined) {
            return jsonResponse(
              errorBody(
                "timetable_slot_not_found",
                "That timetable slot does not exist, or it belongs to someone else.",
              ),
              404,
            );
          }

          slots = slots.filter((slot) => slot.id !== slotId);

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

      const subjectsMatch = /^\/semesters\/([^/]+)\/subjects$/.exec(url);

      if (subjectsMatch !== null) {
        const semesterId = decodeURIComponent(subjectsMatch[1] ?? "");

        if (method === "GET") {
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
    setSlots: (next: readonly TimetableSlot[]) => {
      slots = [...next];
    },
  };
}

function renderTimetable(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/timetable" element={<TimetablePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const SEMESTER_ONE = makeSemester({
  id: "00000000-0000-4000-8000-000000000001",
  name: "Semester 1",
});

const SEMESTER_TWO = makeSemester({
  id: "00000000-0000-4000-8000-000000000002",
  name: "Semester 2",
  status: "setup",
});

const PHYSICS = makeSubject(SEMESTER_ONE.id, "Physics", {
  id: "00000000-0000-4000-8000-000000000101",
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("timetable editor", () => {
  it("shows a loading state before the timetable arrives", async () => {
    let resolveSlots: ((value: Response) => void) | undefined;

    const fetchMock = vi.fn((input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);

      if (url === "/semesters") {
        return Promise.resolve(jsonResponse({ semesters: [SEMESTER_ONE] }));
      }

      if (url === `/semesters/${SEMESTER_ONE.id}/timetable-slots`) {
        return new Promise<Response>((resolve) => {
          resolveSlots = resolve;
        });
      }

      if (url === `/semesters/${SEMESTER_ONE.id}/subjects`) {
        return Promise.resolve(jsonResponse({ subjects: [PHYSICS] }));
      }

      return Promise.resolve(
        jsonResponse(
          errorBody("unexpected_request", "Unexpected request"),
          500,
        ),
      );
    });

    vi.stubGlobal("fetch", fetchMock);
    renderTimetable(`/timetable?semester=${SEMESTER_ONE.id}`);

    expect(await screen.findByText("Loading timetable…")).toBeTruthy();
    await waitFor(() => expect(resolveSlots).toBeTypeOf("function"));

    resolveSlots?.(
      jsonResponse({ slots: [makeSlot(SEMESTER_ONE.id, PHYSICS.id)] }),
    );

    expect(await screen.findByText("Physics")).toBeTruthy();
  });

  it("lists slots grouped by weekday", async () => {
    const physics = makeSubject(SEMESTER_ONE.id, "Physics", {
      id: "00000000-0000-4000-8000-000000000101",
    });
    const mondaySlot = makeSlot(SEMESTER_ONE.id, physics.id, {
      id: "00000000-0000-4000-8000-000000000201",
      dayOfWeek: 1,
      startTime: "09:00",
      endTime: "10:00",
    });
    const wednesdaySlot = makeSlot(SEMESTER_ONE.id, physics.id, {
      id: "00000000-0000-4000-8000-000000000202",
      dayOfWeek: 3,
      startTime: "11:00",
      endTime: "12:00",
    });

    installFakeApi({
      semesters: [SEMESTER_ONE],
      subjects: [physics],
      slots: [mondaySlot, wednesdaySlot],
    });

    renderTimetable(`/timetable?semester=${SEMESTER_ONE.id}`);

    await screen.findByText("09:00 – 10:00");

    const monday = screen
      .getByText("Mon")
      .closest('div[role="rowheader"]') as HTMLElement | null;
    expect(monday).toBeTruthy();
    expect(within(monday!).getByText("Physics")).toBeTruthy();
    expect(within(monday!).getByText("09:00 – 10:00")).toBeTruthy();

    const wednesday = screen
      .getByText("Wed")
      .closest('div[role="rowheader"]') as HTMLElement | null;
    expect(wednesday).toBeTruthy();
    expect(within(wednesday!).getByText("Physics")).toBeTruthy();
    expect(within(wednesday!).getByText("11:00 – 12:00")).toBeTruthy();
  });

  it("renders an empty state and creates the first slot", async () => {
    const api = installFakeApi({
      semesters: [SEMESTER_ONE],
      subjects: [PHYSICS],
      slots: [],
    });

    renderTimetable(`/timetable?semester=${SEMESTER_ONE.id}`);

    expect(await screen.findByText("No timetable slots yet")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add the first slot" }));
    fireEvent.change(screen.getByLabelText("Subject"), {
      target: { value: PHYSICS.id },
    });
    fireEvent.change(screen.getByLabelText("Day of week"), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByLabelText("Start time"), {
      target: { value: "14:00" },
    });
    fireEvent.change(screen.getByLabelText("End time"), {
      target: { value: "15:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add slot" }));

    expect(await screen.findByText(/Timetable slot was added./)).toBeTruthy();

    const post = api.calls.find(
      (call) => call.method === "POST" && call.url.includes("/timetable-slots"),
    );
    expect(post).toBeDefined();
    expect(post!.body).toEqual({
      subjectId: PHYSICS.id,
      dayOfWeek: 2,
      startTime: "14:00",
      endTime: "15:00",
      room: null,
      classType: "lecture",
      activeFrom: null,
      activeTo: null,
    });

    expect(await screen.findByText("14:00 – 15:00")).toBeTruthy();
  });

  it("validates locally before sending a create request", async () => {
    const api = installFakeApi({
      semesters: [SEMESTER_ONE],
      subjects: [PHYSICS],
      slots: [],
    });

    renderTimetable(`/timetable?semester=${SEMESTER_ONE.id}`);

    expect(await screen.findByText("No timetable slots yet")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add the first slot" }));
    fireEvent.click(screen.getByRole("button", { name: "Add slot" }));

    expect(screen.getByText(/Choose a subject/)).toBeTruthy();

    const post = api.calls.find((call) => call.method === "POST");
    expect(post).toBeUndefined();

    fireEvent.change(screen.getByLabelText("Subject"), {
      target: { value: PHYSICS.id },
    });
    fireEvent.change(screen.getByLabelText("Start time"), {
      target: { value: "10:00" },
    });
    fireEvent.change(screen.getByLabelText("End time"), {
      target: { value: "09:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add slot" }));

    expect(
      screen.getByText(/End time must be after the start time/),
    ).toBeTruthy();
    expect(api.calls.find((call) => call.method === "POST")).toBeUndefined();
  });

  it("edits a slot", async () => {
    const physics = makeSubject(SEMESTER_ONE.id, "Physics", {
      id: "00000000-0000-4000-8000-000000000101",
    });
    const slot = makeSlot(SEMESTER_ONE.id, physics.id, {
      id: "00000000-0000-4000-8000-000000000201",
      dayOfWeek: 1,
      startTime: "09:00",
      endTime: "10:00",
    });

    const api = installFakeApi({
      semesters: [SEMESTER_ONE],
      subjects: [physics],
      slots: [slot],
    });

    renderTimetable(`/timetable?semester=${SEMESTER_ONE.id}`);

    await screen.findByText("09:00 – 10:00");

    fireEvent.click(screen.getByRole("button", { name: /Edit/ }));

    fireEvent.change(screen.getByLabelText("Start time"), {
      target: { value: "13:00" },
    });
    fireEvent.change(screen.getByLabelText("End time"), {
      target: { value: "14:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save slot" }));

    expect(await screen.findByText("Slot was saved.")).toBeTruthy();

    const patch = api.calls.find(
      (call) =>
        call.method === "PATCH" && call.url.includes("/timetable-slots/"),
    );
    expect(patch).toBeDefined();
    expect(patch!.body).toMatchObject({ startTime: "13:00", endTime: "14:00" });

    expect(await screen.findByText("13:00 – 14:00")).toBeTruthy();
  });

  it("shows a server validation error on create", async () => {
    const failCreate = jsonResponse(
      errorBody("validation_failed", "Some of those details are not valid.", [
        { path: "endTime", message: "End time must be after the start time." },
      ]),
      422,
    );

    installFakeApi({
      semesters: [SEMESTER_ONE],
      subjects: [PHYSICS],
      slots: [],
      failCreate,
    });

    renderTimetable(`/timetable?semester=${SEMESTER_ONE.id}`);

    expect(await screen.findByText("No timetable slots yet")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add the first slot" }));
    fireEvent.change(screen.getByLabelText("Subject"), {
      target: { value: PHYSICS.id },
    });
    fireEvent.change(screen.getByLabelText("Day of week"), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByLabelText("Start time"), {
      target: { value: "09:00" },
    });
    fireEvent.change(screen.getByLabelText("End time"), {
      target: { value: "10:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add slot" }));

    expect(
      await screen.findByText(/Some of those details are not valid./),
    ).toBeTruthy();
  });

  it("rejects an overlapping slot", async () => {
    const physics = makeSubject(SEMESTER_ONE.id, "Physics", {
      id: "00000000-0000-4000-8000-000000000101",
    });
    const existing = makeSlot(SEMESTER_ONE.id, physics.id, {
      id: "00000000-0000-4000-8000-000000000201",
      dayOfWeek: 1,
      startTime: "09:00",
      endTime: "10:00",
    });

    const failCreate = jsonResponse(
      errorBody(
        "timetable_slot_overlap",
        "Another slot already covers that weekday and time in this semester.",
      ),
      409,
    );

    installFakeApi({
      semesters: [SEMESTER_ONE],
      subjects: [physics],
      slots: [existing],
      failCreate,
    });

    renderTimetable(`/timetable?semester=${SEMESTER_ONE.id}`);

    await screen.findByText("09:00 – 10:00");

    fireEvent.click(screen.getByRole("button", { name: "Add slot" }));
    fireEvent.change(screen.getByLabelText("Subject"), {
      target: { value: physics.id },
    });
    fireEvent.change(screen.getByLabelText("Day of week"), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByLabelText("Start time"), {
      target: { value: "09:30" },
    });
    fireEvent.change(screen.getByLabelText("End time"), {
      target: { value: "10:30" },
    });
    const submitButtons = screen.getAllByRole("button", { name: "Add slot" });
    fireEvent.click(
      submitButtons.find((b) => b.getAttribute("type") === "submit")!,
    );

    expect(
      await screen.findByText(
        /Another slot already covers that weekday and time in this semester./,
      ),
    ).toBeTruthy();
  });

  it("removes a slot after confirmation", async () => {
    const physics = makeSubject(SEMESTER_ONE.id, "Physics", {
      id: "00000000-0000-4000-8000-000000000101",
    });
    const slot = makeSlot(SEMESTER_ONE.id, physics.id, {
      id: "00000000-0000-4000-8000-000000000201",
      dayOfWeek: 1,
      startTime: "09:00",
      endTime: "10:00",
    });

    const api = installFakeApi({
      semesters: [SEMESTER_ONE],
      subjects: [physics],
      slots: [slot],
    });

    renderTimetable(`/timetable?semester=${SEMESTER_ONE.id}`);

    await screen.findByText("09:00 – 10:00");

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    fireEvent.click(screen.getByRole("button", { name: /Yes, remove/ }));

    expect(await screen.findByText("Slot was removed.")).toBeTruthy();

    const del = api.calls.find(
      (call) =>
        call.method === "DELETE" && call.url.includes("/timetable-slots/"),
    );
    expect(del).toBeDefined();

    expect(screen.queryByText("09:00 – 10:00")).toBeNull();
  });

  it("requires sign in when the API refuses with 401", async () => {
    const failSlots = jsonResponse(
      errorBody("unauthenticated", "Sign in to continue."),
      401,
    );

    installFakeApi({
      semesters: [SEMESTER_ONE],
      subjects: [PHYSICS],
      slots: [],
      failSlots,
    });

    renderTimetable(`/timetable?semester=${SEMESTER_ONE.id}`);

    expect(await screen.findByText("Sign in required")).toBeTruthy();
  });

  it("shows unavailable when sign-in is not configured", async () => {
    const failSlots = jsonResponse(
      errorBody("auth_not_configured", "Sign-in is not configured."),
      503,
    );

    installFakeApi({
      semesters: [SEMESTER_ONE],
      subjects: [PHYSICS],
      slots: [],
      failSlots,
    });

    renderTimetable(`/timetable?semester=${SEMESTER_ONE.id}`);

    expect(await screen.findByText("Timetable is unavailable")).toBeTruthy();
  });

  it("never mixes one semester's slots into another", async () => {
    const physics = makeSubject(SEMESTER_ONE.id, "Physics", {
      id: "00000000-0000-4000-8000-000000000101",
    });
    const biology = makeSubject(SEMESTER_TWO.id, "Biology", {
      id: "00000000-0000-4000-8000-000000000102",
    });
    const slotOne = makeSlot(SEMESTER_ONE.id, physics.id, {
      id: "00000000-0000-4000-8000-000000000201",
      dayOfWeek: 1,
      startTime: "09:00",
      endTime: "10:00",
    });
    const slotTwo = makeSlot(SEMESTER_TWO.id, biology.id, {
      id: "00000000-0000-4000-8000-000000000202",
      dayOfWeek: 2,
      startTime: "11:00",
      endTime: "12:00",
    });

    installFakeApi({
      semesters: [SEMESTER_ONE, SEMESTER_TWO],
      subjects: [physics, biology],
      slots: [slotOne, slotTwo],
    });

    renderTimetable(`/timetable?semester=${SEMESTER_ONE.id}`);

    await screen.findByText("09:00 – 10:00");
    expect(screen.queryByText("11:00 – 12:00")).toBeNull();

    fireEvent.change(screen.getByLabelText("Semester"), {
      target: { value: SEMESTER_TWO.id },
    });

    expect(await screen.findByText("11:00 – 12:00")).toBeTruthy();
    expect(screen.queryByText("09:00 – 10:00")).toBeNull();
  });

  it("does not list archived slots", async () => {
    const physics = makeSubject(SEMESTER_ONE.id, "Physics", {
      id: "00000000-0000-4000-8000-000000000101",
    });
    const live = makeSlot(SEMESTER_ONE.id, physics.id, {
      id: "00000000-0000-4000-8000-000000000201",
      dayOfWeek: 1,
      startTime: "09:00",
      endTime: "10:00",
    });
    const archived = makeSlot(SEMESTER_ONE.id, physics.id, {
      id: "00000000-0000-4000-8000-000000000202",
      dayOfWeek: 2,
      startTime: "14:00",
      endTime: "15:00",
      archivedAt: "2026-07-01T00:00:00.000Z",
    });

    installFakeApi({
      semesters: [SEMESTER_ONE],
      subjects: [physics],
      slots: [live, archived],
    });

    renderTimetable(`/timetable?semester=${SEMESTER_ONE.id}`);

    await screen.findByText("09:00 – 10:00");
    expect(screen.queryByText("14:00 – 15:00")).toBeNull();
  });
});
