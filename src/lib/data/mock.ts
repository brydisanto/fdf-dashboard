import "server-only";
import type {
  HolderBucket,
  MarketOverview,
  PlayerSummary,
  PoolStats,
  PricePoint,
  TokenStats,
  Trade,
  Timeframe,
} from "../types";
import { PLAYERS, PLAYERS_BY_ID } from "./players";
import { gauss, makeRng, range, type Rng } from "./seed";

// Anchor "now" to the top of the current UTC hour so we have a stable
// frame of reference within a session but data still feels fresh.
const NOW = (() => {
  const d = new Date();
  d.setUTCMinutes(0, 0, 0);
  return d.getTime();
})();

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const POSITION_TIER: Record<string, number> = {
  QB: 1.0, WR: 0.85, RB: 0.75, TE: 0.55, EDGE: 0.5,
  LB: 0.35, CB: 0.4, S: 0.35, K: 0.18,
};

function starFactor(playerId: string): number {
  // Predetermined "household name" boost for top players. Everyone else
  // gets a deterministic 0.4–1.0 by hash, which keeps the order stable.
  const stars: Record<string, number> = {
    "patrick-mahomes": 1.0, "josh-allen": 0.97, "lamar-jackson": 0.94,
    "joe-burrow": 0.92, "jalen-hurts": 0.88, "jayden-daniels": 0.91,
    "christian-mccaffrey": 0.93, "saquon-barkley": 0.9, "derrick-henry": 0.85,
    "bijan-robinson": 0.83, "justin-jefferson": 0.95, "jamarr-chase": 0.94,
    "ceedee-lamb": 0.9, "tyreek-hill": 0.86, "aj-brown": 0.83,
    "amon-ra-st-brown": 0.84, "puka-nacua": 0.81, "travis-kelce": 0.82,
    "sam-laporta": 0.7, "brock-bowers": 0.79, "myles-garrett": 0.78,
    "micah-parsons": 0.77, "tj-watt": 0.74, "justin-tucker": 0.6,
  };
  return stars[playerId] ?? 0.55;
}

function tokenStatsFor(playerId: string): TokenStats {
  const player = PLAYERS_BY_ID.get(playerId);
  if (!player) throw new Error(`Unknown player ${playerId}`);
  const rng = makeRng(`token:${playerId}`);
  const tier = POSITION_TIER[player.position] ?? 0.4;
  const star = starFactor(playerId);
  const variance = 0.6 + rng() * 0.9;

  const priceUsd = +(2.5 + tier * star * 800 * variance + rng() * 5).toFixed(4);
  const change1h = +((gauss(rng) * 0.8).toFixed(2));
  const change24h = +((gauss(rng) * 6.5 + (star - 0.6) * 1.2).toFixed(2));
  const change7d = +((gauss(rng) * 14 + (star - 0.6) * 3).toFixed(2));

  const maxSupply = 25_000_000;
  const circulatingSupply = Math.round(
    maxSupply * (0.18 + tier * 0.45 * star + rng() * 0.1),
  );
  const marketCap = Math.round(priceUsd * circulatingSupply);
  const volume24h = Math.round(marketCap * (0.04 + rng() * 0.18) * (0.5 + star));
  const trades24h = Math.round(180 + rng() * 4200 * (0.5 + star));
  const holders = Math.round(420 + rng() * 9800 * (0.5 + star));
  const tvl = Math.round(volume24h * (0.6 + rng() * 1.8));
  const poolSupply = priceUsd > 0 ? Math.round((tvl / 2) / priceUsd) : 0;
  const activeSupply = Math.max(0, circulatingSupply - poolSupply);

  const ath = +(priceUsd * (1.4 + rng() * 1.6)).toFixed(4);
  const atl = +(priceUsd * (0.25 + rng() * 0.4)).toFixed(4);
  const athDate = new Date(NOW - Math.floor(rng() * 90) * DAY).toISOString();
  const atlDate = new Date(NOW - Math.floor(120 + rng() * 100) * DAY).toISOString();

  return {
    playerId,
    priceUsd, change1h, change24h, change7d,
    marketCap, volume24h, volume7d: volume24h * (4 + rng() * 4), trades24h, holders,
    circulatingSupply, poolSupply, activeSupply, maxSupply, tvl,
    ath, athDate, atl, atlDate,
  };
}

function sparkline(playerId: string, points: number, drift = 0): number[] {
  const rng = makeRng(`spark:${playerId}`);
  const stats = tokenStatsFor(playerId);
  // Walk backwards so the last point matches current price.
  const series: number[] = [];
  let p = stats.priceUsd;
  for (let i = 0; i < points; i++) series.push(p);
  for (let i = points - 2; i >= 0; i--) {
    const step = gauss(rng) * 0.025 + drift / points;
    p = Math.max(0.05, p / (1 + step));
    series[i] = +p.toFixed(4);
  }
  return series;
}

function priceSeries(playerId: string, tf: Timeframe): PricePoint[] {
  const stats = tokenStatsFor(playerId);
  const cfg: Record<Timeframe, { points: number; stepMs: number; vol: number }> = {
    "1H":  { points: 60,  stepMs: 60 * 1000,    vol: 0.004 },
    "24H": { points: 96,  stepMs: 15 * 60_000,  vol: 0.012 },
    "7D":  { points: 168, stepMs: HOUR,         vol: 0.022 },
    "30D": { points: 180, stepMs: 4 * HOUR,     vol: 0.04  },
    "ALL": { points: 240, stepMs: DAY,          vol: 0.06  },
  };
  const { points, stepMs, vol } = cfg[tf];
  const rng = makeRng(`series:${playerId}:${tf}`);

  const series: PricePoint[] = [];
  let price = stats.priceUsd;
  for (let i = 0; i < points; i++) {
    const t = NOW - (points - 1 - i) * stepMs;
    series.push({ t, price: +price.toFixed(4), volume: 0 });
  }
  // Walk backwards so the present matches current price.
  for (let i = points - 2; i >= 0; i--) {
    const step = gauss(rng) * vol;
    price = Math.max(0.05, price / (1 + step));
    series[i].price = +price.toFixed(4);
  }
  // Add per-bar volume scaled to overall 24h volume.
  const baseVol = stats.volume24h / Math.max(1, points / 4);
  for (let i = 0; i < points; i++) {
    series[i].volume = Math.round(baseVol * (0.4 + Math.abs(gauss(rng)) * 0.9));
  }
  return series;
}

function trades(playerId: string, limit = 25): Trade[] {
  const stats = tokenStatsFor(playerId);
  const rng = makeRng(`trades:${playerId}`);
  const out: Trade[] = [];
  for (let i = 0; i < limit; i++) {
    const side: "buy" | "sell" = rng() > 0.5 ? "buy" : "sell";
    const drift = (gauss(rng) * 0.01);
    const priceUsd = +(stats.priceUsd * (1 + drift)).toFixed(4);
    const amount = +(range(rng, 5, 8000)).toFixed(2);
    const totalUsd = +(amount * priceUsd).toFixed(2);
    const ago = Math.floor(range(rng, 5_000, 6 * HOUR));
    out.push({
      id: `${playerId}-${i}`,
      playerId, side,
      flow: side, // mock data is all buy/sell, no swaps
      priceUsd, amount, totalUsd,
      wallet: walletFrom(rng),
      txHash: hashFrom(rng),
      timestamp: NOW - ago,
    });
  }
  return out.sort((a, b) => b.timestamp - a.timestamp);
}

function walletFrom(rng: Rng) {
  const hex = "0123456789abcdef";
  let s = "0x";
  for (let i = 0; i < 40; i++) s += hex[Math.floor(rng() * 16)];
  return s;
}
function hashFrom(rng: Rng) {
  const hex = "0123456789abcdef";
  let s = "0x";
  for (let i = 0; i < 64; i++) s += hex[Math.floor(rng() * 16)];
  return s;
}

function holders(playerId: string): HolderBucket[] {
  const rng = makeRng(`holders:${playerId}`);
  const stats = tokenStatsFor(playerId);
  const buckets = [
    { label: "Whales (>1%)",        weight: 0.08 + rng() * 0.06 },
    { label: "Large (0.1–1%)",      weight: 0.18 + rng() * 0.08 },
    { label: "Mid (0.01–0.1%)",     weight: 0.32 + rng() * 0.08 },
    { label: "Small (<0.01%)",      weight: 0.42 - rng() * 0.05 },
  ];
  const totalWeight = buckets.reduce((a, b) => a + b.weight, 0);
  return buckets.map((b) => ({
    label: b.label,
    count: Math.round((b.weight / totalWeight) * stats.holders),
    share: +((b.weight / totalWeight) * 100).toFixed(2),
  }));
}

function poolStats(playerId: string): PoolStats {
  const stats = tokenStatsFor(playerId);
  const rng = makeRng(`pool:${playerId}`);
  const fees24h = Math.round(stats.volume24h * 0.003);
  const apr = +((fees24h * 365) / Math.max(1, stats.tvl) * 100).toFixed(2);
  return {
    playerId,
    tvl: stats.tvl,
    feeTier: 0.3,
    volume24h: stats.volume24h,
    fees24h,
    apr,
    depthBuy: Math.round(stats.tvl * (0.42 + rng() * 0.1)),
    depthSell: Math.round(stats.tvl * (0.42 + rng() * 0.1)),
  };
}

// ---------- Public data API ----------

export async function getPlayers(): Promise<PlayerSummary[]> {
  return PLAYERS.map((p) => {
    const stats = tokenStatsFor(p.id);
    return { ...p, ...stats, sparkline7d: sparkline(p.id, 28) };
  });
}

export async function getPlayer(id: string): Promise<PlayerSummary | null> {
  const player = PLAYERS_BY_ID.get(id);
  if (!player) return null;
  const stats = tokenStatsFor(id);
  return { ...player, ...stats, sparkline7d: sparkline(id, 28) };
}

export async function getPriceSeries(id: string, tf: Timeframe): Promise<PricePoint[]> {
  if (!PLAYERS_BY_ID.has(id)) return [];
  return priceSeries(id, tf);
}

export async function getTrades(id: string, limit = 25): Promise<Trade[]> {
  if (!PLAYERS_BY_ID.has(id)) return [];
  return trades(id, limit);
}

export async function getHolders(id: string): Promise<HolderBucket[]> {
  if (!PLAYERS_BY_ID.has(id)) return [];
  return holders(id);
}

export async function getPoolStats(id: string): Promise<PoolStats | null> {
  if (!PLAYERS_BY_ID.has(id)) return null;
  return poolStats(id);
}

export async function getRecentTradesGlobal(limit = 30): Promise<Trade[]> {
  const all: Trade[] = [];
  for (const p of PLAYERS) all.push(...trades(p.id, 4));
  return all.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
}

export async function getMarketOverview(): Promise<MarketOverview> {
  const all = await getPlayers();
  const totalMarketCap = all.reduce((a, p) => a + p.marketCap, 0);
  const totalVolume24h = all.reduce((a, p) => a + p.volume24h, 0);
  const totalTrades24h = all.reduce((a, p) => a + p.trades24h, 0);
  const totalHolders   = all.reduce((a, p) => a + p.holders, 0);
  const totalTvl       = all.reduce((a, p) => a + p.tvl, 0);

  const rng = makeRng("market-overview");
  const mcChange24h = +((gauss(rng) * 4 + 1.2).toFixed(2));
  const volChange24h = +((gauss(rng) * 9 - 1).toFixed(2));
  const activeWallets = Math.round(totalHolders * (0.18 + rng() * 0.08));

  // Aggregate market-cap series – weighted blend that lands on the present total.
  const points = 120;
  const stepMs = 2 * HOUR;
  const series: PricePoint[] = [];
  let mc = totalMarketCap;
  for (let i = 0; i < points; i++) {
    const t = NOW - (points - 1 - i) * stepMs;
    series.push({ t, price: mc, volume: 0 });
  }
  for (let i = points - 2; i >= 0; i--) {
    const step = gauss(rng) * 0.018;
    mc = Math.max(1, mc / (1 + step));
    series[i].price = Math.round(mc);
  }

  const volRng = makeRng("market-volume");
  const volSeries: PricePoint[] = [];
  for (let i = 0; i < 24; i++) {
    const t = NOW - (23 - i) * HOUR;
    const factor = 0.5 + Math.abs(gauss(volRng)) * 1.2;
    volSeries.push({ t, price: 0, volume: Math.round((totalVolume24h / 24) * factor) });
  }

  return {
    totalMarketCap,
    marketCapChange24h: mcChange24h,
    totalVolume24h,
    volumeChange24h: volChange24h,
    totalTrades24h,
    activeWallets24h: activeWallets,
    totalHolders,
    totalTvl,
    listedPlayers: all.length,
    marketCapSeries: series,
    volumeSeries: volSeries,
    goldPriceUsd: 1.0,
    funPriceUsd: +(0.18 + gauss(rng) * 0.02).toFixed(4),
    funChange24h: +((gauss(rng) * 5).toFixed(2)),
  };
}
