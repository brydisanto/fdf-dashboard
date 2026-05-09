import Link from "next/link";
import clsx from "clsx";
import { Fish, Sparkles } from "lucide-react";
import { fmtUsd, shortAddr } from "@/lib/format";
import type { WalletTier } from "@/lib/types";

// Each tier has its own icon size + color so the wallet's weight is
// readable at a glance. Single source of truth — both the trade-feed
// badge and the wallet page hero pull from this map so the visual
// language stays consistent across the app.
export const TIER_META: Record<
  WalletTier,
  { label: string; size: number; color: string; ringClass?: string; pillBg: string; pillBorder: string; pillText: string }
> = {
  whale: {
    label: "Whale",
    size: 16,
    color: "#7aa6ff",
    ringClass: "ring-1 ring-[#7aa6ff]/40",
    pillBg: "bg-[#7aa6ff]/15",
    pillBorder: "border-[#7aa6ff]/40",
    pillText: "text-[#a8c2ff]",
  },
  shark: {
    label: "Shark",
    size: 14,
    color: "#a3b3ff",
    pillBg: "bg-[#a3b3ff]/15",
    pillBorder: "border-[#a3b3ff]/40",
    pillText: "text-[#bcc6ff]",
  },
  dolphin: {
    label: "Dolphin",
    size: 12,
    color: "var(--color-brand-soft)",
    pillBg: "bg-[var(--color-brand)]/15",
    pillBorder: "border-[var(--color-brand)]/40",
    pillText: "text-[var(--color-brand-soft)]",
  },
  fish: {
    label: "Fish",
    size: 11,
    color: "var(--color-text-muted)",
    pillBg: "bg-[var(--color-surface-2)]",
    pillBorder: "border-[var(--color-border)]",
    pillText: "text-[var(--color-text-muted)]",
  },
  shrimp: {
    label: "Shrimp",
    size: 9,
    color: "var(--color-text-dim)",
    pillBg: "bg-[var(--color-surface-2)]/60",
    pillBorder: "border-[var(--color-border)]",
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
  // total when not provided (e.g. a caller hasn't been migrated yet).
  nflValueUsd?: number;
  isNew: boolean;
  compact?: boolean;
}) {
  const meta = TIER_META[tier];
  const displayedUsd = nflValueUsd ?? totalValueUsd;
  return (
    <Link
      href={`/wallet/${address}`}
      className={clsx(
        "group inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1.5 py-0.5 text-xs hover:border-[var(--color-brand)]/40 hover:text-[var(--color-text)]",
        meta.ringClass,
      )}
      title={`${meta.label} · NFL ${fmtUsd(displayedUsd, { compact: true })} · Total ${fmtUsd(totalValueUsd, { compact: true })}`}
    >
      <Fish
        aria-hidden
        width={meta.size}
        height={meta.size}
        style={{ color: meta.color }}
        className="shrink-0"
      />
      <span
        className={clsx(
          "rounded px-1 text-[9px] font-bold uppercase tracking-[0.12em] leading-none py-0.5 border",
          meta.pillBg,
          meta.pillBorder,
          meta.pillText,
        )}
      >
        {meta.label}
      </span>
      {!compact ? (
        <span className="font-mono text-[11px] text-[var(--color-text-muted)] group-hover:text-[var(--color-text)]">
          {shortAddr(address)}
        </span>
      ) : null}
      <span className="tabular text-[11px] text-[var(--color-text-muted)] group-hover:text-[var(--color-text)]">
        {fmtUsd(displayedUsd, { compact: true })}
      </span>
      {isNew ? (
        <span
          aria-label="New wallet (first holding within 7 days)"
          title="New wallet"
          className="inline-flex items-center text-[var(--color-gain)]"
        >
          <Sparkles className="h-3 w-3" />
        </span>
      ) : null}
    </Link>
  );
}

export function tierLabel(tier: WalletTier): string {
  return TIER_META[tier].label;
}
