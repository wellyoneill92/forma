import { dbQuery } from "@/lib/supabase";
import type { Goal, WeeklyPlan, PlanDay } from "@/lib/types";
import PlanActions from "./PlanActions";

const SESSION_LABEL: Record<string, string> = {
  easy_run: "Easy Run",
  tempo: "Tempo",
  intervals: "Intervals",
  long_run: "Long Run",
  rest: "Rest",
  cross_train: "Bike",
  strength: "Gym",
};

const QUALITY = new Set(["tempo", "intervals", "long_run"]);

function getMondayOfWeek(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00Z");
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return d.toISOString().split("T")[0];
}

function sessionLabel(day: PlanDay) {
  return (day.sessions ?? [day.session_type]).map(s => SESSION_LABEL[s] ?? s).join(" + ");
}

export default async function PlanPage() {
  const today = new Date().toISOString().split("T")[0];
  const weekStart = getMondayOfWeek(today);

  const [plans, goals] = await Promise.all([
    dbQuery<WeeklyPlan>("weekly_plans", { week_start: `eq.${weekStart}` }),
    dbQuery<Goal>("goals", { is_active: "eq.true", order: "created_at.desc", limit: "1" }),
  ]);

  const plan = plans[0] ?? null;
  const goal = goals[0] ?? null;

  const dayOfWeekNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const todayDow = dayOfWeekNames[new Date(today + "T12:00:00Z").getUTCDay() === 0 ? 6 : new Date(today + "T12:00:00Z").getUTCDay() - 1];

  const weekLabel = new Date(weekStart + "T12:00:00Z").toLocaleDateString("en-AU", {
    day: "numeric", month: "long", timeZone: "UTC",
  });

  return (
    <div className="px-4 pt-6 pb-8 max-w-xl mx-auto md:px-8 md:max-w-2xl">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <p className="text-xs text-forma-text-muted font-medium mb-0.5">Week of {weekLabel}</p>
          <h1 className="font-display text-2xl font-bold text-forma-text">Training Plan</h1>
          {goal && <p className="text-sm text-forma-text-secondary mt-0.5">{goal.race_name}</p>}
        </div>
        <PlanActions hasPlan={!!plan} />
      </div>

      {!plan ? (
        <div className="bg-white rounded-2xl shadow p-8 text-center">
          <div className="w-12 h-12 rounded-2xl bg-forma-bg flex items-center justify-center mx-auto mb-4">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-forma-text-muted">
              <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
            </svg>
          </div>
          <p className="font-semibold text-forma-text mb-1">No plan yet</p>
          <p className="text-sm text-forma-text-secondary">Hit &quot;Generate plan&quot; and your coach will read your Garmin data to build a personalised week.</p>
        </div>
      ) : (
        <>
          {/* Coach notes */}
          <div className="bg-forma-accent rounded-2xl p-4 mb-4">
            <p className="text-xs font-semibold text-forma-text tracking-widest uppercase mb-1.5">Coach</p>
            <p className="text-sm text-forma-text leading-relaxed">{plan.plan.coach_notes}</p>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-white rounded-2xl shadow px-4 py-4 text-center">
              <p className="font-mono text-2xl font-bold text-forma-text leading-none">{plan.plan.total_planned_km}</p>
              <p className="text-xs text-forma-text-muted mt-1.5 font-semibold uppercase tracking-wider">km running</p>
            </div>
            <div className="bg-white rounded-2xl shadow px-4 py-4 text-center">
              <p className="font-mono text-2xl font-bold text-forma-text leading-none">
                {plan.plan.days?.filter(d => (d.sessions ?? [d.session_type]).includes("strength")).length ?? 0}
              </p>
              <p className="text-xs text-forma-text-muted mt-1.5 font-semibold uppercase tracking-wider">gym</p>
            </div>
            <div className="bg-white rounded-2xl shadow px-4 py-4 text-center">
              <p className="font-mono text-2xl font-bold text-forma-text leading-none">
                {plan.plan.days?.filter(d => (d.sessions ?? [d.session_type]).includes("cross_train")).length ?? 0}
              </p>
              <p className="text-xs text-forma-text-muted mt-1.5 font-semibold uppercase tracking-wider">bike</p>
            </div>
          </div>

          {/* Day cards */}
          <div className="space-y-2">
            {plan.plan.days?.map((day) => {
              const isToday = day.day_of_week === todayDow;
              const isQuality = QUALITY.has(day.session_type);
              return (
                <div
                  key={day.date}
                  className={`bg-white rounded-2xl shadow overflow-hidden ${isToday ? "ring-2 ring-forma-text" : ""}`}
                >
                  <div className="flex items-stretch">
                    {/* Left accent bar for quality sessions */}
                    {isQuality && (
                      <div className="w-1 bg-forma-accent shrink-0 rounded-l-2xl" />
                    )}

                    <div className="flex-1 p-4">
                      <div className="flex items-start gap-3">
                        {/* Date column */}
                        <div className="w-10 shrink-0 text-center">
                          <p className={`text-xs font-bold uppercase tracking-wider ${isToday ? "text-forma-text" : "text-forma-text-muted"}`}>
                            {day.day_of_week.substring(0, 3)}
                          </p>
                          <p className="text-lg font-display font-bold text-forma-text leading-tight">
                            {new Date(day.date + "T12:00:00Z").getDate()}
                          </p>
                        </div>

                        {/* Session content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                              isQuality ? "bg-forma-accent text-forma-text" : "bg-forma-bg text-forma-text-secondary"
                            }`}>
                              {sessionLabel(day)}
                            </span>
                            {isToday && (
                              <span className="text-xs font-semibold text-forma-text bg-forma-border px-2 py-0.5 rounded-full">Today</span>
                            )}
                          </div>
                          <p className="text-sm font-medium text-forma-text leading-snug">{day.description}</p>
                          {day.notes && (
                            <p className="text-xs text-forma-text-secondary mt-1.5 leading-relaxed">{day.notes}</p>
                          )}
                        </div>

                        {/* Distance / duration */}
                        <div className="text-right shrink-0 ml-2">
                          {day.target_distance_km != null && (
                            <p className="font-mono text-sm font-bold text-forma-text">{day.target_distance_km}km</p>
                          )}
                          {day.target_duration_minutes != null && (
                            <p className="font-mono text-xs text-forma-text-muted">{day.target_duration_minutes}min</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {plan.week_summary && (
            <div className="mt-4 bg-white rounded-2xl shadow p-5">
              <p className="text-xs font-semibold text-forma-text-muted tracking-widest uppercase mb-2">Week Wrap-up</p>
              <p className="text-sm text-forma-text leading-relaxed">{plan.week_summary}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
