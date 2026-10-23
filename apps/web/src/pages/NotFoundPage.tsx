import { Link, useLocation } from "react-router";
import PageHeader from "../components/PageHeader";

export default function NotFoundPage() {
  const { pathname } = useLocation();

  return (
    <>
      <PageHeader
        title="Page not found"
        description="This route does not exist, which usually means a link has outlived the page it pointed at."
      />

      <p className="mt-8 rounded-xl border border-slate-800 bg-slate-900/40 p-5 font-mono text-sm break-all text-slate-400">
        {pathname}
      </p>

      <Link
        to="/"
        className="mt-6 inline-flex text-sm font-medium text-indigo-300 underline-offset-4 hover:text-indigo-200 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
      >
        Back to Today
      </Link>
    </>
  );
}
