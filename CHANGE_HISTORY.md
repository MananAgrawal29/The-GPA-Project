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

------------------------------------------------------------------------

## 2026-11-05 --- P10: Subject management UI

-   **Change:** Added a browser subject-management screen with list,
    detail, create, and edit flows. The screen is reached from each
    semester in Academics and always operates on one selected semester.
-   **Implementation:** `/academics/subjects` renders the list and
    create flow; `/academics/subjects/:subjectId?semester=<id>` renders
    one subject and its edit form. The selected semester is stored in the
    URL, defaults to the active semester, then to the first semester when
    none is active, and switching semesters returns to the list. The list
    and detail children are keyed by semester id, so the previous
    semester's view is unmounted rather than left on screen while a new
    request is in flight. The detail view also rejects a response whose
    `semesterId` does not match. The shared fetch transport moved to
    `apps/web/src/api/client.ts`; `apps/web/src/api/subjects.ts` addresses
    subjects only by id under the semester path; and
    `SubjectNameForm` applies the shared create schema before submitting.
    No request carries an owner id. No delete control or optional subject
    metadata was added.
-   **Verification:** `pnpm check` exit 0 --- format, lint, typecheck,
    **171 tests (133 API, 38 web)**, build. The 14 new web tests cover the
    list, empty state, create, client and server validation, detail,
    edit, missing and cross-semester subjects, semester switching,
    active/default/no-active selection, no semesters, request failure,
    and sign-in required.
-   **Data/migration impact:** None. No API, schema, or migration change
    was made; P10 consumes the P09 endpoints.
-   **Known limitations:** The screen was exercised in jsdom with a
    stubbed `fetch`, not in a real browser with a real Clerk session.
    Duplicate subject names are allowed and render as separate records,
    but they are visually distinguished only by their records and dates.
    Delete remains API-only because it is outside the canonical P10
    scope.
-   **Follow-up:** Run P11 timetable domain design. Do not begin P12
    persistence until the recurring-slot and dated-occurrence model is
    recorded.

------------------------------------------------------------------------

## 2026-11-06 --- P11: Timetable domain design

-   **Change:** Designed the timetable domain on top of the existing
    semester and subject model and recorded it as D030--D035. Recurring
    weekly slots, date-scoped exceptions, and dated class occurrences are
    three separate layers; no timetable table, endpoint, or UI was
    added, because P11 is a design milestone and P12 owns persistence.
-   **Design summary:** `timetable_slots` (P12) is a weekly rule with a
    required subject, ISO weekday 1--7, wall-clock `time` start/end, an
    optional room, a class type, and optional effective dates inside the
    semester. `day_exceptions` plus `day_exception_slots` (P14) hold at
    most one holiday or special schedule per semester date and own that
    day's one-off classes, so a date exception never edits a recurring
    row. `class_occurrences` (P15) stores a snapshot of date, times,
    room, class type, and subject id with a nullable source slot or
    one-off slot, and a `scheduled`/`cancelled` status only. Generation
    is on demand for an explicit range and idempotent through partial
    unique indexes over the source and date, so a repeated run inserts
    nothing and never rewrites history.
-   **Decisions recorded:** D030 layer boundaries; D031 slot shape,
    weekday and time validation, effective ranges, and the overlap
    policy; D032 the occurrence snapshot, narrowed status, and
    idempotent generation; D033 one exception per date and the
    holiday/special-schedule kinds; D034 wall-clock time and client-owned
    "today"; D035 composite ownership keys, RESTRICT references, and
    archiving instead of cascading deletion.
-   **Ambiguities resolved and flagged:** MAIN_PLAN's occurrence status
    `completed` is not stored, because whether a class was held is an
    attendance fact for P17; the plan's `cancelled_classes` and `other`
    exception kinds are not adopted, because a holiday with a reason
    already expresses "no classes" and `other` has no defined behaviour.
    Adding either later is additive. MAIN_PLAN's optional
    `activeFrom`/`activeTo` is kept, because without it a slot added
    mid-semester would generate classes for the weeks before it existed.
-   **Verification:** No application code, schema, or migration changed,
    so the existing suite is the regression check. See
    `PROJECT_PROGRESS.md` for the result of the `pnpm check` run.
-   **Data/migration impact:** None in this milestone. D035 specifies
    the forward, additive constraints P12 will add, and no existing
    table, row, or migration file was modified.
-   **Known limitations:** Overlap prevention is repository-level under a
    per-semester lock plus an exact-duplicate unique index; a PostgreSQL
    `EXCLUDE` constraint would need the unverified `btree_gist`
    extension. Times are wall-clock with no per-user timezone, and
    overnight classes are out of scope. Attendance states, attendance
    formulas, manual one-off classes, alternating-week patterns, and all
    timetable UI remain for later milestones.
-   **Follow-up:** Run P12 timetable persistence exactly against
    D030--D035, adding the recurring slot table and its migration. Do not
    begin P13 or P14.

------------------------------------------------------------------------

## 2026-11-06 --- P12: Recurring timetable slot persistence

-   **Change:** Added recurring weekly timetable slots: shared validation
    contracts, a forward migration, a server-side domain module, an
    owner-scoped repository, and tests. No HTTP route or UI was added;
    P13 owns the editor.
-   **Implementation:** `timetable_slots` stores the owning semester and
    user, a required subject, ISO weekday 1--7, wall-clock `time` start
    and end, optional room, `lecture`/`practical`/`tutorial`/`other`
    class type, optional active dates, and `archived_at`. The migration
    adds the enum, the table, composite unique targets on `subjects` and
    `timetable_slots`, two `RESTRICT` ownership foreign keys, four
    `CHECK` constraints, two scan indexes, and the partial unique index
    `timetable_slots_exact_duplicate`. Creates and updates lock the
    semester row, validate the merged record, verify the subject belongs
    to that semester and owner, reject overlapping live slots, and write.
    A constraint rejection is mapped to the same typed errors.
-   **Verification:** `pnpm check` exit 0 --- format, lint, typecheck,
    **237 tests (199 API, 38 web)**, build. The 66 new API tests are 32
    domain tests and 34 repository/migration tests. `drizzle-kit check`
    reported "Everything's fine"; a second `db:generate` reported "No
    schema changes, nothing to migrate"; both new test files apply the
    complete migration sequence to a fresh PGlite, where re-applying is a
    no-op.
-   **Data/migration impact:** Additive. `0000` and `0001` are untouched;
    one enum, one table, two composite unique constraints, two foreign
    keys, four checks, and three indexes (two scan, one partial unique)
    are added. No existing row is rewritten or deleted.
-   **Known limitations:** Overlap ignores effective dates (D036), so a
    same-time replacement needs the old slot removed first. PGlite is
    single-connection, so the `FOR UPDATE` lock has never been contended
    by two writes. There is no endpoint or editor yet; a subject that a
    slot uses cannot be deleted (the database refuses it), and the
    existing subject delete endpoint has no mapping for that rejection
    until P15 decides the archive flow. Times remain wall-clock with no
    per-user timezone.
-   **Follow-up:** Run P13 timetable editor against these repository
    functions, adding its authenticated routes and the semester-scoped
    weekly UI. Do not begin P14 or P15.

-----------------------------------------------------------------------

## 2026-11-06 --- P13: Timetable API and weekly editor

-   **Change:** Added authenticated, semester-scoped timetable slot API
    routes (list, get, create, update, delete) and a weekly timetable
    editor screen. Slots are grouped by weekday, support create/edit/
    delete with client and server validation, overlap rejection, and
    loading/empty/success/error states. No dated occurrences, exceptions,
    holidays, or attendance.
-   **Implementation:** `apps/api/src/timetable-routes.ts` reuses the P12
    repository (`createTimetableSlot`, `getTimetableSlot`,
    `listTimetableSlots`, `updateTimetableSlot`, `deleteTimetableSlot`)
    and domain (`TimetableSlotValidationError`,
    `TimetableSlotOwnershipError`, `TimetableSlotOverlapError`) with no
    direct database writes and no second source of truth. Every route is
    behind a guard that resolves the owner only from the verified Clerk
    session (never a client-supplied user id), scopes to the requested
    semester, reports missing/foreign records as 404 without disclosing
    ownership, maps validation errors to 422, overlap to 409, and
    refuses with 503 when auth or the database is unconfigured (D015).
    `apps/api/src/app.ts` registers the routes. `apps/web/src/api/timetable.ts`
    is the typed client; `apps/web/src/pages/TimetablePage.tsx` is the
    editor integrated with the selected semester and its subjects;
    `apps/web/src/App.tsx` and `apps/web/src/navigation.ts` promote
    `/timetable` from planned to built.
-   **Verification:** `pnpm format:check`, `pnpm lint`, `pnpm typecheck`,
    `pnpm build` all exit 0. Web tests: 50 pass (12 new editor tests).
    API route tests (27 new) are typechecked but not executed because
    PGlite cannot initialize in this environment — the same pre-existing
    limitation affects all P11/P12 PGlite suites. Real Clerk and server
    PostgreSQL verification remains outstanding.
-   **Data/migration impact:** None. Reuses the P12 `timetable_slots`
    schema and migration (`0002`); no new migration.
-   **Known limitations:** PGlite-backed API tests cannot run in this
    environment. Archived slots are readable via GET but are not listed
    for deletion in the editor, matching P12's archive policy. A subject
    in use by a slot cannot be deleted (`ON DELETE RESTRICT`), and the
    existing subject-delete endpoint still has no 409 mapping for that
    rejection — recorded as a follow-up, not silently expanded into P13.
-   **Follow-up:** Record the subject-delete `ON DELETE RESTRICT` → 409
    mapping as a P13-adjacent follow-up; begin P14 (date exceptions)
    only after P13 is verified against a real database.

-----------------------------------------------------------------------

## 2026-11-10 --- P14: Calendar date exceptions

-   **Change:** Added date-specific exceptions to the recurring timetable
    --- holidays (no classes) and special schedules (their own class
    list) --- without touching `timetable_slots`. Includes a forward
    migration, Drizzle tables, shared contracts, server-side validation,
    two owner-scoped repositories, authenticated nested routes, a typed
    web client, and a month calendar screen with create, edit, delete,
    and special-schedule slot management. Implemented and verified but
    **not committed**.
-   **Schema and migration:** `0003_calendar_date_exceptions.sql` is
    additive, drizzle-kit generated, and creates `day_exception_kind`
    (`holiday`, `special_schedule`), `day_exceptions` (one row per
    semester date through `UNIQUE (semester_id, date)`, enum `kind`,
    optional `reason`) and `day_exception_slots` (subject, wall-clock
    start/end, room, and `class_type` typed with P12's existing enum).
    Ownership is structural per D035: `(semester_id, user_id) ->
    semesters(id, user_id)`, `(exception_id, semester_id, user_id) ->
    day_exceptions(...)`, and `(subject_id, semester_id, user_id) ->
    subjects(...)`, all `ON DELETE RESTRICT`; `day_exceptions` also
    carries the `(id, semester_id, user_id)` target. Time order and room
    length (1--80) are `CHECK`s, and the five indexes use the schema's
    `..._idx` names. No trigger or function is created; `updated_at`
    follows the existing `$onUpdate` convention. `0000`--`0002` are
    untouched, and the three existing schema tests expect the two new
    tables.
-   **Migration repair:** the first `0003_snapshot.json` was hand-written
    and invalid for drizzle-kit 0.31.11 --- no `id`/`prevId`, only the
    two new tables instead of the cumulative schema, and
    `primary`/`hasDefault` keys plus array-style enums that no 0.31
    serializer emits; its 2--80 room check came from a stale comment.
    The SQL also declared `kind` as `TEXT` with a `CHECK`, `class_type`
    as unconstrained `TEXT`, used `idx_` index names, and added an
    `update_updated_at_column()` trigger. Both were repaired together:
    the SQL was regenerated from `schema.ts`, and the snapshot was
    regenerated with the installed drizzle-kit against a scratch
    `0000`--`0002` baseline, producing a genuine cumulative snapshot
    whose `prevId` is `0002`'s `id`
    (`1fbe519e-8f88-46da-be95-d0b5bffa3840`). Nothing referenced the
    fabricated snapshot's id, and no migration had been applied to a
    PostgreSQL server.
-   **Repositories and validation:** `day-exception-repository.ts`
    creates, lists, reads, updates, and deletes with every query scoped
    by owner and semester. Dates are compared as `YYYY-MM-DD` strings
    against the semester bounds and are never parsed through `Date`. A
    duplicate date maps to a field issue, a foreign semester to an
    ownership error, and deletion raises a stable conflict while slots
    exist. `day-exception-slot-repository.ts` runs every write in a
    transaction that locks the parent exception row first, refuses a
    subject outside the semester and owner, refuses any write under a
    holiday, and rejects overlap using half-open `[start, end)` ranges,
    so adjacent slots are allowed. Times cross the contract as `HH:MM`
    (D034).
-   **API and contracts:** `day-exception-routes.ts` exposes list, get,
    create, patch, and delete for exceptions and their slots behind the
    P08 guard: 503 when auth or the database is missing, 401 without a
    verified session, 404 for a missing or foreign record, 422 with
    field issues for validation and date bounds, and 409 for overlap and
    for deleting an exception that still has slots. The owner comes only
    from the session. `packages/shared/src/day-exception.ts` holds the
    field, create, patch, and record schemas.
-   **Calendar UI:** `CalendarPage.tsx` renders a month grid with
    weekday headers, Prev/Next/Today navigation, holiday and
    special-schedule badges, an exception detail panel, holiday and slot
    create/edit/delete flows, semester selection bound to `?semester=`,
    and explicit loading, empty, validation, success, and failure states.
    A failed exceptions load renders a status panel with Retry instead of
    an empty calendar. The special-schedule delete confirmation states
    that all slots must be deleted first, matching the API's `ON DELETE
    RESTRICT` and 409. `/calendar` is promoted from planned to built.
-   **Test repair:** the calendar suite could not pass for reasons
    unrelated to timing. Fixtures used non-UUID ids that the shared
    schema rejects, so every exceptions response failed validation and
    the old page hid that as an empty calendar; the page opens on the
    current month, so October fixtures were off-screen; and several
    selectors were ambiguous (two "Add Exception" buttons, two "Delete"
    buttons, and a label whose text included its hint paragraph).
    Fixtures now use UUIDs, tests drive the real Prev/Next controls to
    the fixture's month, dialog interactions are scoped, and the two
    panel delete buttons carry distinct accessible names. No assertion
    was weakened, and the exceptions failure state is now rendered and
    tested.
-   **Verification:** `pnpm check` exit 0 --- format, lint, typecheck,
    369 tests (300 API across 13 files, 69 web across 7 files), build.
    The 19 calendar tests drive the page in jsdom with a stubbed
    `fetch`, and the 74 P14 repository/migration tests apply the real
    `0003` SQL through drizzle's migrator. `git diff --check` is clean.
    `drizzle-kit check` reports "Everything's fine", and a throwaway
    `db:generate` over the real history reports "No schema changes,
    nothing to migrate".
-   **Audit finding (blocker, repaired):** the original
    `apps/api/drizzle/meta/0003_snapshot.json` was malformed for
    drizzle-kit. It had no `id`/`prevId`, listed only the two new tables
    instead of the cumulative snapshot, and recorded `room_length` as
    2--80 where the SQL and schema use 1--80, so `drizzle-kit check`
    reported "data is malformed" and `db:generate` could not run. Both
    the snapshot and the SQL were repaired as described above; runtime
    behaviour, tests, and builds were unaffected throughout because
    migrations are applied as SQL, not from snapshots.
-   **Audit findings (non-blocking):** route bodies still bypass the
    shared input schemas, so a malformed `date` reaches PostgreSQL and
    surfaces as a 500 rather than a 422. `updateDayException` can change
    a `special_schedule` to `holiday` while slots exist, leaving a
    holiday that owns slots and breaks D033's invariant. The domain
    module re-implements validation the shared package now owns and
    carries a stale comment saying P14 shared types do not exist. The
    calendar renders the weekday of a date-only value through
    `new Date(date)`, which D034 forbids and which is wrong west of UTC.
    There are no HTTP route tests for the new endpoints and no dedicated
    edit tests for exceptions or slots. The routes contain dead branches
    (a duplicate `DayExceptionValidationError` check and a duplicate
    `_sendSlotNotFound`). `schema.ts` has a comment with a literal
    backslash (`someone else\'s`), and its `Equal<>` parity alias
    compares a type with itself, so it detects no drift.
-   **Data/migration impact:** Additive. Two tables, one new enum
    (`day_exception_kind`; `class_type` is reused from P12), four
    ownership foreign keys, two unique constraints, two checks, and five
    indexes. No trigger, function, or existing row is created, rewritten,
    or deleted. `day_exception_slots` has no `(id, semester_id, user_id)`
    unique target, so P15 must add one before referencing a
    special-schedule slot.
-   **Known limitations:** Overlap is enforced in the repository under a
    parent-exception lock with no database exclusion constraint, so
    direct SQL can create overlapping slots, and PGlite cannot contend
    two writes. Date bounds apply only when the semester has start and
    end dates. Times are wall-clock with no timezone and no overnight
    class (D034). Real PostgreSQL concurrency and live Clerk sessions
    remain untested: the API suite uses PGlite and an injected verifier.
    A subject referenced by a special-schedule slot cannot be deleted
    (`RESTRICT`), and the subject endpoint still has no 409 mapping for
    that rejection.
-   **Follow-up:** Commit P14 with explicit paths, including
    `0003_calendar_date_exceptions.sql` and its regenerated
    `meta/0003_snapshot.json`. The non-blocking route-validation,
    kind-change, D034 weekday, test-coverage, and dead-branch findings
    remain follow-ups and are not part of that commit. Do not begin P15
    in that change.

-----------------------------------------------------------------------

## 2026-11-11 --- P14 stabilization: invariants, shared validation, and date-only weekdays

-   **Change:** Closed the P14 audit findings without touching the
    migration or expanding scope. D033's kind invariant, D034's
    date-only weekday, and the shared-contract request validation are
    implemented and covered by new repository and HTTP tests. Migration
    `0003`, its snapshot, and the journal are unchanged by this pass.
-   **D033 kind invariant:** `updateDayException` checks for dependent
    slots inside the existing transaction, after the parent row is
    locked with `SELECT ... FOR UPDATE` and before any date work, and
    raises a new `DayExceptionKindConflictError`. The route maps it to
    **409 `day_exception_kind_conflict`**. Slots are never cascaded or
    deleted, and partial updates that do not change the kind still work.
    The check reads the same rows the slot repository locks first, so
    the ordering matches D036.
-   **D034 weekday:** `CalendarPage` derives the detail panel's weekday
    from the ISO date components and reads it in UTC
    (`weekdayIndexFromIsoDate`), so a date-only value can no longer shift
    onto an adjacent day west of UTC. The Sunday-first `WEEKDAYS`
    presentation is unchanged, and no timezone conversion was added to
    the contract. Month-grid arithmetic still uses local `Date` objects
    built from year/month numbers, which is navigation state rather than
    a stored date.
-   **Shared Zod validation:** the P14 domain validators now use
    `createDayExceptionInputSchema`, `dayExceptionPatchSchema`, and
    `createDayExceptionSlotInputSchema` instead of hand-written,
    format-blind checks, following `domain/timetable.ts`. Malformed
    dates (`2026-08-32`, `2026-02-30`, `20261110`, `not-a-date`) and
    malformed times (`25:00`, `09:60`, `9am`, `0900`) produce
    `DayExceptionValidationError` / `DayExceptionSlotValidationError`
    with field paths, which the existing route mappings turn into **422
    `validation_failed`** with `issues`. `0900` is now rejected instead
    of being silently normalized to `09:00`. Patch validation runs
    before the no-op short-circuit, and the end-after-start rule is kept
    as a true time comparison over canonical `HH:MM`.
-   **Scope note:** the partial-update checks live in
    `apps/api/src/db/day-exception-repository.ts`, so that file needed a
    single call-site change (`validateDayExceptionPatch(patch)` in place
    of the inline field checks). All validation logic lives in the
    domain module; no route, shared contract, schema, migration, or
    frontend file changed.
-   **Tests added:** 3 exception repository tests (malformed create
    dates, the reported `date` path, malformed update dates leaving the
    row untouched), 2 slot repository tests (create and update with
    non-canonical times, including `0900`), and 11 HTTP tests (valid
    create still 201, four malformed dates on create, a malformed date
    on update, four malformed slot time pairs, and a malformed slot
    update), all asserting 422 with the expected field issues. No
    existing assertion was weakened or removed; the D033, ownership,
    overlap, delete-conflict, and partial-update tests still pass.
-   **Verification:** `pnpm check` exit 0 --- format, lint, typecheck,
    **391 tests (321 API across 14 files, 70 web across 7 files)**, and
    a successful build. Focused runs: 46 exception repository tests, 35
    slot repository tests, 14 day-exception route tests, and 20 calendar
    tests. `drizzle-kit check` still reports "Everything's fine",
    `git diff --check` is clean, and `drizzle-kit generate` was not
    re-run (the snapshot was not touched).
-   **Audit classification:** the earlier 500-instead-of-422 validation
    finding, the D033 kind-change finding, and the D034 weekday finding
    are **fixed**. The dead route branches (a duplicate
    `DayExceptionValidationError` check and a duplicate
    `_sendSlotNotFound`) remain **non-blocking follow-ups** and behave
    harmlessly. Missing dedicated UI edit-flow tests and the
    subject-delete `ON DELETE RESTRICT` -> 409 mapping remain
    **non-blocking follow-ups**.
-   **Known limitations:** unchanged from the P14 entry --- overlap is
    repository-enforced under a parent-exception lock with no database
    exclusion constraint, PGlite cannot contend two writes, date bounds
    apply only when the semester has start and end dates, and real
    PostgreSQL and live Clerk sessions are still untested.
    `day_exception_slots` still has no `(id, semester_id, user_id)`
    unique target, which P15 needs before referencing a one-off slot.
-   **Follow-up:** Commit P14 with explicit paths, then begin P15. Do not
    begin P15 in the same change.
