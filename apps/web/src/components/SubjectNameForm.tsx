import { useId, useState, type FormEvent } from "react";
import { subjectCreateInputSchema, type FieldIssue } from "@gpa/shared";

interface SubjectNameFormProps {
  readonly mode: "create" | "edit";
  readonly initialName: string;
  readonly pending: boolean;
  readonly issues: readonly FieldIssue[];
  readonly error: string | null;
  readonly onSubmit: (name: string) => void;
  readonly onCancel: () => void;
}

/**
 * The one form used for both creating and editing a subject.
 *
 * It applies the shared create schema before submitting, so the browser
 * rejects the same blank or overlong names the API rejects. The API
 * remains authoritative: a server `422` is rendered through the `issues`
 * prop exactly like a local failure.
 */
export default function SubjectNameForm({
  mode,
  initialName,
  pending,
  issues,
  error,
  onSubmit,
  onCancel,
}: SubjectNameFormProps) {
  const [name, setName] = useState(initialName);
  const [localIssues, setLocalIssues] = useState<readonly FieldIssue[]>([]);
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();

  const allIssues = [...localIssues, ...issues];
  const nameIssue = allIssues.find((issue) => issue.path === "name");
  const describedBy = nameIssue === undefined ? hintId : `${hintId} ${errorId}`;

  function submit(event: FormEvent): void {
    event.preventDefault();

    const parsed = subjectCreateInputSchema.safeParse({ name });

    if (!parsed.success) {
      setLocalIssues(
        parsed.error.issues.map((issue) => ({
          path: String(issue.path[0] ?? "name"),
          message: issue.message,
        })),
      );
      return;
    }

    setLocalIssues([]);
    onSubmit(parsed.data.name);
  }

  return (
    <form
      onSubmit={submit}
      className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 p-5"
    >
      <h3 className="text-sm font-semibold text-slate-200">
        {mode === "create" ? "Add a subject" : "Edit subject"}
      </h3>

      {error !== null ? (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-100"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-col gap-1.5">
        <label htmlFor={inputId} className="text-sm text-slate-300">
          Subject name
        </label>
        <input
          id={inputId}
          required
          maxLength={80}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setLocalIssues([]);
          }}
          placeholder="Data Structures"
          aria-invalid={nameIssue !== undefined}
          aria-describedby={describedBy}
          className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-slate-100 placeholder:text-slate-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-400"
        />
        <p id={hintId} className="text-xs text-slate-500">
          1–80 characters. Names may repeat across semesters.
        </p>
        {nameIssue !== undefined ? (
          <p id={errorId} className="text-xs text-rose-300">
            {nameIssue.message}
          </p>
        ) : null}
      </div>

      <div className="mt-4 flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
        >
          {pending
            ? mode === "create"
              ? "Adding…"
              : "Saving…"
            : mode === "create"
              ? "Add subject"
              : "Save changes"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
