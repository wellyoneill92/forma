import { NextResponse } from "next/server";
import { buildCoachingContext } from "@/lib/coaching/context";
import { generateWrapup } from "@/lib/coaching/brain";
import { dbQuery, dbPatch } from "@/lib/supabase";

export const maxDuration = 120;

export async function POST() {
  try {
    const ctx = await buildCoachingContext();

    const weekActivities = await dbQuery("activities", {
      start_time: `gte.${ctx.weekStart}T00:00:00`,
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
    return NextResponse.json(
      { error: "Failed to generate wrapup", detail: String(err) },
      { status: 500 }
    );
  }
}
