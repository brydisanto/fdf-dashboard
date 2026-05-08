import { getUniqueNflHolderCount } from "@/lib/data";
import { fmtNum } from "@/lib/format";

export async function UniqueHoldersCard() {
  const data = await getUniqueNflHolderCount();
  const ageLabel =
    data.ageMs == null
      ? "fresh sample"
      : data.ageMs < 60_000 ? "just now" :
        data.ageMs < 3_600_000 ? `${Math.round(data.ageMs / 60_000)}m ago` :
        `${Math.round(data.ageMs / 3_600_000)}h ago`;

  const sub =
    data.source === "indexer"
      ? `${data.fullScan ? "Full scan" : "Partial scan"} · indexed ${ageLabel}`
      : `Top-50 sample · largest pool: ${fmtNum(data.largestPoolHolderCount)}`;

  const title =
    data.source === "indexer"
      ? `Distinct wallets across all ${data.pools} NFL pools, deduped from a full holder pagination by the background indexer. Updated hourly via /api/holders/refresh.`
      : `Distinct wallets in the union of the top 50 holders of each of the ${data.pools} NFL pools, with the AMM contract excluded. The background indexer hasn't produced a snapshot yet — once /api/holders/refresh runs, this becomes the true full count.`;

  return (
    <Tile
      label="Unique Holders"
      value={fmtNum(data.count, { compact: true })}
      sub={sub}
      title={title}
    />
  );
}

export function UniqueHoldersCardSkeleton() {
  return (
    <Tile
      label="Unique Holders"
      value="—"
      sub="Loading holder snapshot…"
    />
  );
}

function Tile({ label, value, sub, title }: { label: string; value: string; sub: string; title?: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3.5" title={title}>
      <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-dim)]">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <div className="tabular text-[20px] font-semibold leading-none">{value}</div>
      </div>
      <div className="mt-1 text-[11px] text-[var(--color-text-muted)]">{sub}</div>
    </div>
  );
}
