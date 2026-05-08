import Link from "next/link";
import { PlayerAvatar } from "./PlayerAvatar";
import { Delta } from "./ui";
import { fmtPrice } from "@/lib/format";
import { TEAM_NAMES } from "@/lib/data/players";
import type { PlayerSummary } from "@/lib/types";

export function MoversList({
  players,
  variant,
  limit = 5,
}: {
  players: PlayerSummary[];
  variant: "gainers" | "losers" | "trending";
  limit?: number;
}) {
  const sorted = players.slice();
  if (variant === "gainers") sorted.sort((a, b) => b.change24h - a.change24h);
  if (variant === "losers")  sorted.sort((a, b) => a.change24h - b.change24h);
  if (variant === "trending") sorted.sort((a, b) => b.volume24h - a.volume24h);

  const top = sorted.slice(0, limit);

  return (
    <ul className="divide-y divide-[var(--color-border)]/70">
      {top.map((p, i) => (
        <li key={p.id}>
          <Link
            href={`/player/${p.id}`}
            className="group flex items-center gap-3 py-2.5 px-1 -mx-1 rounded-md hover:bg-[var(--color-surface-2)]/70"
          >
            <span className="w-4 text-right text-xs text-[var(--color-text-dim)] tabular">{i + 1}</span>
            <PlayerAvatar player={p} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium group-hover:text-[var(--color-brand-soft)]">
                {p.firstName} {p.lastName}
              </div>
              <div className="text-[11px] text-[var(--color-text-dim)]">
                {p.position} · {TEAM_NAMES[p.team]}
              </div>
            </div>
            <div className="text-right">
              <div className="tabular text-sm">{fmtPrice(p.priceUsd)}</div>
              <Delta value={p.change24h} className="text-xs" />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
