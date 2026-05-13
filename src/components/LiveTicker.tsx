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
          {/* Track */}
          <div className="ticker-mask relative flex h-full flex-1 items-center overflow-hidden">
            <div className="ticker-track flex h-full items-center gap-7 whitespace-nowrap" style={{ padding: "0 24px" }}>
              {items.map((p, i) => (
                <Link
                  key={`${p.id}-${i}`}
                  href={`/player/${p.id}`}
                  className="inline-flex h-full shrink-0 items-center gap-2 hover:text-[var(--accent-soft)]"
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "12px",
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "var(--color-text)",
                      lineHeight: 1,
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

// Last name only, uppercase. Tickers stay scannable without the
// position suffix.
function tickerSymbol(p: PlayerSummary): string {
  return p.lastName.toUpperCase();
}
