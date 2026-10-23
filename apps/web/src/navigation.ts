/**
 * One source of truth for the application shell's navigation.
 *
 * Every planned module appears here exactly once: the shell renders its
 * navigation from this list and the router renders a page for each entry,
 * so a link can never point at a route that does not exist.
 *
 * Milestones are the canonical prompt IDs from `MIMO_DAILY_PROMPTS.md`
 * (D010). They are shown on placeholder pages so the owner can see what
 * is actually next, and they deliberately avoid promising a date.
 */

export type ModuleStatus = "planned" | "blocked";

export const MODULE_STATUS_LABELS: Record<ModuleStatus, string> = {
  planned: "Planned",
  blocked: "Blocked",
};

/** A module that has a route but no implementation yet. */
export interface PlannedModule {
  readonly path: string;
  readonly label: string;
  readonly group: "workspace" | "later";
  readonly status: ModuleStatus;
  readonly milestone: string;
  readonly summary: string;
  readonly planned: readonly string[];
}

/** What the sidebar needs; planned modules satisfy this shape. */
export interface NavigationItem {
  readonly path: string;
  readonly label: string;
  readonly status?: ModuleStatus;
}

export interface NavigationGroup {
  readonly label: string;
  readonly items: readonly NavigationItem[];
}

export const plannedModules: readonly PlannedModule[] = [
  {
    path: "/tasks",
    label: "Tasks",
    group: "workspace",
    status: "planned",
    milestone: "P21–P26",
    summary:
      "Capture work the moment it appears, and see only what is actually due.",
    planned: [
      "Quick add that needs nothing but a title",
      "Inbox, today, upcoming, overdue, and completed views",
      "Priorities, due dates, and estimated time",
      "Optional links to a subject or semester, never required",
    ],
  },
  {
    path: "/timetable",
    label: "Timetable",
    group: "workspace",
    status: "planned",
    milestone: "P11–P16",
    summary:
      "The weekly pattern entered once, and the dated exceptions that never rewrite it.",
    planned: [
      "Recurring weekly slots for the active semester",
      "Holidays and one-day special schedules, stored per date",
      "Weekly and calendar views, with recurring rules kept visually distinct from dated classes",
    ],
  },
  {
    path: "/attendance",
    label: "Attendance",
    group: "workspace",
    status: "planned",
    milestone: "P17–P20",
    summary:
      "A record of what actually happened in each class, not an assumption.",
    planned: [
      "Marking per dated class occurrence, with unmarked kept separate from absent",
      "Per-subject and semester attendance percentages",
      "History that stays stable when the timetable changes later",
    ],
  },
  {
    path: "/academics",
    label: "Academics",
    group: "workspace",
    status: "planned",
    milestone: "P07–P10",
    summary: "Semesters and the subjects that belong to them.",
    planned: [
      "Create, activate, and archive a semester without losing earlier ones",
      "Subjects scoped to a semester, so a repeated name stays a separate subject",
      "Changing the active semester never mixes two semesters' data",
    ],
  },
  {
    path: "/exams",
    label: "Exams",
    group: "later",
    status: "planned",
    milestone: "P30–P34",
    summary: "Assessments with dates, so preparation has a timeline.",
    planned: [
      "Exams and assessments with dates and weights",
      "Topics and preparation progress per subject",
      "A weekly review of what is coming",
    ],
  },
  {
    path: "/gpa",
    label: "GPA",
    group: "later",
    status: "blocked",
    milestone: "P35–P39",
    summary:
      "Semester and cumulative GPA, calculated only from rules you confirm.",
    planned: [
      "Your institution's grade scale and SGPA/CGPA formula, recorded first",
      "Credit-aware calculation that shows the formula instead of hiding it",
      "Projections that report incomplete data instead of treating it as zero",
    ],
  },
  {
    path: "/history",
    label: "History",
    group: "later",
    status: "planned",
    milestone: "P20, P42",
    summary: "Past semesters stay readable after they end.",
    planned: [
      "Archived semesters with their own attendance and academic record",
      "Corrections that keep an audit trail",
      "Export and backup, so the data stays portable",
    ],
  },
];

const today: NavigationItem = { path: "/", label: "Today" };

export const navigationGroups: readonly NavigationGroup[] = [
  {
    label: "Workspace",
    items: [
      today,
      ...plannedModules.filter((module) => module.group === "workspace"),
    ],
  },
  {
    label: "Later phases",
    items: plannedModules.filter((module) => module.group === "later"),
  },
];

/** The navigation entry for an exact path, if one exists. */
export function findNavigationItem(
  pathname: string,
): NavigationItem | undefined {
  for (const group of navigationGroups) {
    const match = group.items.find((item) => item.path === pathname);

    if (match) {
      return match;
    }
  }

  return undefined;
}
