"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ChevronDown, ChevronUp, Fish } from "lucide-react";
import { fmtNum, fmtTimeAgo, fmtUsd, shortAddr, shortPlayerName } from "@/lib/format";
import { PlayerStatusBadge } from "./PlayerStatusBadge";
import { TIER_META, tierLabel } from "./WalletBadge";
import { ROSTER_BY_ID } from "@/lib/data/roster";
import { getWalletLabel } from "@/lib/data/wallet-labels";
import type { TopNflWallet } from "@/lib/data";
import type { WalletTier } from "@/lib/types";

type SortKey = "nflValueUsd" | "positions" | "funBalance" | "firstHeldAt" | "lastActiveAt";
type TierFilter = "ALL" | WalletTier;

const TIERS: TierFilter[] = ["ALL", "whale", "shark", "dolphin", "fish", "shrimp"];
const PAGE_SIZE = 25;

export function TopWalletsTable({ wallets }: { wallets: TopNflWallet[] }) {
  const [tier, setTier] = useState<TierFilter>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("nflValueUsd");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);

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
    setPage(0);
  };

  // Pagination math — clamp page when filter shrinks the list.
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, filtered.length);
  const pageRows = filtered.slice(start, end);

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
          onChange={(v) => {
            setTier(v as TierFilter);
            setPage(0);
          }}
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
        <table className="w-full min-w-[1080px] text-[13px]">
          <thead style={{ background: "color-mix(in oklab, var(--color-press) 50%, transparent)" }}>
            <tr className="border-b border-[var(--color-line)]">
              <Th align="left" className="pl-5">#</Th>
              <Th align="left">Wallet</Th>
              <Th align="center">Tier</Th>
              <Th align="center" sortKey="nflValueUsd" current={sortKey} dir={sortDir} onSort={onSort} emphasized>
                NFL Value
              </Th>
              <Th align="center" sortKey="positions" current={sortKey} dir={sortDir} onSort={onSort}>
                Positions
              </Th>
              <Th align="center">Top Holding</Th>
              <Th align="center" sortKey="funBalance" current={sortKey} dir={sortDir} onSort={onSort}>
                $FUN
              </Th>
              <Th align="center" sortKey="firstHeldAt" current={sortKey} dir={sortDir} onSort={onSort}>
                First Held
              </Th>
              <Th align="center" sortKey="lastActiveAt" current={sortKey} dir={sortDir} onSort={onSort} className="pr-5">
                Last Active
              </Th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((w, i) => {
              const globalIdx = start + i;
              const meta = TIER_META[w.tier];
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
                      textAlign: "left",
                    }}
                  >
                    {globalIdx + 1}
                  </td>
                  <Cell>
                    <Link
                      href={`/wallet/${w.address}`}
                      className="inline-flex items-center gap-2 hover:text-[var(--color-text)]"
                      style={{
                        fontFamily: getWalletLabel(w.address) ? "var(--font-ui)" : "var(--font-mono)",
                        fontSize: 12.5,
                        fontWeight: getWalletLabel(w.address) ? 600 : undefined,
                        color: getWalletLabel(w.address)
                          ? "var(--color-text)"
                          : "var(--color-text-muted)",
                      }}
                    >
                      <Fish
                        width={meta.iconPx}
                        height={meta.iconPx}
                        style={{ color: meta.color }}
                      />
                      {getWalletLabel(w.address)?.name ?? shortAddr(w.address, 6, 6)}
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
                  {/* Primary metric: accent-soft color + heavier
                      weight + faint accent-tint cell wash so the
                      NFL Value column reads as the headline number
                      across the row. */}
                  <td
                    className="text-center"
                    style={{
                      padding: "var(--row-pad-y) 12px",
                      fontFamily: "var(--font-mono)",
                      fontVariantNumeric: "tabular-nums",
                      fontSize: 14,
                      fontWeight: 700,
                      color: "var(--accent-soft)",
                      background: "color-mix(in oklab, var(--accent) 4%, transparent)",
                    }}
                  >
                    {fmtUsdSmart(w.nflValueUsd)}
                  </td>
                  <NumCell>{fmtNum(w.positions)}</NumCell>
                  <NumCell>
                    {topPlayer ? (
                      <Link
                        href={`/player/${topPlayer.id}`}
                        className="inline-flex items-center gap-1.5 hover:text-[var(--accent-soft)]"
                      >
                        <span style={{ color: "var(--color-text)" }}>
                          {shortPlayerName(topPlayer.firstName, topPlayer.lastName)}
                        </span>
                        <PlayerStatusBadge playerId={topPlayer.id} size={11} />
                        <span style={{ color: "var(--color-text-dim)" }}>
                          {fmtUsdSmart(w.topPositionUsd)}
                        </span>
                      </Link>
                    ) : (
                      <span style={{ color: "var(--color-text-dim)" }}>—</span>
                    )}
                  </NumCell>
                  <NumCell>
                    {w.funBalance > 0 ? (
                      <span style={{ color: "var(--color-text)", fontWeight: 600 }}>
                        {fmtNum(w.funBalance, { compact: true, digits: 2 })}
                      </span>
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
                <td colSpan={9} className="px-5 py-12 text-center text-sm text-[var(--color-text-muted)]">
                  No wallets match this filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {filtered.length > PAGE_SIZE ? (
        <div
          className="flex items-center justify-between gap-3 border-t border-[var(--color-line)] px-5 py-3"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.06em",
            color: "var(--color-text-muted)",
          }}
        >
          <span>
            Showing <span style={{ color: "var(--color-text)", fontWeight: 700 }}>{start + 1}–{end}</span>
            {" "}of{" "}
            <span style={{ color: "var(--color-text)", fontWeight: 700 }}>{filtered.length}</span>
          </span>
          <div className="flex items-center gap-2">
            <PageBtn onClick={() => setPage(0)} disabled={safePage === 0}>« First</PageBtn>
            <PageBtn onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0}>Prev</PageBtn>
            <span
              className="px-2"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                fontWeight: 700,
                color: "var(--color-text)",
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "0.04em",
              }}
            >
              {safePage + 1} / {pageCount}
            </span>
            <PageBtn onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={safePage === pageCount - 1}>Next</PageBtn>
            <PageBtn onClick={() => setPage(pageCount - 1)} disabled={safePage === pageCount - 1}>Last »</PageBtn>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PageBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "rounded-[var(--r-4)] border border-[var(--color-line)] bg-[var(--color-press)] px-2.5 py-1 transition-colors",
        disabled
          ? "cursor-not-allowed opacity-40"
          : "hover:border-[var(--accent-line)] hover:text-[var(--accent-soft)]",
      )}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: "var(--color-text-muted)",
      }}
    >
      {children}
    </button>
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
    <td className="px-3" style={{ padding: "var(--row-pad-y) 12px", textAlign: "left" }}>
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
  emphasized,
}: {
  children: React.ReactNode;
  align?: "left" | "center" | "right";
  className?: string;
  sortKey?: SortKey;
  current?: SortKey;
  dir?: "asc" | "desc";
  onSort?: (key: SortKey) => void;
  // Highlights the column header with an accent-tint wash —
  // matches the body cells of the highlighted column so the
  // headline metric reads as a continuous accent band top to bottom.
  emphasized?: boolean;
}) {
  const isSortable = !!sortKey && !!onSort;
  const active = isSortable && current === sortKey;
  const baseStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    color: emphasized
      ? "var(--accent-soft)"
      : active
        ? "var(--color-text)"
        : "var(--color-text-dim)",
    textAlign: align,
    background: emphasized
      ? "color-mix(in oklab, var(--accent) 4%, transparent)"
      : undefined,
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
