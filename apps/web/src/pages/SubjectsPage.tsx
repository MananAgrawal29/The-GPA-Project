import { useEffect, useState, type ChangeEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import type { FieldIssue, Semester, Subject } from "@gpa/shared";
import { ApiRequestError } from "../api/client";
import { listSemesters } from "../api/semesters";
import {
  createSubject,
  getSubject,
  listSubjects,
  updateSubject,
} from "../api/subjects";
import PageHeader from "../components/PageHeader";
import SubjectNameForm from "../components/SubjectNameForm";

/**
 * Subject management, scoped to one selected semester.
 *
 * The selected semester is part of the URL (`?semester=<id>`), so a deep
 * link always names the context it belongs to. The list and detail
 * children are keyed by semester id: changing semesters unmounts the old
 * view instead of leaving its subjects on screen while a new request is
 * in flight.
 *
 * A subject is addressed by its id, never by its name. No request carries
 * an owner id; the API derives the owner from the verified session.
 */

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

type LoadFailure =
  | { readonly kind: "unavailable"; readonly message: string }
  | { readonly kind: "signInRequired"; readonly message: string }
  | { readonly kind: "error"; readonly message: string };

type SemestersView =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly semesters: readonly Semester[] }
  | LoadFailure;

type SubjectListView =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly subjects: readonly Subject[] }
  | LoadFailure;

type SubjectDetailView =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly subject: Subject }
  | { readonly kind: "notFound" }
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

function subjectPath(semesterId: string, subjectId?: string): string {
  const base =
    subjectId === undefined
      ? "/academics/subjects"
      : `/academics/subjects/${encodeURIComponent(subjectId)}`;

  return `${base}?semester=${encodeURIComponent(semesterId)}`;
}

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

function FailurePanel({
  failure,
  context,
  onRetry,
}: {
  readonly failure: LoadFailure;
  readonly context: "semesters" | "subjects";
  readonly onRetry: () => void;
}) {
  const title =
    failure.kind === "unavailable"
      ? context === "semesters"
        ? "Semesters are unavailable"
        : "Subjects are unavailable"
      : failure.kind === "signInRequired"
        ? "Sign in required"
        : context === "semesters"
          ? "Could not load semesters"
          : "Could not load subjects";

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
        Subjects belong to a semester, so there is nothing to manage until one
        exists. Create a semester first, then come back to add its subjects.
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
            htmlFor="subject-semester"
            className="text-xs font-medium tracking-[0.16em] text-slate-500 uppercase"
          >
            Semester
          </label>
          <select
            id="subject-semester"
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
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_TONES[selected.status]}`}
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
        Every subject below belongs only to{" "}
        <span className="font-medium text-slate-200">{selected.name}</span>.
        Switching semesters clears this view and loads the other semester's own
        subjects.
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

function SubjectList({ semester }: { readonly semester: Semester }) {
  const [view, setView] = useState<SubjectListView>({ kind: "loading" });
  const [reloadToken, setReloadToken] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [issues, setIssues] = useState<readonly FieldIssue[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    listSubjects(semester.id, controller.signal)
      .then((subjects) => {
        if (!controller.signal.aborted) {
          setView({ kind: "ready", subjects });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setView(failureOf(error));
        }
      });

    return () => controller.abort();
  }, [semester.id, reloadToken]);

  function openCreate(): void {
    setIssues([]);
    setFormError(null);
    setNotice(null);
    setFormOpen(true);
  }

  function closeCreate(): void {
    setIssues([]);
    setFormError(null);
    setFormOpen(false);
  }

  async function create(name: string): Promise<void> {
    setPending(true);
    setIssues([]);
    setFormError(null);
    setNotice(null);

    try {
      const created = await createSubject(semester.id, { name });
      setNotice(`${created.name} was added to ${semester.name}.`);
      setFormOpen(false);
      setView({ kind: "loading" });
      setReloadToken((token) => token + 1);
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 422) {
        setIssues(error.issues);
        setFormError(error.message);
      } else if (
        error instanceof ApiRequestError &&
        (error.status === 401 || error.status === 503)
      ) {
        setFormOpen(false);
        setView(failureOf(error));
      } else {
        setFormError(
          error instanceof ApiRequestError
            ? error.message
            : "Could not add the subject. Try again.",
        );
      }
    } finally {
      setPending(false);
    }
  }

  function retry(): void {
    setView({ kind: "loading" });
    setReloadToken((token) => token + 1);
  }

  return (
    <section className="mt-8">
      {notice !== null ? (
        <p
          role="status"
          className="mb-4 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100"
        >
          {notice}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-slate-300 uppercase">
            Subjects in {semester.name}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Names are not unique. Each subject is a separate record with its own
            id.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          disabled={formOpen || pending || view.kind === "loading"}
          className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
        >
          New subject
        </button>
      </div>

      {formOpen ? (
        <SubjectNameForm
          mode="create"
          initialName=""
          pending={pending}
          issues={issues}
          error={formError}
          onSubmit={(name) => void create(name)}
          onCancel={closeCreate}
        />
      ) : null}

      {view.kind === "loading" ? (
        <p
          role="status"
          aria-busy="true"
          className="mt-6 text-sm text-slate-400"
        >
          Loading subjects…
        </p>
      ) : null}

      {view.kind === "unavailable" ||
      view.kind === "signInRequired" ||
      view.kind === "error" ? (
        <FailurePanel failure={view} context="subjects" onRetry={retry} />
      ) : null}

      {view.kind === "ready" && view.subjects.length === 0 && !formOpen ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-700 bg-slate-900/30 p-6 text-center">
          <p className="text-sm font-medium text-slate-200">
            No subjects in this semester yet
          </p>
          <p className="mt-2 text-sm text-slate-400">
            Add the first subject for {semester.name}. You can add another with
            the same name later; they remain separate records.
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-4 rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
          >
            Add the first subject
          </button>
        </div>
      ) : null}

      {view.kind === "ready" && view.subjects.length > 0 ? (
        <ul
          aria-label={`Subjects in ${semester.name}`}
          className="mt-6 flex flex-col gap-3"
        >
          {view.subjects.map((subject) => (
            <li
              key={subject.id}
              className="rounded-xl border border-slate-800 bg-slate-900/40 p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">
                    {subject.name}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Added {formatDate(subject.createdAt)}
                  </p>
                </div>
                <Link
                  to={subjectPath(semester.id, subject.id)}
                  aria-label={`View ${subject.name}`}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
                >
                  View
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function NotFoundPanel({
  semester,
  subjectId,
}: {
  readonly semester: Semester;
  readonly subjectId: string;
}) {
  return (
    <section className="mt-6 rounded-xl border border-slate-800 bg-slate-900/40 p-6">
      <h2 className="text-sm font-semibold text-slate-200">
        Subject not found
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">
        No subject with id <code className="text-slate-300">{subjectId}</code>{" "}
        exists in {semester.name}. It may have been removed, or it may belong to
        a different semester.
      </p>
      <Link
        to={subjectPath(semester.id)}
        className="mt-4 inline-flex rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
      >
        Back to subjects
      </Link>
    </section>
  );
}

function SubjectDetail({
  semester,
  subjectId,
}: {
  readonly semester: Semester;
  readonly subjectId: string;
}) {
  const [view, setView] = useState<SubjectDetailView>({ kind: "loading" });
  const [reloadToken, setReloadToken] = useState(0);
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [issues, setIssues] = useState<readonly FieldIssue[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    getSubject(semester.id, subjectId, controller.signal)
      .then((subject) => {
        if (controller.signal.aborted) {
          return;
        }

        // The path already scopes the request, but a response that names a
        // different semester is treated as absent rather than rendered
        // under this one.
        if (subject.semesterId !== semester.id) {
          setView({ kind: "notFound" });
          return;
        }

        setView({ kind: "ready", subject });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        if (error instanceof ApiRequestError && error.status === 404) {
          setView({ kind: "notFound" });
          return;
        }

        setView(failureOf(error));
      });

    return () => controller.abort();
  }, [semester.id, subjectId, reloadToken]);

  function openEdit(): void {
    setIssues([]);
    setFormError(null);
    setNotice(null);
    setEditing(true);
  }

  function closeEdit(): void {
    setIssues([]);
    setFormError(null);
    setEditing(false);
  }

  async function save(name: string): Promise<void> {
    setPending(true);
    setIssues([]);
    setFormError(null);
    setNotice(null);

    try {
      const updated = await updateSubject(semester.id, subjectId, { name });

      if (updated.semesterId !== semester.id) {
        setEditing(false);
        setView({ kind: "notFound" });
        return;
      }

      setView({ kind: "ready", subject: updated });
      setEditing(false);
      setNotice("Subject updated.");
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 422) {
        setIssues(error.issues);
        setFormError(error.message);
      } else if (error instanceof ApiRequestError && error.status === 404) {
        setEditing(false);
        setView({ kind: "notFound" });
      } else if (
        error instanceof ApiRequestError &&
        (error.status === 401 || error.status === 503)
      ) {
        setEditing(false);
        setView(failureOf(error));
      } else {
        setFormError(
          error instanceof ApiRequestError
            ? error.message
            : "Could not save the subject. Try again.",
        );
      }
    } finally {
      setPending(false);
    }
  }

  function retry(): void {
    setView({ kind: "loading" });
    setReloadToken((token) => token + 1);
  }

  return (
    <section className="mt-8">
      <Link
        to={subjectPath(semester.id)}
        className="text-sm font-medium text-indigo-300 transition-colors hover:text-indigo-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
      >
        ← Back to subjects
      </Link>

      {notice !== null ? (
        <p
          role="status"
          className="mt-4 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100"
        >
          {notice}
        </p>
      ) : null}

      {view.kind === "loading" ? (
        <p
          role="status"
          aria-busy="true"
          className="mt-6 text-sm text-slate-400"
        >
          Loading subject…
        </p>
      ) : null}

      {view.kind === "unavailable" ||
      view.kind === "signInRequired" ||
      view.kind === "error" ? (
        <FailurePanel failure={view} context="subjects" onRetry={retry} />
      ) : null}

      {view.kind === "notFound" ? (
        <NotFoundPanel semester={semester} subjectId={subjectId} />
      ) : null}

      {view.kind === "ready" ? (
        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/40 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-medium tracking-[0.16em] text-slate-500 uppercase">
                Subject
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                {view.subject.name}
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                {semester.name} · {semester.academicYear}
              </p>
            </div>
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_TONES[semester.status]}`}
            >
              {STATUS_LABELS[semester.status]}
            </span>
          </div>

          <dl className="mt-6 grid gap-4 border-t border-slate-800 pt-5 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-slate-500">Added</dt>
              <dd className="mt-1 text-sm text-slate-300">
                {formatDate(view.subject.createdAt)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Last updated</dt>
              <dd className="mt-1 text-sm text-slate-300">
                {formatDate(view.subject.updatedAt)}
              </dd>
            </div>
          </dl>

          {editing ? (
            <SubjectNameForm
              mode="edit"
              initialName={view.subject.name}
              pending={pending}
              issues={issues}
              error={formError}
              onSubmit={(name) => void save(name)}
              onCancel={closeEdit}
            />
          ) : (
            <button
              type="button"
              onClick={openEdit}
              className="mt-6 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
            >
              Edit subject
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}

export default function SubjectsPage() {
  const { subjectId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const requestedSemesterId = searchParams.get("semester");
  const [view, setView] = useState<SemestersView>({ kind: "loading" });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;

    listSemesters()
      .then((semesters) => {
        if (active) {
          setView({ kind: "ready", semesters });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setView(failureOf(error));
        }
      });

    return () => {
      active = false;
    };
  }, [reloadToken]);

  const selectedSemester =
    view.kind === "ready"
      ? (view.semesters.find(
          (semester) => semester.id === requestedSemesterId,
        ) ??
        view.semesters.find((semester) => semester.status === "active") ??
        view.semesters[0] ??
        null)
      : null;

  const selectedSemesterId = selectedSemester?.id ?? null;

  // Keep the URL explicit once a selection exists, including the default
  // active semester or the first semester when none is active.
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

    const next = new URLSearchParams(searchParams);
    next.set("semester", target);

    // Always return to the list: a subject id must never be carried into
    // another semester's context.
    navigate({
      pathname: "/academics/subjects",
      search: `?${next.toString()}`,
    });
  }

  function retrySemesters(): void {
    setView({ kind: "loading" });
    setReloadToken((token) => token + 1);
  }

  return (
    <>
      <PageHeader
        title="Subjects"
        description="Subjects belong to exactly one semester. Choose the semester you are managing, then add, open, or edit only its subjects."
      />

      <div className="mt-6">
        <Link
          to="/academics"
          className="text-sm font-medium text-indigo-300 transition-colors hover:text-indigo-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
        >
          ← Academics
        </Link>
      </div>

      {view.kind === "loading" ? (
        <p
          role="status"
          aria-busy="true"
          className="mt-6 text-sm text-slate-400"
        >
          Loading semesters…
        </p>
      ) : null}

      {view.kind === "unavailable" ||
      view.kind === "signInRequired" ||
      view.kind === "error" ? (
        <FailurePanel
          failure={view}
          context="semesters"
          onRetry={retrySemesters}
        />
      ) : null}

      {view.kind === "ready" && view.semesters.length === 0 ? (
        <NoSemestersPanel />
      ) : null}

      {view.kind === "ready" &&
      selectedSemester !== null &&
      view.semesters.length > 0 ? (
        <>
          <SemesterContext
            semesters={view.semesters}
            selected={selectedSemester}
            onChange={changeSemester}
          />

          {subjectId === undefined ? (
            <SubjectList
              key={selectedSemester.id}
              semester={selectedSemester}
            />
          ) : (
            <SubjectDetail
              key={`${selectedSemester.id}:${subjectId}`}
              semester={selectedSemester}
              subjectId={subjectId}
            />
          )}
        </>
      ) : null}
    </>
  );
}
