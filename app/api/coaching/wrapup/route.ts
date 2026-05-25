import { NextResponse } from "next/server";
import { buildCoachingContext } from "@/lib/coaching/context";
import { generateWrapup } from "@/lib/coaching/brain";
import { dbQuery, dbPatch } from "@/lib/supabase";

export const maxDuration = 120;

export async function POST() {
  try {
    const ctx = await buildCoachingContext();

    // Bound both ends of the week so future-dated or timezone-shifted activities
    // don't leak into the summary.
    const weekEnd = new Date(ctx.weekStart + "T00:00:00Z");
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
    const weekEndStr = weekEnd.toISOString().split("T")[0];

    // PostgREST `and` filter for a bounded date range on the same column
    const weekActivities = await dbQuery("activities", {
      and: `(start_time.gte.${ctx.weekStart}T00:00:00,start_time.lte.${weekEndStr}T23:59:59)`,
      order: "start_time.asc",
      limit: "20",
    });

    const summary = await generateWrapup(
      ctx,
      weekActivities as Record<string, unknown>[]
    );

    if (ctx.currentWeekPlan) {
      await dbPatch(
        "weekly_plans",
        { week_start: `eq.${ctx.weekStart}` },
        { week_summary: summary }
      );
    }

    return NextResponse.json({ summary, weekStart: ctx.weekStart });
  } catch (err) {
    console.error("[coaching/wrapup]", err);
    return NextResponse.json({ error: "Failed to generate wrapup" }, { status: 500 });
  }
}
