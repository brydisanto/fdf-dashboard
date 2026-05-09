import { getUniqueNflHolderCount } from "@/lib/data";
import { fmtNum } from "@/lib/format";
import { StatInner } from "./MarketStatBar";

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
      ? `${data.fullScan ? "Full scan" : "Partial"} · ${ageLabel}`
      : `Top-50 · max ${fmtNum(data.largestPoolHolderCount)}`;

  return (
    <StatInner
      label="Unique Holders"
      value={fmtNum(data.count, { compact: true })}
      sub={sub}
    />
  );
}

export function UniqueHoldersCardSkeleton() {
  return (
    <StatInner
      label="Unique Holders"
      value="—"
      sub="Loading snapshot"
    />
  );
}
