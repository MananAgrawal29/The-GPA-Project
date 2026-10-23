import type { ReactNode } from "react";
import StatusBadge from "./StatusBadge";

interface PlaceholderPanelProps {
  title: string;
  message: string;
  milestone: string;
  action?: ReactNode;
}

/**
 * An empty state for a panel whose feature does not exist yet.
 *
 * It never renders a zero or a fake figure: an unbuilt panel says so and
 * says when it arrives, which is the only honest thing to show.
 */
export default function PlaceholderPanel({
  title,
  message,
  milestone,
  action,
}: PlaceholderPanelProps) {
  return (
    <section className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/40 p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
        <StatusBadge status="planned" />
      </div>
      <p className="mt-3 flex-1 text-sm leading-relaxed text-slate-400">
        {message}
      </p>
      <p className="mt-4 text-xs text-slate-500">Arrives in {milestone}.</p>
      {action}
    </section>
  );
}
