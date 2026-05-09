import Link from "next/link";
import { Delta } from "./ui";
import type { PlayerSummary } from "@/lib/types";

// Live ticker — top movers scrolling left at 30s linear infinite,
// edges masked to fade in/out. Pauses on hover (CSS class on parent).
//
// Sits between SiteHeader and Hero on the home page.
export function LiveTicker({ movers }: { movers: PlayerSummary[] }) {
  if (movers.length === 0) return null;

  // Duplicate so the translateX(-50%) keyframe loops seamlessly.
  const items = [...movers, ...movers];

  return (
    <div className="border-b border-[var(--color-line)] bg-[var(--color-stadium)]">
      <div className="mx-auto max-w-[var(--max-w)] px-5 sm:px-8">
        <div
          className="flex items-stretch overflow-hidden rounded-[var(--r-8)] border border-[var(--color-line)] bg-[var(--color-bench)] my-3"
          style={{ height: 44 }}
        >
          {/* Left pill */}
          <div
            className="flex shrink-0 items-center gap-2 border-r border-[var(--color-line)] bg-[var(--color-press)]"
            style={{ padding: "0 14px" }}
          >
            <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-turf)]" />
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                fontWeight: 600,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--color-text-muted)",
              }}
            >
              LIVE · BASE
            </span>
          </div>
          {/* Track */}
          <div className="ticker-mask relative flex-1 overflow-hidden">
            <div className="ticker-track flex items-center gap-7 whitespace-nowrap" style={{ padding: "0 24px" }}>
              {items.map((p, i) => (
                <Link
                  key={`${p.id}-${i}`}
                  href={`/player/${p.id}`}
                  className="inline-flex shrink-0 items-center gap-2 hover:text-[var(--accent-soft)]"
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "12px",
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "var(--color-text)",
                    }}
                  >
                    {tickerSymbol(p)}
                  </span>
                  <Delta value={p.change24h} />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Build a 4–5 char "ticker symbol" from the player name + position.
// Mirrors the convention sportsbook tickers use (e.g. JEAN-RB,
// HENRY-RB, MAHO-QB).
function tickerSymbol(p: PlayerSummary): string {
  const last = p.lastName.toUpperCase().replace(/[^A-Z]/g, "");
  const stub = last.slice(0, 4);
  return `${stub}-${p.position}`;
}
