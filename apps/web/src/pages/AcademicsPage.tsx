import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";
import type { FieldIssue, Semester } from "@gpa/shared";
import {
  ApiRequestError,
  activateSemester,
  createSemester,
  listSemesters,
  updateSemester,
  type SemesterInput,
} from "../api/semesters";
import PageHeader from "../components/PageHeader";

/**
 * Semester management: the first screen that reads and writes real data.
 *
 * Every state it can reach is explicit -- loading, empty, validation
 * error, refusal, and sign-in required -- because the honest failure mode
 * here is showing an empty list when the request never succeeded.
 *
 * The client never sends an owner id. Who the caller is comes from the
 * session the API verifies, so nothing on this screen can address
 * another user's data.
 */
const SignIn = lazy(() =>
  import("@clerk/react").then((module) => ({ default: module.SignIn })),
);

const PUBLISHABLE_KEY: string =
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? "";

const STATUS_LABELS: Record<Semester["status"], string> = {
  active: "Current",
  setup: "Draft",
  completed: "Completed",
  archived: "Archived",
};

const STATUS_TONES: Record<Semester["status"], string> = {
  active: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  setup: "border-slate-400/30 bg-slate-400/10 text-slate-200",
  completed: "border-indigo-400/30 bg-indigo-400/10 text-indigo-200",
  archived: "border-slate-500/30 bg-slate-500/10 text-slate-400",
};

const DEMOTION_CHOICES = [
  { value: "archived", label: "Archive it (keeps everything readable)" },
  { value: "completed", label: "Mark it completed (the term finished)" },
  { value: "setup", label: "Return it to draft" },
] as const;

type View =
  | { readonly kind: "loading" }
  | { readonly kind: "unavailable"; readonly message: string }
  | { readonly kind: "signInRequired" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "ready"; readonly semesters: readonly Semester[] };

type FormState =
  | { readonly mode: "create" }
  | { readonly mode: "edit"; readonly semester: Semester };

interface FormValues {
  name: string;
  academicYear: string;
  startDate: string;
  endDate: string;
}

const EMPTY_VALUES: FormValues = {
  name: "",
  academicYear: "",
  startDate: "",
  endDate: "",
};

function messageOf(error: unknown): string {
  if (error instanceof ApiRequestError) {
    return error.message;
  }

  return "Something went wrong. Try again.";
}

function viewFromError(error: unknown): View {
  if (error instanceof ApiRequestError) {
    if (error.status === 401) {
      return { kind: "signInRequired" };
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

function toInput(values: FormValues): SemesterInput {
  return {
    name: values.name.trim(),
    academicYear: values.academicYear.trim(),
    startDate: values.startDate === "" ? null : values.startDate,
    endDate: values.endDate === "" ? null : values.endDate,
  };
}

/**
 * Fetches the list and converts any failure into a view.
 *
 * It lives at module scope so the effect that calls it only schedules
 * work: state changes happen after the request settles, never
 * synchronously during render.
 */
async function fetchView(): Promise<View> {
  try {
    const semesters = await listSemesters();
    return { kind: "ready", semesters };
  } catch (error) {
    return viewFromError(error);
  }
}

export default function AcademicsPage() {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [form, setForm] = useState<FormState | null>(null);
  const [values, setValues] = useState<FormValues>(EMPTY_VALUES);
  const [formIssues, setFormIssues] = useState<readonly FieldIssue[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activation, setActivation] = useState<Semester | null>(null);
  const [activationChoice, setActivationChoice] = useState<
    "setup" | "completed" | "archived"
  >("archived");
  const [confirmArchive, setConfirmArchive] = useState<Semester | null>(null);

  const load = useCallback(() => {
    void fetchView().then(setView);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate(): void {
    setValues(EMPTY_VALUES);
    setFormIssues([]);
    setFormError(null);
    setForm({ mode: "create" });
  }

  function openEdit(semester: Semester): void {
    setValues({
      name: semester.name,
      academicYear: semester.academicYear,
      startDate: semester.startDate ?? "",
      endDate: semester.endDate ?? "",
    });
    setFormIssues([]);
    setFormError(null);
    setForm({ mode: "edit", semester });
  }

  function issueFor(path: string): string | undefined {
    return formIssues.find((issue) => issue.path === path)?.message;
  }

  async function submitForm(event: FormEvent): Promise<void> {
    event.preventDefault();

    if (form === null) {
      return;
    }

    const input = toInput(values);
    setFormIssues([]);
    setFormError(null);
    setPending(form.mode === "create" ? "create" : `edit:${form.semester.id}`);

    try {
      if (form.mode === "create") {
        await createSemester(input);
        setNotice(`${input.name} was created.`);
      } else {
        await updateSemester(form.semester.id, input);
        setNotice(`${input.name} was saved.`);
      }

      setForm(null);
      await load();
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 422) {
        setFormIssues(error.issues);
        setFormError(error.message);
      } else {
        setFormError(messageOf(error));
      }
    } finally {
      setPending(null);
    }
  }

  async function confirmActivation(
    semester: Semester,
    demoteActiveTo: "setup" | "completed" | "archived",
  ): Promise<void> {
    setPending(`activate:${semester.id}`);
    setActionError(null);

    try {
      await activateSemester(semester.id, demoteActiveTo);
      setActivation(null);
      setNotice(`${semester.name} is now the current semester.`);
      await load();
    } catch (error) {
      setActivation(null);
      setActionError(messageOf(error));
    } finally {
      setPending(null);
    }
  }

  async function archive(semester: Semester): Promise<void> {
    setPending(`archive:${semester.id}`);
    setActionError(null);

    try {
      await updateSemester(semester.id, { status: "archived" });
      setConfirmArchive(null);
      setNotice(`${semester.name} was archived and stays readable.`);
      await load();
    } catch (error) {
      setConfirmArchive(null);
      setActionError(messageOf(error));
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Academics"
        description="Semesters hold everything academic: subjects, timetable, attendance, and history. Manage the term you are in without losing the ones behind it."
      />

      {view.kind === "loading" ? (
        <p
          role="status"
          className="mt-8 text-sm text-slate-400"
          aria-busy="true"
        >
          Loading semesters…
        </p>
      ) : null}

      {view.kind === "unavailable" ? (
        <div
          role="status"
          className="mt-8 rounded-xl border border-amber-400/30 bg-amber-400/5 p-5"
        >
          <p className="text-sm font-semibold text-amber-100">
            Personal data is unavailable
          </p>
          <p className="mt-2 text-sm leading-relaxed text-amber-100/80">
            {view.message}
          </p>
          <p className="mt-3 text-xs text-amber-100/60">
            Nothing on this page can read or change data until sign-in and a
            database are configured on the server.
          </p>
        </div>
      ) : null}

      {view.kind === "signInRequired" ? (
        <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900/40 p-5">
          <p className="text-sm font-semibold text-slate-200">
            Sign in required
          </p>
          {PUBLISHABLE_KEY !== "" ? (
            <div className="mt-4 max-w-md">
              <Suspense
                fallback={
                  <p className="text-sm text-slate-400">Loading sign-in…</p>
                }
              >
                <SignIn />
              </Suspense>
            </div>
          ) : (
            <>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                This build has no Clerk publishable key, so the browser cannot
                present a sign-in form. Set{" "}
                <code className="text-slate-300">
                  VITE_CLERK_PUBLISHABLE_KEY
                </code>{" "}
                in <code className="text-slate-300">apps/web/.env</code> to
                enable it.
              </p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-4 rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
              >
                Retry
              </button>
            </>
          )}
        </div>
      ) : null}

      {view.kind === "error" ? (
        <div
          role="alert"
          className="mt-8 rounded-xl border border-rose-400/30 bg-rose-400/5 p-5"
        >
          <p className="text-sm font-semibold text-rose-100">
            Could not load semesters
          </p>
          <p className="mt-2 text-sm leading-relaxed text-rose-100/80">
            {view.message}
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-4 rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
          >
            Retry
          </button>
        </div>
      ) : null}

      {view.kind === "ready" ? (
        <div className="mt-8">
          {notice !== null ? (
            <p
              role="status"
              className="mb-4 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100"
            >
              {notice}
            </p>
          ) : null}

          {actionError !== null ? (
            <p
              role="alert"
              className="mb-4 rounded-lg border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100"
            >
              {actionError}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold tracking-wide text-slate-300 uppercase">
              Your semesters
            </h2>
            <button
              type="button"
              onClick={openCreate}
              disabled={form !== null}
              className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
            >
              New semester
            </button>
          </div>

          {form !== null ? (
            <form
              onSubmit={(event) => void submitForm(event)}
              className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 p-5"
            >
              <h3 className="text-sm font-semibold text-slate-200">
                {form.mode === "create" ? "Create a semester" : "Edit semester"}
              </h3>

              {formError !== null ? (
                <p
                  role="alert"
                  className="mt-3 rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-100"
                >
                  {formError}
                </p>
              ) : null}

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-sm text-slate-300">
                  Name
                  <input
                    required
                    value={values.name}
                    onChange={(event) =>
                      setValues({ ...values, name: event.target.value })
                    }
                    placeholder="Semester 1"
                    aria-invalid={issueFor("name") !== undefined}
                    className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-slate-100 placeholder:text-slate-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-400"
                  />
                  {issueFor("name") !== undefined ? (
                    <span className="text-xs text-rose-300">
                      {issueFor("name")}
                    </span>
                  ) : null}
                </label>

                <label className="flex flex-col gap-1.5 text-sm text-slate-300">
                  Academic year
                  <input
                    required
                    value={values.academicYear}
                    onChange={(event) =>
                      setValues({ ...values, academicYear: event.target.value })
                    }
                    placeholder="2026-27"
                    aria-invalid={issueFor("academicYear") !== undefined}
                    className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-slate-100 placeholder:text-slate-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-400"
                  />
                  {issueFor("academicYear") !== undefined ? (
                    <span className="text-xs text-rose-300">
                      {issueFor("academicYear")}
                    </span>
                  ) : null}
                </label>

                <label className="flex flex-col gap-1.5 text-sm text-slate-300">
                  Start date
                  <input
                    type="date"
                    value={values.startDate}
                    onChange={(event) =>
                      setValues({ ...values, startDate: event.target.value })
                    }
                    aria-invalid={issueFor("startDate") !== undefined}
                    className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-400"
                  />
                  <span className="text-xs text-slate-500">
                    Optional while the dates are unknown.
                  </span>
                  {issueFor("startDate") !== undefined ? (
                    <span className="text-xs text-rose-300">
                      {issueFor("startDate")}
                    </span>
                  ) : null}
                </label>

                <label className="flex flex-col gap-1.5 text-sm text-slate-300">
                  End date
                  <input
                    type="date"
                    value={values.endDate}
                    onChange={(event) =>
                      setValues({ ...values, endDate: event.target.value })
                    }
                    aria-invalid={issueFor("endDate") !== undefined}
                    className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-400"
                  />
                  {issueFor("endDate") !== undefined ? (
                    <span className="text-xs text-rose-300">
                      {issueFor("endDate")}
                    </span>
                  ) : null}
                </label>
              </div>

              <div className="mt-4 flex gap-3">
                <button
                  type="submit"
                  disabled={pending !== null}
                  className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
                >
                  {pending !== null
                    ? "Saving…"
                    : form.mode === "create"
                      ? "Create semester"
                      : "Save changes"}
                </button>
                <button
                  type="button"
                  onClick={() => setForm(null)}
                  disabled={pending !== null}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : null}

          {view.semesters.length === 0 && form === null ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-700 bg-slate-900/30 p-6 text-center">
              <p className="text-sm font-medium text-slate-200">
                No semesters yet
              </p>
              <p className="mt-2 text-sm text-slate-400">
                Create the term you are in now. Dates can be added once the
                college publishes them.
              </p>
              <button
                type="button"
                onClick={openCreate}
                className="mt-4 rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
              >
                Create your first semester
              </button>
            </div>
          ) : null}

          <ul className="mt-4 flex flex-col gap-3">
            {view.semesters.map((semester) => (
              <li
                key={semester.id}
                className="rounded-xl border border-slate-800 bg-slate-900/40 p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-white">
                        {semester.name}
                      </p>
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_TONES[semester.status]}`}
                      >
                        {STATUS_LABELS[semester.status]}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {semester.academicYear} ·{" "}
                      {semester.startDate === null || semester.endDate === null
                        ? "Dates not set"
                        : `${semester.startDate} → ${semester.endDate}`}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {semester.status !== "active" ? (
                      <button
                        type="button"
                        onClick={() => {
                          setActivation(semester);
                          setActivationChoice("archived");
                          setActionError(null);
                        }}
                        disabled={pending !== null}
                        className="rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
                      >
                        Make current
                      </button>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => openEdit(semester)}
                      disabled={pending !== null}
                      className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
                    >
                      Edit
                    </button>

                    {semester.status !== "archived" ? (
                      <button
                        type="button"
                        onClick={() => setConfirmArchive(semester)}
                        disabled={pending !== null}
                        className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
                      >
                        Archive
                      </button>
                    ) : null}
                  </div>
                </div>

                {activation?.id === semester.id ? (
                  <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/50 p-4">
                    <p className="text-sm text-slate-200">
                      Make{" "}
                      <span className="font-semibold">{semester.name}</span>{" "}
                      current. What should the current semester become?
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 text-sm text-slate-400">
                        <span className="sr-only">
                          Outgoing semester status
                        </span>
                        <select
                          value={activationChoice}
                          onChange={(event) =>
                            setActivationChoice(
                              event.target.value as
                                "setup" | "completed" | "archived",
                            )
                          }
                          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-400"
                        >
                          {DEMOTION_CHOICES.map((choice) => (
                            <option key={choice.value} value={choice.value}>
                              {choice.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          void confirmActivation(semester, activationChoice)
                        }
                        disabled={pending !== null}
                        className="rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
                      >
                        {pending === `activate:${semester.id}`
                          ? "Switching…"
                          : "Confirm"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setActivation(null)}
                        disabled={pending !== null}
                        className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}

                {confirmArchive?.id === semester.id ? (
                  <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/50 p-4">
                    <p className="text-sm text-slate-200">
                      Archive{" "}
                      <span className="font-semibold">{semester.name}</span>?
                      Nothing is deleted: it stays readable and can be made
                      current again.
                    </p>
                    <div className="mt-3 flex gap-3">
                      <button
                        type="button"
                        onClick={() => void archive(semester)}
                        disabled={pending !== null}
                        className="rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
                      >
                        {pending === `archive:${semester.id}`
                          ? "Archiving…"
                          : "Yes, archive"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmArchive(null)}
                        disabled={pending !== null}
                        className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
                      >
                        Keep it active
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-8 text-xs text-slate-500">
        Subjects and timetable arrive with P09–P10. Nothing here shows a number
        the server did not return.
      </p>
    </>
  );
}
