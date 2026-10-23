# Project Progress --- The GPA Project

**Last updated:** 2026-10-23\
**Current milestone:** P06 --- App shell and navigation\
**Overall status:** Runnable foundation with a responsive shell, honest
placeholder routes, and a single reproducible quality gate. No database,
no authentication, no feature modules.

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

## Foundation as built

**Packages**

-   `apps/web` --- React 19 + Vite 8 + Tailwind 4 + react-router 8.
    Nine routes: Today, seven planned-module placeholders, and a
    not-found page; ten tests.
-   `apps/web/src/navigation.ts` --- single source of truth for the
    navigation groups, module routes, summaries, milestones, and status.
-   `apps/api` --- Express 5 (ESM), env validation, `/health`, uniform
    error envelope, two tests.
-   `packages/shared` --- zod contracts (`healthResponseSchema`,
    `apiErrorSchema`), `APP_NAME`, `APP_TAGLINE`; built to `dist` by a
    `prepare` script so consumers resolve types immediately after
    install.

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

**Could not run:** a real GitHub Actions run (workflow validated locally
only), database integration tests (no schema or database), and any Clerk
sign-in check (auth is not wired --- D015). These are unavailable, not
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
-   The shell makes no API request, so `VITE_API_BASE_URL` is unused.
-   `Settings` is intentionally absent from navigation until a real
    setting exists, and calendar views live under Timetable until P16.
-   `packages/shared` is built by a `prepare` script; a source change
    needs `pnpm --filter @gpa/shared build` before the API picks it up
    outside the root `dev` script.
-   Provider choices (Clerk instance, hosting, managed PostgreSQL) and
    costs are unconfirmed.
-   Institution grading rules unconfirmed; Phase 8 remains blocked
    (D008).
-   Date/timezone policy and excused-attendance policy are still
    unrecorded decisions needed before P07/P19.

## Next action

Run `P07` from `MIMO_DAILY_PROMPTS.md`: design and implement the
semester entities and validation in the persistence layer, with
migrations and tests. That is the first prompt that needs a database, so
it also settles the `DATABASE_URL` provider question.

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
  -----------------------------------------------------------------------
