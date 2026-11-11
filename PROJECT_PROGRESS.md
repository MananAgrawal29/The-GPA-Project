# Project Progress --- The GPA Project

**Last updated:** 2026-11-11\
**Current milestone:** P16 --- Timetable calendar views (implemented; uncommitted)\

**Overall status:** Runnable foundation with a responsive shell, an
owner-scoped semester and subject model, authenticated subject,
timetable slot, and day-exception CRUD API endpoints, forward
migrations, database-backed tests, a semester-scoped subject management
screen, a semester-scoped weekly timetable editor with persistent
recurring slots, and a calendar screen for holidays and special
schedules. Real Clerk/database verification remains outstanding. P14 is complete
and audited: D033's kind invariant returns 409, D034's weekday is
derived from date components, request bodies use the shared Zod
contracts, and migration 0003 is reconciled with the schema with a
regenerated snapshot, so the next migration can be generated.

## Completed

-   [x] Product vision and principles documented.
-   [x] Initial release scope and roadmap documented.
-   [x] Timetable/holiday/attendance/semester data-integrity rules
    documented.
-   [x] Mimo agent instructions drafted.
-   [x] Sequential daily prompt plan created.
-   [x] P00: Repository inspected; confirmed to contain planning
    documents only.
-   [x] P01: Baseline verification recorded; docs reconciled; D009--D011
    added.
-   [x] P02: Requirements mapped to canonical prompts; schema,
    authorization, and testing strategy proposed.
-   [x] P03 (review): Package structure and foundation baseline reviewed;
    four-package proposal reduced to three.
-   [x] P03 (implementation): pnpm workspace created with a runnable
    frontend, a health endpoint, shared contracts, env validation, and
    smoke tests. Recorded as D012--D015.
-   [x] P04: Environment ownership documented, ignore rules verified,
    env errors made actionable, eight validation tests added, and the
    `PORT` collision explained. Recorded as D016--D017.
-   [x] P05: Prettier, ESLint, a five-stage `pnpm check` gate, and a
    GitHub Actions workflow added. Recorded as D018--D019.
-   [x] P06: Responsive app shell with desktop sidebar, mobile
    disclosure navigation, URL-based routing, and one honest placeholder
    page per planned module. Recorded as D020.
-   [x] P07: Semester schema, committed migration, owner-scoped
    repository, and shared validation, tested against a real in-memory
    PostgreSQL. Recorded as D021--D024.
-   [x] P08: Clerk session boundary, the first data endpoints, and the
    semester management screen with explicit loading, empty,
    validation, refusal, and failure states. Recorded as D025--D027.
-   [x] P09 (backend): Semester-scoped subject schema, forward migration,
    composite ownership constraint, shared validation, owner-scoped
    repository, nested authenticated routes, and 55 new tests. Recorded
    as D028.
-   [x] P10: Subject list, detail, create, and edit flows scoped to the
    selected semester, with URL-based selection and keyed views that
    prevent stale subject data. Recorded as D029.
-   [x] P11: Timetable domain designed as three separate layers ---
    recurring weekly slots, date-scoped exceptions, and dated class
    occurrences --- with validation, generation-idempotency, time, and
    ownership rules recorded as D030--D035. No code, schema, migration,
    or UI was added.
-   [x] P12: Recurring timetable slots persisted through an additive
    migration, a shared contract, server-side validation, and an
    owner-scoped repository whose writes lock the semester and reject
    overlapping live slots. Recorded as D036; 66 new tests.
-   [x] P13: Authenticated, semester-scoped timetable slot API routes
    (list, get, create, update, delete) reusing the P12 repository and
    domain, plus a weekly timetable editor screen integrated with the
    selected semester and its subjects. The editor groups slots by
    weekday, supports create/edit/delete with client and server
    validation, overlap rejection, loading/empty/success/error states,
    and query refresh after mutations. No dated occurrences, exceptions,
    or attendance. Recorded as D030--D036; 27 new API route tests and 12
    new web editor tests.
-   [x] P14: Date-specific holidays and special schedules persisted as
    one exception per semester date, with owned and validated
    repositories, authenticated nested routes, shared contracts, a
    forward migration, and a calendar screen for creating, editing, and
    deleting holidays and special-schedule slots. Implements D033 and

-   [x] P15: Dated class occurrences generated on demand from recurring
    slots and P14 special schedules, with idempotent conflict-safe
    insertion, semester/range clamping, active-date boundaries,
    holiday suppression, snapshot preservation, and authenticated
    generate/list/get routes. Adds migration 0004 and shared contracts;
    13 repository tests and 5 route tests.
    D034; the special-schedule to holiday change is refused with 409
    while slots exist, weekdays come from ISO date components, and
    request bodies are validated with the shared Zod contracts. 391
    total tests (321 API across 14 files, 70 web across 7 files). P14
    remains uncommitted; its migration and snapshot are regenerated and
    consistent with the schema.

## Foundation as built

**Packages**

-   `apps/web` --- React 19 + Vite 8 + Tailwind 4 + react-router 8.
    Twelve routes: Today, Academics, the subject list and detail screens,
    the weekly timetable editor, the calendar, five planned-module
    placeholders, and a not-found page; 70 tests. Clerk renders only when
    `VITE_CLERK_PUBLISHABLE_KEY` is set, so a keyless build ships no auth
    code (D026).
-   `apps/web/src/navigation.ts` --- single source of truth for the
    navigation groups, module routes, summaries, milestones, and status.
-   `apps/api` --- Express 5 (ESM), env validation, `/health`, uniform
    error envelope, the Clerk session boundary, semester, subject,
    timetable slot, and day-exception routes, the Drizzle schema,
    migrations, and the semester, subject, timetable slot, and
    day-exception repositories. 321 tests.

**API and sign-in boundary (P08)**

-   `apps/api/src/auth/session.ts` --- one `AuthBoundary`: Clerk's
    middleware plus `getAuth()` when both keys exist, otherwise an
    unconfigured boundary. No request field can name the owner (D025).
-   `apps/api/src/semester-routes.ts` --- `GET`/`POST /semesters`,
    `GET`/`PATCH /semesters/:id`, and `POST /semesters/:id/activate`,
    each behind a single guard: 503 when auth or the database is not
    configured, 401 when no verified identity resolves, then the
    handler with the session's `userId` only.
-   `apps/web/src/api/semesters.ts` --- typed client that sends no
    owner id and parses every response with the shared schemas.
-   `apps/web/src/pages/AcademicsPage.tsx` --- list, create, edit, and
    activate, with explicit loading, empty, validation, refusal,
    sign-in-required, and request-failure views (D027).
-   `packages/shared` --- zod contracts (`healthResponseSchema`,
    `apiErrorSchema`, semester and subject create/patch/record schemas,
    timetable slot create/patch/record schemas), the semester date and
    status rules, timetable wall-clock and semester-bound rules,
    `APP_NAME`, `APP_TAGLINE`; built to `dist` by a `prepare` script so
    consumers resolve types immediately after install.

**Database (P07)**

-   `apps/api/src/db/schema.ts` --- `users` and `semesters` tables, the
    `semester_status` enum, a partial unique index that allows one active
    semester per user, and four `CHECK` constraints (name and academic
    year length, date order, active-needs-dates).
-   `apps/api/drizzle/` --- committed SQL generated by `drizzle-kit`.
    Applied by `pnpm --filter @gpa/api db:migrate`, which reads
    `DATABASE_URL` through the validated environment module and records
    applied migrations, so a second run is a no-op. Migrations are
    additive only.
-   `apps/api/src/db/semester-repository.ts` --- create, list, read,
    update, and activate; every query is scoped by `userId` in SQL, and
    another owner's row is reported as absent rather than modified.
-   `apps/api/src/domain/semester.ts` --- server-side validation and the
    read-merge-write rules used by an edit.
-   Integration tests apply the committed migration to an in-memory
    PostgreSQL 18 (PGlite) created by the test run, then exercise the
    real constraints and two-owner isolation. No server or credentials
    are involved.

**Subject model (P09)**

-   `apps/api/drizzle/0001_condemned_gertrude_yorkes.sql` --- forward,
    additive migration: creates `subjects` with a name-length `CHECK`,
    two indexes, and a composite foreign key
    `(semester_id, user_id) -> semesters(id, user_id)`. The parent-side
    unique constraint is added first so the migration applies on a
    clean database. `0000_semester_model.sql` is untouched.
-   `apps/api/src/db/schema.ts` --- `subjects` table and the
    `semesters_id_user_id_unique` target. The composite key makes
    mismatched ownership impossible through SQL; `ON DELETE RESTRICT`
    preserves subject rows for as long as their semester exists.
-   `apps/api/src/db/subject-repository.ts` --- create, list, read,
    update, and delete, always filtered by `userId` and `semesterId`.
    Invalid UUIDs read as absent, and a foreign-key rejection is mapped
    to `SubjectOwnershipError`.
-   `apps/api/src/subject-routes.ts` --- nested
    `/semesters/:semesterId/subjects` routes behind the same guard as
    P08: 503 when auth or the database is missing, 401 without a
    verified session, 404 for a missing/foreign semester or subject,
    and 422 with field issues for invalid input.
-   Subject names are not unique, globally or per semester: P09 requires
    the same name in different semesters, and identity is the generated
    id. Duplicate names within one semester are allowed and tested
    (D028).
-   Tests: 33 repository tests and 22 route tests run against PGlite and
    the real Express app with an injected verifier. They cover CRUD,
    same names across semesters, duplicates within a semester,
    malformed ids, cross-user isolation, ownership mismatch, and FK
    behavior.

**Subject management UI (P10)**

-   `apps/web/src/pages/SubjectsPage.tsx` --- subject list, detail,
    create, and edit flows. The selected semester lives in the URL as
    `?semester=<id>`; no semester defaults to the active one, or to the
    first existing semester when none is active.
-   The list and detail views are keyed by semester id (detail also by
    subject id), so a semester change unmounts the old view instead of
    leaving its subjects on screen. The detail view also rejects a
    response whose `semesterId` differs from the selected semester.
-   `apps/web/src/api/subjects.ts` --- typed client for list, read,
    create, and update. Every path carries the semester id; a subject is
    addressed by its id, never by its name, and no request carries an
    owner id.
-   `apps/web/src/api/client.ts` --- shared fetch and error transport,
    now used by both the semester and subject clients.
-   `apps/web/src/components/SubjectNameForm.tsx` --- one create/edit
    form using the shared subject schema for client validation and
    rendering server field issues.
-   `apps/web/src/pages/AcademicsPage.tsx` --- each semester links to its
    own subject screen; `apps/web/src/navigation.ts` keeps Academics
    current on the nested routes.
-   No delete control is exposed. P10's canonical scope is list, detail,
    create, and edit; the P09 API's delete endpoint remains unused by the
    UI.
-   Tests: 14 new web tests cover list, empty, create, client and server
    validation, detail, edit, missing and cross-semester subjects,
    semester switching, active/default/no-active selection, no
    semesters, request failure, and sign-in required.

**Timetable domain design (P11)**

-   Recorded in D030--D035. No table, endpoint, client, or screen exists
    yet; P12 owns the first persistence change.
-   Four shapes, each introduced by the milestone that needs it:
    `timetable_slots` (P12), `day_exceptions` + `day_exception_slots`
    (P14), and `class_occurrences` (P15). A slot holds a weekday and
    wall-clock times and never a date; an occurrence holds a date and
    its own copied times and never a weekly rule.
-   Slot: required subject, ISO weekday 1--7, `time` start/end with no
    overnight class, optional room, `lecture`/`practical`/`tutorial`/
    `other`, and optional effective dates inside the semester. Overlaps
    within a semester are rejected; the repository checks under a
    semester lock and a partial unique index blocks exact duplicates.
    A PostgreSQL `EXCLUDE` constraint is deferred because it needs the
    unverified `btree_gist` extension.
-   Occurrence: snapshot of date, times, room, class type, and subject
    id, with only `scheduled`/`cancelled` stored; idempotent generation
    through partial unique indexes over the source and date plus
    `ON CONFLICT DO NOTHING`; on demand for an explicit range inside the
    semester, never a background job, and never an update to existing
    rows.
-   Exception: one per semester date; only `holiday` or
    `special_schedule`; a special day owns its one-off classes in
    `day_exception_slots`, so the weekly table is never mutated. A
    holiday adds no classes and is not an absence.
-   Times are wall-clock and dates are calendar dates (D024); nothing is
    converted to an instant, and the client passes "today" explicitly
    (D034).
-   Ownership repeats the D028 composite-key pattern; removal of a
    referenced record is archiving, not cascading deletion (D035).
-   Deliberately not decided or built here: endpoints, UI, attendance
    states and formulas (P17/P19), manual one-off classes, task links,
    alternating-week patterns, overnight classes, and per-user
    timezones.

**Timetable slot persistence (P12)**

-   `apps/api/drizzle/0002_typical_pandemic.sql` --- forward, additive
    migration: creates the `class_type` enum and `timetable_slots`, adds
    composite unique targets on `subjects` and `timetable_slots`, two
    ownership foreign keys with `ON DELETE RESTRICT`, four `CHECK`
    constraints, two scan indexes, and the partial unique index
    `timetable_slots_exact_duplicate`. `0000` and `0001` are untouched.
    The parent `subjects` constraint is the first statement because the
    generated order placed it after the foreign key that needs it.
-   `apps/api/src/db/schema.ts` --- the table and enum, with a class-type
    parity check against `@gpa/shared`, the same pattern D021 uses for
    semester status.
-   `packages/shared/src/timetable.ts` --- slot fields, create/patch and
    record schemas, `HH:MM` wall-clock validation, ISO weekday 1--7, and
    the cross-field rules (end after start, active range order, active
    range inside the semester).
-   `apps/api/src/domain/timetable.ts` --- server-side parsing, the
    read-merge-write helpers, and typed validation, ownership, and
    overlap errors.
-   `apps/api/src/db/timetable-slot-repository.ts` --- create, list, get,
    update, and delete, every query scoped by owner and semester. Creates
    and updates lock the owning semester with `FOR UPDATE` before
    checking overlaps, and lock order is semester then slot.
-   Overlap means two live slots on the same weekday with intersecting
    half-open `[start, end)` ranges in one semester. Adjacent slots,
    other weekdays, other semesters, and archived slots never conflict.
-   Times cross the contract as `HH:MM`; PostgreSQL's `HH:MM:SS` is
    truncated on read and never parsed into a `Date` (D034).
-   No route or screen is exposed yet. P13 owns the editor and its HTTP
    surface and has since added them (see below).
-   Tests: 32 domain tests and 34 repository/migration tests, all against
    PGlite and the committed migration.

**Timetable API and weekly editor (P13)**

-   `apps/api/src/timetable-routes.ts` --- nested
    `/semesters/:semesterId/timetable-slots` routes (`GET` list, `GET`
    one, `POST` create, `PATCH` update, `DELETE` remove) behind the same
    guard as P08/P09: 503 when auth or the database is missing, 401
    without a verified session, 404 for a missing/foreign semester or
    slot (ownership mismatch is reported as absent, never disclosed), and
    422 with field issues for invalid input. Every handler reuses the
    P12 repository and domain functions; no direct database writes and no
    second source of truth.
-   `apps/api/src/app.ts` --- registers the timetable slot routes
    alongside the semester and subject routes.
-   `apps/web/src/api/timetable.ts` --- typed client for list, read,
    create, update, and delete. Every path carries the semester id; a
    slot is addressed by its id, never by its day or time, and no request
    carries an owner id. Responses are parsed with the shared timetable
    slot schemas.
-   `apps/web/src/pages/TimetablePage.tsx` --- weekly editor. Slots are
    grouped by weekday (Monday--Sunday), each showing subject, time
    range, room, class type, and active dates. Create and edit open a
    shared form validated with the shared slot schema (client issues plus
    server 422 issues). Delete confirms before calling the API. Overlap
    is rejected with a 409; adjacent slots are accepted. Loading, empty,
    validation, success, and error states are handled; queries refresh
    after every mutation. Archived slots are readable but not listed for
    deletion, matching P12's archive policy. Dated occurrences,
    exceptions, and attendance are out of scope (P14/P15/P17).
-   `apps/web/src/App.tsx` and `apps/web/src/navigation.ts` --- the
    `/timetable` route is built and promoted from planned to built.
-   Tests: 27 new API route tests cover authenticated/unauthenticated
    access, semester ownership isolation, subject ownership and semester
    relationship, valid creation and updates, invalid payloads and
    malformed ids, overlap rejection, adjacent slot acceptance, archived
    slot behavior, delete behavior, and consistent error responses. 12
    new web editor tests cover rendering, selected-semester integration,
    empty and loading states, create and edit, validation errors, mutation
    success and failure, query refresh, and no cross-semester leakage.
    PGlite-backed API tests cannot initialize in this environment (the
    same pre-existing limitation affects all P11/P12 PGlite suites), so
    they are typechecked but not executed here. That limitation no longer
    applies: from P14 the whole API suite runs against PGlite (see
    below).

**Calendar date exceptions (P14)**

-   `apps/api/drizzle/0003_calendar_date_exceptions.sql` --- forward,
    additive, drizzle-kit-generated migration creating the
    `day_exception_kind` enum, `day_exceptions`, and
    `day_exception_slots` (with `class_type` typed by P12's enum), their
    ownership foreign keys (all `ON DELETE RESTRICT`), the
    `(semester_id, date)` unique constraint, the
    `(id, semester_id, user_id)` composite target, schema-named `..._idx`
    indexes, and time-order and 1--80 room-length checks. No triggers:
    `updated_at` uses the existing `$onUpdate` convention.
    `0000`--`0002` are untouched.
-   `apps/api/drizzle/meta/0003_snapshot.json` --- regenerated
    cumulatively with drizzle-kit 0.31.11 against a scratch `0000`--`0002`
    baseline. It now has `id`/`prevId` (the `prevId` is `0002`'s
    `1fbe519e-8f88-46da-be95-d0b5bffa3840`), the full six-table schema,
    all three enums, and the `_meta` block the fabricated version
    omitted.
-   `apps/api/src/db/schema.ts` --- `dayExceptions` and
    `dayExceptionSlots` with the D033 shape, the `day_exception_kind`
    enum, the same composite ownership keys, and the P12 `class_type`
    enum.
-   `packages/shared/src/day-exception.ts` --- exception and slot field,
    create, patch, and record schemas, `dayExceptionKindSchema`, and the
    `HH:MM` time rules that reuse the D034 wall-clock contract.
-   `apps/api/src/domain/day-exception-repository.ts` --- shared-schema
    validation for create, patch, and slot payloads through
    `createDayExceptionInputSchema`, `dayExceptionPatchSchema`, and
    `createDayExceptionSlotInputSchema`, plus typed ownership,
    holiday-conflict, kind-conflict, overlap, date-bounds, and
    delete-conflict errors. Zod issues map onto field paths the routes
    already return as 422.
-   `apps/api/src/db/day-exception-repository.ts` --- create, list, get,
    update, and delete, every query scoped by owner and semester. Creates
    and updates validate the date against the semester's start and end,
    reject a duplicate date with a field issue, and map a foreign
    semester to an ownership error. An update that would turn a
    `special_schedule` with slots into a `holiday` is refused with 409
    from inside the locked transaction, and every patch is validated by
    the shared contract before the no-op short-circuit. Deletion is
    refused with a stable conflict while slots exist.
-   `apps/api/src/db/day-exception-slot-repository.ts` --- create, list,
    get, update, and delete inside a transaction that locks the parent
    exception row first and then the slot. Refuses a subject from another
    semester or owner, refuses any write under a holiday, and rejects
    overlap using half-open `[start, end)` ranges, so adjacent slots are
    allowed.
-   `apps/api/src/day-exception-routes.ts` --- nested
    `/semesters/:semesterId/day-exceptions` and
    `.../day-exceptions/:exceptionId/slots` routes behind the same guard
    as P08/P09/P13: 503 when auth or the database is unconfigured, 401
    without a verified session, 404 for a missing or foreign semester,
    exception, or slot, 422 with field issues for validation and date
    bounds, and 409 for overlap and for deleting an exception that still
    has slots. The owner comes only from the session.
-   `apps/api/src/app.ts` --- registers the day-exception routes.
-   `apps/web/src/api/day-exceptions.ts` --- typed client for exceptions
    and slots; every response is parsed with the shared schemas.
-   `apps/web/src/pages/CalendarPage.tsx` --- month grid with weekday
    headers, Prev/Next/Today navigation, holiday and special-schedule
    badges, an exception detail panel, create/edit/delete for holidays
    and for special-schedule slots, semester selection bound to
    `?semester=`, and explicit loading, empty, validation, success, and
    failure states, including a Retry panel when the exceptions request
    fails. `apps/web/src/App.tsx` and `navigation.ts` promote
    `/calendar` from planned to built.
-   Tests: 20 web tests cover rendering, both exception kinds, month
    navigation, semester switching, creating and deleting exceptions,
    date bounds, duplicate dates, the holiday-with-slot refusal, overlap
    versus adjacency, invalid times, the date-only weekday, and the
    exceptions failure state. Edit flows for exceptions and slots have
    no dedicated UI test. The API suite is 321 tests across 14 files:
    46 exception repository, 35 slot repository, and 14 HTTP route tests
    are P14's, and the route suite covers valid creates, malformed dates
    and times on create and update, the 409 kind conflict, ownership,
    and partial updates.
-   Verification: `pnpm check` exit 0 --- format, lint, typecheck, 391
    tests (321 API across 14 files, 70 web across 7 files), build;
    `git diff --check` clean. `drizzle-kit check` reports "Everything's
    fine" and a throwaway `db:generate` over the real history reports
    "No schema changes, nothing to migrate"; 81 P14 repository tests
    apply the real
    `0003` SQL.

**Dependencies added (P07, exact pins)** `drizzle-orm` 0.45.4, `pg`
8.23.1; dev: `drizzle-kit` 0.31.11, `@types/pg` 8.23.1,
`@electric-sql/pglite` 0.5.11.

**Dependencies added (P08, exact pins)** `@clerk/express` 2.1.82 (API);
`@clerk/react` 6.18.0 and `zod` 4.6.7 (web).

**Scripts (root)** `pnpm dev`, `pnpm build`, `pnpm typecheck`,
`pnpm test`. Per package: `dev`, `build`, `typecheck`, `test`; the API
also has `start`.

**Configuration files added** `package.json`, `pnpm-workspace.yaml`,
`pnpm-lock.yaml`, `tsconfig.base.json`, per-package `tsconfig.json`
files, `vite.config.ts`, `.env.example` (root, server-only), and
`apps/web/.env.example` (public `VITE_` values only). `.gitignore` gained
`*.tsbuildinfo` and `.vite/`; it already covered `node_modules/`,
`dist/`, and `.env*`.

## Quality gate (P05)

`pnpm check` chains the five stages, stopping at the first failure:
`format:check` -> `lint` -> `typecheck` -> `test` -> `build`.

| Stage | Command | Tooling |
|---|---|---|
| Formatting | `pnpm format:check` / `pnpm format` | Prettier 3 |
| Lint | `pnpm lint` | ESLint 10 + `typescript-eslint` (one root flat config) |
| Types | `pnpm typecheck` | `tsc --noEmit` in each package (TypeScript 7) |
| Tests | `pnpm test` | Vitest 5 |
| Build | `pnpm build` | `tsc` + Vite 8 |

CI (`.github/workflows/ci.yml`) runs the same five steps on pushes to
`main` and on pull requests, with `pnpm install --frozen-lockfile`, a
pnpm version read from `packageManager`, Node 24, and no credentials of
any kind. **No real GitHub Actions run has occurred** --- the workflow has
only been validated locally by syntax parsing and by running its
commands.

**TypeScript 7 caveat (D019):** `typescript-eslint` has no TypeScript 7
support and aborts on it. The root therefore aliases `typescript` to
`@typescript/typescript6` for the linter while every package builds with
TypeScript 7 through `@typescript/native`.

## Checks run and results

| Command | Result |
|---|---|
| `pnpm install` | **Exit 0.** 188 packages. Two earlier attempts failed with `ERR_PNPM_IGNORED_BUILDS` because pnpm blocks dependency build scripts; fixed by recording `allowBuilds: { esbuild: true }` in `pnpm-workspace.yaml`, not by weakening the guard. |
| `pnpm build` | **Exit 0.** `tsc` for shared and api; `vite build` produced `dist/index.html` 0.55 kB, CSS 8.21 kB, JS 301.58 kB (92.09 kB gzip). |
| `pnpm typecheck` | **Exit 0.** All three packages clean under `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`. |
| `pnpm test` | **Exit 0.** 4 tests passed: API health contract + 404 envelope; web heading + "not connected yet" notice. |
| API dev server | `tsx watch` started; `GET http://localhost:3001/health` returned **200** with the contract payload; `GET /nope` returned **404** with the shared error envelope. |
| Web dev server | Vite ready on port 5173; `/` returned **200**; page rendered in a browser with Tailwind styles applied and a clean console (no errors or failed requests). |
| Env fail-fast | Verified by accident and then intentionally: with the host's `PORT=0`, the API exited with `Invalid environment configuration - PORT: Too small: expected number to be >0`. A readable failure, no values leaked. |
| `pnpm check` (P05) | **Exit 0** --- all five stages. Formatting passed after reformatting three API files; lint passed after the Express error-handler parameter convention was configured; 12 tests passed; build succeeded. |
| `pnpm check` (P06) | **Exit 0** --- format, lint, typecheck, 20 tests, build. Type checking first failed on an optional callback under `exactOptionalPropertyTypes` and passed after the prop type was widened, not after relaxing the compiler setting. |
| Browser checks (P06) | Desktop 1440x900 and mobile 390x844 both render correctly; the sidebar leaves the accessibility tree at mobile width, the disclosure menu reports `aria-expanded` and closes on link click, on Escape, and after navigation; `/gpa` shows the blocked explanation; an unknown path shows the not-found page. Console clean. |

| `pnpm check` (P07) | **Exit 0** --- format, lint, typecheck, 71 tests (61 API, 10 web), build. The integration suite applies the committed migration and runs 29 database tests; 19 domain tests and 3 date-parser tests complete the API count. |
| Migration applied (P07) | Applied to a fresh in-memory PostgreSQL 18 (PGlite) by the test suite; a second run is a no-op. The partial unique index, four `CHECK` constraints, both foreign keys, and per-user isolation all fail or pass as designed. **Never run against a PostgreSQL server** --- none is installed here. |
| `db:migrate` guards (P07) | Exit 1 with a message naming `DATABASE_URL` when it is unset or malformed. No value is printed. |
| `pnpm check` (P08) | **Exit 0** --- format, lint, typecheck, 102 tests (78 API, 24 web), build. The 17 new route tests drive the real Express app with an injected verifier (not Clerk); the 13 new web tests cover loading, empty, per-field validation, 401, 503, request failure, activation conflict, and the entry point itself. |
| API process smoke (P08) | The real API started without Clerk keys and without `DATABASE_URL`: `/health` returned 200, and `GET`, `POST`, `PATCH`, and `POST /semesters/:id/activate` each returned **503 `auth_not_configured`**. The boot log names both missing pieces. |
| Browser checks (P08) | Both dev servers up (`pnpm dev`, `PORT=3001`): `/semesters` through the Vite proxy returned 503 `auth_not_configured`, and `/academics` rendered the refusal state. The check found a real defect --- the rewritten `main.tsx` lacked `BrowserRouter`, so the app crashed at runtime while all component tests passed under `MemoryRouter`. Fixed, pinned by a new entry-point test proven failing on the broken file, and re-rendered with a clean console. |
| `pnpm check` (P09-B) | **Exit 0** --- format, lint, typecheck, 157 tests (133 API, 24 web), build. The 55 new API tests are 33 repository tests and 22 route tests, all against PGlite and the real Express app. |
| Migration checks (P09-B) | `drizzle-kit check` reported **"Everything's fine"**; a second `db:generate` reported **"No schema changes, nothing to migrate"**. The full migration sequence applied to a fresh PGlite in both new test files; re-applying is a no-op. No PostgreSQL server is available. |
| `pnpm check` (P10) | **Exit 0** --- format, lint, typecheck, 171 tests (133 API, 38 web), build. The 14 new web tests cover list, empty, create, client/server validation, detail, edit, failure states, and semester-switch isolation. |
| `pnpm check` (P11) | **Exit 0** --- format, lint, typecheck, 171 tests (133 API, 38 web), build. This milestone changed documentation only, so the unchanged suite is the regression check. |
| `pnpm check` (P12) | **Exit 0** --- format, lint, typecheck, 237 tests (199 API, 38 web), build. The 66 new API tests are 32 domain tests and 34 repository/migration tests. `drizzle-kit check` reported "Everything's fine", and a second `db:generate` reported "No schema changes, nothing to migrate". |
| `pnpm check` (P14) | **Exit 0** --- format, lint, typecheck, 369 tests (300 API, 69 web), build. The 19 calendar tests drive the page in jsdom with a stubbed `fetch`; the P14 repository suites run against PGlite, and the whole API suite now initializes in this environment (superseding the P13 note). |
| `pnpm check` (P14 final) | **Exit 0** --- format, lint, typecheck, **391 tests (321 API across 14 files, 70 web across 7 files)**, build. The 16 new tests after the audit are 3 exception repository, 2 slot repository, and 11 HTTP route tests; the Calendar suite grew to 20 with the date-only weekday test. `drizzle-kit check` stayed "Everything's fine" and the migration, snapshot, and journal were not touched. |
| `git diff --check` (P14) | **Exit 0** --- no whitespace errors in tracked changes. Untracked files are outside this command's scope. |
| `drizzle-kit check` (P14) | **"Everything's fine"** --- the regenerated `0003_snapshot.json` is a valid cumulative snapshot with an `id`/`prevId` chain into `0002`. The fabricated first draft (no `id`/`prevId`, two tables only, a 2--80 room check, array-style enums) was replaced, not patched. |
| `drizzle-kit generate` (P14) | **"No schema changes, nothing to migrate"** --- a throwaway generation against a copy of the real migration history proves the snapshot matches `schema.ts`. |

**Could not run:** a real GitHub Actions run (workflow validated locally
only), a migration through `pg` against a PostgreSQL server (none is
installed or provisioned), and any real Clerk sign-in or token
verification --- the boundary is wired (D025) but no Clerk keys exist,
so the route tests inject a verifier instead. These are unavailable, not
passing.

## Blockers / unknowns

-   **`PORT=0` is injected by the agent harness**, not set in the
    Windows User or Machine environment, so a normal terminal is
    unaffected. Runs inside this workspace need `PORT=3001` explicitly.
    Resolved as documentation, deliberately not masked in code (D017).
-   A `.env` file cannot override it, because real environment variables
    intentionally win over `.env` (D014/D016).
-   The Vite dev server binds IPv6 loopback (`[::1]`) only; `localhost`
    works, `127.0.0.1` does not.
-   Navigation is client-side, so the eventual host must rewrite
    unknown paths to `index.html`; nothing is deployed yet.
-   The web app calls same-origin paths (the Vite dev server proxies
    `/semesters` and `/health` to port 3001), so `VITE_API_BASE_URL`
    stays empty by default (D026); production must serve API and app
    from one host.
-   `Settings` is intentionally absent from navigation until a real
    setting exists, and calendar views live under Timetable until P16.
-   `packages/shared` is built by a `prepare` script; a source change
    needs `pnpm --filter @gpa/shared build` before the API picks it up
    outside the root `dev` script.
-   Provider choices (Clerk instance, hosting, managed PostgreSQL) and
    costs are unconfirmed.
-   Institution grading rules unconfirmed; Phase 8 remains blocked
    (D008).
-   Calendar-date handling (D024) and timetable wall-clock times (D034)
    are recorded and implemented; the excused-attendance policy (P19)
    remains open.
-   No PostgreSQL server exists in this workspace, so the migrations
    have only been applied to PGlite, and the managed-provider choice is
    still unconfirmed. `DATABASE_URL` stays optional at boot because no
    endpoint reads data yet.
-   P10 was verified in jsdom with a stubbed fetch, not in a real
    browser with a real Clerk session. The subject screen does not
    expose delete, although the P09 API supports it; P10's canonical
    scope is list/detail/create/edit.
-   Subjects are hard-deleted; future timetable, attendance, and task
    links will need a safe relationship policy before this is final.
-   Authentication is wired but unconfigured (D025): without Clerk
    keys every data route refuses with 503 and no sign-in has ever run
    end to end. Real keys are needed before the screen can be used with
    real accounts.

## Next action

P14 is complete, audited, and verified, but it is uncommitted: commit it
with explicit paths, including `0003_calendar_date_exceptions.sql` and
the regenerated `meta/0003_snapshot.json`. Then run `P15` (dated class
occurrences); do not begin P15 in the same change. The remaining
follow-ups are non-blocking: dead route branches (a duplicate
`DayExceptionValidationError` check and a duplicate
`_sendSlotNotFound`), the subject-delete `ON DELETE RESTRICT` -> 409
mapping, dedicated UI tests for exception and slot editing, and the
`(id, semester_id, user_id)` unique target that P15 must add before
referencing a one-off slot. Clerk and managed PostgreSQL still need real
configuration before sign-in and server migrations can be verified.

## Session log

  -----------------------------------------------------------------------
  Date              Prompt            Result            Next
  ----------------- ----------------- ----------------- -----------------
  2026-10-18        Planning baseline Documentation     P00 repository
                                      pack created      reconnaissance

  2026-10-18        P00               Repository        P01 baseline
                                      contains docs     verification
                                      only

  2026-10-18        P01               Baseline and      P02 gap analysis
                                      environment
                                      recorded; docs
                                      reconciled;
                                      D009--D011

  2026-10-18        P02               Gap analysis and  P03 foundation
                                      implementation    review
                                      map produced

  2026-10-18        P03               Workspace         P04 configuration
                                      foundation        and secrets
                                      runnable; build,  hygiene
                                      typecheck, tests
                                      pass; D012--D015

  2026-10-18        P04               Env ownership and P05 quality
                                      secrets hygiene   checks
                                      documented; 12
                                      tests pass;
                                      D016--D017

  2026-10-18        P05               Format, lint,      P06 app shell
                                      typecheck, test,   and navigation
                                      build all pass;
                                      CI workflow
                                      added;
                                      D018--D019

  2026-10-23        P06               Sidebar, mobile    P07 semester
                                      disclosure, URL   data model
                                      routing, nine
                                      routes, seven
                                      labelled
                                      placeholders;
                                      20 tests pass;
                                      D020

  2026-10-23        P07               Semester schema,   P08 semester
                                      migration,         management UI
                                      owner-scoped
                                      repository, 71
                                      tests pass;
                                      D021--D024

  2026-10-24        P08               Clerk boundary,    P09 semester-
                                      first data         scoped
                                      endpoints,         subjects
                                      semester screen;
                                      102 tests pass;
                                      D025--D027

  2026-11-05        P09-B             Subject migration, P10 subject
                                      composite FK, 33   management UI
                                      repository + 22
                                      route tests;
                                      157 tests pass;
                                      D028

  2026-11-05        P10               Subject list/       P11 timetable
                                      detail/create/     domain design
                                      edit UI; URL-
                                      scoped semester;
                                      38 web / 171
                                      total tests;
                                      D029

  2026-11-06        P11               Timetable domain  P12 timetable
                                      design recorded;   persistence
                                      no code or
                                      migration;
                                      D030--D035

  2026-11-06        P12               Recurring slot    P13 timetable
                                      table, migration,  editor
                                      repository, and
                                      66 tests;
                                      D036

  2026-11-10        P14               Date exceptions:  P15 after commit
                                      schema, migration,
                                      repositories,
                                      routes, calendar
                                      UI; snapshot
                                      regenerated and
                                      drizzle-kit
                                      check clean; 20
                                      calendar tests /
                                      391 total (321
                                      API, 70 web);
                                      uncommitted
  -----------------------------------------------------------------------
