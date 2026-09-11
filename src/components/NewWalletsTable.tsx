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
import type { NewWalletRow } from "@/lib/data/new-wallets";

type SortKey = "firstSeenAt" | "firstUsd" | "trades" | "buyUsd" | "sellUsd" | "netUsd" | "nflValueUsd" | "lastActiveAt";
type Window = "24H" | "7D" | "30D";
type Status = "ALL" | "HOLDING" | "EXITED";

const WINDOWS: Window[] = ["24H", "7D", "30D"];
const STATUSES: Status[] = ["ALL", "HOLDING", "EXITED"];
const WINDOW_MS: Record<Window, number> = {
  "24H": 24 * 60 * 60 * 1000,
  "7D": 7 * 24 * 60 * 60 * 1000,
  "30D": 30 * 24 * 60 * 60 * 1000,
};
const PAGE_SIZE = 25;

const SIDE_LABEL: Record<NewWalletRow["firstSide"], { text: string; color: string }> = {
  "buy":      { text: "BUY",      color: "var(--color-turf)" },
  "swap-in":  { text: "SWAP IN",  color: "var(--color-turf)" },
  "sell":     { text: "SELL",     color: "var(--color-penalty)" },
  "swap-out": { text: "SWAP OUT", color: "var(--color-penalty)" },
};

export function NewWalletsTable({ rows, now }: { rows: NewWalletRow[]; now: number }) {
  const [window, setWindow] = useState<Window>("7D");
  const [status, setStatus] = useState<Status>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("firstSeenAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const cutoff = now - WINDOW_MS[window];
    let list = rows.filter((r) => r.firstSeenAt >= cutoff);
    if (status === "HOLDING") list = list.filter((r) => r.nflValueUsd > 1);
    if (status === "EXITED") list = list.filter((r) => r.nflValueUsd <= 1);
    list.sort((a, b) => (sortDir === "asc" ? a[sortKey] - b[sortKey] : b[sortKey] - a[sortKey]));
    return list;
  }, [rows, now, window, status, sortKey, sortDir]);

  const onSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
    setPage(0);
  };

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, filtered.length);
  const pageRows = filtered.slice(start, end);

  return (
    <div>
      <div
        className="flex flex-wrap items-center gap-3 border-b border-[var(--color-line)] px-5 py-4"
        style={{ background: "color-mix(in oklab, var(--color-press) 60%, transparent)" }}
      >
        <Seg options={WINDOWS} value={window} onChange={(v) => { setWindow(v); setPage(0); }} />
        <Seg options={STATUSES} value={status} onChange={(v) => { setStatus(v); setPage(0); }} />
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
          {filtered.length} {filtered.length === 1 ? "wallet" : "wallets"}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] text-[13px]">
          <thead style={{ background: "color-mix(in oklab, var(--color-press) 50%, transparent)" }}>
            <tr className="border-b border-[var(--color-line)]">
              <Th align="left" className="pl-5">#</Th>
              <Th align="left">Wallet</Th>
              <Th align="center" sortKey="firstSeenAt" current={sortKey} dir={sortDir} onSort={onSort} emphasized>
                First Seen
              </Th>
              <Th align="left">First Trade</Th>
              <Th align="center" sortKey="firstUsd" current={sortKey} dir={sortDir} onSort={onSort}>
                First $
              </Th>
              <Th align="center" sortKey="trades" current={sortKey} dir={sortDir} onSort={onSort}>
                Trades
              </Th>
              <Th align="center" sortKey="buyUsd" current={sortKey} dir={sortDir} onSort={onSort}>
                Bought
              </Th>
              <Th align="center" sortKey="sellUsd" current={sortKey} dir={sortDir} onSort={onSort}>
                Sold
              </Th>
              <Th align="center" sortKey="netUsd" current={sortKey} dir={sortDir} onSort={onSort}>
                Net Flow
              </Th>
              <Th align="center" sortKey="nflValueUsd" current={sortKey} dir={sortDir} onSort={onSort}>
                Holding Now
              </Th>
              <Th align="center">Top Holding</Th>
              <Th align="center" sortKey="lastActiveAt" current={sortKey} dir={sortDir} onSort={onSort} className="pr-5">
                Last Active
              </Th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((w, i) => {
              const meta = TIER_META[w.tier];
              const label = getWalletLabel(w.address);
              const firstPlayer = w.firstPlayerId ? ROSTER_BY_ID.get(w.firstPlayerId) : null;
              const topPlayer = w.topPlayerId ? ROSTER_BY_ID.get(w.topPlayerId) : null;
              const side = SIDE_LABEL[w.firstSide];
              return (
                <tr
                  key={w.address}
                  className="transition-colors duration-[180ms] ease-out hover:bg-[color-mix(in_oklab,var(--color-press)_50%,transparent)]"
                  style={{ borderBottom: "1px solid var(--color-line)" }}
                >
                  <td
                    style={{
                      padding: "var(--row-pad-y) 8px var(--row-pad-y) 20px",
                      fontFamily: "var(--font-mono)",
                      fontWeight: 700,
                      color: "var(--color-text-dim)",
                      fontSize: 11,
                    }}
                  >
                    {start + i + 1}
                  </td>
                  <Cell>
                    <Link
                      href={`/wallet/${w.address}`}
                      className="inline-flex items-center gap-2 hover:text-[var(--color-text)]"
                      style={{
                        fontFamily: label ? "var(--font-ui)" : "var(--font-mono)",
                        fontSize: 12.5,
                        fontWeight: label ? 600 : undefined,
                        color: label ? "var(--color-text)" : "var(--color-text-muted)",
                      }}
                    >
                      <Fish width={meta.iconPx} height={meta.iconPx} style={{ color: meta.color }} />
                      {label?.name ?? shortAddr(w.address, 6, 6)}
                      <span
                        className={`inline-flex items-center rounded-[var(--r-4)] border px-1.5 py-0.5 ${meta.pillBg} ${meta.pillBorder} ${meta.pillText}`}
                        style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase" }}
                      >
                        {tierLabel(w.tier)}
                      </span>
                    </Link>
                  </Cell>
                  <td
                    className="text-center"
                    style={{
                      padding: "var(--row-pad-y) 12px",
                      fontFamily: "var(--font-mono)",
                      fontVariantNumeric: "tabular-nums",
                      fontSize: 13,
                      fontWeight: 700,
                      color: "var(--accent-soft)",
                      background: "color-mix(in oklab, var(--accent) 4%, transparent)",
                      whiteSpace: "nowrap",
                    }}
                    title={new Date(w.firstSeenAt).toLocaleString()}
                  >
                    {fmtTimeAgo(w.firstSeenAt, now)}
                  </td>
                  <Cell>
                    <span className="inline-flex items-center gap-2" style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
                      <span style={{ color: side.color, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em" }}>{side.text}</span>
                      {firstPlayer ? (
                        <Link href={`/player/${firstPlayer.id}`} className="inline-flex items-center gap-1.5 hover:text-[var(--accent-soft)]">
                          <span style={{ color: "var(--color-text)" }}>
                            {shortPlayerName(firstPlayer.firstName, firstPlayer.lastName)}
                          </span>
                          <PlayerStatusBadge playerId={firstPlayer.id} size={11} />
                        </Link>
                      ) : (
                        <span style={{ color: "var(--color-text-dim)" }}>—</span>
                      )}
                    </span>
                  </Cell>
                  <NumCell>{fmtUsdSmart(w.firstUsd)}</NumCell>
                  <NumCell>
                    <span style={{ color: "var(--color-text)" }}>{fmtNum(w.trades)}</span>
                    <span style={{ color: "var(--color-text-dim)", fontSize: 10.5 }}> · {w.playersTraded}p</span>
                  </NumCell>
                  <NumCell><span style={{ color: "var(--color-turf)" }}>{fmtUsdSmart(w.buyUsd)}</span></NumCell>
                  <NumCell><span style={{ color: "var(--color-penalty)" }}>{fmtUsdSmart(w.sellUsd)}</span></NumCell>
                  <NumCell>
                    <span style={{ color: w.netUsd >= 0 ? "var(--color-turf)" : "var(--color-penalty)", fontWeight: 600 }}>
                      {w.netUsd >= 0 ? "+" : "−"}{fmtUsdSmart(Math.abs(w.netUsd))}
                    </span>
                  </NumCell>
                  <NumCell>
                    {w.nflValueUsd > 1 ? (
                      <span style={{ color: "var(--color-text)", fontWeight: 600 }}>{fmtUsdSmart(w.nflValueUsd)}</span>
                    ) : (
                      <span style={{ color: "var(--color-text-dim)", fontSize: 10.5, letterSpacing: "0.12em" }}>EXITED</span>
                    )}
                  </NumCell>
                  <NumCell>
                    {topPlayer ? (
                      <Link href={`/player/${topPlayer.id}`} className="inline-flex items-center gap-1.5 hover:text-[var(--accent-soft)]">
                        <span style={{ color: "var(--color-text)" }}>
                          {shortPlayerName(topPlayer.firstName, topPlayer.lastName)}
                        </span>
                        <PlayerStatusBadge playerId={topPlayer.id} size={11} />
                        <span style={{ color: "var(--color-text-dim)" }}>{fmtUsdSmart(w.topPlayerUsd)}</span>
                      </Link>
                    ) : (
                      <span style={{ color: "var(--color-text-dim)" }}>—</span>
                    )}
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
                      whiteSpace: "nowrap",
                    }}
                  >
                    {fmtTimeAgo(w.lastActiveAt, now)}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-5 py-12 text-center text-sm text-[var(--color-text-muted)]">
                  No new wallets in this window.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {filtered.length > PAGE_SIZE ? (
        <div
          className="flex items-center justify-between gap-3 border-t border-[var(--color-line)] px-5 py-3"
          style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.06em", color: "var(--color-text-muted)" }}
        >
          <span>
            Showing <span style={{ color: "var(--color-text)", fontWeight: 700 }}>{start + 1}–{end}</span>
            {" "}of{" "}
            <span style={{ color: "var(--color-text)", fontWeight: 700 }}>{filtered.length}</span>
          </span>
          <div className="flex items-center gap-2">
            <PageBtn onClick={() => setPage(0)} disabled={safePage === 0}>« First</PageBtn>
            <PageBtn onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0}>Prev</PageBtn>
            <span className="px-2" style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--color-text)", fontVariantNumeric: "tabular-nums" }}>
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

function fmtUsdSmart(n: number): string {
  return n >= 1000 ? fmtUsd(n, { compact: true }) : fmtUsd(n, { digits: 0 });
}

function PageBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "rounded-[var(--r-4)] border border-[var(--color-line)] bg-[var(--color-press)] px-2.5 py-1 transition-colors",
        disabled ? "cursor-not-allowed opacity-40" : "hover:border-[var(--accent-line)] hover:text-[var(--accent-soft)]",
      )}
      style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-text-muted)" }}
    >
      {children}
    </button>
  );
}

function Cell({ children }: { children: React.ReactNode }) {
  return (
    <td style={{ padding: "var(--row-pad-y) 12px", textAlign: "left", whiteSpace: "nowrap" }}>{children}</td>
  );
}

function NumCell({ children }: { children: React.ReactNode }) {
  return (
    <td
      className="text-center"
      style={{ padding: "var(--row-pad-y) 12px", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontSize: 12.5, whiteSpace: "nowrap" }}
    >
      {children}
    </td>
  );
}

function Th({
  children, align = "left", className, sortKey, current, dir, onSort, emphasized,
}: {
  children: React.ReactNode;
  align?: "left" | "center" | "right";
  className?: string;
  sortKey?: SortKey;
  current?: SortKey;
  dir?: "asc" | "desc";
  onSort?: (key: SortKey) => void;
  emphasized?: boolean;
}) {
  const isSortable = !!sortKey && !!onSort;
  const active = isSortable && current === sortKey;
  return (
    <th
      className={clsx("px-3 py-3 select-none", className)}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: emphasized ? "var(--accent-soft)" : active ? "var(--color-text)" : "var(--color-text-dim)",
        textAlign: align,
        background: emphasized ? "color-mix(in oklab, var(--accent) 4%, transparent)" : undefined,
        whiteSpace: "nowrap",
      }}
    >
      {isSortable ? (
        <button
          onClick={() => onSort!(sortKey!)}
          className={clsx("inline-flex items-center gap-1 hover:text-[var(--color-text)]", align === "center" && "mx-auto")}
        >
          <span>{children}</span>
          {active && dir ? (dir === "asc" ? <ChevronUp className="h-3 w-3" strokeWidth={1.5} /> : <ChevronDown className="h-3 w-3" strokeWidth={1.5} />) : null}
        </button>
      ) : children}
    </th>
  );
}

function Seg<T extends string>({ options, value, onChange }: { options: readonly T[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex items-center rounded-[var(--r-8)] border border-[var(--color-line)] bg-[var(--color-press)] p-[3px]" style={{ height: 38 }}>
      {options.map((o) => {
        const active = value === o;
        return (
          <button
            key={o}
            onClick={() => onChange(o)}
            className={clsx(
              "inline-flex h-[30px] items-center justify-center rounded-[5px] px-3 transition-colors",
              active ? "bg-[var(--color-bench)] text-[var(--accent-soft)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]",
            )}
            style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", boxShadow: active ? "inset 0 0 0 1px var(--accent-line)" : undefined }}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}
