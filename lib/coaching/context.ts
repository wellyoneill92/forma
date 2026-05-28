import { dbQuery } from "@/lib/supabase";

export interface CoachingContext {
  today: string;
  weekStart: string;
  goal: Record<string, unknown> | null;
  currentWeekPlan: Record<string, unknown> | null;
  goalText: string;
  contextText: string;
}

function getMondayOfWeek(todayStr: string): string {
  const d = new Date(todayStr + "T12:00:00Z");
  const dow = d.getUTCDay(); // 0=Sun, 1=Mon ... 6=Sat
  const daysBack = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d.toISOString().split("T")[0];
}

function subDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().split("T")[0];
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function buildGoalText(
  goal: Record<string, unknown> | null,
  fitness: Record<string, unknown> | null,
  today: string
): string {
  if (!goal) {
    return "## Goal\nNo active goal set. Jack has not yet defined a race target.\n";
  }

  const raceDate = goal.race_date as string;
  const distanceKm = (goal.distance_meters as number) / 1000;
  const targetSec = goal.target_time_seconds as number;

  if (!distanceKm || !targetSec) {
    return "## Goal\nGoal data incomplete — distance or target time is missing.\n";
  }
  const th = Math.floor(targetSec / 3600);
  const tm = Math.floor((targetSec % 3600) / 60);
  const ts = targetSec % 60;
  const targetStr = `${th}:${String(tm).padStart(2, "0")}:${String(ts).padStart(2, "0")}`;

  const paceSecPerKm = targetSec / distanceKm;
  const pm = Math.floor(paceSecPerKm / 60);
  const ps = Math.round(paceSecPerKm % 60);
  const paceStr = `${pm}:${String(ps).padStart(2, "0")}/km`;

  const todayMs = new Date(today + "T12:00:00Z").getTime();
  const raceDateMs = new Date(raceDate + "T12:00:00Z").getTime();
  const daysAway = Math.ceil((raceDateMs - todayMs) / 86_400_000);
  const daysLabel =
    daysAway > 0 ? `${daysAway} days away` : daysAway === 0 ? "today!" : "completed";

  let text = `## Goal\n`;
  text += `Race: ${goal.race_name}\n`;
  text += `Date: ${raceDate} (${daysLabel})\n`;
  text += `Distance: ${distanceKm.toFixed(3)} km\n`;
  text += `Target time: ${targetStr} (${paceStr})\n`;
  if (goal.notes) text += `Notes: ${goal.notes}\n`;

  if (fitness) {
    text += `\n## Fitness Baseline (as of ${fitness.date})\n`;
    if (fitness.vo2_max_running != null) {
      text += `VO2 max (running): ${fitness.vo2_max_running} ml/kg/min\n`;
    }
    const preds = fitness.race_predictions as { distance: string; seconds: number }[] | null;
    if (preds && preds.length > 0) {
      const predStrs = preds.map((p) => {
        const ph = Math.floor(p.seconds / 3600);
        const pmin = Math.floor((p.seconds % 3600) / 60);
        const psec = p.seconds % 60;
        const t =
          ph > 0
            ? `${ph}:${String(pmin).padStart(2, "0")}:${String(psec).padStart(2, "0")}`
            : `${pmin}:${String(psec).padStart(2, "0")}`;
        return `${p.distance}: ${t}`;
      });
      text += `Race predictions: ${predStrs.join(" | ")}\n`;
    }
  }

  return text;
}

function buildContextText(
  wellness: Record<string, unknown>[],
  activities: Record<string, unknown>[],
  currentPlan: Record<string, unknown> | null,
  today: string,
  weekStart: string
): string {
  let text = `## Today: ${today} (week starting ${weekStart})\n\n`;

  text += `## Wellness — Last 14 Days\n`;
  if (wellness.length === 0) {
    text += "No wellness data available.\n";
  } else {
    text += `Date        Sleep      HRV           Readiness     Status                RHR  BB\n`;
    text += `----------  ---------  ------------  ------------  --------------------  ---  --\n`;
    for (const w of wellness) {
      const sleep =
        w.sleep_score != null
          ? `${w.sleep_score} ${String(w.sleep_quality ?? "").charAt(0)}`
          : "-";
      const hrv =
        w.hrv_last_night_avg_ms != null
          ? `${Math.round(w.hrv_last_night_avg_ms as number)}ms ${String(w.hrv_status ?? "").split("_")[0].substring(0, 4)}`
          : "-";
      const readiness =
        w.readiness_score != null
          ? `${w.readiness_score} ${String(w.readiness_level ?? "").substring(0, 4)}`
          : "-";
      const status = String(w.training_status ?? "-");
      const rhr = w.rhr_bpm != null ? String(w.rhr_bpm) : "-";
      const bb = w.body_battery_max != null ? String(w.body_battery_max) : "-";
      text += `${w.date}  ${sleep.padEnd(9)}  ${hrv.padEnd(12)}  ${readiness.padEnd(12)}  ${status.padEnd(20)}  ${rhr.padEnd(3)}  ${bb}\n`;
    }
  }

  text += `\n## Recent Activities\n`;
  if (activities.length === 0) {
    text += "No recent activities.\n";
  } else {
    text += `Date+Time           Type         Dist     Duration  AvgHR  AeroTE\n`;
    text += `------------------  -----------  -------  --------  -----  ------\n`;
    for (const a of activities) {
      const dt = String(a.start_time ?? "").substring(0, 16).replace("T", " ");
      const type = String(a.activity_type ?? "unknown");
      const dist =
        a.distance_meters != null
          ? `${((a.distance_meters as number) / 1000).toFixed(1)}km`
          : "-";
      const dur =
        a.duration_seconds != null ? formatDuration(a.duration_seconds as number) : "-";
      const hr = a.avg_heart_rate != null ? String(a.avg_heart_rate) : "-";
      const te = a.training_effect_aerobic != null ? String(a.training_effect_aerobic) : "-";
      text += `${dt.padEnd(18)}  ${type.padEnd(11)}  ${dist.padEnd(7)}  ${dur.padEnd(8)}  ${hr.padEnd(5)}  ${te}\n`;
    }
  }

  text += `\n## Current Week Plan\n`;
  if (!currentPlan) {
    text += "No plan has been generated for this week yet.\n";
  } else {
    text += JSON.stringify(currentPlan.plan, null, 2) + "\n";
  }

  return text;
}

export async function buildCoachingContext(): Promise<CoachingContext> {
  // Use Melbourne time — Vercel servers run UTC and Jack is AEST/AEDT (UTC+10/+11)
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Melbourne" });
  const weekStart = getMondayOfWeek(today);
  const thirtyDaysAgo = subDays(today, 30);

  const [goals, wellness, activities, snapshots, plans] = await Promise.all([
    dbQuery("goals", {
      is_active: "eq.true",
      order: "created_at.desc",
      limit: "1",
    }),
    dbQuery("daily_wellness", {
      date: `gte.${thirtyDaysAgo}`,
      order: "date.asc",
    }),
    dbQuery("activities", {
      order: "start_time.desc",
      limit: "40",
    }),
    dbQuery("fitness_snapshots", {
      order: "date.desc",
      limit: "1",
    }),
    dbQuery("weekly_plans", {
      week_start: `eq.${weekStart}`,
    }),
  ]);

  const goal = (goals[0] as Record<string, unknown>) ?? null;
  const fitnessSnapshot = (snapshots[0] as Record<string, unknown>) ?? null;
  const currentWeekPlan = (plans[0] as Record<string, unknown>) ?? null;

  const goalText = buildGoalText(goal, fitnessSnapshot, today);
  const contextText = buildContextText(
    wellness as Record<string, unknown>[],
    activities as Record<string, unknown>[],
    currentWeekPlan,
    today,
    weekStart
  );

  return { today, weekStart, goal, currentWeekPlan, goalText, contextText };
}
