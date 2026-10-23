import { describe, expect, it } from "vitest";
import { createDatabase } from "./client.js";

/**
 * These tests inspect the pool's configuration without connecting, so no
 * database is needed. They cover the one setting that silently changes
 * stored data if it regresses.
 */
describe("createDatabase", () => {
  it("rejects an empty connection string", () => {
    expect(() => createDatabase("   ")).toThrow(/DATABASE_URL is empty/);
  });

  it("returns calendar dates unchanged instead of shifting the day", async () => {
    const handle = createDatabase(
      "postgresql://gpa:test@127.0.0.1:5432/gpa_test",
    );

    const parser = handle.pool.options.types?.getTypeParser?.(1082, "text");

    expect(typeof parser).toBe("function");
    expect(parser?.("2026-07-01")).toBe("2026-07-01");
    expect(parser?.("2026-12-31")).toBe("2026-12-31");

    await handle.close();
  });

  it("leaves other types on the driver's default parser", async () => {
    const handle = createDatabase(
      "postgresql://gpa:test@127.0.0.1:5432/gpa_test",
    );

    const timestampParser = handle.pool.options.types?.getTypeParser?.(
      1114,
      "text",
    );

    expect(timestampParser?.("2026-07-01 10:00:00")).toBeInstanceOf(Date);

    await handle.close();
  });
});
