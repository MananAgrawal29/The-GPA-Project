import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description: string;
  badge?: ReactNode;
}

/** Shared page heading so every route opens the same way. */
export default function PageHeader({
  title,
  description,
  badge,
}: PageHeaderProps) {
  return (
    <header className="border-b border-slate-800/80 pb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          {title}
        </h1>
        {badge}
      </div>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">
        {description}
      </p>
    </header>
  );
}
