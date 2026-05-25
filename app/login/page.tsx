"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [digits, setDigits] = useState(["", "", "", ""]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const router = useRouter();

  useEffect(() => {
    inputs.current[0]?.focus();
  }, []);

  async function submit(pin: string) {
    setLoading(true);
    setError(false);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    if (res.ok) {
      router.push("/chat");
    } else {
      setError(true);
      setDigits(["", "", "", ""]);
      setLoading(false);
      inputs.current[0]?.focus();
    }
  }

  function handleChange(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);
    setError(false);

    if (digit && index < 3) {
      inputs.current[index + 1]?.focus();
    }

    if (digit && index === 3) {
      const pin = next.join("");
      if (pin.length === 4) submit(pin);
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      const next = [...digits];
      next[index - 1] = "";
      setDigits(next);
      inputs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
    if (pasted.length === 4) {
      setDigits(pasted.split(""));
      submit(pasted);
    }
  }

  return (
    <div className="min-h-screen bg-forma-bg flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow p-8 w-full max-w-xs text-center">

        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-7 h-7 rounded-lg bg-forma-accent flex items-center justify-center">
            <span className="font-display text-xs font-black text-forma-accent-text">F</span>
          </div>
          <span className="font-display text-base font-bold text-forma-text">Forma</span>
        </div>

        <p className="text-sm font-medium text-forma-text-secondary mb-6">Enter your PIN</p>

        <div className="flex justify-center gap-3 mb-6" onPaste={handlePaste}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={el => { inputs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={e => handleChange(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              disabled={loading}
              className={`w-14 h-14 text-center text-xl font-bold rounded-xl border-2 bg-forma-bg text-forma-text focus:outline-none transition-colors ${
                error
                  ? "border-forma-red"
                  : d
                  ? "border-forma-text"
                  : "border-forma-border focus:border-forma-text-secondary"
              }`}
            />
          ))}
        </div>

        {error && (
          <p className="text-xs text-forma-red font-medium">Incorrect PIN — try again</p>
        )}
        {loading && (
          <p className="text-xs text-forma-text-secondary">Signing in…</p>
        )}
      </div>
    </div>
  );
}
