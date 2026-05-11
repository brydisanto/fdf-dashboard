import Link from "next/link";
import clsx from "clsx";
import { Fish, Sparkles } from "lucide-react";
import { fmtUsd, shortAddr } from "@/lib/format";
import { getWalletLabel } from "@/lib/data/wallet-labels";
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
  const label = getWalletLabel(address);
  // NFL-only — never fall back to total. A wallet currently
  // holding 0 NFL displays $0 here even if it has Soccer / $FUN
  // balances; the badge is specifically the NFL portfolio value.
  const displayedUsd = nflValueUsd ?? 0;
  // Sub-$1k values round to whole dollars (no cents). $1k+ uses
  // the compact form ($1.26K, $11.26K, etc.).
  const displayedUsdLabel =
    displayedUsd >= 1000
      ? fmtUsd(displayedUsd, { compact: true })
      : fmtUsd(displayedUsd, { digits: 0 });
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
            // Labelled wallets render their friendly name in the UI
            // font (and pull a touch brighter) so they read as
            // "this is a known entity" instead of "anonymous addr".
            fontFamily: label ? "var(--font-ui)" : "var(--font-mono)",
            fontSize: "11px",
            fontWeight: label ? 600 : undefined,
            color: label ? "var(--color-text)" : "var(--color-text-muted)",
          }}
        >
          {label ? label.name : shortAddr(address)}
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
        {isNewVisual ? "NEW" : displayedUsdLabel}
      </span>
    </Link>
  );
}

export function tierLabel(tier: WalletTier): string {
  return TIER_META[tier].label;
}
