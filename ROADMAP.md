# Roadmap --- The GPA Project

The roadmap is deliberately staged. A later phase should not begin
merely because its screens can be mocked; the underlying data and rules
must be dependable.

## Phase 0 --- Understand the existing project

-   P00 Repository reconnaissance
-   P01 Establish project documentation and baseline checks
-   P02 Identify architecture gaps and propose the smallest safe plan

**Exit criteria:** Known stack, scripts, data model, current
functionality, test baseline, and explicit implementation plan.

## Phase 1 --- App foundation

-   P03 App shell and navigation audit
-   P04 Shared UI patterns and responsive layout
-   P05 Data persistence/API conventions and validation patterns
-   P06 Settings/profile defaults only if required

**Exit criteria:** Stable shell, reusable patterns, persisted feature
conventions, no fake navigation.

## Phase 2 --- Semester and subject setup

-   P07 Semester CRUD and lifecycle
-   P08 Active semester context and history
-   P09 Semester-scoped subjects
-   P10 Setup flow and validation

**Exit criteria:** Can create a semester, add subjects, activate it, and
later inspect it without data mixing.

## Phase 3 --- Timetable and calendar exceptions

-   P11 Recurring timetable slots
-   P12 Weekly timetable UI
-   P13 Calendar/date selection
-   P14 Holiday exceptions
-   P15 Special schedule overrides
-   P16 Idempotent scheduled-class generation

**Exit criteria:** Manual timetable setup works; holidays/overrides are
date-specific; repeated generation does not duplicate classes.

## Phase 4 --- Attendance

-   P17 Attendance marking states
-   P18 Subject attendance calculations
-   P19 Attendance history and semester isolation
-   P20 Attendance edge-case tests and UI polish

**Exit criteria:** Holidays and cancelled classes do not create
absences; unmarked is not absent; history remains stable.

## Phase 5 --- To-do system

-   P21 Task model, create/edit/complete
-   P22 Inbox and quick add
-   P23 Today/Upcoming/Overdue/Completed views
-   P24 Filters, priorities, due dates, estimated time
-   P25 Optional subject/semester links
-   P26 Recurrence only if core task flows are stable

**Exit criteria:** A useful, persistent task manager works without
requiring academic metadata.

## Phase 6 --- Today dashboard

-   P27 Combine today's classes and tasks
-   P28 Priorities, next class, due/overdue summaries
-   P29 Dashboard responsive polish and usability pass

**Exit criteria:** User can understand today's obligations at a glance.

## Phase 7 --- Academic progress and exams

-   P30 Topics and learning states
-   P31 Tasks linked to topics
-   P32 Exams/assessments and dates
-   P33 Syllabus/preparation tracking
-   P34 Weekly review

**Exit criteria:** Progress is editable and transparent; no unsupported
assumptions about mastery.

## Phase 8 --- GPA and insights

-   P35 Collect the institution's grading/credit rules
-   P36 Assessment marks and credits
-   P37 Configurable grade conversion
-   P38 SGPA/CGPA calculations and tests
-   P39 Attendance projections and insights

**Exit criteria:** Formula is confirmed, transparent, tested, and
handles missing/incomplete data.

## Phase 9 --- Optional extensions

-   P40 GATE/long-term study area
-   P41 Export/backup and restore
-   P42 Timetable import investigation
-   P43 Final security, accessibility, and data-integrity audit

## Replanning rule

If reconnaissance reveals that a phase already exists, do not rebuild
it. Verify it, record its status, and move to the next missing
requirement. If a prerequisite changes the order, document why before
proceeding.
