import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import type {
  ClassType,
  FieldIssue,
  Semester,
  Subject,
  TimetableSlot,
  TimetableSlotCreateInput,
} from "@gpa/shared";
import { createTimetableSlotInputSchema } from "@gpa/shared";
import { ApiRequestError } from "../api/client";
import { listSemesters } from "../api/semesters";
import {
  createTimetableSlot,
  deleteTimetableSlot,
  listTimetableSlots,
  updateTimetableSlot,
} from "../api/timetable";
import { listSubjects } from "../api/subjects";
import PageHeader from "../components/PageHeader";

const WEEKDAYS: readonly {
  readonly value: number;
  readonly label: string;
  readonly short: string;
}[] = [
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
  { value: 6, label: "Saturday", short: "Sat" },
  { value: 7, label: "Sunday", short: "Sun" },
] as const;

const CLASS_TYPE_LABELS: Record<ClassType, string> = {
  lecture: "Lecture",
  practical: "Practical",
  tutorial: "Tutorial",
  other: "Other",
};

const CLASS_TYPE_TONES: Record<ClassType, string> = {
  lecture: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  practical: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  tutorial: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  other: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};

const STATUS_LABELS: Record<Semester["status"], string> = {
  active: "Current",
  setup: "Draft",
  completed: "Completed",
  archived: "Archived",
};

type LoadFailure =
  | { readonly kind: "unavailable"; readonly message: string }
  | { readonly kind: "signInRequired"; readonly message: string }
  | { readonly kind: "error"; readonly message: string };

type SemestersView =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly semesters: readonly Semester[] }
  | LoadFailure;

type SlotsView =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly slots: readonly TimetableSlot[] }
  | LoadFailure;

type SubjectsView =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly subjects: readonly Subject[] }
  | LoadFailure;

function failureOf(error: unknown): LoadFailure {
  if (error instanceof ApiRequestError) {
    if (error.status === 401) {
      return { kind: "signInRequired", message: error.message };
    }

    if (error.status === 503) {
      return { kind: "unavailable", message: error.message };
    }

    return { kind: "error", message: error.message };
  }

  return {
    kind: "error",
    message: "Could not reach the API. Check that it is running, then retry.",
  };
}

function FailurePanel({
  failure,
  context,
  onRetry,
}: {
  readonly failure: LoadFailure;
  readonly context: "semesters" | "timetable";
  readonly onRetry: () => void;
}) {
  const title =
    failure.kind === "unavailable"
      ? context === "semesters"
        ? "Semesters are unavailable"
        : "Timetable is unavailable"
      : failure.kind === "signInRequired"
        ? "Sign in required"
        : context === "semesters"
          ? "Could not load semesters"
          : "Could not load timetable";

  const tone =
    failure.kind === "unavailable"
      ? "border-amber-400/30 bg-amber-400/5 text-amber-100"
      : failure.kind === "signInRequired"
        ? "border-slate-800 bg-slate-900/40 text-slate-200"
        : "border-rose-400/30 bg-rose-400/5 text-rose-100";

  return (
    <div
      role={failure.kind === "error" ? "alert" : "status"}
      className={`mt-6 rounded-xl border p-5 ${tone}`}
    >
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-2 text-sm leading-relaxed opacity-80">
        {failure.message}
      </p>
      {failure.kind === "signInRequired" ? (
        <Link
          to="/academics"
          className="mt-4 inline-flex rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
        >
          Open Academics to sign in
        </Link>
      ) : null}
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 ml-3 rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
      >
        Retry
      </button>
    </div>
  );
}

function NoSemestersPanel() {
  return (
    <section className="mt-8 rounded-xl border border-dashed border-slate-700 bg-slate-900/30 p-6 text-center">
      <h2 className="text-sm font-semibold text-slate-200">No semesters yet</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-slate-400">
        Timetable slots belong to a semester, so there is nothing to manage
        until one exists. Create a semester first, then come back to build its
        weekly timetable.
      </p>
      <Link
        to="/academics"
        className="mt-4 inline-flex rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
      >
        Go to Academics
      </Link>
    </section>
  );
}

function SemesterContext({
  semesters,
  selected,
  onChange,
}: {
  readonly semesters: readonly Semester[];
  readonly selected: Semester;
  readonly onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
}) {
  const hasActive = semesters.some((semester) => semester.status === "active");

  return (
    <section className="mt-6 rounded-xl border border-slate-800 bg-slate-900/40 p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 flex-1">
          <label
            htmlFor="timetable-semester"
            className="text-xs font-medium tracking-[0.16em] text-slate-500 uppercase"
          >
            Semester
          </label>
          <select
            id="timetable-semester"
            value={selected.id}
            onChange={onChange}
            className="mt-2 w-full max-w-xl rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-400"
          >
            {semesters.map((semester) => (
              <option key={semester.id} value={semester.id}>
                {semester.name} — {STATUS_LABELS[semester.status]} (
                {semester.academicYear})
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col items-start gap-1.5 sm:items-end">
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${selected.status === "active" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : selected.status === "setup" ? "border-slate-400/30 bg-slate-400/10 text-slate-200" : selected.status === "completed" ? "border-indigo-400/30 bg-indigo-400/10 text-indigo-200" : "border-slate-500/30 bg-slate-500/10 text-slate-400"}`}
          >
            {STATUS_LABELS[selected.status]}
          </span>
          <p className="text-xs text-slate-500">
            {selected.academicYear} ·{" "}
            {selected.startDate === null || selected.endDate === null
              ? "Dates not set"
              : `${selected.startDate} → ${selected.endDate}`}
          </p>
        </div>
      </div>

      <p className="mt-4 text-sm leading-relaxed text-slate-400">
        Every slot below belongs only to{" "}
        <span className="font-medium text-slate-200">{selected.name}</span>.
        Switching semesters clears this view and loads the other semester's own
        timetable.
      </p>

      {!hasActive ? (
        <p className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs leading-relaxed text-amber-100/80">
          No semester is current. Showing {selected.name}; you can make a
          semester current from Academics.
        </p>
      ) : null}
    </section>
  );
}

interface FormValues {
  subjectId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room: string;
  classType: ClassType;
  activeFrom: string;
  activeTo: string;
}

const EMPTY_FORM: FormValues = {
  subjectId: "",
  dayOfWeek: 1,
  startTime: "",
  endTime: "",
  room: "",
  classType: "lecture",
  activeFrom: "",
  activeTo: "",
};

function toSlotInput(values: FormValues): TimetableSlotCreateInput {
  return {
    subjectId: values.subjectId,
    dayOfWeek: values.dayOfWeek,
    startTime: values.startTime,
    endTime: values.endTime,
    room: values.room === "" ? null : values.room,
    classType: values.classType,
    activeFrom: values.activeFrom === "" ? null : values.activeFrom,
    activeTo: values.activeTo === "" ? null : values.activeTo,
  };
}

function slotFieldsFromSlot(slot: TimetableSlot): FormValues {
  return {
    subjectId: slot.subjectId,
    dayOfWeek: slot.dayOfWeek,
    startTime: slot.startTime,
    endTime: slot.endTime,
    room: slot.room ?? "",
    classType: slot.classType,
    activeFrom: slot.activeFrom ?? "",
    activeTo: slot.activeTo ?? "",
  };
}

export default function TimetablePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const requestedSemesterId = searchParams.get("semester");

  const [semestersView, setSemestersView] = useState<SemestersView>({
    kind: "loading",
  });
  const [slotsView, setSlotsView] = useState<SlotsView>({ kind: "loading" });
  const [subjectsView, setSubjectsView] = useState<SubjectsView>({
    kind: "loading",
  });
  const [slotsReloadToken, setSlotsReloadToken] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [formSlotId, setFormSlotId] = useState<string | null>(null);
  const [values, setValues] = useState<FormValues>(EMPTY_FORM);
  const [formIssues, setFormIssues] = useState<readonly FieldIssue[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [formPending, setFormPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    listSemesters()
      .then((semesters) => {
        if (active) {
          setSemestersView({ kind: "ready", semesters });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setSemestersView(failureOf(error));
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const selectedSemester =
    semestersView.kind === "ready"
      ? (semestersView.semesters.find(
          (semester) => semester.id === requestedSemesterId,
        ) ??
        semestersView.semesters.find(
          (semester) => semester.status === "active",
        ) ??
        semestersView.semesters[0] ??
        null)
      : null;

  const selectedSemesterId = selectedSemester?.id ?? null;

  useEffect(() => {
    if (selectedSemesterId === null) {
      return;
    }

    if (requestedSemesterId === selectedSemesterId) {
      return;
    }

    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set("semester", selectedSemesterId);
        return next;
      },
      { replace: true },
    );
  }, [selectedSemesterId, requestedSemesterId, setSearchParams]);

  function changeSemester(event: ChangeEvent<HTMLSelectElement>): void {
    const target = event.target.value;

    if (target === selectedSemesterId) {
      return;
    }

    // Reset transient editor state when the semester changes so a slot
    // from one semester is never edited in another's context.
    setFormOpen(false);
    setFormSlotId(null);
    setValues(EMPTY_FORM);
    setFormIssues([]);
    setFormError(null);
    setConfirmDelete(null);

    const next = new URLSearchParams(searchParams);
    next.set("semester", target);

    navigate({
      pathname: "/timetable",
      search: `?${next.toString()}`,
    });
  }

  function retrySemesters(): void {
    setSemestersView({ kind: "loading" });
  }

  useEffect(() => {
    if (selectedSemester === null) {
      return;
    }

    let active = true;
    const controller = new AbortController();

    listTimetableSlots(selectedSemester.id, controller.signal)
      .then((slots) => {
        if (active) {
          setSlotsView({ kind: "ready", slots });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setSlotsView(failureOf(error));
        }
      });

    listSubjects(selectedSemester.id, controller.signal)
      .then((subjects) => {
        if (active) {
          setSubjectsView({ kind: "ready", subjects });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setSubjectsView(failureOf(error));
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedSemester, slotsReloadToken]);

  function reloadSlots(): void {
    setSlotsView({ kind: "loading" });
    setSlotsReloadToken((token) => token + 1);
  }

  function retryTimetable(): void {
    reloadSlots();
  }

  function issueFor(path: string): string | undefined {
    return formIssues.find((issue) => issue.path === path)?.message;
  }

  function openCreate(dayOfWeek?: number): void {
    setValues(
      dayOfWeek === undefined ? EMPTY_FORM : { ...EMPTY_FORM, dayOfWeek },
    );
    setFormIssues([]);
    setFormError(null);
    setFormSlotId(null);
    setFormMode("create");
    setFormOpen(true);
  }

  function openEdit(slot: TimetableSlot): void {
    setValues(slotFieldsFromSlot(slot));
    setFormIssues([]);
    setFormError(null);
    setFormSlotId(slot.id);
    setFormMode("edit");
    setFormOpen(true);
  }

  function closeForm(): void {
    setFormOpen(false);
    setFormSlotId(null);
    setValues(EMPTY_FORM);
    setFormIssues([]);
    setFormError(null);
  }

  async function submitForm(event: FormEvent): Promise<void> {
    event.preventDefault();

    setFormIssues([]);
    setFormError(null);
    setFormPending(true);

    try {
      const input = toSlotInput(values);
      const parsed = createTimetableSlotInputSchema.safeParse(input);

      if (!parsed.success) {
        setFormIssues(
          parsed.error.issues.map((issue) => ({
            path: String(issue.path[0] ?? "slot"),
            message: issue.message,
          })),
        );
        return;
      }

      if (formMode === "create") {
        await createTimetableSlot(selectedSemesterId!, parsed.data);
        setNotice("Timetable slot was added.");
      } else {
        if (formSlotId === null) {
          throw new Error("No slot to edit");
        }

        await updateTimetableSlot(selectedSemesterId!, formSlotId, parsed.data);
        setNotice("Slot was saved.");
      }

      closeForm();
      reloadSlots();
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 422) {
        setFormIssues(error.issues);
        setFormError(error.message);
      } else if (error instanceof ApiRequestError && error.status === 404) {
        closeForm();
        setNotice("That slot no longer exists. Refreshing the timetable.");
        reloadSlots();
      } else if (
        error instanceof ApiRequestError &&
        (error.status === 401 || error.status === 503)
      ) {
        closeForm();
        setSemestersView(failureOf(error));
      } else {
        setFormError(
          error instanceof ApiRequestError
            ? error.message
            : "Could not save the slot. Try again.",
        );
      }
    } finally {
      setFormPending(false);
    }
  }

  async function requestDelete(slotId: string): Promise<void> {
    setConfirmDelete(slotId);
  }

  function cancelDelete(): void {
    setConfirmDelete(null);
  }

  async function confirmSlotDelete(slotId: string): Promise<void> {
    setDeletePending(slotId);
    setConfirmDelete(null);

    try {
      await deleteTimetableSlot(selectedSemesterId!, slotId);
      setNotice("Slot was removed.");
      reloadSlots();
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 404) {
        // The slot is already gone; reflect that in the timetable.
        reloadSlots();
        return;
      }

      setNotice(
        error instanceof ApiRequestError
          ? error.message
          : "Could not remove the slot. Try again.",
      );
    } finally {
      setDeletePending(null);
    }
  }

  const subjectsById = useMemo(
    () =>
      new Map(
        (subjectsView.kind === "ready"
          ? subjectsView.subjects
          : ([] as readonly Subject[])
        ).map((subject) => [subject.id, subject] as const),
      ),
    [subjectsView],
  );

  const slotsByDay = useMemo(() => {
    const map = new Map<number, TimetableSlot[]>();

    for (const slot of slotsView.kind === "ready" ? slotsView.slots : []) {
      const day = map.get(slot.dayOfWeek) ?? [];
      day.push(slot);
      map.set(slot.dayOfWeek, day);
    }

    for (const day of map.values()) {
      day.sort((a, b) =>
        a.startTime < b.startTime ? -1 : a.startTime > b.startTime ? 1 : 0,
      );
    }

    return map;
  }, [slotsView]);

  if (semestersView.kind === "loading") {
    return (
      <>
        <PageHeader
          title="Timetable"
          description="Your recurring weekly classes, one slot at a time, for the semester you are in."
        />
        <p
          role="status"
          className="mt-8 text-sm text-slate-400"
          aria-busy="true"
        >
          Loading semesters…
        </p>
      </>
    );
  }

  if (
    semestersView.kind === "unavailable" ||
    semestersView.kind === "signInRequired" ||
    semestersView.kind === "error"
  ) {
    return (
      <>
        <PageHeader
          title="Timetable"
          description="Your recurring weekly classes, one slot at a time, for the semester you are in."
        />
        <FailurePanel
          failure={semestersView}
          context="semesters"
          onRetry={retrySemesters}
        />
      </>
    );
  }

  if (semestersView.semesters.length === 0) {
    return (
      <>
        <PageHeader
          title="Timetable"
          description="Your recurring weekly classes, one slot at a time, for the semester you are in."
        />
        <NoSemestersPanel />
      </>
    );
  }

  if (selectedSemester === null) {
    return (
      <>
        <PageHeader
          title="Timetable"
          description="Your recurring weekly classes, one slot at a time, for the semester you are in."
        />
        <NoSemestersPanel />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Timetable"
        description={`Your recurring weekly classes for ${selectedSemester.name}. Slots are weekly rules, not dated classes — they are reviewed here and turned into dated occurrences later.`}
      />

      {notice !== null ? (
        <p
          role="status"
          className="mt-4 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100"
        >
          {notice}
        </p>
      ) : null}

      <SemesterContext
        semesters={semestersView.semesters}
        selected={selectedSemester}
        onChange={changeSemester}
      />

      {formOpen ? (
        <section className="mt-8 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <h3 className="text-sm font-semibold text-slate-200">
            {formMode === "create" ? "Add a timetable slot" : "Edit slot"}
          </h3>

          {formError !== null ? (
            <p
              role="alert"
              className="mt-3 rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-100"
            >
              {formError}
            </p>
          ) : null}

          <form
            onSubmit={(event) => void submitForm(event)}
            className="mt-4 grid gap-4 sm:grid-cols-2"
          >
            <label className="flex flex-col gap-1.5 text-sm text-slate-300">
              Subject
              <select
                required
                value={values.subjectId}
                onChange={(event) =>
                  setValues({ ...values, subjectId: event.target.value })
                }
                aria-invalid={issueFor("subjectId") !== undefined}
                className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-400"
              >
                <option value="">Choose a subject</option>
                {subjectsView.kind === "ready" &&
                  subjectsView.subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
              </select>
              {issueFor("subjectId") !== undefined ? (
                <span className="text-xs text-rose-300">
                  {issueFor("subjectId")}
                </span>
              ) : null}
            </label>

            <label className="flex flex-col gap-1.5 text-sm text-slate-300">
              Day of week
              <select
                required
                value={String(values.dayOfWeek)}
                onChange={(event) =>
                  setValues({
                    ...values,
                    dayOfWeek: Number(event.target.value),
                  })
                }
                aria-invalid={issueFor("dayOfWeek") !== undefined}
                className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-400"
              >
                {WEEKDAYS.map((day) => (
                  <option key={day.value} value={String(day.value)}>
                    {day.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5 text-sm text-slate-300">
              Start time
              <input
                id="slot-start-time"
                required
                type="time"
                value={values.startTime}
                onChange={(event) =>
                  setValues({ ...values, startTime: event.target.value })
                }
                aria-invalid={issueFor("startTime") !== undefined}
                className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-400"
              />
              {issueFor("startTime") !== undefined ? (
                <span className="text-xs text-rose-300">
                  {issueFor("startTime")}
                </span>
              ) : null}
            </label>

            <label className="flex flex-col gap-1.5 text-sm text-slate-300">
              End time
              <input
                id="slot-end-time"
                required
                type="time"
                value={values.endTime}
                onChange={(event) =>
                  setValues({ ...values, endTime: event.target.value })
                }
                aria-invalid={issueFor("endTime") !== undefined}
                className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-400"
              />
              {issueFor("endTime") !== undefined ? (
                <span className="text-xs text-rose-300">
                  {issueFor("endTime")}
                </span>
              ) : null}
            </label>

            <label className="flex flex-col gap-1.5 text-sm text-slate-300">
              Room
              <input
                id="slot-room"
                type="text"
                maxLength={80}
                value={values.room}
                onChange={(event) =>
                  setValues({ ...values, room: event.target.value })
                }
                placeholder="Room 101"
                aria-invalid={issueFor("room") !== undefined}
                className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-400"
              />
              <p className="text-xs text-slate-500">
                Optional. 1–80 characters.
              </p>
              {issueFor("room") !== undefined ? (
                <span className="text-xs text-rose-300">
                  {issueFor("room")}
                </span>
              ) : null}
            </label>

            <label className="flex flex-col gap-1.5 text-sm text-slate-300">
              Class type
              <select
                value={values.classType}
                onChange={(event) =>
                  setValues({
                    ...values,
                    classType: event.target.value as ClassType,
                  })
                }
                className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-400"
              >
                {Object.entries(CLASS_TYPE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5 text-sm text-slate-300 sm:col-span-2">
              Active from
              <input
                id="slot-active-from"
                type="date"
                value={values.activeFrom}
                onChange={(event) =>
                  setValues({ ...values, activeFrom: event.target.value })
                }
                aria-invalid={issueFor("activeFrom") !== undefined}
                className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-400"
              />
              <p className="text-xs text-slate-500">
                Optional. Leave blank for the whole semester.
              </p>
              {issueFor("activeFrom") !== undefined ? (
                <span className="text-xs text-rose-300">
                  {issueFor("activeFrom")}
                </span>
              ) : null}
            </label>

            <label className="flex flex-col gap-1.5 text-sm text-slate-300 sm:col-span-2">
              Active to
              <input
                id="slot-active-to"
                type="date"
                value={values.activeTo}
                onChange={(event) =>
                  setValues({ ...values, activeTo: event.target.value })
                }
                aria-invalid={issueFor("activeTo") !== undefined}
                className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-400"
              />
              <p className="text-xs text-slate-500">
                Optional. Leave blank for the whole semester.
              </p>
              {issueFor("activeTo") !== undefined ? (
                <span className="text-xs text-rose-300">
                  {issueFor("activeTo")}
                </span>
              ) : null}
            </label>

            <div className="mt-4 flex gap-3">
              <button
                type="submit"
                disabled={formPending}
                className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
              >
                {formPending
                  ? formMode === "create"
                    ? "Adding…"
                    : "Saving…"
                  : formMode === "create"
                    ? "Add slot"
                    : "Save slot"}
              </button>
              <button
                type="button"
                onClick={closeForm}
                disabled={formPending}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {slotsView.kind === "loading" ? (
        <p
          role="status"
          className="mt-8 text-sm text-slate-400"
          aria-busy="true"
        >
          Loading timetable…
        </p>
      ) : null}

      {slotsView.kind === "unavailable" ||
      slotsView.kind === "signInRequired" ||
      slotsView.kind === "error" ? (
        <FailurePanel
          failure={slotsView}
          context="timetable"
          onRetry={retryTimetable}
        />
      ) : null}

      {slotsView.kind === "ready" &&
      slotsView.slots.length === 0 &&
      !formOpen ? (
        <section className="mt-8 rounded-xl border border-dashed border-slate-700 bg-slate-900/30 p-6 text-center">
          <h2 className="text-sm font-semibold text-slate-200">
            No timetable slots yet
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Add the first recurring class for {selectedSemester.name}. Pick a
            day, a time range, and a subject.
          </p>
          <button
            type="button"
            onClick={() => void openCreate()}
            className="mt-4 rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
          >
            Add the first slot
          </button>
        </section>
      ) : null}

      {slotsView.kind === "ready" && slotsView.slots.length > 0 ? (
        <>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold tracking-wide text-slate-300 uppercase">
              Weekly timetable
            </h2>
            <button
              type="button"
              onClick={() => void openCreate()}
              className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
            >
              Add slot
            </button>
          </div>

          <div
            role="grid"
            aria-label={`Weekly timetable for ${selectedSemester.name}`}
            className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-3"
          >
            {WEEKDAYS.map((day) => {
              const daySlots = slotsByDay.get(day.value) ?? [];

              return (
                <div
                  key={day.value}
                  role="rowheader"
                  className="border border-slate-800 rounded-xl bg-slate-900/40 p-4 flex flex-col"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-slate-200">
                      {day.short}
                    </h3>
                    <button
                      type="button"
                      onClick={() => void openCreate(day.value)}
                      className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
                    >
                      Add
                    </button>
                  </div>

                  {daySlots.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center">
                      No classes
                    </p>
                  ) : null}

                  <ul className="flex flex-col gap-2">
                    {daySlots.map((slot) => {
                      const subject = subjectsById.get(slot.subjectId);
                      const activeRange =
                        slot.activeFrom !== null && slot.activeTo !== null
                          ? `Active ${slot.activeFrom} → ${slot.activeTo}`
                          : null;

                      return (
                        <li
                          key={slot.id}
                          className="rounded-lg border border-slate-700 bg-slate-950/50 p-3"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-white truncate">
                                {subject === null || subject === undefined
                                  ? "(subject)"
                                  : subject.name}
                              </p>
                              <p className="mt-1 text-xs text-slate-400">
                                {slot.startTime} – {slot.endTime}
                              </p>
                              {slot.room !== null ? (
                                <p className="mt-0.5 text-xs text-slate-500">
                                  {slot.room}
                                </p>
                              ) : null}
                              <span
                                className={`inline-flex mt-1.5 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${CLASS_TYPE_TONES[slot.classType]}`}
                              >
                                {CLASS_TYPE_LABELS[slot.classType]}
                              </span>
                              {activeRange !== null ? (
                                <p className="mt-1 text-[10px] text-slate-500">
                                  {activeRange}
                                </p>
                              ) : null}
                            </div>

                            <div className="flex flex-col sm:flex-row gap-2">
                              <button
                                type="button"
                                onClick={() => void openEdit(slot)}
                                disabled={
                                  formPending || deletePending === slot.id
                                }
                                className="rounded-lg border border-indigo-500/50 bg-indigo-500/10 px-2.5 py-1.5 text-xs font-medium text-indigo-300 transition-colors hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => void requestDelete(slot.id)}
                                disabled={
                                  formPending || deletePending === slot.id
                                }
                                className="rounded-lg border border-rose-500/50 bg-rose-500/10 px-2.5 py-1.5 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
                              >
                                {confirmDelete === slot.id
                                  ? "Remove?"
                                  : "Remove"}
                              </button>
                              {confirmDelete === slot.id ? (
                                <div className="mt-1.5 flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void confirmSlotDelete(slot.id)
                                    }
                                    disabled={deletePending === slot.id}
                                    className="rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
                                  >
                                    {deletePending === slot.id
                                      ? "Removing…"
                                      : "Yes, remove"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={cancelDelete}
                                    disabled={deletePending === slot.id}
                                    className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>

          <p className="mt-6 text-xs text-slate-500">
            Slots are weekly rules, not dated classes. A slot is removed from
            the live timetable when you remove it here; dated classes that
            already exist are untouched (dated classes arrive with P15).
          </p>
        </>
      ) : null}
    </>
  );
}
