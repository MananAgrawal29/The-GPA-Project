# The GPA Project --- Project Pack

This pack is the working source of truth for building **The GPA
Project**, a personal college-management system with Mimo as the coding
agent.

**Repository status (2026-10-23):** a runnable workspace foundation
exists. `apps/web` serves a responsive app shell whose navigation leads to
honest placeholder pages, `apps/api` answers `GET /health` and owns a
PostgreSQL schema with a committed migration for semesters, and
`packages/shared` holds the contracts between them. There is still no
authentication, no API endpoint for data, and no semester screen.

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

Requires Node 22.22 or newer (the floor `react-router` 8 declares) and
pnpm 11.

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
app shell run with no configuration at all. See **Configuration** below
for the variables that exist and the one shell edge case.

The shell has one real route today (`/`) plus a placeholder route per
planned module (`/tasks`, `/timetable`, `/attendance`, `/academics`,
`/exams`, `/gpa`, `/history`) and a not-found page. Every placeholder
states that it is unbuilt; none of them shows data, a zero, or a control
that does nothing.

**Layout**

-   `apps/web` --- React, Vite, Tailwind, and `react-router`. Imports
    `@gpa/shared` only. Every route and navigation entry is declared in
    `src/navigation.ts`, so a link cannot point at a page that does not
    exist.
-   `apps/api` --- Express, plus the Drizzle schema, migrations, and
    owner-scoped repositories under `src/db`. Owns authorization once
    auth exists.
-   `packages/shared` --- zod contracts and pure helpers. No runtime
    dependency other than zod.

`packages/shared` compiles to `dist`, so after editing it either rerun
`pnpm --filter @gpa/shared build` or use the root `pnpm dev` script,
which builds it first.

## Database

The data layer is PostgreSQL with Drizzle ORM (D021). The schema lives in
`apps/api/src/db/schema.ts` and the SQL it generates is committed under
`apps/api/drizzle`, so a schema change is reviewable like any other code.

```bash
# after editing the schema
pnpm --filter @gpa/api db:generate

# apply pending migrations to the database named by DATABASE_URL
DATABASE_URL=postgresql://gpa_user:change_me@localhost:5432/gpa \
  pnpm --filter @gpa/api db:migrate
```

Migrations are additive and `db:migrate` records what it applied, so a
second run is a no-op. It reads the connection string through the same
validated environment module as the API and, when it is missing or
malformed, exits with a message naming the variable (never its value).

**Tests do not need a server.** The integration suite applies the
committed migration to an in-memory PostgreSQL 18 (PGlite) that it creates
and discards itself, then exercises the constraints and per-user
isolation. That is the real engine, but it is not the managed server this
project will deploy against: server version, extensions, roles, and
connection pooling are only verified once a real instance exists.

Calendar dates are stored as `date` and transported as `YYYY-MM-DD` with
no conversion; the pool overrides the driver's date parser so a semester
boundary cannot shift by a day in a non-UTC time zone (D024).

## Configuration

Only the API reads environment variables, and only through one module
(`apps/api/src/config/env.ts`) that validates them at boot. A missing or
malformed value stops the process with a message naming the variable and
the reason; values are never printed.

| Variable | Owner | Required | Notes |
|---|---|---|---|
| `NODE_ENV` | API | no | `development` (default), `test`, `production`. |
| `PORT` | API | no | Defaults to 3001. Valid range 1-65535; `0` is rejected. |
| `DATABASE_URL` | API | only for data | PostgreSQL connection string. Required by `db:migrate` and by any code that opens the database; the API boots without it because no endpoint reads data yet. |
| `CLERK_SECRET_KEY` | API | not yet | Reserved until sign-in lands (P07). Server-side only. |
| `VITE_API_BASE_URL` | web | not yet | Reserved; no screen calls the API yet. Public by construction. |

Copy the root [.env.example](.env.example) to `.env` for local work; the
file is optional and gitignored. Real environment variables always take
precedence over `.env`, which keeps deployment configuration
authoritative.

Tests and shared tooling need no variables at all: API tests build an
environment object in-process, bind an ephemeral port, and create their
own in-memory PostgreSQL, and the shared package never touches
`process.env`. The health check and the app shell run with no `.env` file
present.

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

## Architecture direction (approved; persistence built)

Recorded in full as **D009** in `DECISIONS.md`: React + TypeScript +
Vite frontend, Node.js + Express + TypeScript API, PostgreSQL with
Drizzle ORM, Clerk authentication, pnpm monorepo with shared
types/validation, Tailwind CSS, and hosted deployment with managed
PostgreSQL.

The app is designed for **multiple students from the beginning**: every
academic and personal record is isolated by authenticated user, and
server-side authorization derives identity from a verified Clerk session
--- never from a client-supplied user ID.

PostgreSQL, Drizzle, and the workspace are now real (D021); Clerk,
hosting, and the managed database provider are still direction only.
Nothing here is permission to create provider accounts or deploy.

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
