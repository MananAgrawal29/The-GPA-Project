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
import type { Semester, Subject } from "@gpa/shared";
import SubjectsPage from "./SubjectsPage";

/**
 * Browser-side tests for subject management.
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
    endDate: "2026-11-30",
    status: "setup",
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
  const createdAt = "2026-11-05T10:00:00.000Z";

  return {
    id: "00000000-0000-4000-8000-000000000101",
    semesterId,
    name,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

interface FakeApiOptions {
  readonly semesters?: readonly Semester[];
  readonly subjects?: readonly Subject[];
  readonly failSemesters?: Response;
  readonly failList?: Response;
  readonly failCreate?: Response;
}

interface RecordedCall {
  readonly url: string;
  readonly method: string;
  readonly body: unknown;
}

function installFakeApi(options: FakeApiOptions = {}) {
  const calls: RecordedCall[] = [];
  const semesters = options.semesters ?? [];
  let subjects = [...(options.subjects ?? [])];

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
        return options.failSemesters ?? jsonResponse({ semesters });
      }

      const listMatch = /^\/semesters\/([^/]+)\/subjects$/.exec(url);

      if (listMatch !== null) {
        const semesterId = decodeURIComponent(listMatch[1] ?? "");

        if (method === "GET") {
          return (
            options.failList ??
            jsonResponse({
              subjects: subjects.filter(
                (subject) => subject.semesterId === semesterId,
              ),
            })
          );
        }

        if (method === "POST") {
          if (options.failCreate !== undefined) {
            return options.failCreate;
          }

          const inputBody = body as { readonly name?: string } | undefined;
          const created = makeSubject(
            semesterId,
            inputBody?.name ?? "Untitled",
            { id: crypto.randomUUID() },
          );

          subjects = [...subjects, created];

          return jsonResponse({ subject: created }, 201);
        }
      }

      const detailMatch = /^\/semesters\/([^/]+)\/subjects\/([^/]+)$/.exec(url);

      if (detailMatch !== null) {
        const semesterId = decodeURIComponent(detailMatch[1] ?? "");
        const subjectId = decodeURIComponent(detailMatch[2] ?? "");

        if (method === "GET") {
          const found = subjects.find(
            (subject) =>
              subject.id === subjectId && subject.semesterId === semesterId,
          );

          return found === undefined
            ? jsonResponse(
                errorBody(
                  "subject_not_found",
                  "That subject does not exist, or it belongs to another user's semester.",
                ),
                404,
              )
            : jsonResponse({ subject: found });
        }

        if (method === "PATCH") {
          const index = subjects.findIndex(
            (subject) =>
              subject.id === subjectId && subject.semesterId === semesterId,
          );
          const existing = subjects[index];

          if (existing === undefined) {
            return jsonResponse(
              errorBody(
                "subject_not_found",
                "That subject does not exist, or it belongs to another user's semester.",
              ),
              404,
            );
          }

          const inputBody = body as { readonly name?: string } | undefined;
          const updated: Subject = {
            ...existing,
            name: inputBody?.name ?? existing.name,
            updatedAt: "2026-11-06T10:00:00.000Z",
          };

          subjects = subjects.map((subject, subjectIndex) =>
            subjectIndex === index ? updated : subject,
          );

          return jsonResponse({ subject: updated });
        }
      }

      return jsonResponse(
        errorBody("unexpected_request", `Unexpected request: ${method} ${url}`),
        500,
      );
    },
  );

  vi.stubGlobal("fetch", fetchMock);

  return { calls };
}

function renderSubjects(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/academics" element={<h1>Academics</h1>} />
        <Route path="/academics/subjects" element={<SubjectsPage />} />
        <Route
          path="/academics/subjects/:subjectId"
          element={<SubjectsPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

const SEMESTER_ONE = makeSemester({
  id: "00000000-0000-4000-8000-000000000001",
  name: "Semester 1",
  status: "setup",
});

const SEMESTER_TWO = makeSemester({
  id: "00000000-0000-4000-8000-000000000002",
  name: "Semester 2",
  status: "active",
  startDate: "2027-01-05",
  endDate: "2027-05-30",
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("subject list", () => {
  it("shows a loading state before the selected semester's subjects arrive", async () => {
    let resolveSubjects: ((value: Response) => void) | undefined;

    const fetchMock = vi.fn((input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);

      if (url === "/semesters") {
        return Promise.resolve(jsonResponse({ semesters: [SEMESTER_ONE] }));
      }

      if (url === `/semesters/${SEMESTER_ONE.id}/subjects`) {
        return new Promise<Response>((resolve) => {
          resolveSubjects = resolve;
        });
      }

      return Promise.resolve(
        jsonResponse(
          errorBody("unexpected_request", "Unexpected request"),
          500,
        ),
      );
    });

    vi.stubGlobal("fetch", fetchMock);
    renderSubjects(`/academics/subjects?semester=${SEMESTER_ONE.id}`);

    expect(await screen.findByText("Loading subjects…")).toBeTruthy();
    await waitFor(() => expect(resolveSubjects).toBeTypeOf("function"));

    resolveSubjects?.(
      jsonResponse({
        subjects: [makeSubject(SEMESTER_ONE.id, "Physics")],
      }),
    );

    expect(await screen.findByText("Physics")).toBeTruthy();
  });

  it("lists only the selected semester's subjects", async () => {
    const physics = makeSubject(SEMESTER_ONE.id, "Physics", {
      id: "00000000-0000-4000-8000-000000000101",
    });
    const chemistry = makeSubject(SEMESTER_TWO.id, "Chemistry", {
      id: "00000000-0000-4000-8000-000000000102",
    });

    installFakeApi({
      semesters: [SEMESTER_ONE, SEMESTER_TWO],
      subjects: [physics, chemistry],
    });

    renderSubjects(`/academics/subjects?semester=${SEMESTER_ONE.id}`);

    const list = await screen.findByRole("list", {
      name: "Subjects in Semester 1",
    });

    expect(within(list).getByText("Physics")).toBeTruthy();
    expect(within(list).queryByText("Chemistry")).toBeNull();
    expect(screen.queryByText("Chemistry")).toBeNull();
  });

  it("renders an empty state and creates the first subject", async () => {
    const api = installFakeApi({ semesters: [SEMESTER_ONE] });

    renderSubjects(`/academics/subjects?semester=${SEMESTER_ONE.id}`);

    expect(
      await screen.findByText("No subjects in this semester yet"),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Add the first subject" }),
    );
    fireEvent.change(screen.getByLabelText("Subject name"), {
      target: { value: "Data Structures" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add subject" }));

    expect(await screen.findByText(/was added to Semester 1/)).toBeTruthy();

    const list = await screen.findByRole("list", {
      name: "Subjects in Semester 1",
    });

    expect(within(list).getByText("Data Structures")).toBeTruthy();

    const post = api.calls.find((call) => call.method === "POST");
    expect(post?.body).toEqual({ name: "Data Structures" });
  });

  it("validates a blank name before sending a create request", async () => {
    const api = installFakeApi({ semesters: [SEMESTER_ONE] });

    renderSubjects(`/academics/subjects?semester=${SEMESTER_ONE.id}`);

    fireEvent.click(
      await screen.findByRole("button", { name: "Add the first subject" }),
    );
    fireEvent.change(screen.getByLabelText("Subject name"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add subject" }));

    expect(await screen.findByText("Name is required.")).toBeTruthy();
    expect(api.calls.some((call) => call.method === "POST")).toBe(false);
  });

  it("shows a server validation issue and keeps the form open", async () => {
    installFakeApi({
      semesters: [SEMESTER_ONE],
      failCreate: jsonResponse(
        errorBody("validation_failed", "Some of those details are not valid.", [
          { path: "name", message: "That subject name is not allowed." },
        ]),
        422,
      ),
    });

    renderSubjects(`/academics/subjects?semester=${SEMESTER_ONE.id}`);

    fireEvent.click(
      await screen.findByRole("button", { name: "Add the first subject" }),
    );
    fireEvent.change(screen.getByLabelText("Subject name"), {
      target: { value: "Physics" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add subject" }));

    expect(
      await screen.findByText("That subject name is not allowed."),
    ).toBeTruthy();
    expect(screen.getByText("Add a subject")).toBeTruthy();
  });

  it("shows a retry state when the list request fails", async () => {
    installFakeApi({
      semesters: [SEMESTER_ONE],
      failList: jsonResponse(
        errorBody("http_500", "The server failed to load subjects."),
        500,
      ),
    });

    renderSubjects(`/academics/subjects?semester=${SEMESTER_ONE.id}`);

    expect(await screen.findByText("Could not load subjects")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("shows the sign-in state when the session is missing", async () => {
    installFakeApi({
      semesters: [SEMESTER_ONE],
      failList: jsonResponse(
        errorBody("unauthenticated", "Sign in to continue."),
        401,
      ),
    });

    renderSubjects(`/academics/subjects?semester=${SEMESTER_ONE.id}`);

    expect(await screen.findByText("Sign in required")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Open Academics to sign in" }),
    ).toBeTruthy();
  });
});

describe("subject detail and edit", () => {
  it("opens a subject by id within the selected semester", async () => {
    const subject = makeSubject(SEMESTER_ONE.id, "Physics", {
      id: "00000000-0000-4000-8000-000000000101",
    });

    installFakeApi({ semesters: [SEMESTER_ONE], subjects: [subject] });

    renderSubjects(
      `/academics/subjects/${subject.id}?semester=${SEMESTER_ONE.id}`,
    );

    expect(
      await screen.findByRole("heading", { name: "Physics" }),
    ).toBeTruthy();
    expect(screen.getByText("Semester 1 · 2026-27")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: /Back to subjects/ })
        .getAttribute("href"),
    ).toBe(`/academics/subjects?semester=${SEMESTER_ONE.id}`);
  });

  it("edits a subject and refreshes the detail", async () => {
    const subject = makeSubject(SEMESTER_ONE.id, "Physics", {
      id: "00000000-0000-4000-8000-000000000101",
    });
    const api = installFakeApi({
      semesters: [SEMESTER_ONE],
      subjects: [subject],
    });

    renderSubjects(
      `/academics/subjects/${subject.id}?semester=${SEMESTER_ONE.id}`,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Edit subject" }),
    );

    const input = screen.getByLabelText("Subject name") as HTMLInputElement;
    expect(input.value).toBe("Physics");

    fireEvent.change(input, { target: { value: "Applied Physics" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Subject updated.")).toBeTruthy();
    expect(
      await screen.findByRole("heading", { name: "Applied Physics" }),
    ).toBeTruthy();

    const patch = api.calls.find((call) => call.method === "PATCH");
    expect(patch?.body).toEqual({ name: "Applied Physics" });
  });

  it("does not present a subject from another semester as this semester's", async () => {
    const otherSemesterSubject = makeSubject(SEMESTER_TWO.id, "Physics", {
      id: "00000000-0000-4000-8000-000000000101",
    });

    installFakeApi({
      semesters: [SEMESTER_ONE, SEMESTER_TWO],
      subjects: [otherSemesterSubject],
    });

    renderSubjects(
      `/academics/subjects/${otherSemesterSubject.id}?semester=${SEMESTER_ONE.id}`,
    );

    expect(await screen.findByText("Subject not found")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Physics" })).toBeNull();
  });
});

describe("semester selection and isolation", () => {
  it("switches semesters without leaving the old subjects on screen", async () => {
    const physics = makeSubject(SEMESTER_ONE.id, "Physics", {
      id: "00000000-0000-4000-8000-000000000101",
    });
    const chemistry = makeSubject(SEMESTER_TWO.id, "Chemistry", {
      id: "00000000-0000-4000-8000-000000000102",
    });
    const api = installFakeApi({
      semesters: [SEMESTER_ONE, SEMESTER_TWO],
      subjects: [physics, chemistry],
    });

    renderSubjects(`/academics/subjects?semester=${SEMESTER_ONE.id}`);

    expect(await screen.findByText("Physics")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Semester"), {
      target: { value: SEMESTER_TWO.id },
    });

    expect(await screen.findByText("Chemistry")).toBeTruthy();
    expect(screen.queryByText("Physics")).toBeNull();
    expect((screen.getByLabelText("Semester") as HTMLSelectElement).value).toBe(
      SEMESTER_TWO.id,
    );
    expect(
      api.calls.some(
        (call) => call.url === `/semesters/${SEMESTER_TWO.id}/subjects`,
      ),
    ).toBe(true);
  });

  it("defaults to the active semester when the URL has no selection", async () => {
    const physics = makeSubject(SEMESTER_ONE.id, "Physics", {
      id: "00000000-0000-4000-8000-000000000101",
    });
    const chemistry = makeSubject(SEMESTER_TWO.id, "Chemistry", {
      id: "00000000-0000-4000-8000-000000000102",
    });

    installFakeApi({
      semesters: [SEMESTER_ONE, SEMESTER_TWO],
      subjects: [physics, chemistry],
    });

    renderSubjects("/academics/subjects");

    expect(await screen.findByText("Chemistry")).toBeTruthy();
    expect(screen.queryByText("Physics")).toBeNull();
    expect((screen.getByLabelText("Semester") as HTMLSelectElement).value).toBe(
      SEMESTER_TWO.id,
    );
  });

  it("falls back to the first semester and says when none is active", async () => {
    const archived = makeSemester({
      id: "00000000-0000-4000-8000-000000000002",
      name: "Semester 2",
      status: "archived",
    });

    installFakeApi({
      semesters: [SEMESTER_ONE, archived],
      subjects: [makeSubject(SEMESTER_ONE.id, "Physics")],
    });

    renderSubjects("/academics/subjects");

    expect(await screen.findByText("Physics")).toBeTruthy();
    expect(screen.getByText(/No semester is current/)).toBeTruthy();
    expect((screen.getByLabelText("Semester") as HTMLSelectElement).value).toBe(
      SEMESTER_ONE.id,
    );
  });

  it("handles the case where no semesters exist", async () => {
    installFakeApi({ semesters: [] });

    renderSubjects("/academics/subjects");

    expect(await screen.findByText("No semesters yet")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Go to Academics" })
        .getAttribute("href"),
    ).toBe("/academics");
    expect(screen.queryByRole("button", { name: "New subject" })).toBeNull();
  });
});
