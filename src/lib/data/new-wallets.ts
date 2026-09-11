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
  count: number;              // wallets whose first NFL trade landed this day
  cumulative: number;         // all-time wallet count at the end of this day
  activeNew: number;          // distinct 30-day-cohort wallets that traded this day
  cohortTrades: number;       // trades by the 30-day cohort this day
  cohortVolumeUsd: number;    // their volume (buys + sells + swaps at spot)
  cohortBuyUsd: number;       // buys + swap-ins by the cohort this day
  cohortSellUsd: number;      // sells + swap-outs by the cohort this day
  cohortNetUsd: number;       // buy − sell (positive = new money in)
  cohortNetCumUsd: number;    // running net over the 30-day window
  marketVolumeUsd: number;    // all NFL volume this day, for the share line
}

export interface NewWalletCohort {
  label: string;              // "This week", "1 week ago", ...
  from: number;               // unix ms, inclusive
  to: number;                 // unix ms, exclusive
  joined: number;
  stillHolding: number;       // position > $1 today
  avgFirstUsd: number;        // mean dollars on the first trade
  volumeUsd: number;          // everything they've traded since joining
  netUsd: number;             // buys − sells (positive = money still in)
  tradesPerWallet: number;
}

export interface NewWalletsReport {
  rows: NewWalletRow[];       // newest first
  daily: NewWalletsDay[];     // 30 days, oldest first
  cohorts: NewWalletCohort[]; // 4 weekly cohorts, newest first
  totalWalletsEver: number;
  registrySeeded: boolean;
  registryUpdatedAt: number;
  new24h: number;
  prior24h: number;           // first-seen between 48h and 24h ago
  new7d: number;
  prior7d: number;            // first-seen between 14d and 7d ago, for the trend
  new30d: number;
  prior30d: number;           // first-seen between 60d and 30d ago
  firstBuyUsd7d: number;      // dollars committed on first trades in the last 7d
  stillHolding7d: number;     // of new7d, wallets whose position is still > $1
  activeNew7d: number;        // distinct 30-day-cohort wallets that traded in the last 7d
  cohortVolume7d: number;     // 30-day cohort volume over the last 7d
  cohortBuy7d: number;
  cohortSell7d: number;
  cohortNet7d: number;        // cohortBuy7d − cohortSell7d
  cohortNetPrior7d: number;   // same for the 7 days before that
  marketVolume7d: number;     // all NFL volume over the last 7d
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

  const value = (t: IndexedTrade) => {
    if (t.usdAmount > 0) return t.usdAmount;
    const spot = spotByToken.get(t.tokenIdSuffix) ?? 0;
    return spot > 0 ? t.shareAmount * spot : 0;
  };
  const dayOf = (ts: number) => Math.floor(ts / DAY_MS) * DAY_MS;

  const rows: NewWalletRow[] = [];
  const dailyCounts = new Map<number, number>();
  let new24h = 0, prior24h = 0, new7d = 0, prior7d = 0, new30d = 0, prior30d = 0;
  let firstBuyUsd7d = 0, stillHolding7d = 0;
  let olderThanWindow = 0;

  for (const [addr, seen] of firstSeen) {
    const age = now - seen.at;
    if (age >= DAY_MS && age < 2 * DAY_MS) prior24h++;
    if (age >= 7 * DAY_MS && age < 14 * DAY_MS) prior7d++;
    if (age >= 30 * DAY_MS && age < 60 * DAY_MS) prior30d++;
    if (seen.at < windowStart) { olderThanWindow++; continue; }

    new30d++;
    if (age < DAY_MS) new24h++;
    if (age < 7 * DAY_MS) new7d++;
    const dayKey = dayOf(seen.at);
    dailyCounts.set(dayKey, (dailyCounts.get(dayKey) ?? 0) + 1);

    const list = (byWallet.get(addr) ?? []).slice().sort((a, b) => a.blockTime - b.blockTime || a.logIndex - b.logIndex);

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

  // Daily activity: what the 30-day cohort did each day versus the
  // whole market. One pass over the trade history.
  const cohort = new Set(rows.map((r) => r.address));
  const dayActivity = new Map<number, {
    active: Set<string>; trades: number; cohortUsd: number; buyUsd: number; sellUsd: number; marketUsd: number;
  }>();
  const activeNew7dSet = new Set<string>();
  let cohortVolume7d = 0, marketVolume7d = 0, cohortBuy7d = 0, cohortSell7d = 0, cohortNetPrior7d = 0;
  const sevenDaysAgo = now - 7 * DAY_MS;
  const fourteenDaysAgo = now - 14 * DAY_MS;
  for (const t of trades) {
    if (t.blockTime < windowStart) continue;
    const key = dayOf(t.blockTime);
    let d = dayActivity.get(key);
    if (!d) dayActivity.set(key, (d = { active: new Set(), trades: 0, cohortUsd: 0, buyUsd: 0, sellUsd: 0, marketUsd: 0 }));
    const usd = value(t);
    d.marketUsd += usd;
    const recent = t.blockTime >= sevenDaysAgo;
    if (recent) marketVolume7d += usd;
    if (!cohort.has(t.wallet)) continue;
    const isIn = t.side === "buy" || t.side === "swap-in";
    d.active.add(t.wallet);
    d.trades++;
    d.cohortUsd += usd;
    if (isIn) d.buyUsd += usd; else d.sellUsd += usd;
    if (recent) {
      cohortVolume7d += usd;
      activeNew7dSet.add(t.wallet);
      if (isIn) cohortBuy7d += usd; else cohortSell7d += usd;
    } else if (t.blockTime >= fourteenDaysAgo) {
      cohortNetPrior7d += isIn ? usd : -usd;
    }
  }

  const daily: NewWalletsDay[] = [];
  const today = dayOf(now);
  let cumulative = olderThanWindow;
  let netCum = 0;
  for (let i = 29; i >= 0; i--) {
    const t = today - i * DAY_MS;
    const count = dailyCounts.get(t) ?? 0;
    cumulative += count;
    const d = dayActivity.get(t);
    const buy = d?.buyUsd ?? 0;
    const sell = d?.sellUsd ?? 0;
    netCum += buy - sell;
    daily.push({
      t,
      count,
      cumulative,
      activeNew: d?.active.size ?? 0,
      cohortTrades: d?.trades ?? 0,
      cohortVolumeUsd: d?.cohortUsd ?? 0,
      cohortBuyUsd: buy,
      cohortSellUsd: sell,
      cohortNetUsd: buy - sell,
      cohortNetCumUsd: netCum,
      marketVolumeUsd: d?.marketUsd ?? 0,
    });
  }

  // Weekly cohorts, newest first. Each wallet lands in exactly one.
  const cohorts: NewWalletCohort[] = [];
  const labels = ["This week", "1 week ago", "2 weeks ago", "3 weeks ago"];
  for (let w = 0; w < 4; w++) {
    const to = now - w * 7 * DAY_MS;
    const from = to - 7 * DAY_MS;
    const members = rows.filter((r) => r.firstSeenAt >= from && r.firstSeenAt < to);
    const joined = members.length;
    cohorts.push({
      label: labels[w],
      from,
      to,
      joined,
      stillHolding: members.filter((r) => r.nflValueUsd > 1).length,
      avgFirstUsd: joined ? members.reduce((a, r) => a + r.firstUsd, 0) / joined : 0,
      volumeUsd: members.reduce((a, r) => a + r.buyUsd + r.sellUsd, 0),
      netUsd: members.reduce((a, r) => a + r.netUsd, 0),
      tradesPerWallet: joined ? members.reduce((a, r) => a + r.trades, 0) / joined : 0,
    });
  }

  return {
    rows,
    daily,
    cohorts,
    totalWalletsEver: firstSeen.size,
    registrySeeded: (registry?.seededFromBlock ?? 0) > 0,
    registryUpdatedAt: registry?.updatedAt ?? 0,
    new24h,
    prior24h,
    new7d,
    prior7d,
    new30d,
    prior30d,
    firstBuyUsd7d,
    stillHolding7d,
    activeNew7d: activeNew7dSet.size,
    cohortVolume7d,
    cohortBuy7d,
    cohortSell7d,
    cohortNet7d: cohortBuy7d - cohortSell7d,
    cohortNetPrior7d,
    marketVolume7d,
    generatedAt: now,
  };
}

function tokenAddress(suffix: string): string {
  return `${FOOTBALLFUN_CONTRACT}:${suffix}`;
}
