import { fmtNum } from "@/lib/format";
import type { HolderBucket } from "@/lib/types";

const COLORS = [
  "var(--color-brand)",
  "var(--color-brand-soft)",
  "#7aa6ff",
  "#5b6473",
];

export function HoldersBreakdown({
  buckets,
  totalHolders,
}: {
  buckets: HolderBucket[];
  totalHolders: number;
}) {
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <div className="text-sm text-[var(--color-text-muted)]">Total holders</div>
        <div className="tabular text-lg font-semibold">{fmtNum(totalHolders)}</div>
      </div>
      <div className="flex h-3 w-full overflow-hidden rounded-md">
        {buckets.map((b, i) => (
          <div
            key={b.label}
            style={{ width: `${b.share}%`, background: COLORS[i % COLORS.length] }}
            className="h-full"
            title={`${b.label} · ${b.share}%`}
          />
        ))}
      </div>
      <ul className="mt-4 space-y-2 text-sm">
        {buckets.map((b, i) => (
          <li key={b.label} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ background: COLORS[i % COLORS.length] }}
              />
              <span>{b.label}</span>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="tabular text-[var(--color-text-muted)]">{fmtNum(b.count)}</span>
              <span className="tabular w-12 text-right">{b.share.toFixed(1)}%</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
