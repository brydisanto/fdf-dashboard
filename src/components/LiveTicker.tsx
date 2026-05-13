import Link from "next/link";
import { Delta } from "./ui";
import type { PlayerSummary } from "@/lib/types";

// How often to drop the slogan into the ticker, in mover-slots.
// Roughly: every SLOGAN_INTERVAL players, one slogan card scrolls by.
const SLOGAN_INTERVAL = 8;
const SLOGAN_TEXT = "THIS IS REAL FOOTBALL™";

type TickerItem =
  | { kind: "mover"; player: PlayerSummary }
  | { kind: "slogan" };

// Live ticker — top movers scrolling left at 30s linear infinite,
// edges masked to fade in/out. Pauses on hover (CSS class on parent).
//
// Sits between SiteHeader and Hero on the home page. Every Nth slot
// is replaced with a "THIS IS REAL FOOTBALL™" brand drop.
export function LiveTicker({ movers }: { movers: PlayerSummary[] }) {
  if (movers.length === 0) return null;

  // Interleave a slogan card every SLOGAN_INTERVAL movers so it
  // rolls past organically as the ticker scrolls.
  const base: TickerItem[] = [];
  movers.forEach((p, idx) => {
    base.push({ kind: "mover", player: p });
    if ((idx + 1) % SLOGAN_INTERVAL === 0) {
      base.push({ kind: "slogan" });
    }
  });
  // Guarantee at least one slogan card if the movers list is short.
  if (!base.some((it) => it.kind === "slogan")) {
    base.push({ kind: "slogan" });
  }

  // Duplicate so the translateX(-50%) keyframe loops seamlessly.
  const items = [...base, ...base];

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
              {items.map((it, i) => {
                if (it.kind === "slogan") {
                  return (
                    <span
                      key={`slogan-${i}`}
                      aria-hidden={i >= base.length}
                      className="inline-flex h-full shrink-0 items-center"
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "12px",
                        fontWeight: 800,
                        letterSpacing: "0.18em",
                        textTransform: "uppercase",
                        color: "var(--accent-soft)",
                        lineHeight: 1,
                      }}
                    >
                      {SLOGAN_TEXT}
                    </span>
                  );
                }
                const p = it.player;
                return (
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
                );
              })}
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
