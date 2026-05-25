export default function Home() {
  return (
    <main className="flex flex-col min-h-screen items-center justify-center px-6">
      <div className="max-w-lg w-full">
        <div className="mb-12">
          <span className="font-mono text-xs tracking-widest text-forma-text-secondary uppercase">
            AI Coaching Intelligence
          </span>
          <h1 className="font-display text-6xl font-bold text-forma-text mt-3 mb-4">
            Forma
          </h1>
          <p className="text-forma-text-secondary text-lg leading-relaxed">
            Your coach has done the homework. Come back when the app is live.
          </p>
        </div>

        <div className="border border-forma-border rounded-lg p-6 bg-forma-surface">
          <p className="font-mono text-xs text-forma-text-secondary uppercase tracking-wider mb-3">
            Build Status
          </p>
          <div className="space-y-2">
            {[
              { step: "01", label: "GitHub repo & scaffold", status: "complete" },
              { step: "02", label: "Garmin MCP data audit", status: "pending" },
              { step: "03", label: "Supabase schema", status: "pending" },
              { step: "04", label: "Garmin sync script", status: "pending" },
              { step: "05", label: "Coaching brain", status: "pending" },
              { step: "06", label: "Next.js application", status: "pending" },
              { step: "07", label: "Vercel deployment", status: "pending" },
            ].map(({ step, label, status }) => (
              <div key={step} className="flex items-center gap-4">
                <span className="font-mono text-xs text-forma-text-muted w-6">{step}</span>
                <span className={`text-sm ${status === "complete" ? "text-forma-accent" : "text-forma-text-muted"}`}>
                  {label}
                </span>
                {status === "complete" && (
                  <span className="ml-auto font-mono text-xs text-forma-accent">✓</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
