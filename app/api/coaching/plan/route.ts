import { NextResponse } from "next/server";
import { buildCoachingContext } from "@/lib/coaching/context";
import { generateWeeklyPlan } from "@/lib/coaching/brain";
import { dbUpsert } from "@/lib/supabase";

export const maxDuration = 120;

export async function POST() {
  try {
    const ctx = await buildCoachingContext();
    const plan = await generateWeeklyPlan(ctx);

    await dbUpsert("weekly_plans", {
      week_start: ctx.weekStart,
      goal_id: (ctx.goal?.id as string) ?? null,
      plan,
      generated_at: new Date().toISOString(),
    });

    return NextResponse.json({ plan, weekStart: ctx.weekStart });
  } catch (err) {
    console.error("[coaching/plan]", err);
    return NextResponse.json({ error: "Failed to generate plan" }, { status: 500 });
  }
}
