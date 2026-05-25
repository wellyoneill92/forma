"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

function SendIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
    </svg>
  );
}

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");

    const userMessage: Message = { role: "user", content: text };
    const assistantPlaceholder: Message = { role: "assistant", content: "" };

    setMessages((prev) => [...prev, userMessage, assistantPlaceholder]);
    setStreaming(true);

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch("/api/coaching/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });

      if (!res.ok || !res.body) throw new Error("Request failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let done = false;

      while (!done) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") { done = true; break; }
          try {
            const { text: chunk, error } = JSON.parse(payload);
            if (error) throw new Error(error);
            if (chunk) {
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: updated[updated.length - 1].content + chunk,
                };
                return updated;
              });
            }
          } catch {
            // skip malformed SSE lines
          }
        }
      }
    } catch (err) {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: `Sorry, something went wrong. ${String(err)}`,
        };
        return updated;
      });
    } finally {
      setStreaming(false);
      inputRef.current?.focus();
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="flex flex-col h-screen bg-forma-bg">

      {/* Header */}
      <header className="shrink-0 bg-white border-b border-forma-border px-4 h-12 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-forma-accent flex items-center justify-center">
            <span className="font-display text-xs font-black text-forma-accent-text">F</span>
          </div>
          <span className="font-display text-sm font-bold text-forma-text tracking-tight">Forma</span>
        </div>
        <span className="text-xs text-forma-text-secondary font-medium">Jack O&apos;Neill</span>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4 bg-forma-bg">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center pb-8">
            <div className="w-12 h-12 rounded-2xl bg-forma-accent flex items-center justify-center mb-4">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-forma-accent-text">
                <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="font-display text-lg font-bold text-forma-text mb-1">Your coach is ready</p>
            <p className="text-sm text-forma-text-secondary max-w-xs leading-relaxed">
              Ask about today&apos;s session, get a weekly plan, or review how yesterday&apos;s workout went.
            </p>
            <div className="mt-6 space-y-2 w-full max-w-sm">
              {[
                "Give me my training plan for this week",
                "How did yesterday's run go?",
                "Should I train hard today based on my recovery?",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => { setInput(suggestion); inputRef.current?.focus(); }}
                  className="w-full text-left text-sm text-forma-text-secondary bg-white border border-forma-border rounded-xl px-4 py-3 hover:border-forma-text-secondary hover:text-forma-text transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] md:max-w-[70%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-forma-text text-white rounded-br-md"
                  : "bg-white border border-forma-border text-forma-text rounded-bl-md"
              }`}
            >
              {msg.content || (
                <span className="inline-flex gap-1 items-center text-forma-text-secondary">
                  <span className="animate-bounce" style={{ animationDelay: "0ms" }}>·</span>
                  <span className="animate-bounce" style={{ animationDelay: "150ms" }}>·</span>
                  <span className="animate-bounce" style={{ animationDelay: "300ms" }}>·</span>
                </span>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-forma-border bg-white px-4 py-3">
        <div className="flex gap-2 items-end max-w-2xl mx-auto">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask your coach…"
            rows={1}
            disabled={streaming}
            className="flex-1 bg-forma-bg border border-forma-border rounded-xl px-4 py-2.5 text-sm text-forma-text placeholder:text-forma-text-secondary resize-none focus:outline-none focus:border-forma-text-secondary transition-colors disabled:opacity-50"
            style={{ maxHeight: "8rem", overflowY: "auto" }}
            onInput={(e) => {
              const t = e.currentTarget;
              t.style.height = "auto";
              t.style.height = t.scrollHeight + "px";
            }}
          />
          <button
            onClick={send}
            disabled={!input.trim() || streaming}
            className="w-9 h-9 rounded-xl bg-forma-accent flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
            aria-label="Send"
          >
            <span className="text-forma-accent-text"><SendIcon /></span>
          </button>
        </div>
        <p className="text-center font-mono text-xs text-forma-text-secondary mt-1.5">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
