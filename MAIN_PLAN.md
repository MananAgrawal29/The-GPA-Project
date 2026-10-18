# The GPA Project --- Main Product & Engineering Plan

**Document status:** Initial baseline, v1.0\
**Product type:** Personal-first college management web app\
**Primary builder:** Mimo, guided by the owner\
**Product principle:** Enter the structure once; make everyday
management fast; preserve history.

## 1. Product vision

The GPA Project helps a college student manage the practical work of
college in one place: tasks, timetable, attendance, semesters, subjects,
study progress, exams, and eventually grades/SGPA/CGPA. It should reduce
mental overhead rather than create another system that requires constant
maintenance.

The name is **The GPA Project**. GPA is an eventual outcome and one
module; the product is not limited to calculating GPA.

## 2. Product principles

1.  **Configurable, not hardcoded.** Timetable slots, subjects,
    semesters, holidays, attendance targets, and academic dates are user
    data.
2.  **History is durable.** Starting a new semester must not erase or
    silently rewrite prior-semester records or statistics.
3.  **Fast capture.** A task should be addable in seconds, with optional
    details added later.
4.  **One source of truth.** Avoid duplicate representations of the same
    fact. Keep timetable rules separate from dated class occurrences and
    attendance records.
5.  **User control.** No destructive bulk edits, surprise attendance
    marking, or automatic deletion. Confirm consequential actions.
6.  **Useful before clever.** Build robust manual workflows before OCR,
    AI parsing, integrations, or other automation.
7.  **Honest state.** Show unknown/unrecorded separately from absent,
    incomplete, or zero.
8.  **Progressive complexity.** Keep the daily dashboard simple;
    advanced configuration belongs in focused screens.
9.  **Personal-first, portable later.** Do not over-engineer
    multi-tenant features before the core workflow is dependable.
10. **Accessible and responsive.** Support desktop and mobile-sized
    screens, keyboard navigation, readable contrast, and clear focus
    states.

## 3. Primary user and jobs-to-be-done

Initial user: one student configuring their own college and semester.

Core jobs: - Know what matters today. - Capture tasks before forgetting
them. - See classes and deadlines in one daily view. - Mark attendance
accurately and understand the effect on attendance percentage. - Mark
holidays and one-off timetable changes without corrupting the normal
timetable. - Track subjects/topics and preparation. - Start a new
semester while retaining past statistics. - Later, track marks, credits,
SGPA/CGPA, and longer-term preparation such as GATE.

## 4. Product scope by release

### Release 0 --- Foundation

-   Inspect existing repo and identify runtime, stack, scripts, current
    features, and persistence.
-   Establish project instructions, progress tracking, change history,
    and basic quality checks.
-   Keep the current working stack unless a documented blocker justifies
    a change.

### Release 1 --- Usable personal MVP

-   App shell and navigation.
-   Semester setup and active-semester selection.
-   Subject CRUD scoped to a semester.
-   Weekly timetable slots entered manually.
-   Calendar date exceptions: holiday and special schedule override.
-   Dated class occurrences / scheduled classes.
-   Attendance marking and per-subject statistics.
-   Task inbox, task list, quick add, priorities, due dates, status,
    filters.
-   Today dashboard combining classes and tasks.
-   Persistence, validation, empty/loading/error states, and responsive
    layout.

### Release 2 --- Academic workflow

-   Topics per semester subject.
-   Topic understanding/progress states.
-   Tasks optionally linked to subject and topic.
-   Exams and assessments with dates.
-   Syllabus/preparation progress.
-   Weekly planning and review.
-   Better calendar views and task recurrence.

### Release 3 --- GPA and insights

-   Assessment/marks entry.
-   Credit-aware grade calculations based on a configurable grading
    scheme.
-   Semester GPA and cumulative GPA, with transparent formulas and
    validation.
-   Attendance projections and "classes needed to reach target"
    calculations.
-   Trends and summaries.

### Release 4 --- Optional advanced capabilities

-   GATE/long-term study track.
-   Timetable import from image/PDF (only after manual entry is
    reliable).
-   Natural-language task parsing.
-   Export/backup and restore.
-   Notifications or integrations if there is a clear need.

Do not start later releases until the MVP is stable and the owner agrees
to proceed.

## 5. Main navigation / information architecture

Recommended initial navigation: - **Today** - **Tasks** - **Calendar** -
**Timetable** - **Attendance** - **Academics** - **Exams** (can be
introduced in Release 2) - **GPA** (Release 3) - **History** -
**Settings**

Avoid placing every future module in the UI as a dead link. Add
navigation when the destination is functional, or clearly label a module
as planned only if that is useful.

## 6. Core user flows

### A. First-time setup

1.  Open the app.
2.  Create an academic year/period if the model requires it.
3.  Create Semester 1 and set it active.
4.  Add subjects and optional metadata (code, faculty, credits, target
    attendance).
5.  Add timetable slots by selecting day, start/end time, subject, room,
    and class type.
6.  Configure the semester date range and weekly schedule days.
7.  Start using Today, Tasks, and Attendance.

Do not force every optional field during setup. Allow saving partial
configuration and returning later.

### B. Daily use

1.  Today shows dated classes, attendance status where relevant, and
    due/overdue tasks.
2.  Student marks attendance for a class that actually occurred.
3.  Student adds/completes/re-schedules tasks.
4.  If a class did not happen, the user can record the appropriate
    exception rather than marking absent incorrectly.
5.  Dashboard counts and percentages update from persisted data.

### C. Holiday

1.  Choose a date in Calendar.
2.  Mark it as Holiday; reason is optional.
3.  No ordinary classes should be generated for that date, and the
    holiday must not count as absence.
4.  Preserve the normal recurring timetable.
5.  If dated class occurrences already exist, require a safe
    reconciliation choice (e.g. cancel affected future occurrences
    only). Never silently delete historical attendance.

### D. Special timetable day

Examples: Friday schedule followed on Wednesday; only selected classes
occur; one-off replacement timetable. 1. Select a date. 2. Choose
"Special schedule". 3. Copy from a weekday or select/modify classes for
that date. 4. Preview changes. 5. Save as a date-specific override. 6.
Do not mutate the recurring weekly timetable.

### E. New semester

1.  Create the new semester.
2.  Add its subjects and timetable.
3.  Set it active when ready.
4.  Previous semester becomes archived/completed or inactive, but
    remains readable.
5.  New semester gets its own attendance, subjects, class occurrences,
    topics, exams, and semester-scoped academic data.
6.  Tasks may be global/personal or linked to a specific semester; their
    scope must be explicit.

## 7. Core data model (conceptual)

Exact tables depend on the inspected repository and existing schema. Use
migrations and relational constraints appropriate to the actual
ORM/database.

### Semester

-   id
-   name/label (e.g. Semester 1)
-   academicYear
-   startDate, endDate (nullable during setup)
-   status: setup / active / completed / archived
-   createdAt, updatedAt

Rules: - At most one active semester for this user/profile unless
multi-active is explicitly supported. - Do not delete a semester that
has historical records without an explicit export-and-confirm flow. -
Switching active semester changes the default context, not historical
ownership.

### Subject (semester-scoped subject offering)

-   id
-   semesterId
-   name
-   code (optional)
-   faculty (optional)
-   credits (optional until GPA module)
-   targetAttendancePercent (configurable; default can be set in
    settings)
-   color/icon (optional presentation metadata)

Even if two semesters use "Engineering Mathematics", treat them as
separate semester offerings so attendance and grades do not mix
accidentally.

### TimetableSlot (recurring rule)

-   id
-   semesterId
-   subjectId
-   dayOfWeek
-   startTime, endTime
-   room (optional)
-   faculty (optional)
-   classType (lecture / practical / tutorial / other)
-   activeFrom/activeTo (optional)

Rules: - This is a weekly rule, not a record that a class actually
occurred. - Validate end time after start time and prevent accidental
conflicting slots, while allowing intentional overlaps only through an
explicit decision.

### DayException

-   id
-   semesterId
-   date
-   kind: holiday / special_schedule / cancelled_classes / other
-   reason (optional)
-   metadata for override where needed

Rules: - Unique exception per semester/date unless the chosen model
explicitly supports multiple exception records. - A holiday overrides
normal timetable generation for that date. - Do not change recurring
slots to represent a one-day exception.

### ScheduledClass / ClassOccurrence

-   id
-   semesterId
-   subjectId
-   sourceSlotId (nullable if manually added)
-   date
-   startTime, endTime
-   room snapshot (optional)
-   status: scheduled / completed / cancelled
-   createdAt, updatedAt

Rules: - A dated occurrence represents a specific planned class. - Keep
enough snapshot information to preserve historical context if a slot is
later edited. - Generation must be idempotent: running it twice must not
create duplicate occurrences. - Never regenerate or overwrite historical
occurrences blindly. - Decide and document whether occurrences are
generated in a rolling window or on demand.

### AttendanceRecord

-   id
-   scheduledClassId (or equivalent stable class-occurrence reference)
-   status: present / absent / excused / not-held / pending (use only
    states that the UX can explain)
-   markedAt
-   note (optional)

Rules: - "Pending/unmarked" is not "absent". - Holidays contribute zero
classes and no absence. - Cancelled/not-held classes should not count in
the denominator. - Define how excused classes affect the denominator;
make it configurable or explicit. - Attendance stats must be computed
from a documented formula, not stored as a manually edited percentage. -
Changing a future timetable must not alter recorded past attendance.

### Task

-   id
-   title (required)
-   description/notes (optional)
-   status: inbox / todo / in_progress / done / archived (adapt only if
    a simpler coherent model is chosen)
-   priority: low / normal / high / urgent
-   dueAt (optional; define timezone handling)
-   scheduledFor (optional)
-   estimatedMinutes (optional)
-   type/category (optional)
-   subjectId (optional)
-   topicId (optional)
-   semesterId (optional)
-   recurrenceRule (later release)
-   createdAt, updatedAt, completedAt

Rules: - Quick add requires only a title. - Personal tasks need not have
a subject or semester. - Due date and scheduled date are different
concepts. - Completing a task should preserve it in history; do not
hard-delete by default. - Task filters should be consistent and
composable.

### Topic (Release 2)

-   id, subjectId, name, status, confidence/understanding, notes, order
-   Suggested statuses: not_started / learning / needs_practice / strong
    / revised.
-   Progress should be transparent and editable, not inferred from task
    completion without consent.

### Exam / Assessment (Release 2+)

-   id, semesterId, subjectId, title, type, date/time, maxMarks,
    weight/credits if relevant, notes, syllabus scope.

### Marks / GPA (Release 3)

-   Keep raw marks, assessment weight, credits, grading scale, and
    computed outputs distinct.
-   Never assume the institution's grading formula. Make grading scheme
    configurable and show the formula used.
-   Test edge cases: missing marks, repeated subjects, rounding, zero
    credits, incomplete semester.

## 8. Key domain rules

1.  Semester data must be scoped consistently.
2.  The recurring timetable is not the attendance history.
3.  Calendar exceptions override schedule generation only for their
    dates.
4.  Holidays never count as absences.
5.  Unmarked attendance is clearly shown as pending.
6.  Timetable edits apply to future schedule rules; past
    class/attendance history stays stable.
7.  Any destructive action affecting historical data requires
    confirmation and clear impact summary.
8.  All calculations use a consistent timezone/date policy.
9.  Attendance denominators exclude holidays and cancelled/not-held
    classes; treatment of excused classes must be explicit.
10. Do not invent GPA rules; confirm the user's actual grading scheme
    before implementing GPA calculations.
11. UI must show empty, loading, error, and success states.
12. Use database constraints and server-side validation, not frontend
    validation alone.

## 9. Technical architecture guidance

First inspect the current repository. Do not blindly install or migrate
to a preferred stack.

If this is a greenfield project and Mimo's environment supports it, a
reasonable default based on the owner's prior work is: - Frontend:
React + TypeScript + Vite - Backend: Express + TypeScript - Database:
PostgreSQL - ORM/migrations: Drizzle - Styling: Tailwind or the
repository's established design system - Package manager: pnpm if
already used - Authentication: reuse existing auth if present; do not
add Clerk or another provider without deciding whether authentication is
actually needed for a personal-first MVP.

Prefer clear boundaries: - UI/components - feature/domain logic -
API/routes and validation - database schema/migrations - shared
types/schemas where the current setup supports them.

Do not build a distributed system. Keep the architecture proportionate
to a personal app.

## 10. Security, reliability, and quality

-   Keep secrets in environment variables; never commit credentials.
-   Validate input at API boundaries and enforce ownership/semester
    scope in backend queries.
-   Use safe database migrations; avoid destructive schema pushes in
    production.
-   Avoid logging sensitive user data.
-   Handle database/network errors visibly.
-   Add tests for business rules, especially attendance calculations,
    holiday behavior, class generation, semester isolation, and GPA
    calculations when introduced.
-   Use accessible labels, keyboard interactions, focus indicators, and
    sensible contrast.
-   Test mobile and desktop layouts.
-   Avoid unnecessary dependencies; justify new dependencies.
-   No commits or deployment actions unless the owner explicitly asks.

## 11. MVP acceptance checklist

MVP is not complete until: - \[ \] A semester can be created, edited,
activated, completed, and viewed later. - \[ \] Subjects are scoped to
semesters. - \[ \] Timetable slots can be created, edited, and deleted
safely. - \[ \] Timetable is entirely data-driven. - \[ \] Holiday can
be set for a date with optional reason. - \[ \] A holiday creates no
attendance penalty. - \[ \] Special schedule can override one date
without changing weekly slots. - \[ \] Dated classes are not duplicated
by repeated generation. - \[ \] Past attendance remains stable after
timetable edits or semester switching. - \[ \] Attendance percentage is
calculated correctly from eligible recorded/held classes and unmarked
classes are not silently counted absent. - \[ \] Tasks can be created in
seconds and viewed in Inbox, Today, Upcoming, and Completed. - \[ \]
Tasks can be linked to a subject/semester but don't have to be. - \[ \]
Dashboard combines today's tasks and classes. - \[ \] Data persists
across refresh/restart. - \[ \] Empty/loading/error states are
handled. - \[ \] Responsive layout and basic accessibility checks
pass. - \[ \] Project progress and change history are updated.

## 12. Non-goals for the first MVP

Do not initially build: - AI tutor/chatbot - OCR timetable import -
complex natural-language scheduling - social features - institution-wide
multi-user administration - push notifications - integrations that are
not necessary for core use - elaborate analytics before the underlying
data is trustworthy.

## 13. Definition of done for every prompt

A prompt is complete only when: 1. The relevant code is implemented, not
merely described. 2. Existing behavior is preserved unless a change is
intentional. 3. Relevant checks/tests are run, or inability to run them
is stated. 4. Edge cases and error states are considered. 5.
`PROJECT_PROGRESS.md` is updated. 6. `CHANGE_HISTORY.md` receives a
dated entry for meaningful changes. 7. Any decision or deviation is
recorded in `DECISIONS.md`. 8. The final report states what changed,
what was tested, what remains, and the next recommended prompt.
