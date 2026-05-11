import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { fmtNum, fmtPrice, fmtTimeAgo, fmtUsd } from "@/lib/format";
import { TEAM_NAMES } from "@/lib/data/players";
import type { WalletTradeRow } from "@/lib/types";

export function WalletTradesTable({ rows }: { rows: WalletTradeRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="px-5 py-12 text-center text-sm text-[var(--color-text-muted)]">
        No trades for this wallet on Sport.fun.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-[13px]">
        <thead style={{ background: "color-mix(in oklab, var(--color-press) 50%, transparent)" }}>
          <tr className="border-b border-[var(--color-line)]">
            <Th className="w-24 pl-5">Time</Th>
            <Th className="w-20">Side</Th>
            <Th>Asset</Th>
            <Th>Shares</Th>
            <Th>Price</Th>
            <Th>USD Value</Th>
            <Th className="w-20 pr-5">Tx</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={`${r.txId}-${r.timestamp}`}
              className="transition-colors duration-[180ms] ease-out hover:bg-[color-mix(in_oklab,var(--color-press)_50%,transparent)]"
              style={{ borderBottom: "1px solid var(--color-line)" }}
            >
              <td
                className="pl-5 pr-2"
                style={{
                  padding: "var(--row-pad-y) 8px var(--row-pad-y) 20px",
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  color: "var(--color-text-dim)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {fmtTimeAgo(r.timestamp)}
              </td>
              <td className="px-3" style={{ padding: "var(--row-pad-y) 12px" }}>
                <SidePill side={r.side} />
              </td>
              <td className="px-3" style={{ padding: "var(--row-pad-y) 12px" }}>
                <AssetCell row={r} />
              </td>
              <NumCell>{fmtNum(r.baseAmount)}</NumCell>
              <NumCell>{r.priceUsd > 0 ? fmtPrice(r.priceUsd) : "—"}</NumCell>
              <NumCell>{r.amountUsd > 0 ? fmtUsd(r.amountUsd, { compact: true }) : "—"}</NumCell>
              <td className="pr-5" style={{ padding: "var(--row-pad-y) 12px" }}>
                <a
                  href={`https://basescan.org/tx/${r.txId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center text-[var(--color-text-dim)] hover:text-[var(--accent-soft)]"
                  title={r.txId}
                  aria-label="View transaction on Basescan"
                >
                  <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} />
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SidePill({ side }: { side: "buy" | "sell" }) {
  const buy = side === "buy";
  return (
    <span
      className="inline-flex items-center rounded-[var(--r-pill)] border px-2"
      style={{
        height: 22,
        borderColor: buy
          ? "color-mix(in oklab, var(--color-turf) 40%, transparent)"
          : "color-mix(in oklab, var(--color-penalty) 40%, transparent)",
        background: buy
          ? "color-mix(in oklab, var(--color-turf) 12%, transparent)"
          : "color-mix(in oklab, var(--color-penalty) 12%, transparent)",
        color: buy ? "var(--color-turf)" : "var(--color-penalty)",
        fontFamily: "var(--font-mono)",
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
      }}
    >
      {buy ? "Buy" : "Sell"}
    </span>
  );
}

function AssetCell({ row }: { row: WalletTradeRow }) {
  // NFL trades link to the player page; Soccer trades just display the
  // token name/symbol since we don't have a detail route for them.
  const sport = row.isNfl ? "NFL" : "SOCCER";
  const subtitle = row.isNfl && row.position && row.team
    ? `${row.position} · ${TEAM_NAMES[row.team] ?? row.team}`
    : row.symbol;

  const body = (
    <div className="flex items-center justify-center gap-2.5">
      <div className="min-w-0">
        <div className="truncate font-semibold text-[14px] text-[var(--color-text)]">
          {row.name || row.symbol || "—"}
        </div>
        <div
          className="mt-0.5 truncate"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "10.5px",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--color-text-dim)",
          }}
        >
          {sport} · {subtitle}
        </div>
      </div>
    </div>
  );

  if (row.isNfl && row.playerId) {
    return (
      <Link href={`/player/${row.playerId}`} className="hover:text-[var(--accent-soft)]">
        {body}
      </Link>
    );
  }
  return body;
}

function NumCell({ children }: { children: React.ReactNode }) {
  return (
    <td
      className="mono px-3"
      style={{ padding: "var(--row-pad-y) 12px", fontVariantNumeric: "tabular-nums" }}
    >
      {children}
    </td>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`px-3 py-3 select-none ${className ?? ""}`}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "10px",
        fontWeight: 600,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: "var(--color-text-dim)",
      }}
    >
      {children}
    </th>
  );
}
