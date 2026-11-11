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
  DayException,
  DayExceptionSlot,
  FieldIssue,
  Semester,
  Subject,
  DayExceptionKind,
  DayExceptionPatch,
  CreateDayExceptionInput,
  CreateDayExceptionSlotInput,
  DayExceptionSlotPatch,
} from "@gpa/shared";
import { ApiRequestError } from "../api/client";
import { listSemesters } from "../api/semesters";
import { listSubjects } from "../api/subjects";
import {
  createDayException,
  deleteDayException,
  listDayExceptions,
  updateDayException,
} from "../api/day-exceptions";
import {
  createDayExceptionSlot,
  deleteDayExceptionSlot,
  listDayExceptionSlots,
  updateDayExceptionSlot,
} from "../api/day-exceptions";
import PageHeader from "../components/PageHeader";

const WEEKDAYS: readonly {
  readonly value: number;
  readonly label: string;
  readonly short: string;
}[] = [
  { value: 0, label: "Sunday", short: "Sun" },
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
  { value: 6, label: "Saturday", short: "Sat" },
] as const;

const MONTHS: readonly {
  readonly value: number;
  readonly label: string;
}[] = [
  { value: 0, label: "January" },
  { value: 1, label: "February" },
  { value: 2, label: "March" },
  { value: 3, label: "April" },
  { value: 4, label: "May" },
  { value: 5, label: "June" },
  { value: 6, label: "July" },
  { value: 7, label: "August" },
  { value: 8, label: "September" },
  { value: 9, label: "October" },
  { value: 10, label: "November" },
  { value: 11, label: "December" },
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

const KIND_LABELS: Record<DayExceptionKind, string> = {
  holiday: "Holiday",
  special_schedule: "Special Schedule",
};

const KIND_TONES: Record<DayExceptionKind, string> = {
  holiday: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  special_schedule: "bg-amber-500/15 text-amber-300 border-amber-500/30",
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

type ExceptionsView =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly exceptions: readonly DayException[] }
  | LoadFailure;

type SubjectsView =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly subjects: readonly Subject[] }
  | LoadFailure;

type SlotsView =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly slots: readonly DayExceptionSlot[] }
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
  readonly context: "semesters" | "exceptions" | "slots";
  readonly onRetry: () => void;
}) {
  const title =
    failure.kind === "unavailable"
      ? context === "semesters"
        ? "Semesters are unavailable"
        : context === "exceptions"
          ? "Exceptions are unavailable"
          : "Slots are unavailable"
      : failure.kind === "signInRequired"
        ? "Sign in required"
        : context === "semesters"
          ? "Could not load semesters"
          : context === "exceptions"
            ? "Could not load exceptions"
            : "Could not load slots";

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
        Exceptions belong to a semester, so there is nothing to manage until one
        exists. Create a semester first, then come back to manage its
        exceptions.
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
            htmlFor="calendar-semester"
            className="text-xs font-medium tracking-[0.16em] text-slate-500 uppercase"
          >
            Semester
          </label>
          <select
            id="calendar-semester"
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
        Every exception below belongs only to{" "}
        <span className="font-medium text-slate-200">{selected.name}</span>.
        Switching semesters clears this view and loads the other semester's own
        exceptions.
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

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function formatMonthYear(date: Date): string {
  const month = MONTHS[date.getMonth()];
  if (!month) {
    return `${date.getFullYear()}`;
  }
  return `${month.label} ${date.getFullYear()}`;
}

function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function dateToString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Index into `WEEKDAYS` (0 = Sunday) for a date-only `YYYY-MM-DD` value.
 *
 * The components are read directly and the weekday is taken in UTC, so no
 * local timezone can shift a date-only value onto an adjacent day (D034).
 * Parsing the string as an instant, as `new Date(iso)` does, is avoided on
 * purpose: west of UTC it reports the previous day's weekday.
 */
function weekdayIndexFromIsoDate(iso: string): number {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

type _ExceptionFormMode = "create" | "edit";
type _SlotFormMode = "create" | "edit";

interface ExceptionFormValues {
  date: string;
  kind: "holiday" | "special_schedule";
  reason: string;
}

interface SlotFormValues {
  subjectId: string;
  startTime: string;
  endTime: string;
  room: string;
  classType: "lecture" | "practical" | "tutorial" | "other";
}

const EMPTY_EXCEPTION_FORM: ExceptionFormValues = {
  date: "",
  kind: "holiday",
  reason: "",
};

const EMPTY_SLOT_FORM: SlotFormValues = {
  subjectId: "",
  startTime: "",
  endTime: "",
  room: "",
  classType: "lecture",
};

export default function CalendarPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const requestedSemesterId = searchParams.get("semester");

  const [semestersView, setSemestersView] = useState<SemestersView>({
    kind: "loading",
  });
  const [exceptionsView, setExceptionsView] = useState<ExceptionsView>({
    kind: "loading",
  });
  const [subjectsView, setSubjectsView] = useState<SubjectsView>({
    kind: "loading",
  });
  const [slotsView, setSlotsView] = useState<SlotsView>({ kind: "loading" });

  const [selectedExceptionId, setSelectedExceptionId] = useState<string | null>(
    null,
  );
  const [exceptionReloadToken, setExceptionReloadToken] = useState(0);
  const [slotsReloadToken, setSlotsReloadToken] = useState(0);

  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [exceptionFormOpen, setExceptionFormOpen] = useState(false);
  const [exceptionFormMode, setExceptionFormMode] = useState<"create" | "edit">(
    "create",
  );
  const [editingExceptionId, setEditingExceptionId] = useState<string | null>(
    null,
  );
  const [exceptionValues, setExceptionValues] = useState<ExceptionFormValues>({
    date: "",
    kind: "holiday",
    reason: "",
  });
  const [exceptionFormIssues, setExceptionFormIssues] = useState<
    readonly FieldIssue[]
  >([]);
  const [exceptionFormError, setExceptionFormError] = useState<string | null>(
    null,
  );
  const [exceptionFormPending, setExceptionFormPending] = useState(false);

  const [slotFormOpen, setSlotFormOpen] = useState(false);
  const [slotFormMode, setSlotFormMode] = useState<"create" | "edit">("create");
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [slotValues, setSlotValues] = useState<SlotFormValues>({
    subjectId: "",
    startTime: "",
    endTime: "",
    room: "",
    classType: "lecture",
  });
  const [slotFormIssues, setSlotFormIssues] = useState<readonly FieldIssue[]>(
    [],
  );
  const [slotFormError, setSlotFormError] = useState<string | null>(null);
  const [slotFormPending, setSlotFormPending] = useState(false);

  const [_confirmDeleteException, setConfirmDeleteException] = useState<
    string | null
  >(null);
  const [_confirmDeleteSlot, setConfirmDeleteSlot] = useState<string | null>(
    null,
  );
  const [_deletePending, setDeletePending] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
        next.set("semester", selectedSemesterId!);
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

    setSelectedExceptionId(null);
    setExceptionFormOpen(false);
    setSlotFormOpen(false);

    const next = new URLSearchParams(searchParams);
    next.set("semester", target);

    navigate({
      pathname: "/calendar",
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

    listDayExceptions(selectedSemester.id, controller.signal)
      .then((exceptions) => {
        if (active) {
          setExceptionsView({ kind: "ready", exceptions });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setExceptionsView(failureOf(error));
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
  }, [selectedSemester, exceptionReloadToken]);

  useEffect(() => {
    if (selectedExceptionId === null || selectedSemester === null) {
      return;
    }

    let active = true;
    const controller = new AbortController();

    listDayExceptionSlots(
      selectedSemester.id,
      selectedExceptionId,
      controller.signal,
    )
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

    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedExceptionId, selectedSemester, slotsReloadToken]);

  function reloadExceptions(): void {
    setExceptionsView({ kind: "loading" });
    setExceptionReloadToken((token) => token + 1);
  }

  function reloadSlots(): void {
    setSlotsView({ kind: "loading" });
    setSlotsReloadToken((token) => token + 1);
  }

  function retrySlots(): void {
    reloadSlots();
  }

  function issueFor(
    path: string,
    issues: readonly FieldIssue[],
  ): string | undefined {
    return issues.find((issue) => issue.path === path)?.message;
  }

  function openCreateException(date?: string): void {
    setExceptionValues(
      date === undefined
        ? EMPTY_EXCEPTION_FORM
        : { ...EMPTY_EXCEPTION_FORM, date },
    );
    setExceptionFormIssues([]);
    setExceptionFormError(null);
    setEditingExceptionId(null);
    setExceptionFormMode("create");
    setExceptionFormOpen(true);
  }

  function openEditException(exception: DayException): void {
    setExceptionValues({
      date: exception.date,
      kind: exception.kind,
      reason: exception.reason ?? "",
    });
    setExceptionFormIssues([]);
    setExceptionFormError(null);
    setEditingExceptionId(exception.id);
    setExceptionFormMode("edit");
    setExceptionFormOpen(true);
  }

  function closeExceptionForm(): void {
    setExceptionFormOpen(false);
    setEditingExceptionId(null);
    setExceptionValues(EMPTY_EXCEPTION_FORM);
    setExceptionFormIssues([]);
    setExceptionFormError(null);
  }

  async function submitExceptionForm(event: FormEvent): Promise<void> {
    event.preventDefault();

    setExceptionFormIssues([]);
    setExceptionFormError(null);
    setExceptionFormPending(true);

    try {
      const input: CreateDayExceptionInput = {
        date: exceptionValues.date,
        kind: exceptionValues.kind,
        reason: exceptionValues.reason === "" ? null : exceptionValues.reason,
      };

      if (exceptionFormMode === "create") {
        await createDayException(selectedSemesterId!, input);
        setNotice("Exception was added.");
      } else {
        if (editingExceptionId === null) {
          throw new Error("No exception to edit");
        }

        const patch: DayExceptionPatch = {
          date: exceptionValues.date,
          kind: exceptionValues.kind,
          reason: exceptionValues.reason === "" ? null : exceptionValues.reason,
        };
        await updateDayException(
          selectedSemesterId!,
          editingExceptionId,
          patch,
        );
        setNotice("Exception was saved.");
      }

      closeExceptionForm();
      reloadExceptions();
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 422) {
        setExceptionFormIssues(error.issues);
        setExceptionFormError(error.message);
      } else if (error instanceof ApiRequestError && error.status === 404) {
        closeExceptionForm();
        setNotice("That exception no longer exists. Refreshing.");
        reloadExceptions();
      } else if (
        error instanceof ApiRequestError &&
        (error.status === 401 || error.status === 503)
      ) {
        closeExceptionForm();
        setExceptionsView(failureOf(error));
      } else {
        setExceptionFormError(
          error instanceof ApiRequestError
            ? error.message
            : "Could not save the exception. Try again.",
        );
      }
    } finally {
      setExceptionFormPending(false);
    }
  }

  async function requestDeleteException(exceptionId: string): Promise<void> {
    setConfirmDeleteException(exceptionId);
  }

  function _cancelDeleteException(): void {
    setConfirmDeleteException(null);
  }

  async function _confirmDeleteExceptionHandler(
    exceptionId: string,
  ): Promise<void> {
    setDeletePending(exceptionId);
    setConfirmDeleteException(null);

    try {
      await deleteDayException(selectedSemesterId!, exceptionId);
      setNotice("Exception was removed.");
      reloadExceptions();
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 404) {
        reloadExceptions();
        return;
      }

      setNotice(
        error instanceof ApiRequestError
          ? error.message
          : "Could not remove the exception. Try again.",
      );
    } finally {
      setDeletePending(null);
    }
  }

  function openCreateSlot(): void {
    if (selectedExceptionId === null) return;
    setSlotValues(EMPTY_SLOT_FORM);
    setSlotFormIssues([]);
    setSlotFormError(null);
    setEditingSlotId(null);
    setSlotFormMode("create");
    setSlotFormOpen(true);
  }

  function openEditSlot(slot: DayExceptionSlot): void {
    setSlotValues({
      subjectId: slot.subjectId,
      startTime: slot.startTime,
      endTime: slot.endTime,
      room: slot.room ?? "",
      classType: slot.classType,
    });
    setSlotFormIssues([]);
    setSlotFormError(null);
    setEditingSlotId(slot.id);
    setSlotFormMode("edit");
    setSlotFormOpen(true);
  }

  function closeSlotForm(): void {
    setSlotFormOpen(false);
    setEditingSlotId(null);
    setSlotValues(EMPTY_SLOT_FORM);
    setSlotFormIssues([]);
    setSlotFormError(null);
  }

  async function submitSlotForm(event: FormEvent): Promise<void> {
    event.preventDefault();

    setSlotFormIssues([]);
    setSlotFormError(null);
    setSlotFormPending(true);

    try {
      const input: CreateDayExceptionSlotInput = {
        exceptionId: selectedExceptionId!,
        subjectId: slotValues.subjectId,
        startTime: slotValues.startTime,
        endTime: slotValues.endTime,
        room: slotValues.room === "" ? null : slotValues.room,
        classType: slotValues.classType,
      };

      if (slotFormMode === "create") {
        await createDayExceptionSlot(
          selectedSemesterId!,
          selectedExceptionId!,
          input,
        );
        setNotice("Slot was added.");
      } else {
        if (editingSlotId === null) {
          throw new Error("No slot to edit");
        }

        const patch: DayExceptionSlotPatch = {
          subjectId: slotValues.subjectId,
          startTime: slotValues.startTime,
          endTime: slotValues.endTime,
          room: slotValues.room === "" ? null : slotValues.room,
          classType: slotValues.classType,
        };
        await updateDayExceptionSlot(
          selectedSemesterId!,
          selectedExceptionId!,
          editingSlotId,
          patch,
        );
        setNotice("Slot was saved.");
      }

      closeSlotForm();
      reloadSlots();
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 422) {
        setSlotFormIssues(error.issues);
        setSlotFormError(error.message);
      } else if (error instanceof ApiRequestError && error.status === 404) {
        closeSlotForm();
        setNotice("That slot no longer exists. Refreshing slots.");
        reloadSlots();
      } else if (
        error instanceof ApiRequestError &&
        (error.status === 401 || error.status === 503)
      ) {
        closeSlotForm();
        setSlotsView(failureOf(error));
      } else {
        setSlotFormError(
          error instanceof ApiRequestError
            ? error.message
            : "Could not save the slot. Try again.",
        );
      }
    } finally {
      setSlotFormPending(false);
    }
  }

  async function requestDeleteSlot(slotId: string): Promise<void> {
    setConfirmDeleteSlot(slotId);
  }

  function _cancelDeleteSlot(): void {
    setConfirmDeleteSlot(null);
  }

  async function _confirmDeleteSlotHandler(slotId: string): Promise<void> {
    setDeletePending(slotId);
    setConfirmDeleteSlot(null);

    try {
      await deleteDayExceptionSlot(
        selectedSemesterId!,
        selectedExceptionId!,
        slotId,
      );
      setNotice("Slot was removed.");
      reloadSlots();
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 404) {
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

  function previousMonth(): void {
    setCurrentMonth(addMonths(currentMonth, -1));
  }

  function nextMonth(): void {
    setCurrentMonth(addMonths(currentMonth, 1));
  }

  function goToToday(): void {
    const now = new Date();
    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  }

  const exceptionsByDate = useMemo(() => {
    const map = new Map<string, DayException>();

    if (exceptionsView.kind === "ready") {
      for (const exception of exceptionsView.exceptions) {
        map.set(exception.date, exception);
      }
    }

    return map;
  }, [exceptionsView]);

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

  const _slotsByException = useMemo(() => {
    const map = new Map<string, DayExceptionSlot[]>();

    if (slotsView.kind === "ready") {
      for (const slot of slotsView.slots) {
        const arr = map.get(slot.exceptionId) ?? [];
        arr.push(slot);
        map.set(slot.exceptionId, arr);
      }
    }

    for (const arr of map.values()) {
      arr.sort((a, b) =>
        a.startTime < b.startTime ? -1 : a.startTime > b.startTime ? 1 : 0,
      );
    }

    return map;
  }, [slotsView]);

  const calendarDays = useMemo(() => {
    const daysInMonth = getDaysInMonth(
      currentMonth.getFullYear(),
      currentMonth.getMonth(),
    );
    const firstDayOfMonth = getFirstDayOfMonth(
      currentMonth.getFullYear(),
      currentMonth.getMonth(),
    );
    const prevMonthDays = getDaysInMonth(
      currentMonth.getFullYear(),
      currentMonth.getMonth() - 1,
    );

    const days: (Date | null)[] = [];

    // Previous month padding
    for (let i = firstDayOfMonth - 1; i >= 0; i--) {
      const day = prevMonthDays - i;
      days.push(
        new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, day),
      );
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(
        new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day),
      );
    }

    // Next month padding
    const totalCells = Math.ceil(days.length / 7) * 7;
    for (let i = days.length; i < totalCells; i++) {
      const nextMonth = addMonths(currentMonth, 1);
      days.push(
        new Date(
          nextMonth.getFullYear(),
          nextMonth.getMonth(),
          i - daysInMonth + 1,
        ),
      );
    }

    return days;
  }, [currentMonth]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (semestersView.kind === "loading") {
    return (
      <>
        <PageHeader
          title="Calendar"
          description="Your semester calendar with holidays and special schedules."
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
          title="Calendar"
          description="Your semester calendar with holidays and special schedules."
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
          title="Calendar"
          description="Your semester calendar with holidays and special schedules."
        />
        <NoSemestersPanel />
      </>
    );
  }

  if (selectedSemester === null) {
    return (
      <>
        <PageHeader
          title="Calendar"
          description="Your semester calendar with holidays and special schedules."
        />
        <NoSemestersPanel />
      </>
    );
  }

  const selectedException =
    selectedExceptionId !== null
      ? exceptionsView.kind === "ready"
        ? (exceptionsView.exceptions.find(
            (e) => e.id === selectedExceptionId,
          ) ?? null)
        : null
      : null;

  return (
    <>
      <PageHeader
        title="Calendar"
        description={`Your calendar for ${selectedSemester.name}. Holidays and special schedules are date-specific and do not affect the recurring weekly timetable.`}
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

      <div className="mt-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={previousMonth}
              className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
            >
              ← Prev
            </button>
            <div className="text-center min-w-[180px]">
              <h2 className="text-lg font-semibold text-slate-200">
                {formatMonthYear(currentMonth)}
              </h2>
            </div>
            <button
              type="button"
              onClick={nextMonth}
              className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
            >
              Next →
            </button>
          </div>
          <div className="mt-4 sm:mt-0 flex items-center gap-2">
            <button
              type="button"
              onClick={goToToday}
              className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => openCreateException()}
              className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
            >
              Add Exception
            </button>
          </div>
        </div>

        {/* Calendar Grid */}
        {exceptionsView.kind === "loading" ? (
          <p
            role="status"
            aria-busy="true"
            className="mt-6 text-sm text-slate-400"
          >
            Loading exceptions…
          </p>
        ) : exceptionsView.kind !== "ready" ? (
          <FailurePanel
            failure={exceptionsView}
            context="exceptions"
            onRetry={reloadExceptions}
          />
        ) : (
          <div
            role="grid"
            aria-label={`Calendar for ${formatMonthYear(currentMonth)}`}
            className="grid grid-cols-7 gap-0.5"
          >
            {/* Weekday headers */}
            {WEEKDAYS.map((day) => (
              <div
                key={day.value}
                role="columnheader"
                className="px-2 py-2 text-center text-xs font-semibold text-slate-400 bg-slate-900/50 border-b border-slate-800"
              >
                {day.short}
              </div>
            ))}

            {/* Calendar days */}
            {calendarDays.map((day, index) => {
              if (day === null) {
                return (
                  <div
                    key={index}
                    role="gridcell"
                    className="min-h-[100px] p-2 border border-slate-800 bg-slate-950/60"
                  />
                );
              }

              const isCurrentMonth =
                day.getMonth() === currentMonth.getMonth() &&
                day.getFullYear() === currentMonth.getFullYear();
              const isToday = isSameDay(day, today);
              const dateString = dateToString(day);
              const exception = exceptionsByDate.get(dateString);
              const isSelected = exception?.id === selectedExceptionId;

              return (
                <div
                  key={index}
                  role="gridcell"
                  className={`relative min-h-[100px] p-2 border border-slate-800 ${
                    isCurrentMonth ? "bg-slate-900/40" : "bg-slate-950/60"
                  } ${isToday ? "ring-2 ring-indigo-500" : ""} ${
                    isSelected ? "ring-2 ring-indigo-500" : ""
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span
                      className={`text-sm font-medium ${
                        isCurrentMonth ? "text-slate-100" : "text-slate-500"
                      } ${isToday ? "text-indigo-400" : ""}`}
                    >
                      {day.getDate()}
                    </span>
                  </div>

                  {exception ? (
                    <div className="mt-1 space-y-1">
                      <div
                        className={`rounded border px-1.5 py-0.5 text-[10px] font-medium truncate ${
                          KIND_TONES[exception.kind]
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedExceptionId(exception.id);
                        }}
                      >
                        {KIND_LABELS[exception.kind]}
                      </div>
                      {exception.reason && (
                        <div className="text-[10px] text-slate-400 truncate">
                          {exception.reason}
                        </div>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openCreateException(dateToString(day));
                      }}
                      className="w-full mt-1 text-center text-[10px] text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 rounded px-1 py-0.5 transition-colors"
                    >
                      + Add
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Exception Detail Panel */}
        {selectedException !== null && (
          <section className="mt-8 rounded-xl border border-slate-800 bg-slate-900/40 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${KIND_TONES[selectedException.kind]}`}
                >
                  {KIND_LABELS[selectedException.kind]}
                </span>
                <div className="flex flex-col">
                  <p className="text-sm font-semibold text-slate-200">
                    {formatDate(selectedException.date)}
                  </p>
                  <p className="text-xs text-slate-400">
                    {
                      WEEKDAYS[weekdayIndexFromIsoDate(selectedException.date)]!
                        .label
                    }
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                {selectedException.kind === "special_schedule" && (
                  <button
                    type="button"
                    onClick={openCreateSlot}
                    className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
                  >
                    Add Slot
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => openEditException(selectedException)}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
                >
                  Edit
                </button>
                <button
                  type="button"
                  aria-label="Delete exception"
                  onClick={() => requestDeleteException(selectedException.id)}
                  className="rounded-lg border border-rose-500/50 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400"
                >
                  Delete
                </button>
              </div>
            </div>

            {selectedException.reason && (
              <p className="mb-4 text-sm text-slate-300">
                <span className="font-medium text-slate-400">Reason: </span>
                {selectedException.reason}
              </p>
            )}

            {selectedException.kind === "special_schedule" ? (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-200">
                    Special Schedule Slots
                  </h3>
                </div>

                {slotsView.kind === "loading" ? (
                  <p
                    role="status"
                    className="text-sm text-slate-400"
                    aria-busy="true"
                  >
                    Loading slots…
                  </p>
                ) : slotsView.kind === "unavailable" ||
                  slotsView.kind === "signInRequired" ||
                  slotsView.kind === "error" ? (
                  <FailurePanel
                    failure={slotsView}
                    context="slots"
                    onRetry={retrySlots}
                  />
                ) : (
                  <>
                    {slotsView.kind === "ready" &&
                    slotsView.slots.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center py-4">
                        No slots for this special schedule yet.
                      </p>
                    ) : null}

                    {slotsView.kind === "ready" &&
                    slotsView.slots.length > 0 ? (
                      <ul className="space-y-2">
                        {slotsView.slots.map((slot) => {
                          const subject = subjectsById.get(slot.subjectId);
                          return (
                            <li
                              key={slot.id}
                              className="rounded-lg border border-slate-700 bg-slate-950/50 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                            >
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
                              </div>

                              <div className="flex flex-col sm:flex-row gap-2">
                                <button
                                  type="button"
                                  onClick={() => openEditSlot(slot)}
                                  className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  aria-label="Delete slot"
                                  onClick={() => requestDeleteSlot(slot.id)}
                                  className="rounded-lg border border-rose-500/50 bg-rose-500/10 px-2.5 py-1.5 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400"
                                >
                                  Delete
                                </button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-400 text-center py-4">
                Holiday — no classes scheduled for this date.
              </p>
            )}
          </section>
        )}
      </div>

      {/* Exception Form Modal */}
      {exceptionFormOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="exception-form-title"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900/95 p-5 shadow-xl">
            <h3
              id="exception-form-title"
              className="text-sm font-semibold text-slate-200"
            >
              {exceptionFormMode === "create"
                ? "Add Exception"
                : "Edit Exception"}
            </h3>

            {exceptionFormError !== null ? (
              <p
                role="alert"
                className="mt-3 rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-100"
              >
                {exceptionFormError}
              </p>
            ) : null}

            <form
              onSubmit={(event) => void submitExceptionForm(event)}
              className="mt-4 grid gap-4"
            >
              <label className="flex flex-col gap-1.5 text-sm text-slate-300">
                Date
                <input
                  id="exception-date"
                  required
                  type="date"
                  value={exceptionValues.date}
                  onChange={(event) =>
                    setExceptionValues({
                      ...exceptionValues,
                      date: event.target.value,
                    })
                  }
                  aria-invalid={
                    issueFor("date", exceptionFormIssues) !== undefined
                  }
                  className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-400"
                />
                {issueFor("date", exceptionFormIssues) !== undefined ? (
                  <span className="text-xs text-rose-300">
                    {issueFor("date", exceptionFormIssues)}
                  </span>
                ) : null}
              </label>

              <label className="flex flex-col gap-1.5 text-sm text-slate-300">
                Type
                <select
                  required
                  value={exceptionValues.kind}
                  onChange={(event) =>
                    setExceptionValues({
                      ...exceptionValues,
                      kind: event.target.value as
                        "holiday" | "special_schedule",
                    })
                  }
                  className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-400"
                >
                  <option value="holiday">Holiday</option>
                  <option value="special_schedule">Special Schedule</option>
                </select>
              </label>

              <label className="flex flex-col gap-1.5 text-sm text-slate-300">
                Reason (optional)
                <textarea
                  id="exception-reason"
                  rows={3}
                  value={exceptionValues.reason}
                  onChange={(event) =>
                    setExceptionValues({
                      ...exceptionValues,
                      reason: event.target.value,
                    })
                  }
                  maxLength={200}
                  placeholder="Optional reason for this exception"
                  className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-400"
                />
                <p className="text-xs text-slate-500">
                  Optional. Maximum 200 characters.
                </p>
              </label>

              <div className="mt-4 flex gap-3">
                <button
                  type="submit"
                  disabled={exceptionFormPending}
                  className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
                >
                  {exceptionFormPending
                    ? exceptionFormMode === "create"
                      ? "Adding…"
                      : "Saving…"
                    : exceptionFormMode === "create"
                      ? "Add Exception"
                      : "Save Exception"}
                </button>
                <button
                  type="button"
                  onClick={closeExceptionForm}
                  disabled={exceptionFormPending}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Slot Form Modal */}
      {slotFormOpen && selectedException !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="slot-form-title"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900/95 p-5 shadow-xl">
            <h3
              id="slot-form-title"
              className="text-sm font-semibold text-slate-200"
            >
              {slotFormMode === "create" ? "Add Slot" : "Edit Slot"}
            </h3>

            {slotFormError !== null ? (
              <p
                role="alert"
                className="mt-3 rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-100"
              >
                {slotFormError}
              </p>
            ) : null}

            <form
              onSubmit={(event) => void submitSlotForm(event)}
              className="mt-4 grid gap-4"
            >
              <label className="flex flex-col gap-1.5 text-sm text-slate-300">
                Subject
                <select
                  required
                  value={slotValues.subjectId}
                  onChange={(event) =>
                    setSlotValues({
                      ...slotValues,
                      subjectId: event.target.value,
                    })
                  }
                  aria-invalid={
                    issueFor("subjectId", slotFormIssues) !== undefined
                  }
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
                {issueFor("subjectId", slotFormIssues) !== undefined ? (
                  <span className="text-xs text-rose-300">
                    {issueFor("subjectId", slotFormIssues)}
                  </span>
                ) : null}
              </label>

              <label className="flex flex-col gap-1.5 text-sm text-slate-300">
                Start time
                <input
                  id="slot-start-time"
                  required
                  type="time"
                  value={slotValues.startTime}
                  onChange={(event) =>
                    setSlotValues({
                      ...slotValues,
                      startTime: event.target.value,
                    })
                  }
                  aria-invalid={
                    issueFor("startTime", slotFormIssues) !== undefined
                  }
                  className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-400"
                />
                {issueFor("startTime", slotFormIssues) !== undefined ? (
                  <span className="text-xs text-rose-300">
                    {issueFor("startTime", slotFormIssues)}
                  </span>
                ) : null}
              </label>

              <label className="flex flex-col gap-1.5 text-sm text-slate-300">
                End time
                <input
                  id="slot-end-time"
                  required
                  type="time"
                  value={slotValues.endTime}
                  onChange={(event) =>
                    setSlotValues({
                      ...slotValues,
                      endTime: event.target.value,
                    })
                  }
                  aria-invalid={
                    issueFor("endTime", slotFormIssues) !== undefined
                  }
                  className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-400"
                />
                {issueFor("endTime", slotFormIssues) !== undefined ? (
                  <span className="text-xs text-rose-300">
                    {issueFor("endTime", slotFormIssues)}
                  </span>
                ) : null}
              </label>

              <label className="flex flex-col gap-1.5 text-sm text-slate-300">
                Room
                <input
                  id="slot-room"
                  type="text"
                  maxLength={80}
                  value={slotValues.room}
                  onChange={(event) =>
                    setSlotValues({
                      ...slotValues,
                      room: event.target.value,
                    })
                  }
                  placeholder="Room 101"
                  aria-invalid={issueFor("room", slotFormIssues) !== undefined}
                  className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-400"
                />
                <p className="text-xs text-slate-500">
                  Optional. 1–80 characters.
                </p>
                {issueFor("room", slotFormIssues) !== undefined ? (
                  <span className="text-xs text-rose-300">
                    {issueFor("room", slotFormIssues)}
                  </span>
                ) : null}
              </label>

              <label className="flex flex-col gap-1.5 text-sm text-slate-300">
                Class type
                <select
                  value={slotValues.classType}
                  onChange={(event) =>
                    setSlotValues({
                      ...slotValues,
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

              <div className="mt-4 flex gap-3">
                <button
                  type="submit"
                  disabled={slotFormPending}
                  className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
                >
                  {slotFormPending
                    ? slotFormMode === "create"
                      ? "Adding…"
                      : "Saving…"
                    : slotFormMode === "create"
                      ? "Add Slot"
                      : "Save Slot"}
                </button>
                <button
                  type="button"
                  onClick={closeSlotForm}
                  disabled={slotFormPending}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Exception Delete Confirmation Dialog */}
      {_confirmDeleteException !== null && selectedException !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-exception-dialog-title"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900/95 p-5 shadow-xl">
            <h3
              id="delete-exception-dialog-title"
              className="text-sm font-semibold text-slate-200"
            >
              Delete Exception
            </h3>

            <p className="mt-3 text-sm text-slate-300">
              Are you sure you want to delete this{" "}
              <span className="font-medium">
                {KIND_LABELS[selectedException.kind]}
              </span>{" "}
              on{" "}
              <span className="font-medium">
                {formatDate(selectedException.date)}
              </span>
              ?
            </p>

            {selectedException.reason && (
              <p className="mt-2 text-sm text-slate-400">
                Reason: {selectedException.reason}
              </p>
            )}

            {selectedException.kind === "special_schedule" && (
              <p className="mt-2 text-sm text-rose-300">
                A special schedule can only be deleted once all of its class
                slots are deleted. Remove its slots first, then delete the
                exception.
              </p>
            )}

            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() =>
                  _confirmDeleteExceptionHandler(_confirmDeleteException!)
                }
                disabled={_deletePending === _confirmDeleteException}
                className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400"
              >
                {_deletePending === _confirmDeleteException
                  ? "Deleting…"
                  : "Delete Exception"}
              </button>
              <button
                type="button"
                onClick={_cancelDeleteException}
                disabled={_deletePending === _confirmDeleteException}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Slot Delete Confirmation Dialog */}
      {_confirmDeleteSlot !== null && selectedException !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-slot-dialog-title"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900/95 p-5 shadow-xl">
            <h3
              id="delete-slot-dialog-title"
              className="text-sm font-semibold text-slate-200"
            >
              Delete Slot
            </h3>

            <p className="mt-3 text-sm text-slate-300">
              Are you sure you want to delete this slot?
            </p>

            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => _confirmDeleteSlotHandler(_confirmDeleteSlot!)}
                disabled={_deletePending === _confirmDeleteSlot}
                className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400"
              >
                {_deletePending === _confirmDeleteSlot
                  ? "Deleting…"
                  : "Delete Slot"}
              </button>
              <button
                type="button"
                onClick={_cancelDeleteSlot}
                disabled={_deletePending === _confirmDeleteSlot}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
