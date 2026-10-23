import { fileURLToPath } from "node:url";
import { z } from "zod";

/**
 * Server-side environment schema.
 *
 * This module is the only place in the repository that reads
 * `process.env`. Validating here means a missing or malformed value stops
 * the process with a readable message instead of failing later in an
 * unrelated code path.
 *
 * Ownership boundaries:
 * - Server-only values live here (`NODE_ENV`, `PORT`, `DATABASE_URL`,
 *   `CLERK_SECRET_KEY`). They must never be read by browser code or by
 *   `@gpa/shared`, which is bundled into the client.
 * - Clerk's *publishable* key is deliberately absent: the browser needs
 *   it, so it will be a `VITE_` variable when auth is wired. Only the
 *   secret key belongs on the server, where sessions are verified.
 *
 * `DATABASE_URL` stays optional because the API serves only `/health`
 * and no endpoint reads data yet; the migration script and any code that
 * opens the database require it and fail with a clear message when it is
 * missing (P07). `CLERK_SECRET_KEY` stays optional until sign-in is
 * wired. Requiring either at boot would push fake credentials into local
 * setup for no benefit.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  /**
   * Port the API listens on. `0` is rejected on purpose: it asks the
   * operating system for a random port, but a running API must be
   * reachable at a known address. Some shells and harnesses preset
   * `PORT`, so the failure message says exactly what to do about it.
   */
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),

  DATABASE_URL: z.url().optional(),
  CLERK_SECRET_KEY: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

const REMEDIATION =
  "Unset the variable to use its default, set a valid value, or copy .env.example to .env. " +
  "Variable values are never printed.";

/**
 * Loads the repository-root `.env` when present.
 *
 * Node does not read `.env` files on its own, and the file is optional in
 * every environment (hosts normally inject variables directly), so a
 * missing file is not an error. Existing process variables win, which
 * keeps deployment configuration authoritative over a stray local file.
 */
export function loadLocalEnvFile(): void {
  const envPath = fileURLToPath(new URL("../../../../.env", import.meta.url));

  try {
    process.loadEnvFile(envPath);
  } catch {
    // No .env file: fall back to the real environment.
  }
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    // Name the variable and the reason only. Never echo the value, so a
    // mistyped secret cannot end up in a log or an error report.
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");

    throw new Error(
      `Invalid environment configuration - ${details}. ${REMEDIATION}`,
    );
  }

  return result.data;
}
