import { clerkMiddleware, getAuth } from "@clerk/express";
import type { Request, RequestHandler } from "express";

/**
 * Resolves the verified owner of a request, or `null` when the request
 * carries no session.
 *
 * The value comes from a verified session and never from a header, a
 * query parameter, or a body field: a client can supply any of those, and
 * none of them proves who the caller is (D009).
 */
export type SessionVerifier = (request: Request) => string | null;

export interface AuthBoundary {
  /** Whether sessions can be verified at all (Clerk keys are present). */
  readonly configured: boolean;

  /** Clerk's middleware, mounted only when configured. */
  readonly middleware: RequestHandler | null;

  readonly resolveUserId: SessionVerifier;
}

export interface AuthConfiguration {
  // Explicit `| undefined` so callers may pass an unset variable under
  // `exactOptionalPropertyTypes`; the boundary still treats a missing
  // value as "not configured".
  readonly secretKey?: string | undefined;
  readonly publishableKey?: string | undefined;
}

/**
 * Builds the boundary between HTTP and user data (D015).
 *
 * With both Clerk keys present, `clerkMiddleware()` verifies the session
 * on every request and `getAuth()` reads the result. Without them there
 * is no session to verify, so the boundary reports `configured: false`
 * and the routes refuse with 503 rather than trusting a request that
 * claims to be someone.
 *
 * The keys are passed in rather than read here: `config/env.ts` is the
 * only module allowed to touch `process.env` (D016).
 */
export function createAuthBoundary(config: AuthConfiguration): AuthBoundary {
  const configured =
    config.secretKey !== undefined && config.publishableKey !== undefined;

  if (!configured) {
    return {
      configured: false,
      middleware: null,
      resolveUserId: () => null,
    };
  }

  const middleware = clerkMiddleware({
    secretKey: config.secretKey,
    publishableKey: config.publishableKey,
  });

  return {
    configured: true,
    middleware,
    resolveUserId: (request) => getAuth(request).userId ?? null,
  };
}

/**
 * The boundary used when the app is constructed without configuration:
 * `/health` still works, and user data is refused with an explanation.
 */
export const unconfiguredAuth: AuthBoundary = createAuthBoundary({});
