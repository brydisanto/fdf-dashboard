import { getPlayers } from "@/lib/data";
import { LiveTicker } from "./LiveTicker";

// Async server component that owns the ticker's data fetch. Placed
// directly into the root layout so the ticker rolls on every route
// at identical placement (between SiteHeader and page content).
//
// getPlayers() is module-level cached (60s TTL) so the per-route cost
// is effectively free after the first cold render. We still wrap this
// in <Suspense> at the layout level — if the very first render of a
// fresh worker is slow, the page shell + content stream without
// waiting on the ticker.
export async function TickerStrip() {
  const players = await getPlayers();
  // Top 8 by absolute 24h change — same selection logic as the
  // original home-page inline placement so behavior is unchanged.
  const movers = players
    .slice()
    .sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h))
    .slice(0, 8);
  return <LiveTicker movers={movers} />;
}
