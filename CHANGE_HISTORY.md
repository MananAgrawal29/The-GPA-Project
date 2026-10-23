# Change History --- The GPA Project

This is an append-only log of meaningful project changes. Keep entries
concise but specific. Do not delete old entries; corrections should be
new entries that reference the earlier one.

## Entry template

### YYYY-MM-DD --- PXX: Short title

-   **Change:** What changed from the user's point of view.
-   **Implementation:** Important technical decisions/files.
-   **Verification:** Commands/tests actually run and their results.
-   **Data/migration impact:** None / additive / potentially
    destructive; explain.
-   **Known limitations:** What remains.
-   **Follow-up:** Next small step.

------------------------------------------------------------------------

## 2026-10-18 --- Planning baseline created

-   **Change:** Established initial product vision, MVP boundaries,
    data-integrity rules, agent workflow, roadmap, and daily prompt
    sequence.
-   **Implementation:** Created project documentation pack before
    implementation; no application code was changed by this planning
    baseline.
-   **Verification:** Documentation consistency review only; no
    application tests applicable.
-   **Data/migration impact:** None.
-   **Known limitations:** Actual repository and current stack must be
    inspected by Mimo before implementation. Technical defaults are
    hypotheses, not mandates.
-   **Follow-up:** Run P00 repository reconnaissance and return a
    factual report before coding.

------------------------------------------------------------------------

## 2026-10-18 --- P01: Documentation reconciliation and baseline verification

-   **Change:** Reconciled the roadmap with the canonical prompt
    sequence, recorded the approved architecture direction, and
    documented the verified P01 baseline. No product behavior changed
    because no application exists yet.
-   **Implementation:** Rewrote `ROADMAP.md` so every phase name, prompt
    ID, and description matches `MIMO_DAILY_PROMPTS.md` P00--P43,
    preserving the earlier draft's acceptance criteria and carrying
    forward requirements that had been attached to different numbers
    (shared UI patterns, persistence conventions, active-semester
    context, calendar/date selection, task views and filters, syllabus
    tracking, export/backup, final audit). Updated `README.md` to
    describe the documentation-only repository status, the canonical
    prompt source, the approved architecture direction, and the two
    local-only directories. Appended D009 (architecture), D010
    (canonical prompt IDs), and D011 (duplicate pack and tooling state)
    to `DECISIONS.md`. Updated `PROJECT_PROGRESS.md` with the verified
    baseline.
-   **Verification:** Read-only checks only: `git status --porcelain=v1`
    (clean apart from untracked `.freebuff/`), `git ls-files` (11
    documentation files), `git log --oneline` (three documentation
    commits), filesystem enumeration (no source or manifest files),
    `cmp` of root documents against `The_GPA_Project/*` (8 of 8
    identical), and toolchain versions (Node 24.18.0, npm 11.16.0, pnpm
    11.15.0, git 2.55.0.windows.3). Install, lint, type-check, test, and
    build were not run because no manifest or script exists.
-   **Data/migration impact:** None. Documentation only; no schema,
    database, or application files exist to affect.
-   **Known limitations:** `The_GPA_Project/` remains an untracked
    duplicate and will drift if the root documents change. Clerk,
    hosting, and managed-PostgreSQL provider choices and costs remain
    unconfirmed. No application behavior has been implemented or
    verified.
-   **Follow-up:** Run P02 gap analysis; do not scaffold or install
    dependencies yet.

------------------------------------------------------------------------

## 2026-10-18 --- P03: Runnable workspace foundation

-   **Change:** The project now has a runnable application foundation:
    a web app that renders an identity page, an API that answers
    `GET /health`, and a shared contracts package. No feature module,
    database, or authentication exists yet.
-   **Implementation:** Created a pnpm workspace with three packages ---
    `apps/web` (React 19, Vite 8, Tailwind 4), `apps/api` (Express 5,
    ESM, zod-validated environment, uniform error envelope), and
    `packages/shared` (zod contracts plus product constants). Added
    `tsconfig.base.json` with strict settings, per-package TypeScript
    configs, `vite.config.ts` with a jsdom test environment, root and
    web `.env.example` files, and `*.tsbuildinfo` / `.vite/` ignore
    entries. Recorded D012 (three-package layout), D013 (pinned
    versions), D014 (build-script allowlist and `.env` loading), and
    D015 (no authentication yet).
-   **Verification:** `pnpm install` exit 0 (188 packages; two earlier
    attempts failed with `ERR_PNPM_IGNORED_BUILDS` until
    `allowBuilds: { esbuild: true }` was added to
    `pnpm-workspace.yaml`). `pnpm build` exit 0 --- API and shared
    compiled, web bundle 301.58 kB JS / 8.21 kB CSS. `pnpm typecheck`
    exit 0 for all three packages. `pnpm test` exit 0 with 4 smoke tests
    passing. API dev server answered `/health` with 200 and an unknown
    route with 404 plus the shared error envelope. Web dev server
    returned 200 and the page rendered in a browser with Tailwind styles
    and a clean console. Environment fail-fast was observed directly
    when the host's `PORT=0` produced a readable validation error.
-   **Data/migration impact:** None. No database, schema, or migration
    exists.
-   **Known limitations:** No lint, formatting, or CI yet (P05). The
    host environment defines `PORT=0`, so the API requires an explicit
    `PORT`. The Vite dev server binds IPv6 loopback only. Changing
    `packages/shared` requires rebuilding it outside the root `dev`
    script. No authentication (D015) and no persistence.
-   **Follow-up:** Run P04 configuration and secrets hygiene.

------------------------------------------------------------------------

## 2026-10-18 --- P04: Configuration and secrets hygiene

-   **Change:** Environment handling is now explicit and safer: one
    documented owner per variable, actionable failure messages at boot,
    and eight tests that lock the behaviour in. No functional feature
    changed.
-   **Implementation:** Rewrote `apps/api/src/config/env.ts` so the
    schema documents server-only ownership, adds a remediation hint to
    validation errors, and explains why `PORT=0` is rejected. Removed
    `CLERK_PUBLISHABLE_KEY` from the server schema, because the browser
    is its consumer and it will be a `VITE_` variable when auth is
    wired. Expanded `.env.example` with ownership and precedence notes,
    and `apps/web/.env.example` with the public-value boundary. Added
    `apps/api/src/config/env.test.ts`. Documented the variable table,
    the two secret-protection rules, and the `PORT` troubleshooting step
    in `README.md`. Recorded D016 (single validation boundary and
    ownership) and D017 (preset `PORT` is reported, not masked).
-   **Verification:** `pnpm typecheck` exit 0; `pnpm test` exit 0 ---
    12 tests passing (10 API including 8 new env tests, 2 web);
    `pnpm build` exit 0. The built API was run with `PORT=0` and with
    `NODE_ENV=staging`: both exited 1 with a message naming the variable,
    the reason, and the remedy, and neither printed a value. A scan of
    the rebuilt web bundle found no occurrence of `CLERK_SECRET_KEY`,
    `CLERK_PUBLISHABLE_KEY`, `DATABASE_URL`, or any `sk_`-shaped key.
    `git check-ignore` confirmed `.env`, `.env.local`,
    `.env.development`, `.env.production`, `apps/web/.env`, and
    `apps/web/.env.local` are ignored while both `.env.example` files
    remain trackable. The only credential-shaped match in the example
    files is the commented placeholder password `change_me`. Health and
    frontend smoke checks still return 200.
-   **Data/migration impact:** None. No database or schema exists.
-   **Known limitations:** `DATABASE_URL` and `CLERK_SECRET_KEY` are
    declared but unused until P07, so their format is untested against a
    real provider. Linting, formatting, and CI still do not exist (P05).
    `.env` cannot override a preset environment variable by design.
-   **Follow-up:** Run P05 quality checks.

------------------------------------------------------------------------

## 2026-10-18 --- P05: Quality gate and CI baseline

-   **Change:** The workspace now has one reproducible quality gate.
    `pnpm check` runs formatting, lint, type checking, tests, and build in
    that order, and CI runs the same five steps on pushes to `main` and on
    pull requests. No product behaviour changed.
-   **Implementation:** Added Prettier (`.prettierrc`, `.prettierignore`)
    and ESLint 10 with `typescript-eslint`, React hooks, React Refresh,
    and Prettier-compatibility configs in a single root flat config
    (`eslint.config.mjs`). Added root scripts `lint`, `format`,
    `format:check`, and `check`, and a `.github/workflows/ci.yml` with
    frozen-lockfile install, pnpm taken from `packageManager`, Node 24,
    least-privilege permissions, and run cancellation. Added
    `@typescript/native` and aliased root `typescript` to
    `@typescript/typescript6`. Reformatted three API source files.
    Recorded D018 (quality gate and tool choices) and D019 (TypeScript 7
    API workaround).
-   **Verification:** `pnpm check` exit 0 --- `format:check` passed after
    correctly failing on three unformatted files; `lint` passed after
    correctly failing on one real finding; `typecheck` passed; 12 tests
    passed; build succeeded. Lint was proven non-vacuous with stdin
    probes: a snippet using `any` produced
    `@typescript-eslint/no-explicit-any`, and a clean snippet produced no
    errors. `eslint --print-config` confirmed React hooks and React
    Refresh rules apply to `apps/web` files and not to `apps/api` files,
    and that the `_`-prefix convention is configured. The workflow file
    was parsed by Prettier and its commands were each run locally. Action
    majors were checked against the GitHub API (checkout v7,
    setup-node v7, pnpm/action-setup v6). API and web health checks still
    return 200.
-   **Data/migration impact:** None. No database exists.
-   **Known limitations:** `typescript-eslint` does not support
    TypeScript 7 and requires the documented TS 6 alias, so two
    TypeScript packages exist in `node_modules`. No real GitHub Actions
    run has happened; the workflow is unverified end to end on GitHub.
    Linting is not type-aware, by design. `pnpm-lock.yaml` changed to
    record the new dev tooling.
-   **Follow-up:** Run P06 app shell and navigation.

------------------------------------------------------------------------

## 2026-10-18 --- P06: Responsive app shell and navigation

-   **Change:** The app now has a real shell: a persistent sidebar on
    desktop, a header plus disclosure menu on small screens, a skip
    link, per-page document titles, and a route for every planned
    module. Each of those routes is a placeholder that says plainly that
    the module is unbuilt, so navigation is complete without implying
    any feature works. No academic feature, data, or provider was added.
-   **Implementation:** Added `react-router` 8.5.0 (exact pin) as the
    only new dependency and wrapped the app in `BrowserRouter` in
    `main.tsx`. Added `src/navigation.ts` as the single source of truth
    for the navigation groups, the seven planned modules, their
    summaries, milestones, and status (GPA recorded as blocked per
    D008). Added `components/AppShell.tsx` (layout, navigation, mobile
    disclosure, Escape-to-close, and route-derived `document.title`),
    `components/PageHeader.tsx`, `components/StatusBadge.tsx`,
    `components/PlaceholderPanel.tsx`, `pages/TodayPage.tsx`,
    `pages/PlannedModulePage.tsx`, and `pages/NotFoundPage.tsx`.
    Replaced the foundation identity page in `App.tsx` with routed
    pages, set `color-scheme: dark` in `index.css`, and rewrote the web
    tests. Corrected the stale note in `apps/web/.env.example` that said
    the shell would start calling the API in P06. Recorded D020.
-   **Verification:** `pnpm check` exit 0 --- `format:check`, `lint`,
    `typecheck`, `test`, and `build` all passed. Tests: 20 total (10 API
    unchanged, 10 web) covering the single level-one heading per page,
    every planned module being linked at its declared path,
    `aria-current` on the active route only, every placeholder route
    describing itself as unbuilt, the not-found route, and the mobile
    disclosure opening, closing on link click, closing on Escape, and
    staying closed after navigation. Type checking initially failed on
    one real issue --- an optional callback passed under
    `exactOptionalPropertyTypes` --- and was fixed in the component's
    prop type rather than by relaxing the compiler setting. Browser
    checks against the Vite dev server: 1440x900 desktop and 390x844
    mobile both render correctly; at 390px the sidebar is out of the
    accessibility tree and the menu button exposes
    `aria-expanded`; opening it lists all eight entries; following GPA
    navigates to `/gpa`, closes the menu, and shows the blocked
    explanation; `/does-not-exist` renders the not-found page. Console
    was clean (only Vite and React DevTools notices).
-   **Data/migration impact:** None. No database, schema, or stored
    record exists; every page states that it reads no data.
-   **Known limitations:** Navigation is client-side, so a host serving
    the static build must rewrite unknown paths to `index.html` or a
    deep link will 404 at the server. `Settings` is deliberately absent
    from navigation because no real setting exists yet (ROADMAP Phase 1),
    and calendar views are folded into Timetable until P16 shows they
    need their own route. The shell still makes no API request, so
    `VITE_API_BASE_URL` remains unused, and PWA/offline behaviour does
    not exist.
-   **Follow-up:** Run P07 semester data model.

------------------------------------------------------------------------

## 2026-10-23 --- P07: Semester data model and persistence

-   **Change:** The project has a database for the first time. A
    semester can be created, listed, read, edited, and made the current
    semester, always on behalf of one owner, with PostgreSQL itself
    enforcing that a user cannot have two active semesters and cannot
    store a blank name, an inverted term, or an active term without
    dates. There is still no API endpoint and no screen, so nothing is
    reachable by a browser yet.
-   **Implementation:** Added the Drizzle schema at
    `apps/api/src/db/schema.ts` (`users`, `semesters`, the
    `semester_status` enum, a partial unique index for the active
    semester, and four `CHECK` constraints), a pool-scoped PostgreSQL
    client (`db/client.ts`), a migrator wrapper (`db/migrate.ts`), and a
    migration script (`scripts/migrate.ts`, `db:migrate`). Generated and
    committed the SQL migration under `apps/api/drizzle`. Added a
    repository (`db/semester-repository.ts`) whose every query is scoped
    by `userId`, plus a pure validation layer
    (`src/domain/semester.ts`). Shared the field contract, status list,
    date rules, and record schema from `packages/shared/src/semester.ts`
    so P08 can validate a form with the same rules. Dependencies added
    with exact pins: `drizzle-orm` 0.45.4 and `pg` 8.23.1 at runtime,
    `drizzle-kit` 0.31.11, `@types/pg` 8.23.1, and
    `@electric-sql/pglite` 0.5.11 for tests. Recorded D021--D024.
-   **Verification:** `pnpm check` exit 0 --- formatting, lint,
    typecheck, 71 tests (61 API, 10 web), and build. The 29 integration
    tests apply the committed migration to a freshly created in-memory
    PostgreSQL 18 (PGlite) and exercise the real constraints: a second
    active row per user, a blank name, an inverted term, an active term
    without dates, a missing owner, and an owner deletion all fail with
    the expected SQL error; a second migration run is a no-op. Isolation
    is proven with two owners: reads, updates, activation, and listing
    cannot see or touch the other owner's rows. The remaining API tests
    cover the domain rules (19) and the date-parser configuration (3).
    Two real defects were found by the tests and fixed rather than
    worked around: `.partial()` kept each field's default, so an empty
    edit silently reset dates and status (the patch schema is now
    written out explicitly), and Drizzle wraps driver errors, so
    constraint detection had to walk `cause` before a unique violation
    could be reported as a conflict. A third defect was found by
    inspection before it reached a test: `pg` parses `date` into local
    midnight, which shifts the day in any zone east of UTC; the pool now
    keeps dates as strings and a regression test pins that.
    `db:migrate` was run with no `DATABASE_URL` and with a malformed
    one: each exits 1 and names the variable without printing a value.
-   **Data/migration impact:** Additive only. The migration creates two
    tables, one enum, one index, and four constraints; it drops and
    rewrites nothing. Applying it to an empty database is the intended
    path, and re-running it is safe.
-   **Known limitations:** No PostgreSQL server is installed here, so the
    migration has never run through `pg` against a real server; PGlite is
    the same engine but not the same deployment surface, and server
    version, extensions, roles, and pooling are unverified. `DATABASE_URL`
    stays optional at boot because no endpoint reads data yet, and there
    is no authenticated session, so D015 still forbids exposing these
    repository functions. No delete or archive-only operation exists
    beyond the status field, and activation requires the caller to say
    what the outgoing semester becomes, which P08 must ask in the UI.
-   **Follow-up:** Run P08 semester management UI.
