# Roadmap --- The GPA Project

The roadmap is deliberately staged. A later phase should not begin
merely because its screens can be mocked; the underlying data and rules
must be dependable.

**Canonical sequencing:** `MIMO_DAILY_PROMPTS.md` is the authoritative
source for operational prompt IDs P00--P43 and for the scope of each
prompt (see D010). This roadmap describes the same sequence in phase
form and must match it. Where the two disagree, the daily prompts win
and this file is corrected. Acceptance criteria recorded here remain
binding requirements even where a prompt's text is terse.

**Current status:** Phase 0 is complete at the documentation level and
the repository still contains no application code (see
`PROJECT_PROGRESS.md`). Phase 1 has not started.

## Phase 0 --- Understand the repository (P00--P02)

-   P00 Repository reconnaissance
-   P01 Baseline verification
-   P02 Gap analysis and implementation map

**Exit criteria:** Known stack, scripts, data model, current
functionality, test baseline, and explicit implementation plan.

## Phase 1 --- Foundation (P03--P06)

-   P03 Project foundation review
-   P04 Configuration and secrets hygiene
-   P05 Quality checks
-   P06 App shell and navigation

**Preserved requirements carried from the earlier roadmap draft:**
shared UI patterns and responsive layout (P03/P06), persistence/API
conventions and validation patterns (P03), and settings/profile defaults
only where actually required (deferred until a real setting exists).

**Exit criteria:** Stable responsive shell, reusable patterns, secrets
handled through environment variables with placeholder-only examples,
and defined lint/type-check/test/build scripts that pass; no fake
navigation or dead controls.

## Phase 2 --- Academic structure (P07--P10)

-   P07 Semester data model
-   P08 Semester management UI
-   P09 Semester-scoped subjects
-   P10 Subject management UI

**Preserved requirements carried from the earlier roadmap draft:**
active-semester context and history, plus a setup flow with validation.

**Exit criteria:** Can create a semester, add subjects, activate it, and
later inspect it without data mixing.

## Phase 3 --- Timetable and date exceptions (P11--P16)

-   P11 Timetable domain design
-   P12 Timetable persistence
-   P13 Timetable editor
-   P14 Calendar date exceptions
-   P15 Dated class occurrences
-   P16 Timetable calendar views

**Preserved requirements carried from the earlier roadmap draft:**
weekly timetable UI (P13), calendar/date selection (P14/P16), holiday
exceptions (P14), special schedule overrides (P14), and idempotent
scheduled-class generation as a hard acceptance criterion of P15.

**Exit criteria:** Manual timetable setup works; holidays/overrides are
date-specific and never mutate the recurring weekly timetable; repeated
generation does not duplicate classes; recurring rules are visually
distinct from dated occurrences.

## Phase 4 --- Attendance and history (P17--P20)

-   P17 Attendance data model
-   P18 Mark attendance
-   P19 Attendance summaries
-   P20 Attendance history and corrections

**Preserved requirements carried from the earlier roadmap draft:**
explicit attendance states, per-subject as well as semester-level
calculations (P19), semester isolation and history stability (P20), and
edge-case tests plus UI polish (P19/P20).

**Exit criteria:** Holidays and cancelled classes do not create
absences; unmarked is not absent; history remains stable after timetable
edits.

## Phase 5 --- Tasks (P21--P26)

-   P21 Task domain model
-   P22 Quick add and inbox
-   P23 Task list and detail
-   P24 Task planning fields
-   P25 Academic task links
-   P26 Task search and recurring-task feasibility

**Preserved requirements carried from the earlier roadmap draft:**
Inbox/Today/Upcoming/Overdue/Completed views (P23), filters, priorities,
due dates, and estimated time (P24), optional subject/semester links
(P25), and recurrence only after a written feasibility report and only
if core task flows are stable (P26).

**Exit criteria:** A useful, persistent task manager works without
requiring academic metadata, and a task can be captured in seconds.

## Phase 6 --- Today and MVP polish (P27--P29)

-   P27 Today dashboard
-   P28 Dashboard interactions
-   P29 MVP audit

**Preserved requirements carried from the earlier roadmap draft:**
priorities, next class, and due/overdue summaries (P27/P28), and a
responsive/usability pass (P29).

**Exit criteria:** User can understand today's obligations at a glance,
and the full semester-to-Today workflow has been audited end to end.

## Phase 7 --- Academic progress and assessments (P30--P34)

-   P30 Topics and learning progress model
-   P31 Topic management and progress
-   P32 Exams and assessments model
-   P33 Assessment UI
-   P34 Weekly review

**Preserved requirements carried from the earlier roadmap draft:**
tasks linked to topics (P25 supports the link; P31 proves it in the
topic workflow), syllabus/preparation tracking (P33/P34), and progress
that is editable and transparent with no inferred mastery.

**Exit criteria:** Progress is editable and transparent; no unsupported
assumptions about mastery.

## Phase 8 --- Grading and GPA (P35--P39, blocked until rules confirmed)

-   P35 Confirm grading policy (no implementation)
-   P36 Grading policy model
-   P37 Marks-to-grade calculation
-   P38 SGPA/CGPA calculations
-   P39 GPA audit and projections

**Preserved requirements carried from the earlier roadmap draft:**
assessment marks and credits entry (P36/P37) and attendance projections
and insights (P39).

**Exit criteria:** Formula is confirmed, transparent, tested, and
handles missing/incomplete data. **Blocked:** do not begin P36--P39
until P35 records the institution's actual rules (D008).

## Phase 9 --- Long-term features and portability (P40--P43)

-   P40 GATE study module proposal
-   P41 GATE study module implementation
-   P42 Data export and backup
-   P43 Timetable import investigation and final audit

**Preserved requirements carried from the earlier roadmap draft:**
export/backup and restore (P42), timetable import investigation (P43),
and the final security, accessibility, and data-integrity audit (P43).
Note that P43 intentionally combines the import proposal with the final
audit, matching the canonical prompt.

**Exit criteria:** Approved scope implemented with tests, export
round-trip verified, audit evidence recorded, and no production
readiness claimed without evidence.

## Replanning rule

If reconnaissance reveals that a phase already exists, do not rebuild
it. Verify it, record its status, and move to the next missing
requirement. If a prerequisite changes the order, document why before
proceeding.
