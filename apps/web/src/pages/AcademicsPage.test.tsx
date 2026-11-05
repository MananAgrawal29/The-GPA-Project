import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Semester } from "@gpa/shared";
import AcademicsPage from "./AcademicsPage";

/**
 * Browser-side tests for the semester screen.
 *
 * `fetch` is stubbed, so these cover what the UI does with each response
 * it can receive: loading, empty, refusal, validation failure, conflict,
 * and success. They do not exercise the API, the database, or a real
 * Clerk session -- see the API suite for the server side and the report
 * for what remains unverified.
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

function semester(overrides: Partial<Semester> = {}): Semester {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Semester 1",
    academicYear: "2026-27",
    startDate: "2026-07-01",
    endDate: "2026-11-30",
    status: "setup",
    createdAt: "2026-10-23T10:00:00.000Z",
    updatedAt: "2026-10-23T10:00:00.000Z",
    ...overrides,
  };
}

const fetchMock = vi.fn(
  async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
    jsonResponse({}),
);

function mockResponses(...responses: Response[]): void {
  for (const response of responses) {
    fetchMock.mockResolvedValueOnce(response);
  }
}

function sentBody(index: number): Record<string, unknown> {
  const init = fetchMock.mock.calls[index]?.[1];
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AcademicsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("refusal states", () => {
  it("explains when sign-in is not configured and offers no controls", async () => {
    mockResponses(
      jsonResponse(
        errorBody(
          "auth_not_configured",
          "Sign-in is not configured on this server, so personal data is unavailable.",
        ),
        503,
      ),
    );

    renderPage();

    expect(
      await screen.findByText(/Personal data is unavailable/),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /New semester/ })).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("explains when no session exists and how to enable sign-in", async () => {
    mockResponses(
      jsonResponse(errorBody("unauthenticated", "Sign in to continue."), 401),
    );

    renderPage();

    expect(await screen.findByText("Sign in required")).toBeTruthy();
    expect(screen.getByText(/no Clerk publishable key/i)).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("shows a retry for a request that failed outright", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));

    renderPage();

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });
});

describe("loading and listing", () => {
  it("shows a loading state until the list arrives", async () => {
    let resolveRequest: ((value: Response) => void) | undefined;
    const pending = new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    });
    fetchMock.mockReturnValueOnce(pending);

    renderPage();

    expect(screen.getByRole("status").textContent).toMatch(/Loading semesters/);

    resolveRequest?.(jsonResponse({ semesters: [semester()] }));

    expect(await screen.findByText("Semester 1")).toBeTruthy();
    expect(await screen.findByText("Draft")).toBeTruthy();
  });

  it("renders an empty state instead of an empty list", async () => {
    mockResponses(jsonResponse({ semesters: [] }));

    renderPage();

    expect(await screen.findByText("No semesters yet")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Create your first semester/ }),
    ).toBeTruthy();
    expect(screen.queryByText("Semester 1")).toBeNull();
  });

  it("shows every semester with its status and dates", async () => {
    mockResponses(
      jsonResponse({
        semesters: [
          semester(),
          semester({
            id: "00000000-0000-4000-8000-000000000002",
            name: "Semester 2",
            status: "active",
          }),
        ],
      }),
    );

    renderPage();

    expect(await screen.findByText("Semester 1")).toBeTruthy();
    expect(screen.getByText("Semester 2")).toBeTruthy();
    expect(screen.getAllByText("Current")).toHaveLength(1);
    expect(
      screen.getAllByText(/2026-07-01 → 2026-11-30/).length,
    ).toBeGreaterThan(0);
  });
});

describe("creating a semester", () => {
  it("sends only the contract fields and never an owner id", async () => {
    const created = semester({ name: "Semester 3" });
    mockResponses(
      jsonResponse({ semesters: [] }),
      jsonResponse({ semester: created }, 201),
      jsonResponse({ semesters: [created] }),
    );

    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: /Create your first semester/ }),
    );

    fireEvent.change(screen.getByLabelText(/^Name/), {
      target: { value: "Semester 3" },
    });
    fireEvent.change(screen.getByLabelText(/Academic year/), {
      target: { value: "2026-27" },
    });
    fireEvent.change(screen.getByLabelText(/Start date/), {
      target: { value: "2026-07-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create semester" }));

    expect(await screen.findByText(/was created/)).toBeTruthy();

    const payload = sentBody(1);
    expect(Object.keys(payload).sort()).toEqual([
      "academicYear",
      "endDate",
      "name",
      "startDate",
    ]);
    expect(payload.userId).toBeUndefined();
    expect(payload.user_id).toBeUndefined();
    expect(payload.status).toBeUndefined();
    await waitFor(() => expect(screen.getByText("Semester 3")).toBeTruthy());
  });

  it("keeps the form open and marks the field when the server rejects it", async () => {
    mockResponses(
      jsonResponse({ semesters: [] }),
      jsonResponse(
        errorBody("validation_failed", "Some of those details are not valid.", [
          { path: "name", message: "Name is required." },
        ]),
        422,
      ),
    );

    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: /New semester/ }),
    );

    fireEvent.change(screen.getByLabelText(/^Name/), {
      target: { value: "   " },
    });
    fireEvent.change(screen.getByLabelText(/Academic year/), {
      target: { value: "2026-27" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create semester" }));

    expect(await screen.findByText("Name is required.")).toBeTruthy();
    expect(screen.getByLabelText(/^Name/).getAttribute("aria-invalid")).toBe(
      "true",
    );
    expect(screen.queryByText(/was created/)).toBeNull();
  });
});

describe("activating a semester", () => {
  it("asks what the current semester becomes and sends that choice", async () => {
    const current = semester({
      id: "00000000-0000-4000-8000-000000000001",
      name: "Semester 1",
      status: "active",
    });
    const next = semester({
      id: "00000000-0000-4000-8000-000000000002",
      name: "Semester 2",
      status: "setup",
      startDate: "2027-01-05",
      endDate: "2027-05-30",
    });

    mockResponses(
      jsonResponse({ semesters: [current, next] }),
      jsonResponse({ semester: { ...next, status: "active" } }),
      jsonResponse({
        semesters: [
          { ...next, status: "active" },
          { ...current, status: "completed" },
        ],
      }),
    );

    renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: "Make current" }),
    );
    expect(
      screen.getByText(/What should the current semester become/),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await screen.findByText(/is now the current semester/)).toBeTruthy();
    expect(sentBody(1)).toEqual({ demoteActiveTo: "archived" });
    await waitFor(() => expect(screen.getByText("Semester 2")).toBeTruthy());
  });

  it("surfaces a conflict instead of silently changing the wrong semester", async () => {
    const current = semester({ status: "active" });
    const other = semester({
      id: "00000000-0000-4000-8000-000000000002",
      name: "Semester 2",
      status: "setup",
    });

    mockResponses(
      jsonResponse({ semesters: [current, other] }),
      jsonResponse(
        errorBody(
          "active_semester_conflict",
          "Another semester is already active. Choose what the current active semester becomes before activating this one.",
        ),
        409,
      ),
    );

    renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: "Make current" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText(/Another semester is already active/)).toBeTruthy();
    expect(screen.queryByText(/is now the current semester/)).toBeNull();
  });

  it("never offers to make the current semester current again", async () => {
    mockResponses(
      jsonResponse({ semesters: [semester({ status: "active" })] }),
    );

    renderPage();

    expect(await screen.findByText("Current")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Make current" })).toBeNull();
  });
});

describe("archiving", () => {
  it("requires a confirmation step and keeps the record", async () => {
    const current = semester({ status: "active" });
    const archived = semester({ status: "archived" });

    mockResponses(
      jsonResponse({ semesters: [current] }),
      jsonResponse({ semester: archived }),
      jsonResponse({ semesters: [archived] }),
    );

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Archive" }));

    expect(screen.getByText(/Nothing is deleted/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Yes, archive" }));

    expect(
      await screen.findByText(/was archived and stays readable/),
    ).toBeTruthy();
    expect(sentBody(1)).toEqual({ status: "archived" });
    await waitFor(() => expect(screen.getByText("Archived")).toBeTruthy());
  });
});
