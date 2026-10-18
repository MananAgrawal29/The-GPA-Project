# The GPA Project --- Project Pack

This pack is the working source of truth for building **The GPA
Project**, a personal college-management system with Mimo as the coding
agent.

## Files

-   `MAIN_PLAN.md` --- product vision, scope, architecture, data rules,
    milestones, and acceptance principles.
-   `AGENT_INSTRUCTIONS.md` --- persistent instructions for Mimo
    (inspect first, preserve working code, test, document decisions).
-   `CHANGE_HISTORY.md` --- append-only record of meaningful changes.
-   `PROJECT_PROGRESS.md` --- current milestone, next action, blockers,
    and verification status.
-   `ROADMAP.md` --- phased delivery plan.
-   `MIMO_DAILY_PROMPTS.md` --- small, sequential prompts to give Mimo
    one session/day at a time.
-   `DECISIONS.md` --- architecture/product decisions and items that
    must not be silently changed.

## How to use this pack

1.  Put these files in the root of the project repository.
2.  Start with the first prompt in `MIMO_DAILY_PROMPTS.md`.
3.  Give Mimo **one prompt per session**. Do not jump ahead if the
    current milestone is broken.
4.  Ask Mimo to update `PROJECT_PROGRESS.md` and `CHANGE_HISTORY.md`
    after meaningful work.
5.  Keep this pack under version control with the code.
6.  Treat the existing repository as authoritative. If a stack or
    feature already exists, inspect it and adapt rather than rebuilding
    it.

## Initial stack assumption

A prior project used React, TypeScript, Vite, Express, PostgreSQL,
Drizzle ORM, Clerk, Tailwind, and pnpm in a monorepo. This is a
**starting hypothesis, not permission to migrate**. Mimo must inspect
the current project and retain its working stack unless there is a
clear, documented reason to change it.

## Working rule

Build a reliable, usable system in small increments. A feature is not
complete merely because it looks finished: it must handle realistic
states, errors, persistence, empty states, responsive layouts, and
relevant tests.
