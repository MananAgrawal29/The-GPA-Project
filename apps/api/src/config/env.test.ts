import { describe, expect, it } from "vitest";
import { loadEnv, loadLocalEnvFile } from "./env.js";

describe("loadEnv", () => {
  it("applies defaults when nothing is configured", () => {
    const env = loadEnv({});

    expect(env.NODE_ENV).toBe("development");
    expect(env.PORT).toBe(3001);
  });

  it("returns only declared keys, ignoring unrelated environment noise", () => {
    const env = loadEnv({ SOMETHING_UNRELATED: "value" });

    expect(Object.keys(env).sort()).toEqual(["NODE_ENV", "PORT"]);
  });

  it("accepts explicit valid values", () => {
    const env = loadEnv({
      NODE_ENV: "production",
      PORT: "8080",
      DATABASE_URL: "postgresql://gpa_user:change_me@localhost:5432/gpa",
      CLERK_SECRET_KEY: "placeholder-not-a-real-key",
    });

    expect(env.NODE_ENV).toBe("production");
    expect(env.PORT).toBe(8080);
    expect(env.DATABASE_URL).toContain("localhost:5432");
  });

  it("rejects PORT=0 with an actionable message instead of picking a random port", () => {
    expect(() => loadEnv({ PORT: "0" })).toThrowError(/PORT/);
    expect(() => loadEnv({ PORT: "0" })).toThrowError(/\.env\.example/);
  });

  it("rejects a non-numeric or out-of-range port", () => {
    expect(() => loadEnv({ PORT: "not-a-port" })).toThrowError(/PORT/);
    expect(() => loadEnv({ PORT: "70000" })).toThrowError(/PORT/);
  });

  it("rejects an unknown NODE_ENV", () => {
    expect(() => loadEnv({ NODE_ENV: "staging" })).toThrowError(/NODE_ENV/);
  });

  it("never includes the offending value in the error message", () => {
    const marker = "sensitive-marker-should-not-appear";

    let message = "";
    try {
      loadEnv({ DATABASE_URL: marker });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("DATABASE_URL");
    expect(message).not.toContain(marker);
  });

  it("treats a missing .env file as normal", () => {
    expect(() => {
      loadLocalEnvFile();
    }).not.toThrow();
  });
});
