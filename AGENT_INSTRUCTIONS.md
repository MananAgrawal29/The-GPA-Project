# Mimo Agent Instructions --- The GPA Project

These instructions are persistent. Follow them for every session.

## 1. Start by understanding, not rewriting

-   Inspect the repository structure, package scripts, current
    branch/status if available, README, existing instructions, recent
    history, environment configuration (without exposing secrets),
    database schema, migrations, and tests.
-   Identify what already works and what is unfinished.
-   Treat current code as authoritative. Do not replace working systems
    merely because you prefer a different implementation.
-   Do not assume this is a greenfield repository.
-   If context is missing, inspect files before asking the owner to
    repeat information that may already be documented.

## 2. Work in small, verifiable increments

-   Implement only the scope of the current prompt.
-   Do not jump to later roadmap features.
-   Prefer a complete, tested vertical slice over broad scaffolding with
    dead buttons.
-   Do not leave placeholder controls that appear functional but do
    nothing.
-   If a task uncovers a prerequisite defect, fix it only when necessary
    and document the scope change.

## 3. Exercise strong product and engineering judgment

-   You may refactor, redesign, optimize, and add a dependency when it
    materially improves quality.
-   Make substantial changes when justified by the task, but avoid
    needless rewrites and speculative abstractions.
-   Prioritize a polished, coherent, responsive product over a bare
    demo.
-   Keep interfaces understandable and uncluttered.
-   Consider empty states, loading states, error states, validation,
    accessibility, keyboard use, mobile layout, and realistic edge
    cases.
-   Be direct and truthful. Do not claim tests passed if they were not
    run.

## 4. Protect data integrity

-   Semester history must be preserved.
-   Timetable slots are recurring rules; scheduled classes are dated
    occurrences; attendance is a record of what happened.
-   A one-day holiday or schedule override must never mutate the
    recurring weekly timetable.
-   Holidays do not count as absences.
-   Unmarked attendance is pending, not absent.
-   Timetable edits must not silently rewrite historical class
    occurrences or attendance.
-   Re-running class generation must not create duplicates.
-   Do not delete historical records as a shortcut.
-   Any destructive operation needs a clear confirmation and an impact
    summary.
-   Use server-side validation and database constraints where
    appropriate.

## 5. Respect the current technology choices

-   Inspect before choosing tools.
-   If the project already uses
    React/TypeScript/Vite/Express/PostgreSQL/Drizzle/Clerk/Tailwind/pnpm,
    preserve the working setup.
-   Do not introduce authentication if the personal-first app does not
    need it yet.
-   Do not switch databases, ORM, bundler, package manager, or
    deployment platform without explaining the problem, alternatives,
    migration impact, and getting approval for a major migration.
-   Never commit secrets or put credentials in source code.

## 6. Code quality

-   Use clear names and small, cohesive functions.
-   Keep business logic testable and separate from presentation when
    practical.
-   Avoid duplicated calculation logic.
-   Handle time zones and date-only values consistently.
-   Validate API input and database ownership/scope.
-   Add tests for important business rules and regressions.
-   Run relevant lint, typecheck, test, and build scripts when
    available.
-   Do not silence errors or weaken types simply to make checks pass.

## 7. UI/UX expectations

-   Build for desktop and mobile.
-   Use consistent spacing, typography, states, and interaction
    patterns.
-   Provide clear feedback for create/update/delete/mark actions.
-   Ensure forms have labels and validation messages.
-   Make quick-add fast; optional metadata should not block capture.
-   Do not overload the dashboard with every statistic.
-   Never show a fabricated percentage or treat missing data as zero.

## 8. Change documentation is required

After meaningful changes: - Append an entry to `CHANGE_HISTORY.md` with
date, milestone/prompt ID, summary, files/areas affected, checks run,
and known limitations. - Update `PROJECT_PROGRESS.md` with completed
items, current status, blockers, and the next small task. - Update
`ROADMAP.md` only if scope or sequencing materially changes. - Record
important architectural/product choices in `DECISIONS.md`. - Do not
rewrite history to make earlier decisions disappear; add a
correction/superseding entry.

## 9. Git and deployment

-   Do not commit, push, publish, or deploy unless the owner explicitly
    requests it.
-   Do not run destructive database operations against production.
-   Before migrations, explain whether the operation is additive,
    potentially destructive, and how rollback/data preservation works.

## 10. End-of-session response format

At the end of every session, report: 1. **Completed** --- specific
working behavior delivered. 2. **Files changed** --- concise list. 3.
**Verification** --- exact tests/checks run and results. 4.
**Limitations/risks** --- anything not resolved. 5. **Progress files**
--- confirm whether progress/history/decisions were updated. 6. **Next
prompt** --- the next roadmap prompt ID, but do not execute it
automatically.

If blocked, explain the blocker and propose the smallest next action.
Never fabricate completion.
