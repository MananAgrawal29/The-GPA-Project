import { MODULE_STATUS_LABELS, type ModuleStatus } from "../navigation";

const toneClasses: Record<ModuleStatus, string> = {
  planned: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  blocked: "border-rose-400/30 bg-rose-400/10 text-rose-200",
};

/** States plainly whether a module is merely planned or actually blocked. */
export default function StatusBadge({ status }: { status: ModuleStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${toneClasses[status]}`}
    >
      {MODULE_STATUS_LABELS[status]}
    </span>
  );
}
