import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apiErrorSchema, healthResponseSchema } from "@gpa/shared";
import { createApp } from "./app.js";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createApp().listen(0);
  await new Promise<void>((resolve) => {
    server.once("listening", resolve);
  });

  const address = server.address();

  if (address === null || typeof address === "string") {
    throw new Error("API test server did not expose a TCP port");
  }

  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
});

describe("GET /health", () => {
  it("returns a payload that matches the shared contract", async () => {
    const response = await fetch(`${baseUrl}/health`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");

    const body: unknown = await response.json();
    const parsed = healthResponseSchema.parse(body);

    expect(parsed.status).toBe("ok");
    expect(parsed.service).toBe("api");
  });
});

describe("unknown routes", () => {
  it("returns the shared error envelope", async () => {
    const response = await fetch(`${baseUrl}/not-a-route`);

    expect(response.status).toBe(404);

    const body: unknown = await response.json();
    const parsed = apiErrorSchema.parse(body);

    expect(parsed.error.code).toBe("not_found");
  });
});
