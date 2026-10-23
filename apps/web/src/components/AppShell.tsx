import { APP_NAME, APP_TAGLINE } from "@gpa/shared";
import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router";
import {
  findNavigationItem,
  navigationGroups,
  type NavigationItem,
} from "../navigation";

interface AppShellProps {
  children: ReactNode;
}

function Monogram() {
  return (
    <span
      aria-hidden="true"
      className="grid size-9 shrink-0 place-items-center rounded-xl bg-indigo-500/15 text-xs font-semibold tracking-wide text-indigo-300 ring-1 ring-inset ring-indigo-400/30"
    >
      GP
    </span>
  );
}

function NavigationLink({
  item,
  onSelect,
}: {
  item: NavigationItem;
  onSelect?: (() => void) | undefined;
}) {
  return (
    <NavLink
      to={item.path}
      end={item.path === "/"}
      onClick={onSelect}
      className={({ isActive }) =>
        [
          "flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400",
          isActive
            ? "bg-indigo-500/10 font-medium text-white ring-1 ring-inset ring-indigo-400/30"
            : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100",
        ].join(" ")
      }
    >
      <span className="truncate">{item.label}</span>
      {item.status ? (
        <span
          className={[
            "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
            item.status === "blocked"
              ? "bg-rose-500/10 text-rose-300/90"
              : "bg-slate-500/10 text-slate-500",
          ].join(" ")}
        >
          {item.status === "blocked" ? "Blocked" : "Planned"}
        </span>
      ) : null}
    </NavLink>
  );
}

function NavigationList({ onSelect }: { onSelect?: (() => void) | undefined }) {
  return (
    <div className="flex flex-col gap-6">
      {navigationGroups.map((group) => (
        <div key={group.label}>
          <p className="px-3 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-600">
            {group.label}
          </p>
          <ul className="mt-2 flex flex-col gap-0.5">
            {group.items.map((item) => (
              <li key={item.path}>
                <NavigationLink item={item} onSelect={onSelect} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default function AppShell({ children }: AppShellProps) {
  const { pathname } = useLocation();
  const [openPath, setOpenPath] = useState<string | null>(null);

  // The mobile disclosure is open only for the route it was opened on, so
  // navigating (including with the back button) closes it without an
  // effect that would have to fight the router.
  const isMobileNavigationOpen = openPath === pathname;

  useEffect(() => {
    const current = findNavigationItem(pathname);
    document.title = `${current?.label ?? "Page not found"} · ${APP_NAME}`;
  }, [pathname]);

  useEffect(() => {
    if (!isMobileNavigationOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenPath(null);
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isMobileNavigationOpen]);

  return (
    <div className="min-h-dvh bg-slate-950 text-slate-100">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-slate-950"
      >
        Skip to content
      </a>

      <div className="lg:flex">
        <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-64 lg:shrink-0 lg:flex-col lg:gap-8 lg:overflow-y-auto lg:border-r lg:border-slate-800/80 lg:px-4 lg:py-6">
          <div className="flex items-center gap-3 px-1">
            <Monogram />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">
                {APP_NAME}
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                {APP_TAGLINE}
              </p>
            </div>
          </div>

          <nav className="flex-1">
            <NavigationList />
          </nav>

          <p className="px-3 text-[11px] leading-relaxed text-slate-600">
            Foundation shell. No account, no database, and no saved records yet.
          </p>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur lg:hidden">
            <div className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <Monogram />
                <p className="truncate text-sm font-semibold text-white">
                  {APP_NAME}
                </p>
              </div>

              <button
                type="button"
                aria-expanded={isMobileNavigationOpen}
                aria-label={
                  isMobileNavigationOpen
                    ? "Close navigation"
                    : "Open navigation"
                }
                onClick={() =>
                  setOpenPath(isMobileNavigationOpen ? null : pathname)
                }
                className="grid size-10 shrink-0 place-items-center rounded-lg border border-slate-800 text-slate-300 transition-colors hover:bg-slate-800/60 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
              >
                <span aria-hidden="true" className="text-lg leading-none">
                  {isMobileNavigationOpen ? "×" : "☰"}
                </span>
              </button>
            </div>

            {isMobileNavigationOpen ? (
              <nav
                aria-label="Primary navigation"
                className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-slate-800/80 px-3 py-4"
              >
                <NavigationList onSelect={() => setOpenPath(null)} />
              </nav>
            ) : null}
          </header>

          <main
            id="main-content"
            tabIndex={-1}
            className="flex-1 scroll-mt-16 px-5 py-8 focus:outline-none sm:px-8 lg:scroll-mt-0 lg:px-10 lg:py-12"
          >
            <div className="mx-auto w-full max-w-4xl">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
