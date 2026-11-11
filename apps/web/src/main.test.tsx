import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * The entry point is where this bug class hides: every other test wraps
 * the component tree in its own `MemoryRouter`, so a `main.tsx` that
 * forgets the real `BrowserRouter` still passes all of them while the
 * shipped app crashes with "useLocation() may be used only in the
 * context of a <Router>". This test boots the actual entry module.
 */
describe("app entry point", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
  });

  it("renders the shell on load, so the router is wired in main.tsx", async () => {
    await import("./main");

    // Let the concurrent root commit; StrictMode renders twice.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.body.textContent).toContain("The GPA Project");
    expect(document.querySelector("h1")?.textContent).toBe("Today");
  });
});
