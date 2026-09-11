import "server-only";
import { FOOTBALLFUN_CONTRACT, ROSTER_BY_ID, ROSTER_BY_TOKEN } from "./roster";
import { readTradeHistory, type IndexedTrade } from "./trade-indexer";
import { readWalletRegistry } from "./wallet-registry";
import { getPlayers, tierForValue } from "./footballfun";
import type { WalletTier } from "../types";

// "New wallets" = wallets whose first-ever NFL trade landed inside the
// last 30 days. The registry supplies the first-seen date (persistent,
// seeded from the contract's deployment block); trade-history (30-day
// window + live on-chain tail) supplies everything they've done since.
// Because a new wallet's entire NFL life fits inside the 30-day window,
// its net share balance from the index IS its current position, so no
// per-wallet balance RPCs are needed.

export const NEW_WALLET_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export interface NewWalletRow {
  address: string;
  firstSeenAt: number;
  firstPlayerId: string | null;
  firstSide: IndexedTrade["side"];
  firstUsd: number;
  lastActiveAt: number;
  trades: number;
  playersTraded: number;
  buyUsd: number;             // buys + swap-ins, valued at spot when the indexer had no USDC leg
  sellUsd: number;            // sells + swap-outs
  netUsd: number;             // buyUsd - sellUsd (positive = net money in)
  nflValueUsd: number;        // net shares still held × spot
  topPlayerId: string | null;
  topPlayerUsd: number;
  tier: WalletTier;
  provisional: boolean;       // not in the registry yet (seen only in the live tail)
}

export interface NewWalletsDay {
  t: number;                  // unix ms at UTC midnight
  count: number;
}

export interface NewWalletsReport {
  rows: NewWalletRow[];       // newest first
  daily: NewWalletsDay[];     // 30 days, oldest first
  totalWalletsEver: number;
  registrySeeded: boolean;
  registryUpdatedAt: number;
  new24h: number;
  new7d: number;
  new30d: number;
  prior7d: number;            // first-seen between 14d and 7d ago, for the trend
  firstBuyUsd7d: number;      // dollars committed on first trades in the last 7d
  stillHolding7d: number;     // of new7d, wallets whose position is still > $1
  generatedAt: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

let cache: { ts: number; promise: Promise<NewWalletsReport> } | null = null;
const CACHE_TTL_MS = 60_000;

export function getNewWallets(): Promise<NewWalletsReport> {
  const now = Date.now();
  if (cache && now - cache.ts < CACHE_TTL_MS) return cache.promise;
  const promise = buildReport().catch((err) => {
    cache = null;
    throw err;
  });
  cache = { ts: now, promise };
  return promise;
}

async function buildReport(): Promise<NewWalletsReport> {
  const [registry, history, players] = await Promise.all([
    readWalletRegistry(),
    readTradeHistory(),
    getPlayers(),
  ]);
  const now = Date.now();
  const windowStart = now - NEW_WALLET_WINDOW_MS;
  const spotByToken = new Map<string, number>();
  for (const p of players) {
    const roster = ROSTER_BY_ID.get(p.id);
    if (roster) spotByToken.set(roster.tokenIdSuffix, p.priceUsd);
  }

  // First-seen per wallet: registry first, then anything in the trade
  // history the registry hasn't caught up with yet (live tail).
  const firstSeen = new Map<string, { at: number; provisional: boolean }>();
  const registryWallets = registry?.wallets ?? {};
  for (const [addr, e] of Object.entries(registryWallets)) {
    if (e.firstSeenAt > 0) firstSeen.set(addr, { at: e.firstSeenAt, provisional: false });
  }
  const trades = history?.trades ?? [];
  const byWallet = new Map<string, IndexedTrade[]>();
  for (const t of trades) {
    let list = byWallet.get(t.wallet);
    if (!list) byWallet.set(t.wallet, (list = []));
    list.push(t);
    const cur = firstSeen.get(t.wallet);
    if (!cur) firstSeen.set(t.wallet, { at: t.blockTime, provisional: true });
    else if (cur.provisional && t.blockTime < cur.at) cur.at = t.blockTime;
  }

  const rows: NewWalletRow[] = [];
  const dailyCounts = new Map<number, number>();
  let new24h = 0, new7d = 0, new30d = 0, prior7d = 0, firstBuyUsd7d = 0, stillHolding7d = 0;

  for (const [addr, seen] of firstSeen) {
    const age = now - seen.at;
    if (age >= 7 * DAY_MS && age < 14 * DAY_MS) prior7d++;
    if (seen.at < windowStart) continue;

    new30d++;
    if (age < DAY_MS) new24h++;
    if (age < 7 * DAY_MS) new7d++;
    const dayKey = Math.floor(seen.at / DAY_MS) * DAY_MS;
    dailyCounts.set(dayKey, (dailyCounts.get(dayKey) ?? 0) + 1);

    const list = (byWallet.get(addr) ?? []).slice().sort((a, b) => a.blockTime - b.blockTime || a.logIndex - b.logIndex);
    const value = (t: IndexedTrade) => {
      if (t.usdAmount > 0) return t.usdAmount;
      const spot = spotByToken.get(t.tokenIdSuffix) ?? 0;
      return spot > 0 ? t.shareAmount * spot : 0;
    };

    let buyUsd = 0, sellUsd = 0;
    const shares = new Map<string, number>();
    const playersSeen = new Set<string>();
    let lastActiveAt = seen.at;
    for (const t of list) {
      playersSeen.add(t.tokenIdSuffix);
      if (t.blockTime > lastActiveAt) lastActiveAt = t.blockTime;
      const isIn = t.side === "buy" || t.side === "swap-in";
      if (isIn) buyUsd += value(t); else sellUsd += value(t);
      shares.set(t.tokenIdSuffix, (shares.get(t.tokenIdSuffix) ?? 0) + (isIn ? t.shareAmount : -t.shareAmount));
    }
    let nflValueUsd = 0;
    let topToken: string | null = null;
    let topUsd = 0;
    for (const [token, n] of shares) {
      if (n <= 1e-9) continue;
      const usd = n * (spotByToken.get(token) ?? 0);
      nflValueUsd += usd;
      if (usd > topUsd) { topUsd = usd; topToken = token; }
    }

    const reg = registryWallets[addr];
    const first = list[0];
    const firstToken = reg?.firstToken ?? first?.tokenIdSuffix ?? null;
    const firstSide = reg?.firstSide ?? first?.side ?? "buy";
    const firstUsd = reg ? (reg.firstUsd > 0 ? reg.firstUsd : first ? value(first) : 0) : first ? value(first) : 0;

    if (age < 7 * DAY_MS) {
      firstBuyUsd7d += firstSide === "buy" || firstSide === "swap-in" ? firstUsd : 0;
      if (nflValueUsd > 1) stillHolding7d++;
    }

    rows.push({
      address: addr,
      firstSeenAt: seen.at,
      firstPlayerId: firstToken ? (ROSTER_BY_TOKEN.get(tokenAddress(firstToken))?.id ?? null) : null,
      firstSide,
      firstUsd,
      lastActiveAt,
      trades: list.length,
      playersTraded: playersSeen.size,
      buyUsd,
      sellUsd,
      netUsd: buyUsd - sellUsd,
      nflValueUsd,
      topPlayerId: topToken ? (ROSTER_BY_TOKEN.get(tokenAddress(topToken))?.id ?? null) : null,
      topPlayerUsd: topUsd,
      tier: tierForValue(nflValueUsd),
      provisional: seen.provisional,
    });
  }

  rows.sort((a, b) => b.firstSeenAt - a.firstSeenAt);

  const daily: NewWalletsDay[] = [];
  const today = Math.floor(now / DAY_MS) * DAY_MS;
  for (let i = 29; i >= 0; i--) {
    const t = today - i * DAY_MS;
    daily.push({ t, count: dailyCounts.get(t) ?? 0 });
  }

  return {
    rows,
    daily,
    totalWalletsEver: firstSeen.size,
    registrySeeded: (registry?.seededFromBlock ?? 0) > 0,
    registryUpdatedAt: registry?.updatedAt ?? 0,
    new24h,
    new7d,
    new30d,
    prior7d,
    firstBuyUsd7d,
    stillHolding7d,
    generatedAt: now,
  };
}

function tokenAddress(suffix: string): string {
  return `${FOOTBALLFUN_CONTRACT}:${suffix}`;
}
