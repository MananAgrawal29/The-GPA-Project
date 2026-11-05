import { APP_NAME } from "@gpa/shared";
import { createApp } from "./app.js";
import { createAuthBoundary } from "./auth/session.js";
import { createDatabase, type DatabaseHandle } from "./db/client.js";
import { loadEnv, loadLocalEnvFile, type Env } from "./config/env.js";

loadLocalEnvFile();

let env: Env;

try {
  env = loadEnv();
} catch (error) {
  const message =
    error instanceof Error
      ? error.message
      : "Invalid environment configuration";
  console.error(message);
  process.exit(1);
}

const databaseHandle: DatabaseHandle | undefined =
  env.DATABASE_URL === undefined ? undefined : createDatabase(env.DATABASE_URL);

const app = createApp({
  auth: createAuthBoundary({
    secretKey: env.CLERK_SECRET_KEY,
    publishableKey: env.CLERK_PUBLISHABLE_KEY,
  }),
  database: databaseHandle?.db,
});

const server = app.listen(env.PORT, () => {
  console.log(`${APP_NAME} API listening on http://localhost:${env.PORT}`);

  // Say plainly what is not wired, so a working /health is never mistaken
  // for a working sign-in or a working database.
  if (
    env.CLERK_SECRET_KEY === undefined ||
    env.CLERK_PUBLISHABLE_KEY === undefined
  ) {
    console.log(
      "Clerk is not configured; routes that read or write user data will refuse requests.",
    );
  }

  if (databaseHandle === undefined) {
    console.log(
      "No DATABASE_URL; routes that read or write user data will refuse requests.",
    );
  }
});

function shutdown(signal: NodeJS.Signals): void {
  console.log(`${signal} received, shutting down`);

  server.close(() => {
    void (databaseHandle?.close() ?? Promise.resolve()).finally(() => {
      process.exit(0);
    });
  });
}

process.on("SIGINT", () => {
  shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});
