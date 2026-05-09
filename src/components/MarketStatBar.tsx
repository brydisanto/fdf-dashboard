import { Delta } from "./ui";
import { fmtUsd, fmtNum } from "@/lib/format";
import type { MarketOverview } from "@/lib/types";

// 5-up hairline-divided grid. The wrapping container paints
// --color-line as a 1px gap, and each cell paints --color-bench so
// the result reads as a single seamless bar with hairline dividers.
// Replaces the previous stack of individual cards. The 5th cell is
// the `trailing` slot — typically a Suspense-boundaried unique
// holders card; if omitted, falls back to a Pool Activity stat.
export function MarketStatBar({
  data,
  trailing,
}: {
  data: MarketOverview;
  trailing?: React.ReactNode;
}) {
  type Stat = { label: string; value: string; delta?: number | null; sub: string };
  const stats: Stat[] = [
    { label: "NFL Market Cap",   value: fmtUsd(data.totalMarketCap, { compact: true }), delta: data.marketCapChange24h, sub: "Price × circulating supply" },
    { label: "24h Volume",       value: fmtUsd(data.totalVolume24h, { compact: true }), delta: data.volumeChange24h,    sub: `${fmtNum(data.totalTrades24h)} trades` },
    { label: "Total TVL",        value: fmtUsd(data.totalTvl, { compact: true }), delta: null, sub: `${data.listedPlayers} player pools` },
    { label: "$FUN",             value: fmtUsd(data.funPriceUsd, { digits: 4 }), delta: data.funChange24h,              sub: "Sport.fun token · 24h" },
  ];

  return (
    <div
      className="grid overflow-hidden rounded-[var(--r-14)] border border-[var(--color-line)] sm:grid-cols-2 lg:grid-cols-5"
      style={{
        gap: "1px",
        background: "var(--color-line)",
      }}
    >
      {stats.map((s) => (
        <StatCell key={s.label} stat={s} />
      ))}
      <div className="bg-[var(--color-bench)]" style={{ padding: "16px 18px" }}>
        {trailing ?? (
          <StatInner
            label="Active Wallets 24h"
            value={fmtNum(data.activeWallets24h, { compact: true })}
            sub="Distinct traders · 24h"
          />
        )}
      </div>
    </div>
  );
}

function StatCell({ stat }: { stat: { label: string; value: string; delta?: number | null; sub: string } }) {
  return (
    <div className="bg-[var(--color-bench)]" style={{ padding: "16px 18px" }}>
      <StatInner {...stat} />
    </div>
  );
}

// Public so the trailing-slot UniqueHoldersCard can match the same
// anatomy. Prefer composition over a wrapper for the 5th cell so
// Suspense fallbacks remain easy.
export function StatInner({
  label,
  value,
  delta,
  sub,
}: {
  label: string;
  value: string;
  delta?: number | null;
  sub: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      {/* Eyebrow rule + label */}
      <div className="flex items-center gap-2">
        <span className="block h-px w-4 bg-[var(--accent)]" />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--color-text-muted)",
          }}
        >
          {label}
        </span>
      </div>
      {/* Numeric */}
      <div className="flex items-baseline justify-between gap-2">
        <span
          className="leading-none"
          style={{
            fontFamily: "var(--font-mono)",
            fontWeight: 700,
            fontSize: "28px",
            letterSpacing: "-0.03em",
            color: "var(--color-text)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {splitUnit(value)}
        </span>
        {delta !== null && delta !== undefined ? <Delta value={delta} /> : null}
      </div>
      {/* Foot */}
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "10.5px",
          letterSpacing: "0.06em",
          color: "var(--color-text-dim)",
          textTransform: "uppercase",
        }}
      >
        {sub}
      </div>
    </div>
  );
}

// Split off a trailing K / M / B unit so it can render at a softer
// weight/color ($3.47M → "$3.47" + "M").
function splitUnit(s: string): React.ReactNode {
  const m = s.match(/^(.*?)([KMB])$/);
  if (!m) return s;
  return (
    <>
      {m[1]}
      <span style={{ color: "var(--color-text-muted)", fontWeight: 500, paddingLeft: "1px" }}>{m[2]}</span>
    </>
  );
}
