import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import App from "./App";
import { plannedModules } from "./navigation";

function renderApp(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("app shell", () => {
  it("puts the product identity in the shell and one level-one heading in the page", () => {
    renderApp("/");

    const headings = screen.getAllByRole("heading", { level: 1 });

    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe("Today");
    expect(screen.getAllByText("The GPA Project").length).toBeGreaterThan(0);
  });

  it("links every planned module, and only real routes", () => {
    renderApp("/");

    const nav = screen.getByRole("navigation");

    for (const module of plannedModules) {
      const link = within(nav).getByRole("link", {
        name: new RegExp(`^${module.label}`),
      });

      expect(link.getAttribute("href")).toBe(module.path);
    }
  });

  it("marks the current route without marking the others", () => {
    renderApp("/tasks");

    const nav = screen.getByRole("navigation");
    const tasks = within(nav).getByRole("link", { name: /^Tasks/ });
    const timetable = within(nav).getByRole("link", { name: /^Timetable/ });

    expect(tasks.getAttribute("aria-current")).toBe("page");
    expect(timetable.getAttribute("aria-current")).toBeNull();
  });

  it("describes every planned route as unbuilt rather than empty data", () => {
    for (const module of plannedModules) {
      renderApp(module.path);

      const heading = screen.getAllByRole("heading", { level: 1 });

      expect(heading).toHaveLength(1);
      expect(heading[0]?.textContent).toBe(module.label);
      expect(screen.getByText(/Not built yet/i)).toBeTruthy();
      expect(screen.queryByText(/^0%$/)).toBeNull();

      cleanup();
    }
  });

  it("says the shell has no account or stored records", () => {
    renderApp("/");

    expect(screen.getByText(/Nothing is connected yet/i)).toBeTruthy();
  });

  it("returns a not-found page for an unknown route", () => {
    renderApp("/nope");

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Page not found",
    );
    expect(screen.getByRole("link", { name: /Back to Today/i })).toBeTruthy();
  });
});
