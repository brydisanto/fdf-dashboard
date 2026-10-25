"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Flame } from "lucide-react";
import { NAV, isActive, isGroup, type NavGroup, type NavLinkItem } from "@/lib/nav";

// Desktop bar: plain links plus dropdown groups, so ten pages fit on one
// line beside the logo. A dropdown opens on hover or click, and closes on
// outside click, Escape, or picking a page.

const ITEM =
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-[var(--r-8)] px-2.5 py-1.5 text-[13px] font-bold transition-colors";

export function DesktopNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="flex items-center gap-0.5">
      {NAV.map((e) =>
        isGroup(e) ? (
          <Dropdown
            key={e.label}
            group={e}
            pathname={pathname}
            open={open === e.label}
            setOpen={(o) => setOpen(o ? e.label : null)}
          />
        ) : (
          <TopLink key={e.href} item={e} active={isActive(e.href, pathname)} />
        ),
      )}
    </div>
  );
}

function TopLink({ item, active }: { item: NavLinkItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`${ITEM} ${
        active
          ? "bg-[var(--color-bench)] text-[var(--color-text)]"
          : "text-[var(--color-text-muted)] hover:bg-[var(--color-bench)] hover:text-[var(--color-text)]"
      }`}
    >
      {item.flame ? <Flame className="h-3.5 w-3.5" strokeWidth={2} /> : null}
      {item.short ?? item.label}
    </Link>
  );
}

function Dropdown({
  group,
  pathname,
  open,
  setOpen,
}: {
  group: NavGroup;
  pathname: string;
  open: boolean;
  setOpen: (o: boolean) => void;
}) {
  const active = group.items.some((i) => isActive(i.href, pathname));
  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`${ITEM} ${
          active || open
            ? "bg-[var(--color-bench)] text-[var(--color-text)]"
            : "text-[var(--color-text-muted)] hover:bg-[var(--color-bench)] hover:text-[var(--color-text)]"
        }`}
      >
        {group.label}
        <ChevronDown
          className="h-3.5 w-3.5 transition-transform duration-150"
          style={{ transform: open ? "rotate(180deg)" : undefined }}
        />
      </button>
      {/* pt-2 bridges the gap so the hover doesn't drop between button and panel */}
      <div className={`absolute left-0 top-full z-40 pt-2 ${open ? "block" : "hidden"}`}>
        <div
          className="w-[280px] overflow-hidden rounded-[var(--r-14)] border border-[var(--color-line)] p-1.5 shadow-lg"
          style={{ background: "color-mix(in oklab, var(--color-stadium) 96%, transparent)", backdropFilter: "blur(12px)" }}
        >
          {group.items.map((i) => {
            const on = isActive(i.href, pathname);
            return (
              <Link
                key={i.href}
                href={i.href}
                onClick={() => setOpen(false)}
                aria-current={on ? "page" : undefined}
                className={`block rounded-[var(--r-8)] px-3 py-2.5 transition-colors ${
                  on ? "bg-[var(--color-bench)]" : "hover:bg-[var(--color-bench)]"
                }`}
              >
                <div
                  className="text-[13px] font-bold"
                  style={{ color: on ? "var(--accent-soft)" : "var(--color-text)" }}
                >
                  {i.label}
                </div>
                {i.hint ? (
                  <div className="mt-0.5 text-[12px]" style={{ color: "var(--color-text-dim)" }}>
                    {i.hint}
                  </div>
                ) : null}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
