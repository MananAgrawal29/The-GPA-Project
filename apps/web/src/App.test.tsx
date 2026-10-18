import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { APP_NAME } from "@gpa/shared";
import App from "./App";

afterEach(cleanup);

describe("App", () => {
  it("renders the project name as the only level-one heading", () => {
    render(<App />);

    const headings = screen.getAllByRole("heading", { level: 1 });

    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe(APP_NAME);
  });

  it("is explicit that no features are connected yet", () => {
    render(<App />);

    expect(screen.getByText(/Nothing here is connected/i)).toBeTruthy();
  });
});
