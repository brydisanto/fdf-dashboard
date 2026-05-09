"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ChevronDown, ChevronUp, Fish } from "lucide-react";
import { fmtNum, fmtTimeAgo, fmtUsd, shortAddr } from "@/lib/format";
import { TIER_META, tierLabel } from "./WalletBadge";
import { ROSTER_BY_ID } from "@/lib/data/roster";
import type { TopNflWallet } from "@/lib/data";
import type { WalletTier } from "@/lib/types";

type SortKey = "nflValueUsd" | "positions" | "firstHeldAt" | "lastActiveAt";
type TierFilter = "ALL" | WalletTier;

const TIERS: TierFilter[] = ["ALL", "whale", "shark", "dolphin", "fish", "shrimp"];

export function TopWalletsTable({ wallets }: { wallets: TopNflWallet[] }) {
  const [tier, setTier] = useState<TierFilter>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("nflValueUsd");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filtered = useMemo(() => {
    let list = wallets.slice();
    if (tier !== "ALL") list = list.filter((w) => w.tier === tier);
    list.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      return 0;
    });
    return list;
  }, [wallets, tier, sortKey, sortDir]);

  const onSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      // first/last activity natural-asc reads as "oldest first"; flip to desc.
      setSortDir(key === "firstHeldAt" ? "asc" : "desc");
    }
  };

  // Reference: largest NFL value drives the bar widths in the value cell.
  const top = filtered[0]?.nflValueUsd ?? 0;

  return (
    <div>
      {/* Toolbar — tier filter */}
      <div
        className="flex flex-wrap items-center gap-3 border-b border-[var(--color-line)] px-5 py-4"
        style={{ background: "color-mix(in oklab, var(--color-press) 60%, transparent)" }}
      >
        <Seg
          options={TIERS}
          value={tier}
          onChange={(v) => setTier(v as TierFilter)}
          renderLabel={(t) => (t === "ALL" ? "ALL" : tierLabel(t as WalletTier).toUpperCase())}
        />
        <span
          className="ml-auto"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "10.5px",
            fontWeight: 600,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--color-text-dim)",
          }}
        >
          {filtered.length} {tier === "ALL" ? "wallets" : `${tierLabel(tier).toLowerCase()}s`}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-[13px]">
          <thead style={{ background: "color-mix(in oklab, var(--color-press) 50%, transparent)" }}>
            <tr className="border-b border-[var(--color-line)]">
              <Th align="center" className="pl-5">#</Th>
              <Th>Wallet</Th>
              <Th align="center">Tier</Th>
              <Th align="center" sortKey="nflValueUsd" current={sortKey} dir={sortDir} onSort={onSort}>
                NFL Value
              </Th>
              <Th align="center" sortKey="positions" current={sortKey} dir={sortDir} onSort={onSort}>
                Positions
              </Th>
              <Th align="center">Top Holding</Th>
              <Th align="center" sortKey="firstHeldAt" current={sortKey} dir={sortDir} onSort={onSort}>
                First Held
              </Th>
              <Th align="center" sortKey="lastActiveAt" current={sortKey} dir={sortDir} onSort={onSort} className="pr-5">
                Last Active
              </Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((w, i) => {
              const meta = TIER_META[w.tier];
              const barPct = top > 0 ? (w.nflValueUsd / top) * 100 : 0;
              const topPlayer = w.topPositionPlayerId ? ROSTER_BY_ID.get(w.topPositionPlayerId) : null;
              return (
                <tr
                  key={w.address}
                  className="transition-colors duration-[180ms] ease-out hover:bg-[color-mix(in_oklab,var(--color-press)_50%,transparent)]"
                  style={{ borderBottom: "1px solid var(--color-line)" }}
                >
                  <td
                    className="pl-5"
                    style={{
                      padding: "var(--row-pad-y) 8px var(--row-pad-y) 20px",
                      fontFamily: "var(--font-mono)",
                      fontWeight: 700,
                      color: "var(--color-text-dim)",
                      fontSize: 11,
                      textAlign: "center",
                    }}
                  >
                    {i + 1}
                  </td>
                  <Cell>
                    <Link
                      href={`/wallet/${w.address}`}
                      className="inline-flex items-center gap-2 hover:text-[var(--color-text)]"
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 12,
                        color: "var(--color-text-muted)",
                      }}
                    >
                      <Fish
                        width={meta.iconPx}
                        height={meta.iconPx}
                        style={{ color: meta.color }}
                      />
                      {shortAddr(w.address, 6, 6)}
                    </Link>
                  </Cell>
                  <CenterCell>
                    <span
                      className={`inline-flex items-center rounded-[var(--r-4)] border px-2 py-0.5 ${meta.pillBg} ${meta.pillBorder} ${meta.pillText}`}
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                      }}
                    >
                      {tierLabel(w.tier)}
                    </span>
                  </CenterCell>
                  <NumCell>
                    <div className="flex items-center justify-center gap-2">
                      <span className="holdings-bar" style={{ width: 56 }}>
                        <span
                          className="holdings-bar-fill"
                          style={{ width: `${Math.max(2, Math.min(100, barPct))}%` }}
                        />
                      </span>
                      <span className="font-semibold text-[var(--color-text)]" style={{ minWidth: 64, textAlign: "right" }}>
                        {fmtUsdSmart(w.nflValueUsd)}
                      </span>
                    </div>
                  </NumCell>
                  <NumCell>{fmtNum(w.positions)}</NumCell>
                  <NumCell>
                    {topPlayer ? (
                      <Link
                        href={`/player/${topPlayer.id}`}
                        className="inline-flex items-center gap-1.5 hover:text-[var(--accent-soft)]"
                      >
                        <span style={{ color: "var(--color-text)" }}>
                          {topPlayer.firstName[0]}. {topPlayer.lastName}
                        </span>
                        <span style={{ color: "var(--color-text-dim)" }}>
                          {fmtUsdSmart(w.topPositionUsd)}
                        </span>
                      </Link>
                    ) : (
                      <span style={{ color: "var(--color-text-dim)" }}>—</span>
                    )}
                  </NumCell>
                  <NumCell>
                    <span style={{ color: "var(--color-text-muted)" }}>
                      {w.firstHeldAt ? fmtTimeAgo(w.firstHeldAt) : "—"}
                    </span>
                  </NumCell>
                  <td
                    className="pr-5"
                    style={{
                      padding: "var(--row-pad-y) 12px",
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      fontVariantNumeric: "tabular-nums",
                      textAlign: "center",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    {w.lastActiveAt ? fmtTimeAgo(w.lastActiveAt) : "—"}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center text-sm text-[var(--color-text-muted)]">
                  No wallets match this filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Sub-$1k → integer dollars; $1k+ → compact form. Mirrors the
// WalletBadge convention so the leaderboard reads consistently.
function fmtUsdSmart(n: number): string {
  return n >= 1000
    ? fmtUsd(n, { compact: true })
    : fmtUsd(n, { digits: 0 });
}

function Cell({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-3" style={{ padding: "var(--row-pad-y) 12px" }}>
      {children}
    </td>
  );
}

function CenterCell({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-3 text-center" style={{ padding: "var(--row-pad-y) 12px" }}>
      <div className="flex items-center justify-center">{children}</div>
    </td>
  );
}

function NumCell({ children }: { children: React.ReactNode }) {
  return (
    <td
      className="text-center"
      style={{
        padding: "var(--row-pad-y) 12px",
        fontFamily: "var(--font-mono)",
        fontVariantNumeric: "tabular-nums",
        fontSize: 12.5,
      }}
    >
      {children}
    </td>
  );
}

function Th({
  children,
  align = "left",
  className,
  sortKey,
  current,
  dir,
  onSort,
}: {
  children: React.ReactNode;
  align?: "left" | "center" | "right";
  className?: string;
  sortKey?: SortKey;
  current?: SortKey;
  dir?: "asc" | "desc";
  onSort?: (key: SortKey) => void;
}) {
  const isSortable = !!sortKey && !!onSort;
  const active = isSortable && current === sortKey;
  const baseStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    color: active ? "var(--color-text)" : "var(--color-text-dim)",
    textAlign: align,
  };
  return (
    <th className={clsx("px-3 py-3 select-none", className)} style={baseStyle}>
      {isSortable ? (
        <button
          onClick={() => onSort!(sortKey!)}
          className={clsx(
            "inline-flex items-center gap-1 hover:text-[var(--color-text)]",
            align === "right" && "ml-auto",
            align === "center" && "mx-auto",
          )}
        >
          <span>{children}</span>
          {active && dir ? (
            dir === "asc" ? (
              <ChevronUp className="h-3 w-3" strokeWidth={1.5} />
            ) : (
              <ChevronDown className="h-3 w-3" strokeWidth={1.5} />
            )
          ) : null}
        </button>
      ) : (
        children
      )}
    </th>
  );
}

function Seg<T extends string>({
  options,
  value,
  onChange,
  renderLabel,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  renderLabel?: (v: T) => string;
}) {
  return (
    <div
      className="inline-flex items-center rounded-[var(--r-8)] border border-[var(--color-line)] bg-[var(--color-press)] p-[3px]"
      style={{ height: 38 }}
    >
      {options.map((o) => {
        const active = value === o;
        return (
          <button
            key={o}
            onClick={() => onChange(o)}
            className={clsx(
              "inline-flex h-[30px] items-center justify-center rounded-[5px] px-3 transition-colors",
              active
                ? "bg-[var(--color-bench)] text-[var(--accent-soft)]"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]",
            )}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.12em",
              boxShadow: active ? "inset 0 0 0 1px var(--accent-line)" : undefined,
            }}
          >
            {renderLabel ? renderLabel(o) : o}
          </button>
        );
      })}
    </div>
  );
}
