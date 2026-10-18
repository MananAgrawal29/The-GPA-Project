# The GPA Project --- Project Pack

This pack is the working source of truth for building **The GPA
Project**, a personal college-management system with Mimo as the coding
agent.

**Repository status (2026-10-18):** a runnable workspace foundation
exists. `apps/web` renders one page, `apps/api` answers `GET /health`,
and `packages/shared` holds the contracts between them. There is still
no database, no authentication, and no feature module.

## Files

-   `MAIN_PLAN.md` --- product vision, scope, architecture, data rules,
    milestones, and acceptance principles.
-   `AGENT_INSTRUCTIONS.md` --- persistent instructions for Mimo
    (inspect first, preserve working code, test, document decisions).
-   `CHANGE_HISTORY.md` --- append-only record of meaningful changes.
-   `PROJECT_PROGRESS.md` --- current milestone, next action, blockers,
    and verification status.
-   `ROADMAP.md` --- phased delivery plan, aligned to the canonical
    prompt sequence. `MIMO_DAILY_PROMPTS.md` remains authoritative for
    prompt IDs (D010).
-   `MIMO_DAILY_PROMPTS.md` --- small, sequential prompts to give Mimo
    one session/day at a time. Canonical for P00--P43.
-   `DECISIONS.md` --- architecture/product decisions and items that
    must not be silently changed.
-   `QUICK_START.txt` --- short reminder of the session workflow.
-   `LICENSE` --- MIT.

## How to use this pack

1.  These files belong at the root of the project repository; they are
    already there.
2.  Start with the first prompt in `MIMO_DAILY_PROMPTS.md`.
3.  Give Mimo **one prompt per session**. Do not jump ahead if the
    current milestone is broken.
4.  Ask Mimo to update `PROJECT_PROGRESS.md` and `CHANGE_HISTORY.md`
    after meaningful work.
5.  Keep this pack under version control with the code.
6.  Treat the existing repository as authoritative. If a stack or
    feature already exists, inspect it and adapt rather than rebuilding
    it.

## Development

Requires Node 22 or newer and pnpm 11.

```bash
pnpm install
pnpm check        # format, lint, typecheck, test, build
```

Individual stages: `pnpm format`, `pnpm format:check`, `pnpm lint`,
`pnpm typecheck`, `pnpm test`, `pnpm build`. Each can be run alone; CI
runs the same five in order on pushes and pull requests.

Run both dev servers together with `pnpm dev`. They can also be started
individually:

```bash
PORT=3001 pnpm --filter @gpa/api dev   # API on http://localhost:3001
pnpm --filter @gpa/web dev             # web on http://localhost:5173
```

No credentials are needed for either of those: the health check and the
identity page run with no configuration at all. See **Configuration**
below for the variables that exist and the one shell edge case.

**Layout**

-   `apps/web` --- React, Vite, Tailwind. Imports `@gpa/shared` only.
-   `apps/api` --- Express. Owns authorization once auth exists, and
    will hold the Drizzle schema under `src/db` from P07.
-   `packages/shared` --- zod contracts and pure helpers. No runtime
    dependency other than zod.

`packages/shared` compiles to `dist`, so after editing it either rerun
`pnpm --filter @gpa/shared build` or use the root `pnpm dev` script,
which builds it first.

## Configuration

Only the API reads environment variables, and only through one module
(`apps/api/src/config/env.ts`) that validates them at boot. A missing or
malformed value stops the process with a message naming the variable and
the reason; values are never printed.

| Variable | Owner | Required | Notes |
|---|---|---|---|
| `NODE_ENV` | API | no | `development` (default), `test`, `production`. |
| `PORT` | API | no | Defaults to 3001. Valid range 1-65535; `0` is rejected. |
| `DATABASE_URL` | API | not yet | Reserved until persistence lands (P07). |
| `CLERK_SECRET_KEY` | API | not yet | Reserved until sign-in lands (P07). Server-side only. |
| `VITE_API_BASE_URL` | web | not yet | Reserved until the shell calls the API (P06). Public by construction. |

Copy the root [.env.example](.env.example) to `.env` for local work; the
file is optional and gitignored. Real environment variables always take
precedence over `.env`, which keeps deployment configuration
authoritative.

Tests and shared tooling need no variables at all: API tests build an
environment object in-process and bind an ephemeral port, and the shared
package never touches `process.env`. The health check and identity page
run with no `.env` file present.

**Two rules that protect secrets**

1.  Anything prefixed with `VITE_` is compiled into the browser bundle,
    so server-only values never use that prefix. The web example file
    says so at the top.
2.  `packages/shared` is imported by the browser, so it must never read
    `process.env` or hold a secret. Contracts and pure helpers only.

**If the API refuses to start with `PORT`**

Some shells and agent harnesses export `PORT` (a harness may set it to
`0`). The API rejects that rather than silently binding a random port,
and prints which variable failed. Set it explicitly:

```bash
PORT=3001 pnpm dev
```

A normal terminal without a preset `PORT` needs none of this.

## Architecture direction (approved, not yet built)

Recorded in full as **D009** in `DECISIONS.md`: React + TypeScript +
Vite frontend, Node.js + Express + TypeScript API, PostgreSQL with
Drizzle ORM, Clerk authentication, pnpm monorepo with shared
types/validation, Tailwind CSS, and hosted deployment with managed
PostgreSQL.

The app is designed for **multiple students from the beginning**: every
academic and personal record is isolated by authenticated user, and
server-side authorization derives identity from a verified Clerk session
--- never from a client-supplied user ID.

This is approved direction, not permission to scaffold, install
dependencies, create provider accounts, or deploy. Provider choice,
configuration, and cost verification remain future work.

## Local-only directories

Two locations are intentionally not part of the tracked documentation:

-   `The_GPA_Project/` --- a gitignored backup copy of eight of these
    documents, byte-identical to the root copies. It is not a second
    source of truth (D011).
-   `.freebuff/` --- untracked local tooling state (a project ID). Not
    application content (D011).

## Working rule

Build a reliable, usable system in small increments. A feature is not
complete merely because it looks finished: it must handle realistic
states, errors, persistence, empty states, responsive layouts, and
relevant tests.
