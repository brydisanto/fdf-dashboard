import Link from "next/link";
import clsx from "clsx";
import { Fish, Sparkles } from "lucide-react";
import { fmtUsd, shortAddr } from "@/lib/format";
import type { WalletTier } from "@/lib/types";

// Each tier escalates icon size + color so the wallet's weight is
// readable at a glance without resorting to emoji.
const TIER_META: Record<
  WalletTier,
  { label: string; size: number; color: string; ring?: string }
> = {
  whale:   { label: "Whale",   size: 16, color: "#7aa6ff",                          ring: "ring-1 ring-[#7aa6ff]/40" },
  shark:   { label: "Shark",   size: 14, color: "#a3b3ff" },
  dolphin: { label: "Dolphin", size: 12, color: "var(--color-brand-soft)" },
  fish:    { label: "Fish",    size: 11, color: "var(--color-text-muted)" },
  shrimp:  { label: "Shrimp",  size: 9,  color: "var(--color-text-dim)" },
};

export function WalletBadge({
  address,
  tier,
  totalValueUsd,
  isNew,
  compact = false,
}: {
  address: string;
  tier: WalletTier;
  totalValueUsd: number;
  isNew: boolean;
  compact?: boolean;
}) {
  const meta = TIER_META[tier];
  return (
    <Link
      href={`/wallet/${address}`}
      className={clsx(
        "group inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1.5 py-0.5 text-xs hover:border-[var(--color-brand)]/40 hover:text-[var(--color-text)]",
        meta.ring,
      )}
      title={`${meta.label} · ${fmtUsd(totalValueUsd, { compact: true })}`}
    >
      <Fish
        aria-hidden
        width={meta.size}
        height={meta.size}
        style={{ color: meta.color }}
        className="shrink-0"
      />
      {!compact ? (
        <span className="font-mono text-[11px] text-[var(--color-text-muted)] group-hover:text-[var(--color-text)]">
          {shortAddr(address)}
        </span>
      ) : null}
      <span className="tabular text-[11px] text-[var(--color-text-muted)] group-hover:text-[var(--color-text)]">
        {fmtUsd(totalValueUsd, { compact: true })}
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
