import { Card, Delta } from "./ui";
import { fmtUsd, fmtNum } from "@/lib/format";
import type { MarketOverview } from "@/lib/types";

export function MarketStatBar({
  data,
  trailing,
}: {
  data: MarketOverview;
  trailing?: React.ReactNode;
}) {
  const stats = [
    { label: "NFL Market Cap",   value: fmtUsd(data.totalMarketCap, { compact: true }), delta: data.marketCapChange24h, sub: "Price × circulating supply" },
    { label: "24h Volume",       value: fmtUsd(data.totalVolume24h, { compact: true }), delta: data.volumeChange24h,    sub: `${fmtNum(data.totalTrades24h)} trades` },
    { label: "Total TVL",        value: fmtUsd(data.totalTvl, { compact: true }), delta: null, sub: `${data.listedPlayers} player pools` },
    { label: "$FUN",             value: fmtUsd(data.funPriceUsd, { digits: 4 }), delta: data.funChange24h,              sub: "Sport.fun token · 24h" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {stats.map((s) => (
        <Card key={s.label} className="px-4 py-3.5">
          <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-dim)]">
            {s.label}
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <div className="tabular text-[20px] font-semibold leading-none">{s.value}</div>
            {s.delta !== null && s.delta !== undefined ? (
              <Delta value={s.delta} className="text-xs" />
            ) : null}
          </div>
          <div className="mt-1 text-[11px] text-[var(--color-text-muted)]">{s.sub}</div>
        </Card>
      ))}
      {trailing}
    </div>
  );
}
