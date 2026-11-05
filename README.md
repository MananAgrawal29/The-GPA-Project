# The GPA Project

> **College life, a little more organized.**

The GPA Project is a personal college-management app built to bring academic life into one calm, connected place. It starts with the foundations—semesters and subjects—with a broader vision of helping students keep track of the moving parts of college without losing sight of the whole.

**Early development · Not a finished product**

## One place for the pieces of college

College work is spread across schedules, subject lists, deadlines, attendance records, and grades. The project aims to make those pieces easier to organize together, while keeping each semester's academic record distinct and useful over time.

The long-term direction includes planning a week, tracking what happened in class, managing work ahead, and understanding academic progress. These are goals for the project, not features that are already available.

## What works today

### Semester management

Create, edit, and activate semesters, and keep past terms organized.

### Subjects by semester

Add subjects to a semester, browse its list, open a subject, and edit it. Switching semesters keeps each subject list in its own context.

These are the project's implemented product features today. The **Today** screen and the other module routes are still placeholders.

## Where it could go

| Area | Status |
| --- | --- |
| Timetable and class planning | Planned |
| Attendance and class history | Planned |
| Tasks and study planning | Planned |
| Exams, topics, and progress | Planned |
| Semester history and export | Planned |
| GPA calculation | Planned; grading rules need to be confirmed first |

GPA calculation is **not implemented**.

## A small, modern foundation

- **Web:** React, TypeScript, Vite, Tailwind CSS
- **API and data:** Node.js, Express, PostgreSQL, Drizzle ORM
- **Sign-in and workspace:** Clerk, pnpm

## Try it locally

Requires Node.js 22.22+ and pnpm 11.

```sh
pnpm install
pnpm dev
```

The app shell runs locally without credentials. Semester and subject data require database and sign-in configuration; see [project progress](PROJECT_PROGRESS.md) for the current implementation notes.

## Project status

The project is under active development. Semester management and subject management are implemented; the next planned work is timetable design.

[Project progress](PROJECT_PROGRESS.md) · [Roadmap](ROADMAP.md) · [Change history](CHANGE_HISTORY.md)
