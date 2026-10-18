# Decision Log --- The GPA Project

Record durable decisions here. New decisions should be appended with an
ID and date. Do not silently overwrite an earlier decision; mark it
superseded and explain why.

## D001 --- Product name

-   **Date:** 2026-10-18
-   **Decision:** The product is named **The GPA Project**.
-   **Reason:** The scope includes the broader college workflow, not
    only GPA calculation.

## D002 --- Timetable is configurable data

-   **Date:** 2026-10-18
-   **Decision:** The student manually enters recurring timetable slots
    once per semester; the timetable must not be hardcoded.
-   **Implication:** All timetable behavior is driven by persisted
    semester-specific records.

## D003 --- Semester history is preserved

-   **Date:** 2026-10-18
-   **Decision:** A new semester must not erase prior semester
    statistics or records.
-   **Implication:** Subjects and academic records are scoped to
    semester offerings; archived semesters remain readable.

## D004 --- Date-specific holidays

-   **Date:** 2026-10-18
-   **Decision:** The user can mark any date as a holiday with an
    optional reason.
-   **Implication:** Holiday is a calendar exception; it does not mutate
    the recurring timetable and does not count as absence.

## D005 --- Date-specific schedule overrides

-   **Date:** 2026-10-18
-   **Decision:** Support a one-day special schedule separately from the
    weekly timetable.
-   **Implication:** A special day can follow another weekday or use a
    custom set of classes without changing the recurring pattern.

## D006 --- Tasks are a first-class feature

-   **Date:** 2026-10-18
-   **Decision:** Task management is central, not an add-on.
-   **Implication:** Quick capture, Inbox, due dates, priorities,
    statuses, views, and optional subject/topic/semester links are core
    requirements.

## D007 --- Technical stack is inspected, not assumed

-   **Date:** 2026-10-18
-   **Decision:** Prior stack knowledge is a starting hypothesis only.
-   **Implication:** Mimo must inspect the current repository and
    preserve its existing working stack unless a documented, approved
    reason supports change.

## D008 --- GPA formula must be confirmed

-   **Date:** 2026-10-18
-   **Decision:** Do not assume the institution's grade scale or
    SGPA/CGPA formula.
-   **Implication:** GPA calculations are deferred until the user
    provides/approves the actual rules.
