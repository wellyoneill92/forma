"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PlanActions({ hasPlan }: { hasPlan: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/coaching/plan", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? "Generation failed");
      }
      router.refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5 shrink-0">
      <button
        onClick={generate}
        disabled={loading}
        className="text-xs font-semibold px-4 py-2 rounded-xl bg-forma-text text-white hover:opacity-80 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
      >
        {loading ? "Generating…" : hasPlan ? "Regenerate" : "Generate plan"}
      </button>
      {loading && <p className="text-xs text-forma-text-muted text-right">~30–60 seconds</p>}
      {error && <p className="text-xs text-forma-red max-w-[160px] text-right leading-tight">{error}</p>}
    </div>
  );
}
