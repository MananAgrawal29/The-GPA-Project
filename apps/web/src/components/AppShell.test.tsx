import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import App from "../App";

function renderApp(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("mobile navigation", () => {
  it("opens on request and reports its state", () => {
    renderApp("/");

    const toggle = screen.getByRole("button", { name: "Open navigation" });

    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(
      screen.queryByRole("navigation", { name: "Primary navigation" }),
    ).toBeNull();

    fireEvent.click(toggle);

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(
      screen.getByRole("navigation", { name: "Primary navigation" }),
    ).toBeTruthy();
  });

  it("closes itself after following a link", () => {
    renderApp("/");
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));

    const panel = screen.getByRole("navigation", {
      name: "Primary navigation",
    });

    fireEvent.click(within(panel).getByRole("link", { name: /^Tasks/ }));

    expect(
      screen.queryByRole("navigation", { name: "Primary navigation" }),
    ).toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Tasks");
  });

  it("closes on Escape", () => {
    renderApp("/");
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));

    fireEvent.keyDown(document, { key: "Escape" });

    expect(
      screen.queryByRole("navigation", { name: "Primary navigation" }),
    ).toBeNull();
  });

  it("stays closed when the route changes from elsewhere", () => {
    renderApp("/");
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));

    fireEvent.click(
      within(
        screen.getByRole("navigation", { name: "Primary navigation" }),
      ).getByRole("link", { name: /^Timetable/ }),
    );

    expect(
      screen.getByRole("button", { name: "Open navigation" }),
    ).toBeTruthy();
  });
});
