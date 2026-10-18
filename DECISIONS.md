# Decision Log --- The GPA Project

Record durable decisions here. New decisions should be appended with an
ID and date. Do not silently overwrite an earlier decision; mark it
superseded and explain why.

## D001 --- Product name

-   **Date:** 2026-10-18
-   **Decision:** The product is named **The GPA Project**.
-   **Reason:** The scope includes the broader college workflow, not
    only GPA calculation.

## D002 --- Timetable is configurable data

-   **Date:** 2026-10-18
-   **Decision:** The student manually enters recurring timetable slots
    once per semester; the timetable must not be hardcoded.
-   **Implication:** All timetable behavior is driven by persisted
    semester-specific records.

## D003 --- Semester history is preserved

-   **Date:** 2026-10-18
-   **Decision:** A new semester must not erase prior semester
    statistics or records.
-   **Implication:** Subjects and academic records are scoped to
    semester offerings; archived semesters remain readable.

## D004 --- Date-specific holidays

-   **Date:** 2026-10-18
-   **Decision:** The user can mark any date as a holiday with an
    optional reason.
-   **Implication:** Holiday is a calendar exception; it does not mutate
    the recurring timetable and does not count as absence.

## D005 --- Date-specific schedule overrides

-   **Date:** 2026-10-18
-   **Decision:** Support a one-day special schedule separately from the
    weekly timetable.
-   **Implication:** A special day can follow another weekday or use a
    custom set of classes without changing the recurring pattern.

## D006 --- Tasks are a first-class feature

-   **Date:** 2026-10-18
-   **Decision:** Task management is central, not an add-on.
-   **Implication:** Quick capture, Inbox, due dates, priorities,
    statuses, views, and optional subject/topic/semester links are core
    requirements.

## D007 --- Technical stack is inspected, not assumed

-   **Date:** 2026-10-18
-   **Decision:** Prior stack knowledge is a starting hypothesis only.
-   **Implication:** Mimo must inspect the current repository and
    preserve its existing working stack unless a documented, approved
    reason supports change.

## D008 --- GPA formula must be confirmed

-   **Date:** 2026-10-18
-   **Decision:** Do not assume the institution's grade scale or
    SGPA/CGPA formula.
-   **Implication:** GPA calculations are deferred until the user
    provides/approves the actual rules.

## D009 --- Approved architecture direction

-   **Date:** 2026-10-18
-   **Decision:** The owner has approved the following target architecture:
    -   Frontend: React + TypeScript + Vite.
    -   Backend: Node.js + Express + TypeScript.
    -   Database: PostgreSQL with Drizzle ORM.
    -   Authentication: Clerk.
    -   Workspace: pnpm monorepo, sharing types/validation where useful.
    -   Styling: Tailwind CSS.
    -   Deployment direction: hosted frontend and API with managed
        PostgreSQL, usable across devices.
    -   Audience: potentially multiple students, so the data model and
        authorization model are designed for multiple users from the
        beginning.
    -   Isolation: every academic and personal record is scoped to an
        authenticated user. Server-side authorization derives identity
        from a verified Clerk session, never from a client-supplied user
        ID, email, or other untrusted identifier.
-   **Status:** Approved direction only. This is not permission to
    scaffold the application, install dependencies, create provider
    accounts, or deploy. Exact provider choice, configuration, pricing,
    and cost verification remain future work.
-   **Relationship to earlier decisions:** Consistent with D007 because
    the repository was inspected first (P00) and confirmed to contain no
    application code, and the stack was then chosen explicitly by the
    owner rather than assumed. For authentication specifically, this
    record is the explicit decision that MAIN_PLAN.md section 9 asked
    for before adding Clerk; that planning-stage caution is now
    satisfied, not contradicted.
-   **Implication:** User ownership columns, per-user query scoping, and
    server-side authorization are architectural requirements from the
    first schema (P07 onward), not later hardening. Retrofitting them
    would be a data migration, so they must be designed in.

## D010 --- MIMO_DAILY_PROMPTS.md is canonical for prompt IDs

-   **Date:** 2026-10-18
-   **Decision:** `MIMO_DAILY_PROMPTS.md` is the single canonical source
    for the operational prompt sequence P00--P43 and for what each
    prompt is allowed to implement. `ROADMAP.md` describes the same
    sequence in phase form and must match it.
-   **Reason:** The first roadmap draft used different prompt IDs and
    scopes from P01 onward, which would have caused sessions to execute
    a different task than the reviewed prompt.
-   **Implication:** If the roadmap and the daily prompts ever disagree
    again, the daily prompts win and the roadmap must be corrected
    rather than reinterpreted. Roadmap acceptance criteria remain
    binding requirements even where the prompt text is terse.

## D011 --- Repository hygiene: duplicate pack and tooling state

-   **Date:** 2026-10-18
-   **Decision:** Two non-tracked locations are retained unchanged:
    -   `The_GPA_Project/` is a gitignored local backup containing eight
        byte-identical copies of the root planning documents. It is not
        a second source of truth and must not be edited as if it were.
    -   `.freebuff/` is untracked local tooling state containing only a
        `project-id` file. It is not application content.
-   **Reason:** Neither is harmful, and deleting files or changing
    ignore rules is outside the scope of a documentation-reconciliation
    task.
-   **Implication:** The root documents are the only tracked source of
    truth. The duplicate copy will drift if root documents change; that
    is accepted for now. Any future removal or ignore-rule change should
    be a deliberate, separately approved task.

## D012 --- Foundation layout is three packages, not four

-   **Date:** 2026-10-18
-   **Decision:** The workspace ships as `apps/web` (React + Vite +
    Tailwind), `apps/api` (Express, and from P07 the Drizzle schema at
    `apps/api/src/db`), and `packages/shared` (zod contracts, types,
    and pure helpers). P02 proposed a fourth package, `packages/db`;
    P03 reviewed and dropped it.
-   **Reason:** Only the API and its tests consume the schema, so a
    separate database package added a workspace boundary with no second
    consumer. It will be extracted if and when a worker, import script,
    or admin tool needs the same schema.
-   **Implication:** Server-only pure logic lives in
    `apps/api/src/domain`, not in a package, and stays free of Express
    and Drizzle imports so it can be unit-tested without a database.
    `packages/shared` carries no runtime dependency other than zod.

## D013 --- Toolchain versions are pinned per package

-   **Date:** 2026-10-18
-   **Decision:** Dependencies are declared with exact versions in each
    package manifest and resolved to a single committed
    `pnpm-lock.yaml`. The foundation is built on Node 24, TypeScript 7,
    React 19, Vite 8, Express 5, Tailwind 4, Vitest 5, and zod 4.
-   **Reason:** Exact pins plus one lockfile make installs reproducible
    and make a version bump a deliberate, reviewable change rather than
    an accident of install order.
-   **Implication:** Upgrading a major (for example Tailwind or Vite)
    is its own documented task with the checks re-run, not a side effect
    of adding a dependency.

## D014 --- Build scripts are approved explicitly, and `.env` is loaded by Node

-   **Date:** 2026-10-18
-   **Decision:** pnpm's default refusal to run dependency build scripts
    is kept, with `allowBuilds: { esbuild: true }` recorded in
    `pnpm-workspace.yaml` as the only exception. The API loads an
    optional repository-root `.env` with Node's built-in
    `process.loadEnvFile`, then validates every variable through one zod
    schema that fails fast at boot.
-   **Reason:** Blanket-approving dependency scripts weakens supply-chain
    safety, and only esbuild demonstrably needs one for the Vite/Vitest
    toolchain. Validation in a single module means a missing or
    malformed variable stops the process with a readable message instead
    of failing later in an unrelated code path.
-   **Implication:** Environment variables already present in the
    process win over `.env` values, so deployment configuration stays
    authoritative. Secrets are never logged: validation errors name the
    variable and the reason only. The frontend may only read `VITE_`
    prefixed values, which are public by construction.

## D015 --- Authentication is not implemented yet

-   **Date:** 2026-10-18
-   **Decision:** The foundation contains no Clerk code, no session
    handling, and no authenticated route. The health endpoint is public
    and returns no user data.
-   **Reason:** D009 approves Clerk as the direction, but wiring it is
    P04/P07 work. Shipping an unverified auth path, or a route that
    appears protected but is not, would be worse than shipping none.
-   **Implication:** Until auth lands, **no endpoint may read or write
    user data**, and no feature module may be exposed over the API. The
    first authenticated endpoint must arrive together with its
    two-user isolation test.

## D016 --- Environment variables have one owner and one validation boundary

-   **Date:** 2026-10-18
-   **Decision:** `apps/api/src/config/env.ts` is the only module in the
    repository that reads `process.env`. It validates every server
    variable at process boot and fails fast with a message that names the
    variable and the reason. Server configuration is documented once, in
    the repository-root `.env.example`.
-   **Ownership rules:**
    -   Server-only: `NODE_ENV`, `PORT`, `DATABASE_URL`,
        `CLERK_SECRET_KEY`. These never appear in browser code and never
        use the `VITE_` prefix.
    -   Browser: only `VITE_`-prefixed values, documented in
        `apps/web/.env.example`. Everything there ships in the client
        bundle, so it is public by construction.
    -   `packages/shared`: no environment access at all. It is imported
        by the browser, so reading `process.env` there would leak server
        configuration into the client bundle.
    -   Clerk keys are split by audience: the secret key stays
        server-side; the publishable key becomes a `VITE_` variable when
        auth is wired.
-   **Reason:** A single boundary makes it impossible to forget
    validation in a new module, and an explicit ownership rule makes a
    leaked secret a structural mistake rather than a judgement call.
-   **Implication:** Error messages name variables but never print
    values, so a mistyped secret cannot reach a log. Adding a variable
    means adding it to the schema and the example file in the same
    change.

## D017 --- A preset `PORT` is reported, never masked

-   **Date:** 2026-10-18
-   **Decision:** The API keeps strict `PORT` validation (integer,
    1-65535) and rejects `0`. When validation fails it prints the
    variable name, the reason, and a remediation hint, then exits 1.
-   **Cause established:** In this workspace, `PORT=0` is present in the
    parent process environment of the agent's shell, but it is **not**
    set in the Windows User or Machine environment (`User=` and
    `Machine=` are empty). A normal terminal therefore does not have it;
    the value is injected by the execution harness and inherited by
    child processes.
-   **Rejected alternatives:** forcing `PORT=3001` inside the `dev`
    script would mask a genuinely invalid environment value and diverge
    from the documented configuration path; treating `PORT=0` as an
    ephemeral port would let the API bind an unpredictable address,
    which no client or health check could rely on.
-   **Implication:** Local runs in this workspace start the API with
    `PORT=3001` set explicitly. This is documented in `README.md` and
    `.env.example` rather than papered over in code.

## D018 --- The quality gate is one command with five stages

-   **Date:** 2026-10-18
-   **Decision:** `pnpm check` runs `format:check` -> `lint` ->
    `typecheck` -> `test` -> `build`, cheapest and fastest first, and CI
    runs the same five steps individually so a failure names the stage.
    Tools: Prettier for formatting, ESLint 10 with `typescript-eslint`
    for linting, one flat config at the repository root.
-   **Non-type-aware linting is deliberate:** `pnpm typecheck` already
    runs the full TypeScript compiler across every package, so type-aware
    lint rules would duplicate that coverage and roughly double lint
    time. If a future bug class needs them, adding a second lint pass is
    a small, separate change.
-   **Prettier scope:** source, configs, and workflow YAML are formatted;
    generated output, the lockfile, dotenv templates (no Prettier parser),
    and the hand-wrapped planning documents are excluded. Reformatting the
    project pack would create churn without improving content.
-   **Lint convention:** `@typescript-eslint/no-unused-vars` ignores
    identifiers prefixed with `_`. TypeScript's own `noUnusedParameters`
    honours the same convention, so this aligns lint with the compiler
    rather than suppressing the rule.
-   **Implication:** No rule is disabled wholesale and no source path is
    excluded from linting. A check may only be trusted once it has been
    seen to fail; the formatting and lint stages were both observed
    failing on real findings before they passed.

## D019 --- TypeScript 7 ships no API, so typescript-eslint uses the TS 6 alias

-   **Date:** 2026-10-18
-   **Decision:** The workspace compiles with TypeScript 7 in every
    package, while the root installs two aliases: `typescript` resolves to
    `@typescript/typescript6` and `@typescript/native` resolves to
    `typescript@7.0.2`. `typescript-eslint` therefore consumes the TS 6
    API, and `tsc` remains the TypeScript 7 compiler.
-   **Reason:** With the real TypeScript 7 installed, `typescript-eslint`
    8.71.2 aborts with `typescript-eslint does not support TS 7.0`
    (its peer range is `>=4.8.4 <6.1.0`). TypeScript 7.0 is a native port
    that does not yet expose a programmatic API, and this side-by-side
    arrangement is the vendor-documented mitigation for tools that still
    need compiler APIs.
-   **Alternatives considered:** pinning the whole workspace to
    TypeScript 6 would remove the alias but forfeit the TypeScript 7
    compiler and contradict the pinned versions in D013; dropping linting
    would leave the P05 objective unmet while the tool works correctly
    through a supported path.
-   **Implication:** Two TypeScript packages exist, so a future reader
    must not assume `typescript` in `node_modules` is the compiler used to
    build. This override should be removed once a typescript-eslint release
    supports TypeScript 7.1's API.
