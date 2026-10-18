import { APP_NAME, APP_TAGLINE } from "@gpa/shared";

const foundationItems = [
  {
    label: "Web app",
    detail: "React, TypeScript, Vite, and Tailwind are wired up.",
  },
  {
    label: "API",
    detail: "Express exposes a health endpoint and a uniform error envelope.",
  },
  {
    label: "Shared contracts",
    detail: "Validation schemas and types are imported from one package.",
  },
];

export default function App() {
  return (
    <div className="min-h-dvh bg-slate-950 text-slate-100">
      <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center px-6 py-16">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-indigo-400">
          Foundation build
        </p>

        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
          {APP_NAME}
        </h1>

        <p className="mt-4 max-w-xl text-lg leading-relaxed text-slate-300">
          {APP_TAGLINE}
        </p>

        <ul className="mt-10 space-y-4 border-t border-slate-800 pt-8">
          {foundationItems.map((item) => (
            <li key={item.label} className="flex gap-4 text-sm">
              <span
                aria-hidden="true"
                className="mt-1.5 size-2 shrink-0 rounded-full bg-indigo-400"
              />
              <span>
                <span className="font-medium text-slate-100">{item.label}</span>
                <span className="mt-1 block text-slate-400">{item.detail}</span>
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-10 text-sm text-slate-500">
          Semesters, timetable, attendance, and tasks arrive in later prompts.
          Nothing here is connected to a database or an account yet.
        </p>
      </main>
    </div>
  );
}
