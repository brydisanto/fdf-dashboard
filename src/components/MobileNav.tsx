"use client";

import Link from "next/link";
import { useState } from "react";
import { Flame, Menu, X } from "lucide-react";

// Mobile nav: hamburger button + slide-down panel.
// Hidden on md+ (the desktop nav inside layout.tsx takes over there).
//
// Kept deliberately simple — no portal, no scroll lock, no animations
// beyond a CSS transition on the panel max-height. The header is
// sticky, so the panel hangs from it naturally and closes on link tap.

const LINKS: Array<{ href: string; label: string; highlight?: boolean; icon?: React.ReactNode }> = [
  { href: "/", label: "Overview" },
  { href: "/#players", label: "Players" },
  { href: "/#trades", label: "Live Feed" },
  { href: "/wallets", label: "Wallets" },
  { href: "/on-fire", label: "On Fire", icon: <Flame className="h-3.5 w-3.5" strokeWidth={2} /> },
  { href: "/value", label: "Value Plays", highlight: true },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--r-8)] border border-[var(--color-line)] bg-[var(--color-bench)] text-[var(--color-text)] transition-colors hover:bg-[var(--color-press)]"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Slide-down panel — overlays the page below the sticky header */}
      <div
        className={`absolute left-0 right-0 top-16 z-30 overflow-hidden border-b border-[var(--color-line)] bg-[color-mix(in_oklab,var(--color-stadium)_95%,transparent)] backdrop-blur transition-[max-height] duration-200 ease-out ${
          open ? "max-h-[420px]" : "max-h-0"
        }`}
      >
        <nav className="mx-auto flex max-w-[var(--max-w)] flex-col gap-1 px-5 py-3">
          {LINKS.map((link) =>
            link.highlight ? (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="inline-flex items-center gap-2 rounded-[var(--r-8)] border px-3 py-3 text-[14px] font-bold transition-colors"
                style={{
                  borderColor: "var(--accent-line)",
                  background: "var(--accent-tint)",
                  color: "var(--accent-soft)",
                }}
              >
                {link.icon}
                <span>{link.label}</span>
              </Link>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="inline-flex items-center gap-2 rounded-[var(--r-8)] px-3 py-3 text-[14px] font-bold text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bench)] hover:text-[var(--color-text)]"
              >
                {link.icon}
                <span>{link.label}</span>
              </Link>
            ),
          )}
        </nav>
      </div>
    </div>
  );
}
