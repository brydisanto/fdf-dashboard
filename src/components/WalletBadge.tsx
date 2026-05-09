import Link from "next/link";
import clsx from "clsx";
import { fmtUsd, shortAddr } from "@/lib/format";
import type { WalletTier } from "@/lib/types";

// Single source of truth for tier visuals — the wallet page hero
// pulls TIER_META.color too so the icon, label, and badge all stay
// in sync. The values in `pillBg/Border/Text` are tuned for the
// hero pill on the detail page; the badge below uses its own
// border-tint via TIER_META.borderClass.
export const TIER_META: Record<
  WalletTier,
  {
    label: string;        // visible tier label
    glyph: string;        // tier glyph used in the badge (whale/shark/●/★)
    color: string;        // pure tier color — used for the hero icon
    borderClass: string;  // badge border tint
    valueClass: string;   // badge USD value color
    pillBg: string;
    pillBorder: string;
    pillText: string;
    bgClass?: string;     // optional badge bg (e.g. NEW)
  }
> = {
  whale: {
    label: "Whale",
    glyph: "🐋",
    color: "var(--color-broadcast)",
    borderClass: "border-[color-mix(in_oklab,var(--color-broadcast)_35%,transparent)]",
    valueClass: "text-[var(--color-broadcast)]",
    pillBg: "bg-[color-mix(in_oklab,var(--color-broadcast)_15%,transparent)]",
    pillBorder: "border-[color-mix(in_oklab,var(--color-broadcast)_40%,transparent)]",
    pillText: "text-[var(--color-broadcast)]",
  },
  shark: {
    label: "Shark",
    glyph: "🦈",
    color: "var(--accent)",
    borderClass: "border-[color-mix(in_oklab,var(--accent)_35%,transparent)]",
    valueClass: "text-[var(--accent-soft)]",
    pillBg: "bg-[var(--accent-tint)]",
    pillBorder: "border-[var(--accent-line)]",
    pillText: "text-[var(--accent-soft)]",
  },
  dolphin: {
    label: "Dolphin",
    glyph: "●",
    color: "var(--accent-soft)",
    borderClass: "border-[var(--color-line)]",
    valueClass: "text-[var(--accent-soft)]",
    pillBg: "bg-[var(--accent-tint)]",
    pillBorder: "border-[var(--accent-line)]",
    pillText: "text-[var(--accent-soft)]",
  },
  fish: {
    label: "Fish",
    glyph: "●",
    color: "var(--color-text-muted)",
    borderClass: "border-[var(--color-line)]",
    valueClass: "text-[var(--accent-soft)]",
    pillBg: "bg-[var(--color-press)]",
    pillBorder: "border-[var(--color-line)]",
    pillText: "text-[var(--color-text-muted)]",
  },
  shrimp: {
    label: "Shrimp",
    glyph: "●",
    color: "var(--color-text-dim)",
    borderClass: "border-[var(--color-line)]",
    valueClass: "text-[var(--accent-soft)]",
    pillBg: "bg-[var(--color-press)]/60",
    pillBorder: "border-[var(--color-line)]",
    pillText: "text-[var(--color-text-dim)]",
  },
};

export function WalletBadge({
  address,
  tier,
  totalValueUsd,
  nflValueUsd,
  isNew,
  compact = false,
}: {
  address: string;
  tier: WalletTier;
  totalValueUsd: number;
  // NFL-only $ value — what the trade-feed surfaces. Falls back to
  // total when not provided.
  nflValueUsd?: number;
  isNew: boolean;
  compact?: boolean;
}) {
  const meta = TIER_META[tier];
  const displayedUsd = nflValueUsd ?? totalValueUsd;
  // NEW trumps tier visual.
  const isNewVisual = isNew;
  return (
    <Link
      href={`/wallet/${address}`}
      title={`${meta.label} · NFL ${fmtUsd(displayedUsd, { compact: true })} · Total ${fmtUsd(totalValueUsd, { compact: true })}`}
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border bg-[var(--color-press)] hover:bg-[var(--color-bench)] transition-colors",
        isNewVisual
          ? "border-[color-mix(in_oklab,var(--color-flag)_35%,transparent)] bg-[color-mix(in_oklab,var(--color-flag)_8%,transparent)]"
          : meta.borderClass,
      )}
      style={{ padding: "4px 10px 4px 6px", fontSize: "11.5px" }}
    >
      <span aria-hidden style={{ fontSize: "13px", lineHeight: 1 }}>
        {isNewVisual ? "★" : meta.glyph}
      </span>
      {!compact ? (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            color: "var(--color-text-muted)",
          }}
        >
          {shortAddr(address)}
        </span>
      ) : null}
      <span className="h-3 w-px bg-[var(--color-line)]" />
      <span
        className={isNewVisual ? "text-[var(--color-flag)]" : meta.valueClass}
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "10px",
          fontWeight: 700,
          letterSpacing: "0.06em",
          paddingLeft: "2px",
        }}
      >
        {isNewVisual ? "NEW" : fmtUsd(displayedUsd, { compact: true })}
      </span>
    </Link>
  );
}

export function tierLabel(tier: WalletTier): string {
  return TIER_META[tier].label;
}
