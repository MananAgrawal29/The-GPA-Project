import { defineConfig } from "drizzle-kit";

/**
 * Configuration for `drizzle-kit generate`.
 *
 * Only `generate` is used: it reads the schema and writes committed SQL
 * to `drizzle/`. Applying migrations is done by this package's own
 * script (`db:migrate`), which reads `DATABASE_URL` through the single
 * validated environment module instead of a second configuration path.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
