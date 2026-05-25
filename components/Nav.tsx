"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  {
    href: "/",
    label: "Dashboard",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
      </svg>
    ),
  },
  {
    href: "/plan",
    label: "Training Plan",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    href: "/chat",
    label: "Coach",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7z" clipRule="evenodd" />
      </svg>
    ),
  },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop sidebar */}
      <nav className="hidden md:flex flex-col fixed left-0 top-0 h-full w-52 bg-white border-r border-forma-border z-20 p-5">
        <div className="mb-8">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-forma-accent flex items-center justify-center">
              <span className="font-display text-xs font-black text-forma-text">F</span>
            </div>
            <span className="font-display text-base font-bold text-forma-text tracking-tight">Forma</span>
          </div>
        </div>

        <div className="space-y-0.5 flex-1">
          {items.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  active
                    ? "bg-forma-text text-white"
                    : "text-forma-text-secondary hover:text-forma-text hover:bg-forma-bg"
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="pt-4 border-t border-forma-border">
          <p className="text-xs text-forma-text-muted font-mono">Jack O&apos;Neill</p>
          <p className="text-xs text-forma-text-muted truncate">jack.oneill@merkle.com</p>
        </div>
      </nav>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-forma-border z-20">
        <div className="flex">
          {items.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors ${
                  active ? "text-forma-text" : "text-forma-text-muted"
                }`}
              >
                <span className={`p-1.5 rounded-lg transition-colors ${active ? "bg-forma-accent" : ""}`}>
                  {item.icon}
                </span>
                <span>{item.label === "Training Plan" ? "Plan" : item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
