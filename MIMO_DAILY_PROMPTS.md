# Mimo Daily Prompts — The GPA Project

Use these prompts in order, one per work session. Do not skip a prompt when its acceptance criteria are not met. Paste only the current prompt into Mimo, then review its report before proceeding.

## Rules for every prompt
- Inspect the current repository before acting; the existing codebase is authoritative.
- Keep changes scoped to the current prompt. Do not rebuild or migrate the stack without a documented reason and explicit approval.
- Do not commit, push, deploy, or change repository settings unless Manan explicitly asks.
- Run relevant tests, linting, type checks, and builds where available. Never claim a check passed unless it was run.
- Update `PROJECT_PROGRESS.md`, `CHANGE_HISTORY.md`, and `DECISIONS.md` when appropriate.
- Report: summary, files changed, commands/checks run and results, limitations, risks, and the exact next prompt.
- Protect secrets and personal academic data. Use synthetic examples only.
- Preserve historical records; do not silently rewrite past attendance or academic data.

## Phase 0 — Understand the repository

### P00 — Repository reconnaissance (NO FEATURE CODING)
Inspect the entire repository structure, package manifests, framework, scripts, environment configuration, routes, database/schema/migrations, authentication, tests, and current Git status. Do not edit any application files or install packages. Report what exists, what works based on checks you can safely run, what's incomplete, likely risks, and the smallest sensible next step. Do not assume the stack.

### P01 — Baseline verification
Run the existing documented install/check/test/build commands only where safe and feasible. Do not fix issues yet. Record exact commands, results, blockers, and environment requirements in PROJECT_PROGRESS.md. Do not change application code.

### P02 — Gap analysis and implementation map
Compare the existing project against MAIN_PLAN.md. Map existing features, partially implemented features, missing features, schema implications, and dependencies. Recommend a staged plan that reuses working code. Do not implement features. Ask Manan about any genuinely blocking ambiguity; do not invent institutional GPA rules.

## Phase 1 — Foundation

### P03 — Project foundation review
Based on P00–P02, propose the smallest foundation changes needed for a maintainable application. Confirm current stack and conventions. If a major change is proposed, explain trade-offs and request approval before doing it. Implement only clearly necessary, low-risk foundation fixes.

### P04 — Configuration and secrets hygiene
Review environment variable handling, examples, ignore rules, and accidental secret exposure. Add or improve .env.example and documentation using placeholder values only. Never print secret values or rewrite Git history. Report any possible exposed secret for manual rotation.

### P05 — Quality checks
Add or improve proportionate lint, type-check, test, and build scripts using the existing stack. Avoid adding unnecessary tooling. Run them and document results.

### P06 — App shell and navigation
Implement or refine the basic responsive app shell and navigation using the existing UI conventions. Use placeholder/empty states for modules not yet implemented. Keep this change limited to layout and navigation.

## Phase 2 — Academic structure

### P07 — Semester data model
Design and implement semester entities and validation in the existing persistence layer. Include active/current semester behavior if appropriate. Add migrations and tests. Do not delete or overwrite existing records.

### P08 — Semester management UI
Build create, edit, activate, archive, and view flows supported by the model. Prevent accidental destructive actions and show clear empty/error states.

### P09 — Semester-scoped subjects
Implement subjects linked to a semester, allowing repeated subject names in different semesters. Add validation, persistence, and tests. Do not use subject name alone as a unique identity.

### P10 — Subject management UI
Add subject list/detail/create/edit flows scoped to the selected semester. Include useful empty states and ensure changing semesters does not mix subject data.

## Phase 3 — Timetable and date exceptions

### P11 — Timetable domain design
Inspect the current schema and design recurring weekly timetable slots separately from dated class occurrences. Record key decisions. Do not implement unrelated modules.

### P12 — Timetable persistence
Implement recurring timetable slots with weekday, time range, subject, location/label where supported, and validation against invalid or overlapping times where appropriate. Add tests.

### P13 — Timetable editor
Build UI to add, edit, remove, and review recurring weekly slots for a semester. Make the active semester explicit and prevent accidental edits to another semester.

### P14 — Calendar date exceptions
Implement date-specific holidays and special schedule overrides. A holiday must not mutate the recurring weekly timetable. Support an optional reason and test date/time-zone handling.

### P15 — Dated class occurrences
Implement a safe way to generate or resolve dated class occurrences from recurring slots and date exceptions. Generation must be idempotent: repeating it must not duplicate classes. Holidays should produce no scheduled classes for the affected date unless an explicit special override defines classes.

### P16 — Timetable calendar views
Show weekly timetable and dated calendar views. Clearly distinguish recurring slots from dated occurrences and special days. Add loading, empty, and error states.

## Phase 4 — Attendance and history

### P17 — Attendance data model
Model attendance records against dated class occurrences, with statuses appropriate to the product. Preserve history independently of future timetable edits. Add constraints and tests.

### P18 — Mark attendance
Implement a fast attendance marking workflow for an individual class occurrence. Prevent duplicate/conflicting records and support correction without silently erasing audit-relevant history.

### P19 — Attendance summaries
Implement subject- and semester-level attendance totals and percentages. Define how cancelled classes, holidays, and unmarked occurrences are treated; document assumptions and test edge cases.

### P20 — Attendance history and corrections
Add dated attendance history and a safe correction workflow. Verify that timetable changes do not rewrite prior attendance. Add regression tests.

## Phase 5 — Tasks (first-class module)

### P21 — Task domain model
Implement tasks that work for personal use without academic metadata. Support title, description/notes where appropriate, status, priority, due date, optional scheduled date/time, estimated duration, and optional subject/topic/semester links. Add validation and tests.

### P22 — Quick add and inbox
Build a fast task capture flow and an inbox for unscheduled tasks. Keep required fields minimal and allow personal tasks without a subject.

### P23 — Task list and detail
Implement task list, detail, edit, complete/reopen, and delete/archive behavior. Prefer recoverable archive where appropriate. Add useful filters and empty states.

### P24 — Task planning fields
Add priority, due date, scheduled date/time, estimated time, and task category/type UI if supported by the model. Clearly distinguish a due date from a planned work date.

### P25 — Academic task links
Allow optional links from tasks to semester, subject, or topic. Ensure deleting or archiving academic entities cannot unexpectedly destroy personal tasks; define safe relationship behavior.

### P26 — Task search and recurring-task feasibility
Add practical search/filter/sort if not already available. Investigate recurring tasks and report a design proposal first; implement recurring behavior only if the current plan and data model support it cleanly.

## Phase 6 — Today and MVP polish

### P27 — Today dashboard
Build a Today view combining today's scheduled classes, relevant attendance actions, and tasks planned or due today. Keep the sources distinguishable and handle dates consistently.

### P28 — Dashboard interactions
Add quick actions such as mark attendance, complete a task, and open a class/task detail. Ensure actions update persisted state and show clear success/error feedback.

### P29 — MVP audit
Test the complete semester → subjects → timetable → exceptions → dated classes → attendance → tasks → Today workflow. Fix only MVP-blocking defects, add regression tests, and update progress. Do not start later phases until the flow is coherent.

## Phase 7 — Academic progress and assessments

### P30 — Topics and learning progress model
Design topics under semester-scoped subjects and a simple progress state. Avoid overengineering. Record schema and UX decisions before broad implementation.

### P31 — Topic management and progress
Implement topic creation, ordering, progress updates, and subject-level summaries. Add validation and tests.

### P32 — Exams and assessments model
Implement semester/subject-linked assessments with name/type, date, and configurable marks fields as appropriate. Do not hardcode a grading policy. Add tests for validation.

### P33 — Assessment UI
Build assessment list, create/edit, and marks entry flows with clear validation and missing-mark states. Keep grading calculations out unless explicitly specified.

### P34 — Weekly review
Create a useful weekly review summarizing tasks completed/overdue, upcoming assessments, study progress, and attendance trends. Avoid misleading conclusions when data is incomplete.

## Phase 8 — Grading and GPA (blocked until rules confirmed)

### P35 — Confirm grading policy (NO GPA IMPLEMENTATION)
Ask Manan for the institution's official rules: grade scale, grade points, credits, SGPA/CGPA formulas, rounding, failed/absent subjects, repeat/backlog attempts, exemptions, and any special cases. Record confirmed rules and source in DECISIONS.md. If rules are unknown, leave this phase blocked.

### P36 — Grading policy model
Only after P35 is confirmed, design a configurable grading policy and validation model. Do not assume a universal formula. Add tests for every confirmed rule.

### P37 — Marks-to-grade calculation
Implement marks-to-grade mapping only when the official thresholds and boundaries are confirmed. Test boundary values and invalid/missing marks.

### P38 — SGPA/CGPA calculations
Implement calculations from the confirmed credit and grade-point rules. Show the calculation breakdown and handle incomplete semesters according to the documented policy.

### P39 — GPA audit and projections
Add tests using hand-calculated examples supplied or approved by Manan. Implement attendance projections only from confirmed rules and clearly label estimates. Never present estimates as official results.

## Phase 9 — Long-term features and portability

### P40 — GATE study module proposal
Propose a lightweight GATE preparation module that can track subjects, topics, study sessions, and revision. Reuse existing task/topic concepts where sensible. Get approval for scope before implementation.

### P41 — GATE study module implementation
Implement the approved minimal scope, with progress views and tests. Avoid adding a separate parallel task system if the existing one can support it.

### P42 — Data export and backup
Design and implement safe export/backup for the user's own data in a documented format. Validate exports and avoid including credentials or secrets. Explain restore limitations and test round trips where feasible.

### P43 — Timetable import investigation and final audit
Investigate a low-risk timetable import path (for example CSV) and present a proposal before implementing it. Then perform a final audit of tests, data integrity, accessibility, responsive behavior, security, setup documentation, and known limitations. Update roadmap and progress; do not claim production readiness without evidence.

## Completion gate for every prompt
Before moving to the next prompt, Manan should be able to review:
1. What changed and why.
2. Which files changed.
3. What verification was run and its actual result.
4. Known limitations or decisions needed.
5. Whether PROJECT_PROGRESS.md and CHANGE_HISTORY.md are current.
6. The next prompt number and why it is now safe to proceed.
