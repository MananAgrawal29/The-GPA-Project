import { apiErrorSchema, type FieldIssue } from "@gpa/shared";

/**
 * The browser's shared API transport.
 *
 * No request carries an owner id: the server derives the caller from the
 * verified session. Every response is parsed by the feature client that
 * called this module, so a contract change fails loudly.
 *
 * `VITE_API_BASE_URL` is public by construction (D016). Leaving it empty
 * makes the client call same-origin paths, which is what the Vite dev
 * server proxy does in development.
 */
const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? "";

/** A server-refused request, carrying the code and field issues. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly issues: readonly FieldIssue[];

  constructor(
    status: number,
    code: string,
    message: string,
    issues: readonly FieldIssue[],
  ) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

export async function request(
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(body);

    if (parsed.success) {
      throw new ApiRequestError(
        response.status,
        parsed.data.error.code,
        parsed.data.error.message,
        parsed.data.error.issues ?? [],
      );
    }

    throw new ApiRequestError(
      response.status,
      `http_${response.status}`,
      "The server sent a response this app does not understand.",
      [],
    );
  }

  return body;
}
