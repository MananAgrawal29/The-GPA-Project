import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { healthResponseSchema, type HealthResponse } from "@gpa/shared";
import { unconfiguredAuth, type AuthBoundary } from "./auth/session.js";
import type { Database } from "./db/client.js";
import { registerSemesterRoutes } from "./semester-routes.js";

export interface AppOptions {
  /**
   * Session boundary for every route that touches user data. Defaults to
   * the unconfigured boundary, which refuses with 503 -- constructing the
   * app never opens a hole by omission.
   */
  readonly auth?: AuthBoundary | undefined;

  /** Database handle. Without it, the data routes refuse with 503. */
  readonly database?: Database | undefined;
}

/**
 * Builds the API without binding a port, so tests can mount it on an
 * ephemeral port and the process entry point stays trivial.
 */
export function createApp(options: AppOptions = {}): Express {
  const app = express();
  const auth = options.auth ?? unconfiguredAuth;

  app.disable("x-powered-by");

  // Mounted first: Clerk verifies the session before any body parsing or
  // routing happens, so every downstream handler sees a verified result.
  if (auth.middleware !== null) {
    app.use(auth.middleware);
  }

  app.use(express.json({ limit: "100kb" }));

  registerSemesterRoutes(app, { auth, database: options.database });

  app.get("/health", (_request: Request, response: Response) => {
    // Parsed through the shared schema so the producer cannot drift from
    // the contract the web app and tests consume.
    const payload: HealthResponse = healthResponseSchema.parse({
      status: "ok",
      service: "api",
      version: "0.1.0",
      timestamp: new Date().toISOString(),
    });

    response.status(200).json(payload);
  });

  app.use((request: Request, response: Response) => {
    response.status(404).json({
      error: {
        code: "not_found",
        message: `No route for ${request.method} ${request.path}`,
      },
    });
  });

  app.use(
    (
      error: unknown,
      _request: Request,
      response: Response,
      _next: NextFunction,
    ) => {
      // Log the fact of the failure, not request content or stack details.
      console.error("Unhandled API error");

      response.status(500).json({
        error: {
          code: "internal_error",
          message: "Unexpected server error",
        },
      });
    },
  );

  return app;
}
