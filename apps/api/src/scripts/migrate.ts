import { loadEnv, loadLocalEnvFile } from "../config/env.js";
import { createDatabase } from "../db/client.js";
import { migrateDatabase } from "../db/migrate.js";

/**
 * Applies committed migrations to the database named by `DATABASE_URL`.
 *
 * Run with `pnpm --filter @gpa/api db:migrate`. There is no destructive
 * step: the migrations only create the schema that does not exist yet.
 */
loadLocalEnvFile();

let databaseUrl: string;

try {
  const env = loadEnv();

  if (env.DATABASE_URL === undefined) {
    console.error(
      "DATABASE_URL is not set. Copy .env.example to .env and provide a PostgreSQL connection string.",
    );
    process.exit(1);
  }

  databaseUrl = env.DATABASE_URL;
} catch (error) {
  const message =
    error instanceof Error
      ? error.message
      : "Invalid environment configuration";
  console.error(message);
  process.exit(1);
}

const { db, close } = createDatabase(databaseUrl);

try {
  await migrateDatabase(db);
  console.log("Database migrations applied.");
} catch (error) {
  const message =
    error instanceof Error ? error.message : "Unknown migration failure";
  console.error(`Migration failed: ${message}`);
  process.exitCode = 1;
} finally {
  await close();
}
