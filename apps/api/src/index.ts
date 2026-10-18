import { APP_NAME } from "@gpa/shared";
import { createApp } from "./app.js";
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

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`${APP_NAME} API listening on http://localhost:${env.PORT}`);
});

function shutdown(signal: NodeJS.Signals): void {
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", () => {
  shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});
