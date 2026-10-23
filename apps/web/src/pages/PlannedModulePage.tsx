import type { PlannedModule } from "../navigation";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";

/**
 * Renders any module that has no implementation yet.
 *
 * One component covers every placeholder so the routes cannot disagree
 * about tone, and so an unfinished module can only ever describe itself
 * as unfinished.
 */
export default function PlannedModulePage({
  module,
}: {
  module: PlannedModule;
}) {
  return (
    <>
      <PageHeader
        title={module.label}
        description={module.summary}
        badge={<StatusBadge status={module.status} />}
      />

      <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <p className="text-sm font-semibold text-slate-200">Not built yet</p>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          {module.status === "blocked"
            ? `${module.label} is deliberately deferred: the grading rules it depends on have not been confirmed, so any number shown here would be invented.`
            : `This is a placeholder route. ${module.label} has no screens, no controls, and no stored records yet.`}{" "}
          It is scheduled for {module.milestone} in the roadmap.
        </p>
      </div>

      <h2 className="mt-8 text-sm font-semibold tracking-wide text-slate-300 uppercase">
        What will live here
      </h2>
      <ul className="mt-3 flex flex-col gap-2">
        {module.planned.map((entry) => (
          <li key={entry} className="flex gap-3 text-sm leading-relaxed">
            <span
              aria-hidden="true"
              className="mt-2 size-1.5 shrink-0 rounded-full bg-indigo-400/70"
            />
            <span className="text-slate-400">{entry}</span>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-xs text-slate-500">
        Nothing on this page reads, saves, or changes data.
      </p>
    </>
  );
}
