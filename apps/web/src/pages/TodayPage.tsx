import { APP_NAME } from "@gpa/shared";
import { Link } from "react-router";
import PageHeader from "../components/PageHeader";
import PlaceholderPanel from "../components/PlaceholderPanel";

const actionClassName =
  "mt-4 inline-flex w-fit text-sm font-medium text-indigo-300 underline-offset-4 hover:text-indigo-200 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400";

export default function TodayPage() {
  return (
    <>
      <PageHeader
        title="Today"
        description="The one screen meant to answer what is happening today. It stays empty until a semester, a timetable, and tasks exist."
      />

      <div className="mt-8 rounded-xl border border-indigo-400/20 bg-indigo-500/5 p-5">
        <p className="text-sm font-semibold text-indigo-100">
          Nothing is connected yet
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          The shell is real, the features are not. {APP_NAME} has no database,
          no account, and no saved records at this point, so the panels below
          are empty states rather than measured zeroes.
        </p>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <PlaceholderPanel
          title="Today's classes"
          message="No semester exists yet, so there is no weekly timetable to resolve for today."
          milestone="P07–P16"
          action={
            <Link to="/timetable" className={actionClassName}>
              See what the timetable will hold
            </Link>
          }
        />

        <PlaceholderPanel
          title="Tasks due and overdue"
          message="No tasks have been captured, because task capture does not exist yet."
          milestone="P21–P26"
          action={
            <Link to="/tasks" className={actionClassName}>
              See what tasks will hold
            </Link>
          }
        />
      </div>
    </>
  );
}
