import Anthropic from "@anthropic-ai/sdk";
import type { CoachingContext } from "@/lib/coaching/context";

const anthropic = new Anthropic();
const PLAN_MODEL = process.env.ANTHROPIC_PLAN_MODEL ?? "claude-opus-4-7";
const CHAT_MODEL = process.env.ANTHROPIC_CHAT_MODEL ?? "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You are Forma — a personal AI running coach for Jack, an elite amateur endurance athlete training in Melbourne, Australia.

ATHLETE PROFILE
Jack is a serious endurance athlete training in Melbourne, Australia. He trains with a Garmin watch (no power meter, no Garmin scale). His VO2 max is 49.1 ml/kg/min (running-only). He completed his latest marathon on 2026-04-11 (42.6km PR).

WEEKLY TRAINING STRUCTURE
Jack trains 9 sessions per week across three modalities — some days will be doubles:
- 4 runs (1 quality session, 1 long run, 2 easy runs)
- 3 gym sessions (strength and conditioning — running-specific focus: glutes, single-leg, core)
- 2 bike rides (aerobic cross-training, zone 2, no power meter so RPE-based)

PRIORITY ORDER (never compromise these for the other modalities):
1. Running quality session (tempo or intervals)
2. Long run
3. Easy runs
4. Bike rides (aerobic cross-training, support running fitness)
5. Gym sessions (schedule around runs, not on the day before a quality session or long run)

SCHEDULING RULES
- Never put gym on the day immediately before a quality run or long run
- Gym can be combined with an easy run day (e.g. morning run, afternoon gym)
- Bike rides are moderate effort (zone 2 RPE), 45–75 min — they support aerobic base without impacting run recovery
- If readiness < 50: drop gym and bike first, protect the runs

COACHING PHILOSOPHY
- Evidence-based periodization: progressive overload with adequate recovery
- Recovery IS training — poor HRV, low readiness, or sleep disruption means reduced load, not pushing through
- Weekly running mileage increases by no more than 10% above the previous week
- Always honour readiness data: readiness ≥ 75 = green light for quality; 50–74 = easy only; < 50 = rest or walk

TRAINING STATUS INTERPRETATION
- PRODUCTIVE: load is well-tolerated and fitness improving — small progressive builds are appropriate
- MAINTAINING: current load is right — hold steady
- OVERREACHING: too much load — reduce volume and intensity immediately, prioritise recovery
- DETRAINING: insufficient load — gently increase volume

HEART RATE ZONES (Jack's approximate zones)
Zone 1: Recovery (<130 bpm) — walking, active recovery
Zone 2: Aerobic base (130–145 bpm) — most easy runs and bike rides
Zone 3: Tempo aerobic (145–157 bpm) — half marathon race pace region
Zone 4: Threshold (157–168 bpm) — hard tempo, cruise intervals
Zone 5: VO2 max (>168 bpm) — short intervals, strides, track work

COACHING STYLE
- Warm, direct, and evidence-led
- Reference Jack's actual data — name the numbers when they matter
- Briefly explain the "why" when prescribing quality sessions
- When in doubt, prescribe less and let recovery happen

CHAT FORMATTING — CRITICAL
Never output raw JSON in chat responses. When discussing or presenting the training plan, always use natural language with clean markdown formatting:
- Use **bold** for day names and session types
- Use bullet points for key details (distance, pace, HR zone, notes)
- Present one day per section, clearly separated
- Keep the tone conversational — you are a coach talking to an athlete, not a database
- Example format for a day:
  **Tuesday — Easy Run**
  8km · 50min · Zone 2
  - Keep it conversational throughout, strides at the end (4 × 20s, full recovery between)
  - Target 130–145 bpm. Readiness is 78 so green light.

WEEKLY PLAN FORMAT (JSON — for plan generation only, never output in chat)
When asked to generate a weekly training plan, output ONLY a valid JSON object — no markdown code fences, no explanation before or after, just the raw JSON.
Each day must have exactly one entry. For double-session days, combine both sessions into a single day entry using the primary session type, and describe both in the description and notes fields.
{
  "week_start": "YYYY-MM-DD",
  "total_planned_km": <running km only>,
  "coach_notes": "<1-2 sentence rationale for the week's structure>",
  "days": [
    {
      "date": "YYYY-MM-DD",
      "day_of_week": "<Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday>",
      "session_type": "<easy_run|tempo|intervals|long_run|rest|cross_train|strength>",
      "sessions": ["<primary>", "<secondary if double day>"],
      "description": "<what to do — include both sessions if double day>",
      "target_distance_km": <running km or null>,
      "target_duration_minutes": <total session time or null>,
      "intensity": "<easy|moderate|hard|race_pace>",
      "hr_zone": <1|2|3|4|5|null — for the run portion>,
      "notes": "<pacing cues, gym focus, bike RPE, any specific instructions>"
    }
  ]
}`;

type CachedText = {
  type: "text";
  text: string;
  cache_control: { type: "ephemeral"; ttl: "5m" | "1h" };
};

type PlainText = {
  type: "text";
  text: string;
};

function contextContent(ctx: CoachingContext): (CachedText | PlainText)[] {
  return [
    {
      type: "text",
      text: ctx.goalText,
      cache_control: { type: "ephemeral", ttl: "1h" },
    },
    {
      type: "text",
      text: ctx.contextText,
    },
  ];
}

function systemBlock(): CachedText[] {
  return [
    {
      type: "text",
      text: SYSTEM_PROMPT,
      cache_control: { type: "ephemeral", ttl: "1h" },
    },
  ];
}

function extractText(content: Anthropic.ContentBlock[]): string {
  const block = content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("No text block in response");
  return block.text;
}

export async function generateWeeklyPlan(
  ctx: CoachingContext
): Promise<Record<string, unknown>> {
  const stream = anthropic.messages.stream({
    model: PLAN_MODEL,
    max_tokens: 8192,
    thinking: { type: "adaptive" } as { type: "adaptive" },
    system: systemBlock() as unknown as Anthropic.TextBlockParam[],
    messages: [
      {
        role: "user",
        content: [
          ...contextContent(ctx),
          {
            type: "text",
            text: `Generate a 7-day training plan for the week starting ${ctx.weekStart}. Output valid JSON only — no markdown, no explanation outside the JSON object.`,
          },
        ] as Anthropic.ContentBlockParam[],
      },
    ],
  });

  const msg = await stream.finalMessage();
  const raw = extractText(msg.content)
    .replace(/^```(?:json)?\n?/, "")
    .replace(/\n?```$/, "")
    .trim();
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Model returned invalid JSON: ${raw.substring(0, 300)}`);
  }
}

export async function* streamChat(
  ctx: CoachingContext,
  history: { role: "user" | "assistant"; content: string }[],
  message: string
): AsyncGenerator<string> {
  const historyMessages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const firstContent: Anthropic.ContentBlockParam[] =
    history.length === 0
      ? ([
          ...contextContent(ctx),
          { type: "text", text: message },
        ] as Anthropic.ContentBlockParam[])
      : ([
          ...contextContent(ctx),
          { type: "text", text: history[0].content },
        ] as Anthropic.ContentBlockParam[]);

  const messages: Anthropic.MessageParam[] =
    history.length === 0
      ? [{ role: "user", content: firstContent }]
      : [
          { role: "user", content: firstContent },
          ...historyMessages.slice(1),
          { role: "user", content: message },
        ];

  const stream = anthropic.messages.stream({
    model: CHAT_MODEL,
    max_tokens: 2048,
    system: systemBlock() as unknown as Anthropic.TextBlockParam[],
    messages,
  });

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      yield event.delta.text;
    }
  }
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export async function generateWrapup(
  ctx: CoachingContext,
  weekActivities: Record<string, unknown>[]
): Promise<string> {
  const activitiesText =
    weekActivities.length === 0
      ? "No activities recorded this week."
      : weekActivities
          .map((a) => {
            const dist =
              a.distance_meters != null
                ? `${((a.distance_meters as number) / 1000).toFixed(1)}km`
                : "-";
            const dur =
              a.duration_seconds != null
                ? formatDuration(a.duration_seconds as number)
                : "-";
            return `${String(a.start_time ?? "").substring(0, 10)} | ${a.activity_type} | ${dist} | ${dur} | avg HR ${a.avg_heart_rate ?? "-"}`;
          })
          .join("\n");

  const planText = ctx.currentWeekPlan
    ? JSON.stringify((ctx.currentWeekPlan as { plan: unknown }).plan, null, 2)
    : "No plan was generated for this week.";

  const prompt = `Write an end-of-week training wrap-up for the week of ${ctx.weekStart}.

PLANNED:
${planText}

ACTUAL ACTIVITIES:
${activitiesText}

Write a warm, concise coaching wrap-up (3–5 sentences) covering:
1. What was achieved versus the plan
2. Any standout positives or concerns from this week
3. One forward-looking recommendation for next week`;

  const stream = anthropic.messages.stream({
    model: CHAT_MODEL,
    max_tokens: 1024,
    system: systemBlock() as unknown as Anthropic.TextBlockParam[],
    messages: [
      {
        role: "user",
        content: [
          ...contextContent(ctx),
          { type: "text", text: prompt },
        ] as Anthropic.ContentBlockParam[],
      },
    ],
  });

  const msg = await stream.finalMessage();
  return extractText(msg.content);
}
