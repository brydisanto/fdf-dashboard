import "server-only";
import { cache } from "react";
import { readTradeHistory } from "./trade-indexer";
import { readManyWalletsNflBalances } from "./onchain-client";
import { ROSTER, ROSTER_BY_TOKEN, type NflPlayer } from "./roster";
import { BUYBACK_WALLET } from "./buyback";
import { getTournamentMatrix } from "./tournament-matrix";
import { getPlayers } from "./index";
import { getWalletLabel } from "./wallet-labels";

// Seller Watch: which players have the most stock sitting with wallets
// that are actively selling, and which have the least.
//
//   1. Heavy sellers: wallets whose USDC sells minus buys over the last
//      7 days is at least MIN_NET_SELL_USD.
//   2. Their current holdings are read on-chain, so "overhang" is what
//      they could still sell, not what they already sold.
//   3. Each seller is classed by pace. Exit rate = what they sold this
//      week as a share of (sold + still held). Fast sellers are cutting
//      their position quickly; large holders sell slowly but own so much
//      that a speed-up would swamp the buyers.
//   4. Per player, those holdings are measured against Sport.fun's active
//      shares (the same snapshot the Tournament Matrix uses), next to the
//      whole market's net flow and the 7d price change.

const DAY = 86_400_000;
const WINDOW_MS = 7 * DAY;
const RECENT_MS = 3 * DAY;
export const MIN_NET_SELL_USD = 500;
export const FAST_EXIT_RATE = 0.08;          // ≥ 8% of the position sold in a week
export const LARGE_HOLDER_USD = 50_000;      // slow sellers this big count as large holders
export const SMALL_PLAYER_USD = 10_000;      // below this active market cap, one trade moves the price
const HISTORY_WEEKS = 4;

const SYSTEM_WALLETS = new Set([
  BUYBACK_WALLET,
  "0x0000000000000000000000000000000000000000",
]);
const isSystem = (w: string) => SYSTEM_WALLETS.has(w) || !!getWalletLabel(w)?.systemWallet;

export type SellerKind = "fast" | "large" | "other";

export interface HeavySeller {
  wallet: string;
  kind: SellerKind;
  netSold7d: number;          // USDC sells minus buys, last 7 days
  sold3d: number;
  bought3d: number;
  holdUsd: number;            // current holdings at spot
  positions: number;
  exitRate: number;           // 0..1, share of the position sold this week
  weeksSelling: number;       // of weeksTracked, weeks with sells > buys
  weeksTracked: number;
  top: { player: NflPlayer; usd: number }[];
}

export interface SellerWatchPlayer {
  player: NflPlayer;
  priceUsd: number;
  change7d: number;           // %
  marketCapUsd: number;       // price × active shares
  activeShares: number;
  fastPct: number;            // % of active shares held by fast sellers
  largePct: number;           // % held by large slow sellers
  sellerPct: number;          // % held by every heavy seller
  sellerWallets: number;
  netFlowPct: number;         // (buys + swaps in − sells − swaps out) / active, all wallets, 7d
  buybackPct: number;         // buyback wallet buys this week / active
  risk: number;
  tier: "safest" | "steady" | null;
  reasons: string[];
  topHolders: { wallet: string; kind: SellerKind; pct: number }[];
}

export interface SellerWatch {
  available: boolean;
  generatedAt: number;
  activeSharesAt: string | null;
  sold7d: number;
  bought7d: number;
  sellers: HeavySeller[];
  overhangUsd: number;
  players: SellerWatchPlayer[];
}

const EMPTY: SellerWatch = {
  available: false, generatedAt: 0, activeSharesAt: null, sold7d: 0, bought7d: 0,
  sellers: [], overhangUsd: 0, players: [],
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Cached per request so the hero pill and the body share one build. */
export const getSellerWatch = cache(async (): Promise<SellerWatch> => {
  const [store, summaries] = await Promise.all([readTradeHistory(), getPlayers().catch(() => [])]);
  if (!store || store.trades.length === 0 || summaries.length === 0) return EMPTY;
  const price = new Map(summaries.map((p) => [p.id, p.priceUsd]));
  const change7d = new Map(summaries.map((p) => [p.id, p.change7d]));
  const circulating = new Map(summaries.map((p) => [p.id, p.circulatingSupply]));

  const now = Date.now();
  const priceOf = (p: NflPlayer) => price.get(p.id) ?? 0;

  // Active shares: Sport.fun's own count (weekly snapshot in the matrix),
  // falling back to circulating supply for anyone missing from it.
  const matrix = getTournamentMatrix();
  const active = new Map<string, number>();
  for (const list of Object.values(matrix.byPosition)) {
    for (const s of list) if (s.activeShares) active.set(s.playerId, s.activeShares);
  }
  const activeOf = (p: NflPlayer) => active.get(p.id) ?? circulating.get(p.id) ?? 0;

  // ── Wallet flows ──────────────────────────────────────────────
  const oldest = store.trades.reduce((m, t) => Math.min(m, t.blockTime), now);
  const weeksTracked = Math.max(1, Math.min(HISTORY_WEEKS, Math.floor((now - oldest) / WINDOW_MS)));
  type Flow = { sell: number; buy: number; sell3: number; buy3: number; weekly: { sell: number; buy: number }[] };
  const flows = new Map<string, Flow>();
  const playerFlow = new Map<string, { in: number; out: number; buyback: number }>();
  let sold7d = 0;
  let bought7d = 0;

  for (const t of store.trades) {
    const age = now - t.blockTime;
    if (age > weeksTracked * WINDOW_MS) continue;
    const inWindow = age <= WINDOW_MS;

    if (inWindow) {
      const pf = playerFlow.get(t.tokenIdSuffix) ?? { in: 0, out: 0, buyback: 0 };
      if (t.wallet === BUYBACK_WALLET) {
        if (t.side === "buy" || t.side === "swap-in") pf.buyback += t.shareAmount;
      } else if (!isSystem(t.wallet)) {
        if (t.side === "buy" || t.side === "swap-in") pf.in += t.shareAmount;
        else pf.out += t.shareAmount;
      }
      playerFlow.set(t.tokenIdSuffix, pf);
    }
    if (isSystem(t.wallet) || (t.side !== "buy" && t.side !== "sell")) continue;

    const f = flows.get(t.wallet) ?? {
      sell: 0, buy: 0, sell3: 0, buy3: 0,
      weekly: Array.from({ length: weeksTracked }, () => ({ sell: 0, buy: 0 })),
    };
    const wk = f.weekly[Math.min(weeksTracked - 1, Math.floor(age / WINDOW_MS))];
    if (t.side === "sell") {
      wk.sell += t.usdAmount;
      if (inWindow) { f.sell += t.usdAmount; sold7d += t.usdAmount; }
      if (age <= RECENT_MS) f.sell3 += t.usdAmount;
    } else {
      wk.buy += t.usdAmount;
      if (inWindow) { f.buy += t.usdAmount; bought7d += t.usdAmount; }
      if (age <= RECENT_MS) f.buy3 += t.usdAmount;
    }
    flows.set(t.wallet, f);
  }

  const candidates = [...flows.entries()]
    .filter(([, f]) => f.sell - f.buy >= MIN_NET_SELL_USD)
    .sort((a, b) => (b[1].sell - b[1].buy) - (a[1].sell - a[1].buy));

  // ── Current holdings, on-chain ────────────────────────────────
  const priceByToken = new Map(ROSTER.map((p) => [p.tokenAddress, priceOf(p)]));
  const balances = await readManyWalletsNflBalances(candidates.map(([w]) => w), priceByToken);

  // shares held per seller per player id
  const holdings = new Map<string, Map<string, number>>();
  const sellers: HeavySeller[] = [];
  for (const [wallet, f] of candidates) {
    const rows = balances.get(wallet.toLowerCase());
    if (!rows) continue;   // RPC chunk failed: leave the wallet out rather than count it as empty
    const held = new Map<string, number>();
    const top: { player: NflPlayer; usd: number }[] = [];
    let holdUsd = 0;
    for (const h of rows) {
      const player = ROSTER_BY_TOKEN.get(h.tokenAddress);
      if (!player || h.balance <= 0) continue;
      held.set(player.id, h.balance);
      const usd = h.balance * priceOf(player);
      holdUsd += usd;
      top.push({ player, usd });
    }
    const net = f.sell - f.buy;
    const exitRate = net / (net + holdUsd);
    const kind: SellerKind = exitRate >= FAST_EXIT_RATE ? "fast" : holdUsd >= LARGE_HOLDER_USD ? "large" : "other";
    holdings.set(wallet, held);
    sellers.push({
      wallet, kind, netSold7d: net, sold3d: f.sell3, bought3d: f.buy3, holdUsd,
      positions: held.size, exitRate,
      weeksSelling: f.weekly.filter((w) => w.sell > w.buy).length, weeksTracked,
      top: top.sort((a, b) => b.usd - a.usd).slice(0, 3),
    });
  }

  // ── Per player ────────────────────────────────────────────────
  const players: SellerWatchPlayer[] = ROSTER.map((player) => {
    const act = activeOf(player);
    const pct = (shares: number) => (act > 0 ? (shares / act) * 100 : 0);
    let fast = 0, large = 0, all = 0, wallets = 0;
    const holders: { wallet: string; kind: SellerKind; pct: number }[] = [];
    for (const s of sellers) {
      const sh = holdings.get(s.wallet)?.get(player.id) ?? 0;
      if (sh <= 0) continue;
      wallets++;
      all += sh;
      if (s.kind === "fast") fast += sh;
      if (s.kind === "large") large += sh;
      holders.push({ wallet: s.wallet, kind: s.kind, pct: round1(pct(sh)) });
    }
    const pf = playerFlow.get(player.tokenIdSuffix) ?? { in: 0, out: 0, buyback: 0 };
    const p = priceOf(player);
    return {
      player, priceUsd: p, change7d: change7d.get(player.id) ?? 0,
      marketCapUsd: p * act, activeShares: act,
      fastPct: round1(pct(fast)), largePct: round1(pct(large)), sellerPct: round1(pct(all)),
      sellerWallets: wallets,
      netFlowPct: round1(pct(pf.in - pf.out)), buybackPct: round1(pct(pf.buyback)),
      risk: 0, tier: null, reasons: [],
      topHolders: holders.sort((a, b) => b.pct - a.pct).slice(0, 3),
    };
  });

  for (const p of players) {
    // Fast sellers weigh most (they are actually selling now); large slow
    // holders less per share, since a single wallet's pace can stay slow.
    p.risk = Math.round(
      p.fastPct * 2 + p.largePct * 0.5 + Math.max(0, -p.netFlowPct) + Math.max(0, -p.change7d) * 0.15,
    );
    const quietFlow = p.netFlowPct >= -2.5 && p.change7d >= -5;
    p.tier = quietFlow && p.fastPct < 10 && p.largePct < 15 ? "safest"
      : quietFlow && p.fastPct < 14 && p.largePct < 22 ? "steady"
      : null;
    p.reasons = p.tier ? safeReasons(p) : riskReasons(p);
  }
  players.sort((a, b) => b.risk - a.risk);

  return {
    available: true,
    generatedAt: now,
    activeSharesAt: matrix.activeSharesAt ?? null,
    sold7d, bought7d,
    sellers,
    overhangUsd: sellers.reduce((a, s) => a + s.holdUsd, 0),
    players,
  };
});

function riskReasons(p: SellerWatchPlayer): string[] {
  const r: string[] = [];
  if (p.change7d >= 30 && p.fastPct >= 10) r.push(`Up ${Math.round(p.change7d)}% this week while fast sellers hold ${Math.round(p.fastPct)}%, so profit-taking is likely`);
  else if (p.fastPct >= 10) r.push(`${Math.round(p.fastPct)}% of active shares held by fast sellers`);
  if (p.largePct >= 20) r.push(`${Math.round(p.largePct)}% held by large holders who keep selling`);
  if (p.netFlowPct <= -5) r.push(`Sellers outpaced buyers by ${Math.round(-p.netFlowPct)}% of active shares this week`);
  if (p.change7d <= -20 && !(p.change7d >= 30)) r.push(`Down ${Math.round(-p.change7d)}% this week`);
  return r;
}

function safeReasons(p: SellerWatchPlayer): string[] {
  const r: string[] = [`Only ${Math.round(p.fastPct + p.largePct)}% held by wallets that are selling`];
  if (p.netFlowPct > 0.5) r.push(`Net buying of ${round1(p.netFlowPct)}% of active shares this week`);
  if (p.change7d >= 3) r.push(`Up ${Math.round(p.change7d)}% this week`);
  if (p.buybackPct > 0) r.push(`Buyback wallet bought ${round1(p.buybackPct)}% of active shares this week`);
  if (p.marketCapUsd > 0 && p.marketCapUsd < SMALL_PLAYER_USD) r.push("Small player: a single trade can move it");
  return r;
}
