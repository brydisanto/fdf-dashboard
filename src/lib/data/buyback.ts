import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { ROSTER_BY_ID } from "./roster";
import type { NflPlayer } from "./roster";

// Reader for the buyback wallet index produced by
// scripts/index-buyback.mjs and committed to the `data` branch.
//
// The cycle is buy-and-burn: the treasury funds the wallet with USDC,
// the wallet buys baskets of player shares from the pair, then sends
// those shares to the share contract and receives nothing back, which
// retires them.
//
// So the wallet's balance is NOT the position it has built — it is only
// the float between a buy and the next burn. Read `sharesBurned` for
// supply actually removed, and `holdings` for what is waiting to be.

export const BUYBACK_WALLET = "0xd9dd74e1109fa6fb8772706594bcabfbedfb706d";

export interface BuybackBuy {
  kind: "buy";
  block: number;
  ts: number;
  tx: string;
  usdcSpent: number;
  usdcRefund: number;
  netUsd: number;
  shares: number;
  tokens: number;
}

export interface BuybackFunding {
  kind: "funding";
  block: number;
  ts: number;
  tx: string;
  usdcIn: number;
  from: string;
}

export interface BuybackBurn {
  kind: "burn";
  block: number;
  ts: number;
  tx: string;
  shares: number;
  tokens: number;
}

export type BuybackEvent = BuybackBuy | BuybackFunding | BuybackBurn;

export interface BuybackHolding {
  playerId: string;
  tokenIdSuffix: string;
  shares: number;
}

interface BuybackStore {
  wallet: string;
  lastIndexedBlock: number;
  updatedAt: number;
  usdcBalance: number;
  holdings: BuybackHolding[];
  events: BuybackEvent[];
}

export interface BuybackDay {
  t: number;              // unix ms at UTC midnight
  netUsd: number;         // deployed that day
  shares: number;         // shares bought
  burned: number;         // shares retired
  buys: number;
  cumulativeUsd: number;
  cumulativeBurned: number;
  fundedUsd: number;      // treasury top-ups that day
}

export interface BuybackHoldingRow extends BuybackHolding {
  player: NflPlayer | null;
  valueUsd: number;
  shareOfSupply: number | null;   // percent of circulating supply, when known
}

export interface BuybackReport {
  wallet: string;
  updatedAt: number;
  lastIndexedBlock: number;
  usdcBalance: number;
  totalDeployedUsd: number;
  totalFundedUsd: number;
  totalShares: number;        // bought
  totalBurned: number;        // retired
  burnCount: number;
  floatShares: number;        // bought − burned, the working balance
  heldShares: number;         // live balance, should track floatShares
  costPerShare: number;       // deployed / shares bought
  buyCount: number;
  firstBuyAt: number;
  lastBuyAt: number;
  deployed24h: number;
  deployed7d: number;
  deployed30d: number;
  activeDays: number;
  avgBuyUsd: number;
  // Evaluated here rather than in the page: reading the clock inside a
  // component trips react-hooks/purity.
  activeRecently: boolean;
  generatedAt: number;
  daily: BuybackDay[];
  holdings: BuybackHoldingRow[];
  holdingsValueUsd: number;
  recent: BuybackBuy[];
  recentBurns: BuybackBurn[];
  funding: BuybackFunding[];
  available: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const COMMITTED_FILE = path.join(process.cwd(), "data", "buyback.json");
const REMOTE_URL = process.env.GRIDIRON_BUYBACK_URL
  ?? "https://raw.githubusercontent.com/brydisanto/fdf-dashboard/data/data/buyback.json";
const REMOTE_TTL_MS = 5 * 60 * 1000;

let remoteCache: { fetchedAt: number; store: BuybackStore } | null = null;

async function readStore(): Promise<BuybackStore | null> {
  if (remoteCache && Date.now() - remoteCache.fetchedAt < REMOTE_TTL_MS) return remoteCache.store;
  try {
    const res = await fetch(REMOTE_URL, { next: { revalidate: 300 } });
    if (res.ok) {
      const parsed = (await res.json()) as BuybackStore;
      if (Array.isArray(parsed.events)) {
        remoteCache = { fetchedAt: Date.now(), store: parsed };
        return parsed;
      }
    }
  } catch { /* fall through to the checked-in copy */ }
  try {
    const parsed = JSON.parse(await fs.readFile(COMMITTED_FILE, "utf8")) as BuybackStore;
    if (Array.isArray(parsed.events)) return parsed;
  } catch { /* no local copy */ }
  return null;
}

/**
 * Build the buyback report. `spotByPlayerId` values the holdings at
 * current prices; pass the same player list the rest of the page uses
 * so the numbers agree.
 */
export async function getBuyback(
  spotByPlayerId?: Map<string, number>,
  supplyByPlayerId?: Map<string, number>,
): Promise<BuybackReport> {
  const store = await readStore();
  const now = Date.now();

  if (!store) {
    return {
      wallet: BUYBACK_WALLET, updatedAt: 0, lastIndexedBlock: 0, usdcBalance: 0,
      totalDeployedUsd: 0, totalFundedUsd: 0, totalShares: 0, totalBurned: 0,
      burnCount: 0, floatShares: 0, heldShares: 0, costPerShare: 0, buyCount: 0,
      firstBuyAt: 0, lastBuyAt: 0, deployed24h: 0, deployed7d: 0, deployed30d: 0,
      activeDays: 0, avgBuyUsd: 0, activeRecently: false, generatedAt: now,
      daily: [], holdings: [], holdingsValueUsd: 0,
      recent: [], recentBurns: [], funding: [], available: false,
    };
  }

  const buys = store.events.filter((e): e is BuybackBuy => e.kind === "buy");
  const funding = store.events.filter((e): e is BuybackFunding => e.kind === "funding");
  const burns = store.events.filter((e): e is BuybackBurn => e.kind === "burn");

  const totalDeployedUsd = buys.reduce((a, b) => a + b.netUsd, 0);
  const totalShares = buys.reduce((a, b) => a + b.shares, 0);
  const totalBurned = burns.reduce((a, b) => a + b.shares, 0);
  const since = (ms: number) => buys.filter((b) => now - b.ts < ms).reduce((a, b) => a + b.netUsd, 0);

  // Daily series spanning first buy → today, so quiet stretches show as
  // gaps rather than being collapsed away.
  const dayOf = (t: number) => Math.floor(t / DAY_MS) * DAY_MS;
  const perDay = new Map<number, { netUsd: number; shares: number; burned: number; buys: number; fundedUsd: number }>();
  const bump = (t: number) => {
    const k = dayOf(t);
    let d = perDay.get(k);
    if (!d) perDay.set(k, (d = { netUsd: 0, shares: 0, burned: 0, buys: 0, fundedUsd: 0 }));
    return d;
  };
  for (const b of buys) {
    const d = bump(b.ts);
    d.netUsd += b.netUsd;
    d.shares += b.shares;
    d.buys++;
  }
  for (const b of burns) bump(b.ts).burned += b.shares;
  for (const f of funding) bump(f.ts).fundedUsd += f.usdcIn;

  const firstBuyAt = buys.length ? Math.min(...buys.map((b) => b.ts)) : 0;
  const lastBuyAt = buys.length ? Math.max(...buys.map((b) => b.ts)) : 0;

  const daily: BuybackDay[] = [];
  if (buys.length) {
    let cumulative = 0;
    let cumulativeBurned = 0;
    for (let t = dayOf(firstBuyAt); t <= dayOf(now); t += DAY_MS) {
      const d = perDay.get(t);
      cumulative += d?.netUsd ?? 0;
      cumulativeBurned += d?.burned ?? 0;
      daily.push({
        t,
        netUsd: d?.netUsd ?? 0,
        shares: d?.shares ?? 0,
        burned: d?.burned ?? 0,
        buys: d?.buys ?? 0,
        fundedUsd: d?.fundedUsd ?? 0,
        cumulativeUsd: cumulative,
        cumulativeBurned,
      });
    }
  }

  const holdings: BuybackHoldingRow[] = store.holdings.map((h) => {
    const player = ROSTER_BY_ID.get(h.playerId) ?? null;
    const spot = spotByPlayerId?.get(h.playerId) ?? 0;
    const supply = supplyByPlayerId?.get(h.playerId) ?? 0;
    return {
      ...h,
      player,
      valueUsd: spot > 0 ? h.shares * spot : 0,
      shareOfSupply: supply > 0 ? (h.shares / supply) * 100 : null,
    };
  }).sort((a, b) => b.valueUsd - a.valueUsd || b.shares - a.shares);

  return {
    wallet: store.wallet ?? BUYBACK_WALLET,
    updatedAt: store.updatedAt ?? 0,
    lastIndexedBlock: store.lastIndexedBlock ?? 0,
    usdcBalance: store.usdcBalance ?? 0,
    totalDeployedUsd,
    totalFundedUsd: funding.reduce((a, f) => a + f.usdcIn, 0),
    totalShares,
    totalBurned,
    burnCount: burns.length,
    floatShares: totalShares - totalBurned,
    heldShares: store.holdings.reduce((a, h) => a + h.shares, 0),
    costPerShare: totalShares > 0 ? totalDeployedUsd / totalShares : 0,
    buyCount: buys.length,
    firstBuyAt,
    lastBuyAt,
    deployed24h: since(DAY_MS),
    deployed7d: since(7 * DAY_MS),
    deployed30d: since(30 * DAY_MS),
    activeDays: [...perDay.values()].filter((d) => d.buys > 0).length,
    avgBuyUsd: buys.length ? totalDeployedUsd / buys.length : 0,
    activeRecently: lastBuyAt > 0 && now - lastBuyAt < 3 * DAY_MS,
    generatedAt: now,
    daily,
    holdings,
    holdingsValueUsd: holdings.reduce((a, h) => a + h.valueUsd, 0),
    recent: buys.slice().sort((a, b) => b.ts - a.ts).slice(0, 40),
    recentBurns: burns.slice().sort((a, b) => b.ts - a.ts).slice(0, 40),
    funding: funding.slice().sort((a, b) => b.ts - a.ts),
    available: true,
  };
}
