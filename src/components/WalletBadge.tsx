import Link from "next/link";
import clsx from "clsx";
import { Fish, Sparkles } from "lucide-react";
import { fmtUsd, shortAddr } from "@/lib/format";
import type { WalletTier } from "@/lib/types";

// Single source of truth for tier visuals — the wallet page hero
// pulls TIER_META.color too so the icon, label, and badge all stay
// in sync. iconPx grows with tier so a whale's badge reads visually
// heavier than a shrimp's.
export const TIER_META: Record<
  WalletTier,
  {
    label: string;
    iconPx: number;       // Fish icon size in the inline badge
    color: string;        // tier color, applied to icon stroke + ring
    borderClass: string;  // badge border tint
    valueClass: string;   // badge USD value color
    pillBg: string;
    pillBorder: string;
    pillText: string;
  }
> = {
  whale: {
    label: "Whale",
    iconPx: 16,
    color: "var(--color-broadcast)",
    borderClass: "border-[color-mix(in_oklab,var(--color-broadcast)_35%,transparent)]",
    valueClass: "text-[var(--color-broadcast)]",
    pillBg: "bg-[color-mix(in_oklab,var(--color-broadcast)_15%,transparent)]",
    pillBorder: "border-[color-mix(in_oklab,var(--color-broadcast)_40%,transparent)]",
    pillText: "text-[var(--color-broadcast)]",
  },
  shark: {
    label: "Shark",
    iconPx: 14,
    color: "var(--accent)",
    borderClass: "border-[color-mix(in_oklab,var(--accent)_35%,transparent)]",
    valueClass: "text-[var(--accent-soft)]",
    pillBg: "bg-[var(--accent-tint)]",
    pillBorder: "border-[var(--accent-line)]",
    pillText: "text-[var(--accent-soft)]",
  },
  dolphin: {
    label: "Dolphin",
    iconPx: 12,
    color: "var(--accent-soft)",
    borderClass: "border-[var(--color-line)]",
    valueClass: "text-[var(--accent-soft)]",
    pillBg: "bg-[var(--accent-tint)]",
    pillBorder: "border-[var(--accent-line)]",
    pillText: "text-[var(--accent-soft)]",
  },
  fish: {
    label: "Fish",
    iconPx: 11,
    color: "var(--color-text-muted)",
    borderClass: "border-[var(--color-line)]",
    valueClass: "text-[var(--accent-soft)]",
    pillBg: "bg-[var(--color-press)]",
    pillBorder: "border-[var(--color-line)]",
    pillText: "text-[var(--color-text-muted)]",
  },
  shrimp: {
    label: "Shrimp",
    iconPx: 9,
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
  // Prefer NFL-only value, but fall back to total when the wallet
  // currently holds 0 NFL (e.g. just sold out). Showing $0 NFL on
  // wallets with real Soccer / $FUN balances reads as missing data.
  const displayedUsd = nflValueUsd != null && nflValueUsd > 0 ? nflValueUsd : totalValueUsd;
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
      <span aria-hidden className="inline-flex shrink-0 items-center justify-center">
        {isNewVisual ? (
          <Sparkles
            width={12}
            height={12}
            style={{ color: "var(--color-flag)" }}
          />
        ) : (
          <Fish
            width={meta.iconPx}
            height={meta.iconPx}
            style={{ color: meta.color }}
          />
        )}
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
