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

------------------------------------------------------------------------

## 2026-10-24 --- P08: Semester management UI

-   **Change:** The first data-backed screen exists. `/academics` lists
    the signed-in student's semesters, creates one, edits its details,
    and makes it the current semester, with explicit states for loading,
    empty, validation error, server refusal, sign-in required, and a
    request that failed outright. The API exposes its first endpoints
    (`GET`/`POST /semesters`, `GET`/`PATCH /semesters/:id`, and
    `POST /semesters/:id/activate`) behind a Clerk session boundary; no
    route reads or writes user data without a verified session, and no
    request can name an owner. No GPA rule, calculation, or
    institution-specific behaviour was added.
-   **Implementation:** API --- added `@clerk/express` 2.1.82 (exact
    pin) and `src/auth/session.ts`, which builds one `AuthBoundary`:
    `clerkMiddleware()` plus `getAuth()` when both Clerk keys exist,
    otherwise a boundary that reports itself unconfigured. `app.ts`
    mounts the middleware before body parsing and registers the routes;
    `config/env.ts` now validates `CLERK_PUBLISHABLE_KEY` alongside
    `CLERK_SECRET_KEY` (both optional, both present to enable sign-in);
    `index.ts` builds the boundary from the validated env and logs
    plainly when Clerk or `DATABASE_URL` is missing.
    `semester-routes.ts` guards every handler with one wrapper that
    answers 503 (auth or database not configured) or 401 (no verified
    identity, including an empty one) before running the handler with
    the verified `userId`. Domain and repository gained a validated
    activation input so the HTTP layer and the repository share one
    list of legal demotion targets; `packages/shared` exports the
    activation schema and the field-issue contract the client needed.
    Web --- added `src/api/semesters.ts`, a typed client that sends no
    owner id and parses every response with the shared schemas;
    `pages/AcademicsPage.tsx` with create, edit, activate (an explicit
    "what happens to the outgoing semester" choice) and the six view
    states; `navigation.ts` gained a `builtModules` list so Academics
    moved out of the planned set in the same change that replaced its
    placeholder page; `main.tsx` renders with Clerk only when
    `VITE_CLERK_PUBLISHABLE_KEY` exists (dynamic import, so a keyless
    build ships no auth SDK); `vite.config.ts` proxies `/semesters` and
    `/health` to the API so the browser calls same-origin paths; both
    `.env.example` files document the new variables. Dependencies added
    with exact pins: `@clerk/express` 2.1.82 (API), `@clerk/react`
    6.18.0 and `zod` 4.6.7 (web). Recorded D025--D027.
-   **Verification:** `pnpm check` exit 0 --- `format:check`, `lint`,
    `typecheck`, `test`, `build`. Tests: 102 total (78 API, 24 web).
    The 17 new route tests run the real Express app against the
    in-memory PostgreSQL with an **injected** boundary (a stub verifier,
    not Clerk): they prove an unconfigured server refuses with 503, a
    missing identity refuses with 401, validation failures return 422
    with field issues, a racing activation returns 409, a foreign row
    reads as 404, and two owners cannot see or touch each other's
    semesters.    The 13 new web tests drive the page through loading,
    empty, per-field validation errors, 401, 503, network failure, and
    create, edit, activate success and conflict, plus an entry-point
    test that boots `main.tsx` itself. That test exists because a
    browser check of the running dev servers found a real defect the
    suite had missed: the rewritten `main.tsx` had dropped the
    `BrowserRouter` wrapper, so the shipped app crashed with
    `useLocation() outside a Router` while every component test passed
    under its own `MemoryRouter`. The router was restored, the
    regression test was confirmed failing against the broken file and
    passing against the fixed one, and the reloaded page then rendered
    the Academics screen with a clean console. Separately, the real
    API process was started without Clerk keys and without
    `DATABASE_URL`: `GET /health` returned 200, and `GET`, `POST`,
    `PATCH`, and `POST /semesters/:id/activate` each returned 503
    `auth_not_configured`, with the boot log naming both missing
    pieces.
-   **Data/migration impact:** None. No schema or migration change;
    P07's tables, index, and constraints are used exactly as written.
-   **Known limitations:** No real Clerk instance exists here, so no
    token has ever been verified against Clerk and no browser sign-in
    has run --- the route tests inject a verifier, and the 503 refusal
    was exercised against the real process, neither of which is
    end-to-end authentication. No PostgreSQL server exists either, so
    database-backed tests still run on PGlite rather than a server. The
    Vite proxy is a development convenience: production must serve the
    API and the static app from one host. Duplicate-submit protection
    is in-flight blocking in the UI plus the server's 409; there is no
    idempotency key.
-   **Follow-up:** Run P09 semester-scoped subjects.

------------------------------------------------------------------------

## 2026-11-05 --- P09-B: Subject migration and backend tests

-   **Change:** Added the semester-scoped subject backend. A subject now
    belongs to one semester and one owner, the same name may be reused in
    different semesters (or within one semester), and authenticated
    callers can create, list, read, update, and delete subjects only
    inside their own semesters.
-   **Implementation:** Added `0001_condemned_gertrude_yorkes.sql`, an
    additive migration that creates `subjects` with a name-length
    `CHECK`, `subjects_user_id_idx`, `subjects_semester_id_idx`, and a
    composite `(semester_id, user_id)` foreign key to
    `semesters(id, user_id)` with `ON DELETE RESTRICT`. The parent
    `semesters_id_user_id_unique` constraint is applied before the
    foreign key. The repository maps the FK rejection to
    `SubjectOwnershipError`; routes expose nested
    `/semesters/:semesterId/subjects` endpoints behind the D025 guard.
    Shared create, patch, id, and record schemas live in
    `@gpa/shared`; `SubjectValidationError` maps invalid input to 422.
-   **Verification:** `pnpm check` exit 0 --- format, lint, typecheck,
    **157 tests (133 API, 24 web)**, build. The 55 new API tests are 33
    repository tests and 22 route tests. `drizzle-kit check` reported
    "Everything's fine"; a second `db:generate` reported "No schema
    changes, nothing to migrate". Both new test files apply the complete
    migration sequence to a fresh PGlite database, and re-applying is a
    no-op. The SQL `CHECK`, composite FK, indexes, and parent unique
    constraint are asserted directly.
-   **Data/migration impact:** Additive. `0000_semester_model.sql` is
    unmodified. The new migration adds one table, one parent unique
    constraint, two indexes, one check, and one composite FK. No
    existing rows are rewritten or deleted.
-   **Known limitations:** No PostgreSQL server or Clerk instance exists
    here: the tests use PGlite and an injected auth verifier, so real
    server migration and real token verification remain unverified.
    Subject management has no frontend yet. Deletes are hard deletes;
    future academic references will need a deliberate policy. No
    uniqueness is enforced on subject names.
-   **Follow-up:** Run P10 subject management UI, scoped to the selected
    semester and built on these endpoints.
