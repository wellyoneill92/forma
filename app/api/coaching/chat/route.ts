import { buildCoachingContext } from "@/lib/coaching/context";
import { streamChat } from "@/lib/coaching/brain";

export const maxDuration = 120;

export async function POST(req: Request) {
  let body: { message?: string; history?: { role: "user" | "assistant"; content: string }[] };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { message, history = [] } = body;

  if (!message || typeof message !== "string") {
    return new Response(JSON.stringify({ error: "message is required" }), { status: 400 });
  }
  if (message.length > 4000) {
    return new Response(JSON.stringify({ error: "message too long" }), { status: 400 });
  }
  if (!Array.isArray(history) || history.length > 40) {
    return new Response(JSON.stringify({ error: "invalid history" }), { status: 400 });
  }
  // History must alternate roles: user, assistant, user, assistant…
  if (history.some((m, i) => m.role !== (i % 2 === 0 ? "user" : "assistant"))) {
    return new Response(JSON.stringify({ error: "history roles must alternate user/assistant" }), { status: 400 });
  }

  const ctx = await buildCoachingContext();
  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamChat(ctx, history, message)) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`)
          );
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (err) {
        console.error("[coaching/chat]", err);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: "Something went wrong" })}\n\n`)
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
