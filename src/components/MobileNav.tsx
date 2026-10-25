"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Flame, Menu, X } from "lucide-react";
import { NAV, isActive, isGroup, type NavLinkItem } from "@/lib/nav";

// Mobile nav: hamburger button + slide-down panel.
// Hidden on lg+ (DesktopNav takes over there).
//
// Kept deliberately simple: no portal, no scroll lock, no animations
// beyond a CSS transition on the panel max-height. The header is
// sticky, so the panel hangs from it naturally and closes on link tap.
// Links sit two to a row, with the nav's groups as labeled sections, so
// every page fits without scrolling the panel.

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const close = () => setOpen(false);

  const loose = NAV.filter((e) => !isGroup(e)) as NavLinkItem[];
  const groups = NAV.filter(isGroup);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--r-8)] border border-[var(--color-line)] bg-[var(--color-bench)] text-[var(--color-text)] transition-colors hover:bg-[var(--color-press)]"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Slide-down panel, overlays the page below the sticky header */}
      <div
        className={`absolute left-0 right-0 top-16 z-30 overflow-y-auto border-b border-[var(--color-line)] bg-[color-mix(in_oklab,var(--color-stadium)_95%,transparent)] backdrop-blur transition-[max-height] duration-200 ease-out ${
          open ? "max-h-[calc(100dvh-4rem)]" : "max-h-0"
        }`}
      >
        <nav className="mx-auto flex max-w-[var(--max-w)] flex-col gap-4 px-5 py-4">
          <Section>
            {loose.map((l) => <Item key={l.href} link={l} active={isActive(l.href, pathname)} onClick={close} />)}
          </Section>
          {groups.map((g) => (
            <Section key={g.label} label={g.label}>
              {g.items.map((l) => <Item key={l.href} link={l} active={isActive(l.href, pathname)} onClick={close} />)}
            </Section>
          ))}
        </nav>
      </div>
    </div>
  );
}

function Section({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div>
      {label ? (
        <div className="mono-eyebrow mb-1.5 px-3" style={{ fontSize: "10px" }}>
          {label}
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-1">{children}</div>
    </div>
  );
}

function Item({ link, active, onClick }: { link: NavLinkItem; active: boolean; onClick: () => void }) {
  return (
    <Link
      href={link.href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`inline-flex items-center gap-2 rounded-[var(--r-8)] px-3 py-2.5 text-[14px] font-bold transition-colors ${
        active
          ? "bg-[var(--color-bench)] text-[var(--color-text)]"
          : "text-[var(--color-text-muted)] hover:bg-[var(--color-bench)] hover:text-[var(--color-text)]"
      }`}
    >
      {link.flame ? <Flame className="h-3.5 w-3.5" strokeWidth={2} /> : null}
      <span>{link.label}</span>
    </Link>
  );
}
