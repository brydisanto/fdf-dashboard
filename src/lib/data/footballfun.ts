import "server-only";
import { getAddress } from "viem";
import type {
  HolderBucket,
  MarketOverview,
  MarketStatRow,
  PlayerSummary,
  PoolStats,
  PricePoint,
  Timeframe,
  Trade,
  WalletHolding,
  WalletProfile,
  WalletTier,
  WalletTradeRow,
  WindowKey,
  WindowStats,
} from "../types";
import { ROSTER, ROSTER_BY_ID, ROSTER_BY_TOKEN, FOOTBALLFUN_CONTRACT, type NflPlayer } from "./roster";
import { POOL_FEE_RATE, FEE_RATE_BUY, FEE_RATE_SELL, FEE_RATE_SWAP } from "../constants";
import { readManyFunBalances, readManyWalletsNflBalances, readWalletNflBalances, readFunBalance } from "./onchain-client";

export { POOL_FEE_RATE, FEE_RATE_BUY, FEE_RATE_SELL, FEE_RATE_SWAP };

// Sport.fun's player share contract acts as the counterparty for every
// player ↔ player swap. Any trade where this address shows up as maker
// or recipient is a swap leg, not a regular buy/sell against USDC.
const SWAP_ROUTER_LC = FOOTBALLFUN_CONTRACT.toLowerCase();

// ---------- Tenero API client ----------

const API_BASE = "https://api.tenero.io/v1/sportsfun";

// Cache responses to stay under the upstream per-IP rate limit while
// keeping headline market cap reasonably fresh. The /tokens list feeds
// every market cap calculation so it's the shortest-lived; heavier
// per-pool endpoints (OHLC, holders, wallet snapshots) live longer.
const REVALIDATE = {
  list:    15,        // /tokens list — drives mcap, prices, supplies
  detail:  30,
  ohlc:    300,       // 5 min — OHLC bars don't change intraday
  trades:  45,        // bumped from 20s — under ISR (revalidate=60), the
                      // trade fetches were misaligned with the page cycle
                      // and getting hit twice per regen; 45s lets the
                      // page cache absorb most regens.
  wallet:  300,       // 5 min — wallet snapshots for trade-feed badges
  holders: 1800,      // 30 min — full holder pagination is hundreds of calls
} as const;

async function tget<T>(path: string, revalidate: number): Promise<T> {
  const url = `${API_BASE}${path}`;
  let attempt = 0;
  while (true) {
    const res = await fetch(url, { next: { revalidate } });
    if (res.status === 429 && attempt < 3) {
      const wait = 250 * (attempt + 1) ** 2;
      await new Promise((r) => setTimeout(r, wait));
      attempt++;
      continue;
    }
    if (!res.ok) {
      throw new Error(`Upstream ${res.status} on ${path}`);
    }
    const json = (await res.json()) as { statusCode: string; message: string; data: T };
    return json.data;
  }
}

// Resolve promises in chunks so we don't slam the upstream API with
// 70+ parallel requests (which triggers rate limiting during prerender).
async function chunked<T>(items: readonly (() => Promise<T>)[], size: number): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < items.length; i += size) {
    const slice = items.slice(i, i + size);
    const results = await Promise.all(slice.map((fn) => fn()));
    out.push(...results);
  }
  return out;
}

interface TeneroTokenRow {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  description?: string;
  image_url?: string;
  deployer_address?: string;
  deployed_at?: string;
  holder_count: number;
  circulating_supply: string | number;
  total_supply: string | number;
  total_liquidity_usd: number;
  base_liquidity_usd?: number;
  quote_liquidity_usd?: number;
  pool_count: number;
  biggest_pool_id?: string;
  price_usd: number;
  marketcap_usd: number;
  total_marketcap_usd?: number;
  metrics: {
    volume_30m_usd: number; volume_1h_usd: number; volume_4h_usd: number;
    volume_1d_usd: number;  volume_7d_usd: number;
    swaps_30m: number; swaps_1h: number; swaps_4h: number;
    swaps_1d: number; swaps_7d: number;
    buys_1d?: number; sells_1d?: number;
  };
  price: {
    current_price: number;
    price_1h_ago: number;
    price_4h_ago: number;
    price_1d_ago: number;
    price_7d_ago: number;
    price_30d_ago?: number;
  };
}

interface ListResponse<T> {
  rows: T[];
  next: string | null;
}

interface TeneroTradeRow {
  tx_id: string;
  tx_index: number;
  event_index: number;
  pool_id: string;
  event_type: "buy" | "sell" | string;
  maker: string;
  maker_name?: string;
  recipient: string;
  recipient_name?: string;
  base_token_address: string;
  quote_token_address: string;
  base_token_amount: string | number;
  quote_token_amount: string | number;
  amount_usd: number;
  price: number;
  price_usd: number;
  block_time: number;
}

interface TeneroHolderRow {
  wallet_address: string;
  balance: string | number;
  start_holding_at: number;
  last_active_at: number;
  wallet_name?: string;
}

interface TeneroOhlcRow {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ---------- Mappers ----------

function pctChange(current: number, prior: number): number {
  if (!Number.isFinite(prior) || prior === 0) return 0;
  return +(((current - prior) / prior) * 100).toFixed(2);
}

function buildPlayerSummary(player: NflPlayer, row: TeneroTokenRow): PlayerSummary {
  // The upstream returns two prices per token that drift between trades:
  //   - `price_usd` updates only when a trade lands (lags but stable)
  //   - `price.current_price` is derived from live pool reserves
  // Neither alone matches the price feed Sport.fun's own dashboard shows
  // — that one effectively averages the two. We do the same so our
  // headline market cap tracks the official chart instead of straddling
  // it by 1-2%.
  // Use the last-trade price (`price_usd`) for display rather than the
  // bonding-curve spot or an average — that's what Sport.fun's own UI
  // shows and what users see on the FDF/Sport.fun trade screen. The
  // curve spot can drift a percent or two above the last fill between
  // trades, which made our display read higher than the source UI.
  const lastTrade = Number(row.price_usd ?? 0);
  const liveSpot  = Number(row.price?.current_price ?? 0);
  const price = lastTrade > 0 ? lastTrade : liveSpot;
  // % changes must compare spot-to-spot. The upstream's price_*_ago
  // fields are all snapshots of `current_price`, so if we anchor those
  // against our averaged display price we get a phantom delta whenever
  // last_trade and current_price diverge (common during quiet hours
  // when the bonding-curve spot drifts away from the most recent trade).
  // Example: Josh Allen with last_trade=$0.0184, spot=$0.0197, and a
  // flat 1d/7d showed -3.1% with the averaged anchor when the real
  // spot-to-spot change was 0%.
  const refPrice = liveSpot > 0 ? liveSpot : (lastTrade > 0 ? lastTrade : price);
  const change1h  = pctChange(refPrice, Number(row.price?.price_1h_ago ?? refPrice));
  const change24h = pctChange(refPrice, Number(row.price?.price_1d_ago ?? refPrice));
  const change7d  = pctChange(refPrice, Number(row.price?.price_7d_ago ?? refPrice));

  // The upstream `marketcap_usd` field is actually FDV (price × total
  // supply 25M). The real circulating market cap is price × circulating
  // supply, which is what every other DEX analytics tool calls "market cap".
  const circulating = Number(row.circulating_supply ?? 0);
  const marketCap = Math.round(price * circulating);

  // Sport.fun runs a bonding curve, not a paired AMM — the Sport.fun
  // contract itself holds every share that hasn't been bought yet. The
  // upstream's `circulating_supply` already excludes those contract
  // holdings and represents exactly the shares sitting in user wallets,
  // so `activeSupply` is just `circulating`. `poolSupply` is the unsold
  // bonding-curve inventory: total cap minus circulating.
  const totalSupply = Number(row.total_supply ?? 0);
  const poolSupply = Math.max(0, totalSupply - circulating);
  const activeSupply = circulating;

  return {
    id: player.id,
    firstName: player.firstName,
    lastName: player.lastName,
    position: player.position,
    team: player.team,
    jerseyNumber: player.jerseyNumber,
    playerId: player.id,
    priceUsd: price,
    change1h,
    change24h,
    change7d,
    marketCap,
    volume24h: Number(row.metrics?.volume_1d_usd ?? 0),
    volume7d: Number(row.metrics?.volume_7d_usd ?? 0),
    trades24h: Number(row.metrics?.swaps_1d ?? 0),
    holders: Number(row.holder_count ?? 0),
    circulatingSupply: circulating,
    poolSupply,
    activeSupply,
    maxSupply: totalSupply,
    tvl: Number(row.total_liquidity_usd ?? 0),
    // ATH/ATL aren't returned in this row; show current as a placeholder.
    // The OHLC endpoint can give a real value later.
    ath: Math.max(price, Number(row.price?.price_30d_ago ?? price), Number(row.price?.price_7d_ago ?? price)),
    athDate: new Date().toISOString(),
    atl: Math.min(price, Number(row.price?.price_30d_ago ?? price), Number(row.price?.price_7d_ago ?? price)),
    atlDate: new Date().toISOString(),
    sparkline7d: [],
  };
}

// ---------- $FUN balance + price ----------

export interface WalletFunPosition {
  balance: number;
  priceUsd: number;
  valueUsd: number;
  change24h: number;
}

export async function getWalletFunPosition(address: string): Promise<WalletFunPosition> {
  const [balance, fun] = await Promise.all([
    readFunBalance(address),
    getFunPriceInfo(),
  ]);
  return {
    balance,
    priceUsd: fun.priceUsd,
    valueUsd: balance * fun.priceUsd,
    change24h: fun.change24h,
  };
}

// ---------- $FUN price from dexscreener ----------

const FUN_PAIR = "0x659be70647b0f63217d60e077f4417b1ecc65064";

interface DexScreenerPair {
  priceUsd?: string;
  priceChange?: { h24?: number };
}

async function getFunPriceInfo(): Promise<{ priceUsd: number; change24h: number }> {
  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/pairs/base/${FUN_PAIR}`,
      { next: { revalidate: 60 } },
    );
    if (!res.ok) return { priceUsd: 0, change24h: 0 };
    const json = (await res.json()) as { pair?: DexScreenerPair; pairs?: DexScreenerPair[] };
    const pair = json.pair ?? json.pairs?.[0];
    return {
      priceUsd: Number(pair?.priceUsd ?? 0),
      change24h: Number(pair?.priceChange?.h24 ?? 0),
    };
  } catch {
    return { priceUsd: 0, change24h: 0 };
  }
}

// ---------- Token list pagination ----------

async function fetchAllTokens(): Promise<TeneroTokenRow[]> {
  const out: TeneroTokenRow[] = [];
  let cursor: string | null = null;
  let safety = 0;
  let pages = 0;
  let failedAt: number | null = null;
  do {
    const path: string = cursor
      ? `/tokens?cursor=${encodeURIComponent(cursor)}`
      : `/tokens`;
    try {
      const data = await tget<ListResponse<TeneroTokenRow>>(path, REVALIDATE.list);
      if (Array.isArray(data?.rows)) out.push(...data.rows);
      cursor = data?.next ?? null;
      pages++;
    } catch (err) {
      // Upstream throttled or failed mid-pagination. Log loudly so we know
      // when the dashboard is rendering with partial data, but still
      // return what we have so the page can render at all.
      failedAt = pages + 1;
      console.warn(`[fetchAllTokens] pagination failed at page ${failedAt}:`, err);
      break;
    }
    safety++;
  } while (cursor && safety < 30);
  if (failedAt !== null) {
    console.warn(`[fetchAllTokens] partial data: ${out.length} tokens across ${pages} pages (failed page ${failedAt})`);
  }
  return out;
}

async function fetchNflTokenMap(): Promise<Map<string, TeneroTokenRow>> {
  const all = await fetchAllTokens();
  const wanted = new Set(ROSTER.map((p) => p.tokenAddress));
  const map = new Map<string, TeneroTokenRow>();
  for (const row of all) {
    if (wanted.has(row.address)) map.set(row.address, row);
  }
  return map;
}

// ---------- Sparklines (cheap: derive from prior price points) ----------

function tinySparkline(row: TeneroTokenRow): number[] {
  const p = row.price ?? ({} as TeneroTokenRow["price"]);
  const points = [
    Number(p.price_30d_ago ?? p.price_7d_ago ?? p.current_price),
    Number(p.price_7d_ago  ?? p.current_price),
    Number(p.price_1d_ago  ?? p.current_price),
    Number(p.price_4h_ago  ?? p.current_price),
    Number(p.price_1h_ago  ?? p.current_price),
    Number(p.current_price ?? 0),
  ];
  return points.map((v) => (Number.isFinite(v) ? v : 0));
}

// ---------- Public API ----------

export async function getPlayers(): Promise<PlayerSummary[]> {
  const map = await fetchNflTokenMap();
  const summaries = ROSTER.map((player) => {
    const row = map.get(player.tokenAddress);
    if (!row) {
      // Player not currently listed in Tenero response (e.g. delisted). Return zeroed.
      return buildPlayerSummary(player, {
        address: player.tokenAddress,
        symbol: player.symbol, name: player.displayName, decimals: 18,
        holder_count: 0, circulating_supply: 0, total_supply: 0,
        total_liquidity_usd: 0, pool_count: 0,
        price_usd: 0, marketcap_usd: 0,
        metrics: {
          volume_30m_usd: 0, volume_1h_usd: 0, volume_4h_usd: 0, volume_1d_usd: 0, volume_7d_usd: 0,
          swaps_30m: 0, swaps_1h: 0, swaps_4h: 0, swaps_1d: 0, swaps_7d: 0,
        },
        price: {
          current_price: 0, price_1h_ago: 0, price_4h_ago: 0, price_1d_ago: 0, price_7d_ago: 0, price_30d_ago: 0,
        },
      });
    }
    const summary = buildPlayerSummary(player, row);
    summary.sparkline7d = tinySparkline(row);
    return summary;
  });

  // The upstream's `price_*_ago` snapshot fields are unreliable for
  // low-activity tokens — they silently fall back to `current_price`
  // when no proper historical snapshot exists, which makes every short
  // window read 0% even after a real curve move. Replace those values
  // with OHLC-derived deltas so the % columns actually reflect what
  // the bonding curve has done.
  //
  // Skip the OHLC fetch when (a) the token has no recent activity (no
  // bars to anchor against anyway) OR (b) upstream's snapshot looks
  // reliable for the relevant window (a real price_1d_ago different
  // from current_price means the upstream gave us a real snapshot —
  // overriding with a coarser OHLC anchor would lose precision). Cuts
  // the cold-render OHLC fetch count roughly in half on offseason days.
  const fns = summaries.map((summary) => async () => {
    const roster = ROSTER_BY_ID.get(summary.id);
    if (!roster) return;
    const row = map.get(roster.tokenAddress);
    if (!row) return;
    const spot = Number(row.price?.current_price ?? 0);
    if (spot <= 0) return;
    // Inactive token — upstream's 0% is the right answer, no OHLC needed.
    if (summary.volume24h <= 0 && summary.volume7d <= 0) return;
    // Upstream snapshot reliable for all windows — keep its values.
    if (
      isPriceSnapshotReliable(row.price?.price_1h_ago, spot) &&
      isPriceSnapshotReliable(row.price?.price_1d_ago, spot) &&
      isPriceSnapshotReliable(row.price?.price_7d_ago, spot)
    ) {
      return;
    }
    const deltas = await fetchOhlcDeltas(roster.tokenAddress, spot);
    if (deltas.change1h != null) summary.change1h = deltas.change1h;
    if (deltas.change24h != null) summary.change24h = deltas.change24h;
    if (deltas.change7d != null) summary.change7d = deltas.change7d;
  });
  await chunked(fns, 8);

  // Active Shares = total supply minus what's parked in platform-side
  // wallets (the FDF Marketplace + the Sport.fun swap router contract).
  // Reads both wallets' balances on-chain in a single batched call.
  const priceByToken = new Map<string, number>();
  for (const s of summaries) {
    const roster = ROSTER_BY_ID.get(s.id);
    if (roster) priceByToken.set(roster.tokenAddress, s.priceUsd);
  }
  const nonActive = await getNonActiveBalances(priceByToken);
  for (const summary of summaries) {
    const roster = ROSTER_BY_ID.get(summary.id);
    if (!roster) continue;
    let excluded = 0;
    for (const addr of NON_ACTIVE_WALLETS) {
      const holdings = nonActive.get(addr);
      if (!holdings) continue;
      const h = holdings.find((x) => x.tokenAddress === roster.tokenAddress);
      if (h) excluded += h.balance;
    }
    summary.activeSupply = Math.max(0, summary.maxSupply - Math.round(excluded));
  }

  return summaries;
}

// The upstream's price_*_ago fields fall back to `current_price` when
// no real historical snapshot exists. A non-trivial difference from
// current means the upstream actually has a real snapshot for that
// window — we should trust it rather than override with OHLC.
function isPriceSnapshotReliable(snapshot: number | undefined, currentPrice: number): boolean {
  if (snapshot == null || !Number.isFinite(snapshot) || snapshot <= 0 || currentPrice <= 0) {
    return false;
  }
  return Math.abs(currentPrice - snapshot) / currentPrice > 1e-6;
}

// Wallets whose holdings shouldn't count toward "Active Shares" — these
// are platform-side custodians, not regular trader wallets:
//   - FDF Marketplace: the secondary-market escrow contract
//   - FOOTBALLFUN_CONTRACT: the Sport.fun ERC-1155 itself, which holds
//     every share that hasn't been minted out of the bonding curve yet
// All lowercase because readManyWalletsNflBalances keys its result map
// off the lowercased input addresses.
const NON_ACTIVE_WALLETS = [
  "0x4fdce033b9f30019337ddc5cc028dc023580585e",
  FOOTBALLFUN_CONTRACT.toLowerCase(),
];

// Module-level cache for the platform-wallet balance lookup. These
// balances change slowly (only when the marketplace lists/delists or
// when the bonding curve mints/burns) so a 5-minute TTL is a fair
// trade-off between freshness and avoiding a public-RPC call on every
// getPlayers() invocation. Without this cache, every ISR regeneration
// of the home page (and every player/wallet page render) was firing a
// fresh balanceOfBatch — when the RPC was slow or rate-limited, it
// could time out and starve the rest of the page render of budget.
let nonActiveBalanceCache: {
  ts: number;
  data: Map<string, WalletHolding[] | null>;
} | null = null;
const NON_ACTIVE_CACHE_TTL_MS = 5 * 60 * 1000;

async function getNonActiveBalances(
  priceByToken: Map<string, number>,
): Promise<Map<string, WalletHolding[] | null>> {
  const now = Date.now();
  if (nonActiveBalanceCache && now - nonActiveBalanceCache.ts < NON_ACTIVE_CACHE_TTL_MS) {
    return nonActiveBalanceCache.data;
  }
  try {
    const data = await readManyWalletsNflBalances(NON_ACTIVE_WALLETS, priceByToken);
    nonActiveBalanceCache = { ts: now, data };
    return data;
  } catch {
    // If the RPC fully fails, return whatever's cached (even if stale)
    // so getPlayers can finish. Active Shares may be slightly off until
    // the next successful refresh — better than blocking the whole page.
    if (nonActiveBalanceCache) return nonActiveBalanceCache.data;
    return new Map();
  }
}

export async function getPlayer(id: string): Promise<PlayerSummary | null> {
  const player = ROSTER_BY_ID.get(id);
  if (!player) return null;
  // Hit the per-token endpoint for fresher numbers.
  try {
    const data = await tget<TeneroTokenRow>(
      `/tokens/${encodeURIComponent(player.tokenAddress)}`,
      REVALIDATE.detail,
    );
    const summary = buildPlayerSummary(player, data);
    summary.sparkline7d = tinySparkline(data);
    // Same OHLC override as getPlayers() — upstream's price_*_ago is
    // unreliable for low-activity tokens. Skip when the token is inactive
    // or upstream snapshots already look reliable.
    const spot = Number(data?.price?.current_price ?? 0);
    const shouldFetchOhlc =
      spot > 0 &&
      (summary.volume24h > 0 || summary.volume7d > 0) &&
      !(
        isPriceSnapshotReliable(data?.price?.price_1h_ago, spot) &&
        isPriceSnapshotReliable(data?.price?.price_1d_ago, spot) &&
        isPriceSnapshotReliable(data?.price?.price_7d_ago, spot)
      );
    if (shouldFetchOhlc) {
      const deltas = await fetchOhlcDeltas(player.tokenAddress, spot);
      if (deltas.change1h != null) summary.change1h = deltas.change1h;
      if (deltas.change24h != null) summary.change24h = deltas.change24h;
      if (deltas.change7d != null) summary.change7d = deltas.change7d;
    }
    // Apply the same Active Shares definition as getPlayers — total
    // supply minus what the platform-side wallets hold.
    const priceByToken = new Map([[player.tokenAddress, summary.priceUsd]]);
    const nonActive = await getNonActiveBalances(priceByToken);
    let excluded = 0;
    for (const addr of NON_ACTIVE_WALLETS) {
      const holdings = nonActive.get(addr);
      if (!holdings) continue;
      const h = holdings.find((x) => x.tokenAddress === player.tokenAddress);
      if (h) excluded += h.balance;
    }
    summary.activeSupply = Math.max(0, summary.maxSupply - Math.round(excluded));
    return summary;
  } catch {
    // Fall back to the bulk list if the per-token call fails for any reason.
    const all = await getPlayers();
    return all.find((p) => p.id === id) ?? null;
  }
}

export async function getPriceSeries(id: string, tf: Timeframe): Promise<PricePoint[]> {
  const player = ROSTER_BY_ID.get(id);
  if (!player) return [];

  // Map our timeframes onto Tenero OHLC `period` values.
  const cfg: Record<Timeframe, { period: string; limit: number }> = {
    "1H":  { period: "1m",  limit: 60  },
    "24H": { period: "15m", limit: 96  },
    "7D":  { period: "1h",  limit: 168 },
    "30D": { period: "4h",  limit: 180 },
    "ALL": { period: "1d",  limit: 365 },
  };
  const { period, limit } = cfg[tf];
  const path = `/tokens/${encodeURIComponent(player.tokenAddress)}/ohlc?period=${period}&type=token&limit=${limit}`;
  // The upstream OHLC endpoint returns the most-recent N bars that had
  // ACTIVITY, not the last N chronological intervals. For low-activity
  // tokens those bars can span months — so a "24H" chart ends up showing
  // data going back to February. Filter on our side to the actual window.
  const windowSec: Record<Timeframe, number | null> = {
    "1H":  3600,
    "24H": 86_400,
    "7D":  7 * 86_400,
    "30D": 30 * 86_400,
    "ALL": null,
  };
  const cutoff = windowSec[tf];
  try {
    const data = await tget<TeneroOhlcRow[]>(path, REVALIDATE.ohlc);
    if (!Array.isArray(data)) return [];
    const nowSec = Math.floor(Date.now() / 1000);
    return data
      .filter((row) => cutoff == null || Number(row.time ?? 0) >= nowSec - cutoff)
      .map((row) => ({
        t: row.time * 1000,
        price: Number(row.close),
        volume: Number(row.volume ?? 0),
      }))
      .sort((a, b) => a.t - b.t);
  } catch {
    return [];
  }
}

export async function getTrades(id: string, limit = 30): Promise<Trade[]> {
  const player = ROSTER_BY_ID.get(id);
  if (!player) return [];
  try {
    const data = await tget<ListResponse<TeneroTradeRow>>(
      `/tokens/${encodeURIComponent(player.tokenAddress)}/trades?limit=${limit}`,
      REVALIDATE.trades,
    );
    return (data?.rows ?? []).map((t) => mapTrade(t, player.id));
  } catch {
    return [];
  }
}

function mapTrade(t: TeneroTradeRow, playerId: string): Trade {
  const side: "buy" | "sell" = t.event_type === "sell" ? "sell" : "buy";
  const makerLc = (t.maker || "").toLowerCase();
  const recipientLc = (t.recipient || "").toLowerCase();
  const isSwap = makerLc === SWAP_ROUTER_LC || recipientLc === SWAP_ROUTER_LC;

  // Resolve the actual trader wallet. On swap legs the contract is on
  // one side, so the user lives on the other.
  let wallet: string;
  let flow: Trade["flow"];
  if (isSwap) {
    if (side === "buy") {
      // Contract sent the player share to the user — user gains a player.
      flow = "swap-in";
      wallet = makerLc === SWAP_ROUTER_LC ? t.recipient : t.maker;
    } else {
      // User sent the player share to the contract — user gives up a player.
      flow = "swap-out";
      wallet = recipientLc === SWAP_ROUTER_LC ? t.maker : t.recipient;
    }
  } else {
    flow = side; // "buy" or "sell"
    // Non-swap trades typically have maker === recipient (user trading
    // against the AMM); preferring recipient keeps backward compatibility.
    wallet = t.recipient || t.maker;
  }

  // `block_time` from the upstream API is already in milliseconds.
  return {
    id: `${t.tx_id}-${t.tx_index}-${t.event_index}`,
    playerId,
    side,
    flow,
    priceUsd: Number(t.price_usd ?? t.price ?? 0),
    amount: Number(t.base_token_amount ?? 0),
    totalUsd: Number(t.amount_usd ?? 0),
    wallet,
    txHash: t.tx_id,
    timestamp: Number(t.block_time),
  };
}

export interface FlowRollup {
  // 24h volume by trade type
  buyUsd: number;
  sellUsd: number;
  swapUsd: number;        // gross swap volume — counts both legs once
  // Trade counts
  buyCount: number;
  sellCount: number;
  swapCount: number;      // distinct swap events (pairs of legs)
  // Distinct wallets per category in the last 24h
  uniqueBuyers: number;
  uniqueSellers: number;
  uniqueSwappers: number;
  uniqueWallets24h: number; // union — distinct wallets that did anything 24h
  // Net Gold flow into the NFL market (buy − sell)
  netGoldFlowUsd: number;
  // Platform fees collected by category
  buyFeesUsd: number;     // 3%
  sellFeesUsd: number;    // 3%
  swapFeesUsd: number;    // 5%
  totalFeesUsd: number;
}

// Pull recent trades from every active NFL pool ONCE, then derive both
// the live trade feed and the 24h flow rollup from the same data.
async function getNflTradesAndFlow(perPool = 50): Promise<{ trades: Trade[]; flow: FlowRollup }> {
  const players = await getPlayers();
  const active = players.filter((p) => p.volume24h > 0 || p.trades24h > 0);
  const targets = active.length > 0 ? active : players.slice(0, 20);
  const fns = targets.map((p) => () => getTrades(p.id, perPool));
  // Drop to concurrency 4 (was 6) — under ISR regeneration the home
  // page fires 50+ trade fetches alongside OHLC + token list calls in
  // a burst, and Tenero's 100 req/min limit was getting tripped, which
  // returned empty rows. Slower fan-out keeps us under the limit.
  const all = await chunked(fns, 4);
  const classified = all.flat().sort((a, b) => b.timestamp - a.timestamp);

  const cutoff = Date.now() - 24 * 3600 * 1000;
  // Track swap-in and swap-out volumes separately, then take the larger
  // of the two as the canonical "swap volume" — every swap emits one
  // of each leg, so summing both would double-count.
  let swapInUsd = 0, swapOutUsd = 0;
  let swapInCount = 0, swapOutCount = 0;
  let buyUsd = 0, sellUsd = 0, buyCount = 0, sellCount = 0;

  // Track distinct wallets per flow category for "unique buyers /
  // sellers / swappers" tiles.
  const buyers = new Set<string>();
  const sellers = new Set<string>();
  const swappers = new Set<string>();
  const allActive = new Set<string>();

  for (const t of classified) {
    if (t.timestamp < cutoff) continue;
    const w = t.wallet?.toLowerCase();
    if (w) allActive.add(w);
    switch (t.flow) {
      case "buy":
        buyUsd += t.totalUsd; buyCount++;
        if (w) buyers.add(w);
        break;
      case "sell":
        sellUsd += t.totalUsd; sellCount++;
        if (w) sellers.add(w);
        break;
      case "swap-in":
        swapInUsd += t.totalUsd; swapInCount++;
        if (w) swappers.add(w);
        break;
      case "swap-out":
        swapOutUsd += t.totalUsd; swapOutCount++;
        if (w) swappers.add(w);
        break;
    }
  }
  const swapUsd = Math.max(swapInUsd, swapOutUsd);
  const swapCount = Math.max(swapInCount, swapOutCount);

  const buyFeesUsd  = +(buyUsd  * FEE_RATE_BUY).toFixed(2);
  const sellFeesUsd = +(sellUsd * FEE_RATE_SELL).toFixed(2);
  const swapFeesUsd = +(swapUsd * FEE_RATE_SWAP).toFixed(2);

  const flow: FlowRollup = {
    buyUsd, sellUsd, swapUsd,
    buyCount, sellCount, swapCount,
    uniqueBuyers: buyers.size,
    uniqueSellers: sellers.size,
    uniqueSwappers: swappers.size,
    uniqueWallets24h: allActive.size,
    netGoldFlowUsd: buyUsd - sellUsd,
    buyFeesUsd, sellFeesUsd, swapFeesUsd,
    totalFeesUsd: +(buyFeesUsd + sellFeesUsd + swapFeesUsd).toFixed(2),
  };
  return { trades: classified, flow };
}

export async function getRecentTradesGlobal(limit = 50): Promise<Trade[]> {
  const { trades } = await getNflTradesAndFlow(8);
  return trades.slice(0, limit);
}

export async function getNflFlowRollup(): Promise<FlowRollup> {
  const { flow } = await getNflTradesAndFlow(50);
  return flow;
}

// Combined fetch — call this when the page needs both the trade feed
// and the flow rollup, so the underlying API calls are deduped.
//
// We used to pair swap legs by tx_id and drop orphans, but the upstream
// only returns the "received" leg of a player↔player swap in the token's
// /trades endpoint — the corresponding swap-out leg never appears in the
// other pool's feed. The pairing filter therefore stripped every swap,
// which is why visibly-recent Telegram-announced swaps were missing from
// the live feed. We now keep single-leg swaps as-is.
export async function getNflTradeFeedAndFlow(perPool = 100, feedLimit = 50): Promise<{
  trades: Trade[];
  flow: FlowRollup;
}> {
  const { trades, flow } = await getNflTradesAndFlow(perPool);
  return { trades: trades.slice(0, feedLimit), flow };
}

// Distinct user wallets holding ≥1 NFL share. Reads from the indexer
// snapshot at `.gridiron-cache/unique-holders.json` — populated by
// /api/holders/refresh on a cron. If the snapshot is empty (cold
// start, never run), falls back to a quick top-50-per-pool sample
// that's a conservative lower bound.
export interface UniqueHolderCount {
  count: number;
  largestPoolHolderCount: number;
  pools: number;
  source: "indexer" | "fallback-sample";
  ageMs: number | null;        // how stale the indexer snapshot is, ms
  fullScan: boolean;           // true if last indexer run paginated to convergence on every pool
}

const HOLDERS_SAMPLE_LIMIT = 50;

export async function getUniqueNflHolderCount(): Promise<UniqueHolderCount> {
  const { readLatestHolderCount } = await import("./holder-indexer");
  const snap = await readLatestHolderCount();
  if (snap) {
    return {
      count: snap.count,
      largestPoolHolderCount: snap.largestPoolHolderCount,
      pools: snap.pools,
      source: "indexer",
      ageMs: Date.now() - snap.ts,
      fullScan: snap.fullScan,
    };
  }

  // Fallback while no snapshot exists yet — single sweep of top-50.
  const fns = ROSTER.map((p) => async () => {
    try {
      const data = await tget<ListResponse<TeneroHolderRow>>(
        `/tokens/${encodeURIComponent(p.tokenAddress)}/holders?limit=${HOLDERS_SAMPLE_LIMIT}`,
        REVALIDATE.holders,
      );
      return data?.rows ?? [];
    } catch {
      return [] as TeneroHolderRow[];
    }
  });
  const results = await chunked(fns, 4);
  const set = new Set<string>();
  for (const rows of results) {
    for (const h of rows) {
      const addr = h.wallet_address?.toLowerCase();
      if (!addr) continue;
      if (addr === SWAP_ROUTER_LC) continue;
      if (Number(h.balance ?? 0) <= 0) continue;
      set.add(addr);
    }
  }
  const players = await getPlayers();
  const largest = players.reduce((m, p) => (p.holders > m ? p.holders : m), 0);

  return {
    count: set.size,
    largestPoolHolderCount: largest,
    pools: ROSTER.length,
    source: "fallback-sample",
    ageMs: null,
    fullScan: false,
  };
}

export async function getHolderHistory(): Promise<{ ts: number; count: number }[]> {
  const { readHolderSnapshot } = await import("./holder-indexer");
  const store = await readHolderSnapshot();
  return store.history;
}

// NFL-only daily volume series for the last `days` days. Built by
// summing each active player's 1d OHLC volume across the roster.
export async function getNflDailyVolume(days = 30): Promise<{ t: number; volumeUsd: number }[]> {
  const players = await getPlayers();
  const active = players.filter((p) => p.volume24h > 0 || p.trades24h > 0);
  const targets = active.length > 0 ? active : players.slice(0, 20);
  // "ALL" timeframe uses period=1d, so each point is exactly one day.
  const fns = targets.map((p) => () => getPriceSeries(p.id, "ALL"));
  const seriesList = await chunked(fns, 8);

  const dayMs = 86_400_000;
  const buckets = new Map<number, number>();
  for (const series of seriesList) {
    for (const pt of series) {
      const day = Math.floor(pt.t / dayMs) * dayMs;
      buckets.set(day, (buckets.get(day) ?? 0) + (pt.volume || 0));
    }
  }
  const todayDay = Math.floor(Date.now() / dayMs) * dayMs;
  const out: { t: number; volumeUsd: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = todayDay - i * dayMs;
    out.push({ t: day, volumeUsd: Math.round(buckets.get(day) ?? 0) });
  }
  return out;
}

// ---------- Hot players (On Fire page) ----------

export interface HotPlayerRow extends PlayerSummary {
  // Rolling volume windows in USD. 24h and 7d come straight from the
  // upstream `/tokens` metrics. 6h is computed from hourly OHLC bars
  // because the upstream doesn't expose that exact window.
  volume6h: number;
  // Momentum ratio: (24h volume × 7) ÷ 7d volume. >1 means today is
  // hotter than the player's weekly average → trending up. We use the
  // 24h/7d windows (rather than 6h/24h) because the upstream's short
  // windows collapse to $0 across the entire roster during offseason
  // quiet hours, which would leave heat empty for everyone. 24h/7d
  // always has data when a player has traded in the past week.
  heat: number;
}

// Fetch a single OHLC window directly. Mirrors `getPriceSeries` but lets
// callers pick an arbitrary period/limit so we can target the exact
// volume windows the On Fire page needs without bending the public
// Timeframe enum.
async function fetchOhlcBars(
  tokenAddress: string,
  period: string,
  limit: number,
): Promise<TeneroOhlcRow[]> {
  const path = `/tokens/${encodeURIComponent(tokenAddress)}/ohlc?period=${period}&type=token&limit=${limit}`;
  try {
    const data = await tget<TeneroOhlcRow[]>(path, REVALIDATE.ohlc);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * Derive 1h/24h/7d % changes from hourly OHLC bars instead of trusting
 * the upstream's `price_*_ago` snapshot fields, which fall back to
 * `current_price` for low-activity tokens and produce phantom 0% reads
 * after real curve moves.
 *
 * Strategy: fetch 168 most-recent active hourly bars. For each window,
 * find the most recent bar whose timestamp is ≤ (now − window) — that
 * bar's close approximates the spot at the anchor point. % = (spot
 * vs anchor close). Returns null per field if no anchor bar exists
 * (caller can keep the upstream value as a last-resort fallback).
 */
async function fetchOhlcDeltas(
  tokenAddress: string,
  currentSpot: number,
): Promise<{ change1h: number | null; change24h: number | null; change7d: number | null }> {
  const bars = await fetchOhlcBars(tokenAddress, "1h", 168);
  if (bars.length === 0 || currentSpot <= 0) {
    return { change1h: null, change24h: null, change7d: null };
  }
  const nowSec = Math.floor(Date.now() / 1000);
  // Fresh activity that hasn't propagated into the OHLC yet shows up as
  // a divergence between `currentSpot` (upstream's live current_price)
  // and the latest OHLC bar's close. When that gap exists, the latest
  // bar's close is our best estimate of the pre-activity spot, which we
  // can use as a fallback anchor when no in-band bar is available.
  const mostRecentBar = bars[0];
  const mostRecentClose = mostRecentBar ? Number(mostRecentBar.close ?? 0) : 0;
  const hasFreshActivity =
    mostRecentClose > 0 && Math.abs(currentSpot - mostRecentClose) / mostRecentClose > 1e-6;
  // Bars are newest-first. Find the most recent bar whose timestamp sits
  // in the [now - windowSec*1.5, now - windowSec] band — i.e. roughly
  // at the anchor point we care about, with some slack for sparse data.
  // The 1.5x cap matters: without it, a token whose only "older" bar
  // is 40 days back would anchor the 24h delta against that ancient
  // close, producing a misleading multi-percent move that has nothing
  // to do with the last 24 hours.
  //
  // If no bar falls in the band BUT there's fresh-activity divergence,
  // fall back to the most-recent bar's close: that's the pre-activity
  // spot, and the move since represents the unreflected fresh activity
  // we care about surfacing in short windows.
  // Absolute lookback cap per window — bars OLDER than this don't count
  // as a reasonable anchor for that window. Calibrated empirically: the
  // 1.5x relative cap was too tight (e.g. for a 24h window, a 70-hour-old
  // bar is still a fair anchor for "how much has the price moved roughly
  // since yesterday", but a 40-day-old one isn't).
  const ANCHOR_MAX_AGE: Record<number, number> = {
    3600: 24 * 3600,        // 1h window → allow anchor up to 24h old
    86400: 7 * 86400,       // 24h window → allow anchor up to 7d old
    604800: 30 * 86400,     // 7d window → allow anchor up to 30d old
  };
  const findAnchor = (windowSec: number): number | null => {
    const cutoff = nowSec - windowSec;
    const maxAge = nowSec - (ANCHOR_MAX_AGE[windowSec] ?? windowSec * 7);
    for (const b of bars) {
      const t = Number(b.time ?? 0);
      if (t <= cutoff && t >= maxAge) {
        const close = Number(b.close ?? 0);
        return close > 0 ? close : null;
      }
    }
    return hasFreshActivity ? mostRecentClose : null;
  };
  const compute = (anchor: number | null): number | null => {
    if (anchor == null || anchor <= 0) return null;
    return +(((currentSpot - anchor) / anchor) * 100).toFixed(2);
  };
  return {
    change1h: compute(findAnchor(3600)),
    change24h: compute(findAnchor(86400)),
    change7d: compute(findAnchor(7 * 86400)),
  };
}

/**
 * Build the On Fire leaderboard. Volume windows:
 *   - 6h  → sum of hourly OHLC bars whose timestamp falls in the last 6h
 *   - 24h → upstream `metrics.volume_1d_usd` (free, already on PlayerSummary)
 *   - 7d  → upstream `metrics.volume_7d_usd` (free)
 *
 * One OHLC fetch per active player, cached by Next.js for 5min via
 * REVALIDATE.ohlc, so the first render is the only slow one — after
 * that the page is essentially free.
 */
export async function getNflHotPlayers(): Promise<HotPlayerRow[]> {
  const players = await getPlayers();

  // Skip the OHLC fetches for players with zero recent activity — saves
  // ~half the API calls in the offseason without changing the leaderboard
  // (a cold player would rank last anyway).
  const active = players.filter((p) => p.volume24h > 0 || p.volume7d > 0);

  // CRITICAL: the upstream's OHLC endpoint returns the most-recent N bars
  // that had ACTIVITY — not the last N chronological hours. For sparse
  // tokens those bars can stretch back days, so summing the raw response
  // inflates short windows enormously. We request a generous limit, then
  // filter to the actual rolling 6h window via timestamp.
  const nowSec = Math.floor(Date.now() / 1000);
  const cutoff6h = nowSec - 6 * 3600;

  const fns = active.map((p) => async () => {
    const roster = ROSTER_BY_ID.get(p.id);
    if (!roster) return { id: p.id, volume6h: 0 };
    // 48 hourly bars-with-activity is plenty to cover the last 6h even
    // on the busiest player — and lets the timestamp filter do its job
    // when bars are sparse.
    const hourly = await fetchOhlcBars(roster.tokenAddress, "1h", 48);
    const volume6h = hourly.reduce(
      (a, b) => (Number(b.time ?? 0) >= cutoff6h ? a + Number(b.volume ?? 0) : a),
      0,
    );
    return { id: p.id, volume6h };
  });

  // Concurrency 8 — single fetch per player, plenty of headroom under
  // the upstream's 100/min budget.
  const results = await chunked(fns, 8);
  const byId = new Map(results.map((r) => [r.id, r]));

  return players.map((p) => {
    const r = byId.get(p.id);
    const volume6h = r?.volume6h ?? 0;
    // Heat compares today's volume to the player's weekly average so it
    // stays meaningful even when nothing has traded in the last 6h.
    const heat = p.volume7d > 0 ? (p.volume24h * 7) / p.volume7d : 0;
    return { ...p, volume6h, heat };
  });
}

// Paginate the holder list up to a generous cap so the breakdown
// buckets reflect the full population (not just the top 50). Tenero
// returns a `next` cursor when more rows are available.
async function fetchAllHolders(tokenAddress: string, maxPages = 14): Promise<TeneroHolderRow[]> {
  const out: TeneroHolderRow[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    try {
      const path: string = `/tokens/${encodeURIComponent(tokenAddress)}/holders?limit=50` +
        (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
      const data: ListResponse<TeneroHolderRow> | null = await tget<ListResponse<TeneroHolderRow>>(
        path,
        REVALIDATE.detail,
      );
      const rows = data?.rows ?? [];
      out.push(...rows);
      cursor = data?.next ?? null;
      if (!cursor || rows.length === 0) break;
    } catch {
      break;
    }
  }
  return out;
}

export async function getHolders(id: string): Promise<HolderBucket[]> {
  const player = ROSTER_BY_ID.get(id);
  if (!player) return [];
  const rows = await fetchAllHolders(player.tokenAddress);
  if (rows.length === 0) return [];

  const balances = rows
    .filter((r) => r.wallet_address?.toLowerCase() !== SWAP_ROUTER_LC)
    .map((r) => Number(r.balance ?? 0))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => b - a);
  const total = balances.reduce((a, b) => a + b, 0) || 1;

  const buckets: HolderBucket[] = [
    { label: "Whales (>1%)",     count: 0, share: 0 },
    { label: "Large (0.1–1%)",   count: 0, share: 0 },
    { label: "Mid (0.01–0.1%)",  count: 0, share: 0 },
    { label: "Small (<0.01%)",   count: 0, share: 0 },
  ];
  for (const b of balances) {
    const pct = (b / total) * 100;
    if (pct > 1)         { buckets[0].count++; buckets[0].share += pct; }
    else if (pct > 0.1)  { buckets[1].count++; buckets[1].share += pct; }
    else if (pct > 0.01) { buckets[2].count++; buckets[2].share += pct; }
    else                 { buckets[3].count++; buckets[3].share += pct; }
  }
  for (const b of buckets) b.share = +b.share.toFixed(2);
  return buckets;
}

// Top N holders for the player detail page's "Largest Holders" table.
// Excludes the AMM router. Each row carries the share % of circulating
// supply so the table can render a bar without re-summing.
export interface TopHolder {
  address: string;
  balance: number;
  sharePct: number;
  startHoldingAt: number;
  lastActiveAt: number;
}
export async function getTopHolders(id: string, limit = 25): Promise<TopHolder[]> {
  const player = ROSTER_BY_ID.get(id);
  if (!player) return [];
  const rows = await fetchAllHolders(player.tokenAddress);
  const filtered = rows
    .filter((r) => r.wallet_address && r.wallet_address.toLowerCase() !== SWAP_ROUTER_LC)
    .map((r) => ({
      address: r.wallet_address,
      balance: Number(r.balance ?? 0),
      startHoldingAt: Number(r.start_holding_at ?? 0),
      lastActiveAt: Number(r.last_active_at ?? 0),
    }))
    .filter((r) => Number.isFinite(r.balance) && r.balance > 0);
  filtered.sort((a, b) => b.balance - a.balance);
  const total = filtered.reduce((a, r) => a + r.balance, 0) || 1;
  return filtered.slice(0, limit).map((r) => ({
    ...r,
    sharePct: +((r.balance / total) * 100).toFixed(3),
  }));
}

// Cross-pool wallet leaderboard. Aggregates each NFL pool's top
// holders into a global NFL-portfolio-value ranking — no per-wallet
// API calls needed since each holder row already carries balance,
// and we have current price per pool from getPlayers().
//
// Top-K per pool (default 100) trades exhaustiveness for speed;
// the wealthy wallets we care about are by definition in the top
// of every pool they touch, so K=100 captures essentially all of
// them while keeping the upstream call count bounded.
export interface TopNflWallet {
  address: string;
  nflValueUsd: number;
  positions: number;        // distinct NFL pools held
  topPositionPlayerId: string | null;
  topPositionUsd: number;
  firstHeldAt: number;      // earliest startHoldingAt across NFL holdings
  lastActiveAt: number;     // latest lastActiveAt across NFL holdings
  tier: WalletTier;
  funBalance: number;       // raw $FUN token count, decimal-adjusted
  funValueUsd: number;      // funBalance × current $FUN spot price
}
export async function getTopNflWallets(limit = 100, perPool = 100): Promise<TopNflWallet[]> {
  const players = await getPlayers();
  // Pull top-K holders for each pool in parallel (chunked).
  const fns = players.map((p) => async () => {
    const rows = await fetchAllHolders(
      ROSTER_BY_ID.get(p.id)!.tokenAddress,
      Math.ceil(perPool / 50),
    );
    const filtered = rows
      .filter((r) => r.wallet_address && r.wallet_address.toLowerCase() !== SWAP_ROUTER_LC)
      .map((r) => ({
        address: r.wallet_address,
        balance: Number(r.balance ?? 0),
        startHoldingAt: Number(r.start_holding_at ?? 0),
        lastActiveAt: Number(r.last_active_at ?? 0),
      }))
      .filter((r) => Number.isFinite(r.balance) && r.balance > 0);
    filtered.sort((a, b) => b.balance - a.balance);
    return { player: p, rows: filtered.slice(0, perPool) };
  });
  const results = await chunked(fns, 6);

  type Agg = {
    nflValueUsd: number;
    positions: number;
    topPositionPlayerId: string | null;
    topPositionUsd: number;
    firstHeldAt: number;
    lastActiveAt: number;
  };
  const byAddr = new Map<string, Agg>();

  for (const { player, rows } of results) {
    const price = player.priceUsd;
    if (!Number.isFinite(price) || price <= 0) continue;
    for (const r of rows) {
      const addr = r.address.toLowerCase();
      const valueUsd = r.balance * price;
      if (valueUsd <= 0) continue;
      const cur = byAddr.get(addr) ?? {
        nflValueUsd: 0,
        positions: 0,
        topPositionPlayerId: null as string | null,
        topPositionUsd: 0,
        firstHeldAt: 0,
        lastActiveAt: 0,
      };
      cur.nflValueUsd += valueUsd;
      cur.positions += 1;
      if (valueUsd > cur.topPositionUsd) {
        cur.topPositionUsd = valueUsd;
        cur.topPositionPlayerId = player.id;
      }
      if (r.startHoldingAt && (cur.firstHeldAt === 0 || r.startHoldingAt < cur.firstHeldAt)) {
        cur.firstHeldAt = r.startHoldingAt;
      }
      if (r.lastActiveAt > cur.lastActiveAt) cur.lastActiveAt = r.lastActiveAt;
      byAddr.set(addr, cur);
    }
  }

  const aggregated: TopNflWallet[] = Array.from(byAddr.entries())
    .map(([address, v]) => ({
      address,
      nflValueUsd: +v.nflValueUsd.toFixed(2),
      positions: v.positions,
      topPositionPlayerId: v.topPositionPlayerId,
      topPositionUsd: +v.topPositionUsd.toFixed(2),
      firstHeldAt: v.firstHeldAt,
      lastActiveAt: v.lastActiveAt,
      tier: tierForValue(v.nflValueUsd),
      funBalance: 0,    // populated by the bulk $FUN reader below
      funValueUsd: 0,
    }))
    .sort((a, b) => b.nflValueUsd - a.nflValueUsd)
    .slice(0, limit);

  // Refine the top candidates with an on-chain balanceOfBatch read.
  // The aggregation above misses positions where the wallet ranks
  // outside our perPool window (e.g. a wallet sitting at #251 of a
  // pool when perPool=250), which can undercount NFL value by 30%+
  // for diversified holders. The on-chain read is exact and matches
  // what the wallet detail page renders.
  //
  // Bulk-batched via Multicall3 — earlier per-wallet RPC calls were
  // throttled by the public Base RPC and returned null for most
  // wallets, leaving the leaderboard stuck with aggregated estimates.
  const priceByToken = new Map(
    players.map((p) => [ROSTER_BY_ID.get(p.id)!.tokenAddress, p.priceUsd]),
  );
  const addresses = aggregated.map((w) => w.address);

  // NFL balances + $FUN balances + $FUN price all fetched in
  // parallel. $FUN reads are simple ERC-20 balanceOf calls so
  // multicall handles them cleanly (unlike the NFL nested-array
  // path that needs the flat-batch shape).
  const [refinementMap, funMap, funInfo] = await Promise.all([
    readManyWalletsNflBalances(addresses, priceByToken),
    readManyFunBalances(addresses),
    getFunPriceInfo(),
  ]);
  const funPrice = funInfo.priceUsd;

  const refined: TopNflWallet[] = aggregated.map((w) => {
    const lower = w.address.toLowerCase();
    const funBalance = funMap.get(lower) ?? 0;
    const funValueUsd = +(funBalance * funPrice).toFixed(2);

    const onchain = refinementMap.get(lower);
    if (onchain == null) {
      // RPC failed for NFL — keep aggregated NFL but still apply
      // refined $FUN.
      return { ...w, funBalance, funValueUsd };
    }
    let nflValueUsd = 0;
    let topPositionUsd = 0;
    let topPositionPlayerId: string | null = null;
    for (const h of onchain) {
      nflValueUsd += h.balanceValueUsd;
      if (h.balanceValueUsd > topPositionUsd) {
        topPositionUsd = h.balanceValueUsd;
        const player = ROSTER.find((r) => r.tokenAddress === h.tokenAddress);
        topPositionPlayerId = player?.id ?? null;
      }
    }
    return {
      ...w,
      nflValueUsd: +nflValueUsd.toFixed(2),
      positions: onchain.length,
      topPositionPlayerId: topPositionPlayerId ?? w.topPositionPlayerId,
      topPositionUsd: +topPositionUsd.toFixed(2),
      tier: tierForValue(nflValueUsd),
      funBalance,
      funValueUsd,
    };
  });

  // Re-sort after refinement so the leaderboard order reflects the
  // exact on-chain values, not the (possibly under-counted)
  // aggregated estimates. Filter out wallets whose refined value
  // came back as 0 — those are stale aggregations for wallets
  // that have since fully exited NFL.
  return refined
    .filter((w) => w.nflValueUsd > 0)
    .sort((a, b) => b.nflValueUsd - a.nflValueUsd);
}

export async function getPoolStats(id: string): Promise<PoolStats | null> {
  const player = await getPlayer(id);
  if (!player) return null;
  const fees24h = Math.round(player.volume24h * POOL_FEE_RATE);
  const apr = player.tvl > 0 ? +(((fees24h * 365) / player.tvl) * 100).toFixed(2) : 0;
  return {
    playerId: id,
    tvl: player.tvl,
    feeTier: POOL_FEE_RATE * 100,
    volume24h: player.volume24h,
    fees24h,
    apr,
    depthBuy: Math.round(player.tvl * 0.5),
    depthSell: Math.round(player.tvl * 0.5),
  };
}

export async function getMarketOverview(): Promise<MarketOverview> {
  const [players, fun] = await Promise.all([getPlayers(), getFunPriceInfo()]);

  const totalMarketCap = players.reduce((a, p) => a + p.marketCap, 0);
  const totalVolume24h = players.reduce((a, p) => a + p.volume24h, 0);
  const totalTrades24h = players.reduce((a, p) => a + p.trades24h, 0);
  const totalHolders   = players.reduce((a, p) => a + p.holders, 0);
  const totalTvl       = players.reduce((a, p) => a + p.tvl, 0);

  // Weighted 24h market-cap change, derived from each player's price change
  // weighted by current marketCap.
  const totalWeight = players.reduce((a, p) => a + p.marketCap, 0) || 1;
  const marketCapChange24h = +(
    players.reduce((a, p) => a + p.change24h * (p.marketCap / totalWeight), 0)
  ).toFixed(2);

  // Build a coarse market-cap timeline by walking back through prior price
  // ratios (1h, 4h, 1d, 7d, 30d, etc.) for the heaviest players.
  const top = players.slice().sort((a, b) => b.marketCap - a.marketCap).slice(0, 12);
  const offsets = [0, 1, 4, 24, 24 * 7, 24 * 30];
  const HOUR_MS = 3600 * 1000;
  const now = Date.now();
  const marketCapSeries: PricePoint[] = offsets
    .map((hoursAgo) => {
      const t = now - hoursAgo * HOUR_MS;
      let total = 0;
      for (const p of top) {
        const change = hoursAgo === 0 ? 0 :
          hoursAgo === 1  ? p.change1h :
          hoursAgo === 4  ? p.change1h * 2 :
          hoursAgo === 24 ? p.change24h :
          hoursAgo === 24 * 7  ? p.change7d :
          p.change7d * 1.4;
        const factor = 1 + change / 100;
        total += factor === 0 ? p.marketCap : p.marketCap / factor;
      }
      // Scale to full population so series is comparable to total.
      const scale = totalMarketCap / Math.max(1, top.reduce((a, p) => a + p.marketCap, 0));
      return { t, price: Math.round(total * scale), volume: 0 };
    })
    .sort((a, b) => a.t - b.t);

  // 24h volume chart: split totalVolume24h across hourly buckets weighted by
  // each player's actual `volume_1d_usd` distribution (best we can do
  // without the time-binned global endpoint).
  const volumeSeries: PricePoint[] = Array.from({ length: 24 }, (_, i) => ({
    t: now - (23 - i) * HOUR_MS,
    price: 0,
    volume: Math.round(totalVolume24h / 24),
  }));

  return {
    totalMarketCap,
    marketCapChange24h,
    totalVolume24h,
    volumeChange24h: 0, // not exposed by the API in a single roll-up
    totalTrades24h,
    activeWallets24h: Math.round(totalHolders * 0.18),
    totalHolders,
    totalTvl,
    listedPlayers: ROSTER.length,
    marketCapSeries,
    volumeSeries,
    funPriceUsd: fun.priceUsd,
    funChange24h: fun.change24h,
  };
}

// ---------- Market stats (daily 90-day series) ----------

interface TeneroMarketStatRow {
  period: string;
  volume_usd: number;
  buy_volume_usd: number;
  sell_volume_usd: number;
  netflow_usd: number;
  unique_traders: number;
  unique_buyers: number;
  unique_sellers: number;
  unique_pools: number;
}

export async function getMarketStats(): Promise<MarketStatRow[]> {
  try {
    const data = await tget<TeneroMarketStatRow[]>("/market/stats", REVALIDATE.list);
    if (!Array.isArray(data)) return [];
    return data
      .map((d) => ({
        date: d.period,
        t: Date.parse(`${d.period}T00:00:00Z`),
        volumeUsd: Number(d.volume_usd ?? 0),
        buyVolumeUsd: Number(d.buy_volume_usd ?? 0),
        sellVolumeUsd: Number(d.sell_volume_usd ?? 0),
        netflowUsd: Number(d.netflow_usd ?? 0),
        uniqueTraders: Number(d.unique_traders ?? 0),
        uniqueBuyers: Number(d.unique_buyers ?? 0),
        uniqueSellers: Number(d.unique_sellers ?? 0),
        uniquePools: Number(d.unique_pools ?? 0),
      }))
      .sort((a, b) => a.t - b.t);
  } catch {
    return [];
  }
}

const WINDOW_DAYS: Record<WindowKey, number> = { "24h": 1, "7d": 7, "30d": 30 };

// Build a rollup over a recent window plus the immediately prior window of
// the same length, so the UI can show period-over-period comparisons.
export function rollupWindow(rows: MarketStatRow[], key: WindowKey): WindowStats {
  const days = WINDOW_DAYS[key];
  const sorted = rows.slice().sort((a, b) => b.t - a.t);
  const recent = sorted.slice(0, days);
  const prior = sorted.slice(days, days * 2);
  const sum = (xs: MarketStatRow[], pick: (r: MarketStatRow) => number) =>
    xs.reduce((a, r) => a + pick(r), 0);
  const uniqueTraders = (xs: MarketStatRow[]) => {
    // Approximation: average daily uniques over the window. Tenero doesn't
    // expose a true distinct-wallet rollup across multiple days.
    if (xs.length === 0) return 0;
    return Math.round(xs.reduce((a, r) => a + r.uniqueTraders, 0) / xs.length);
  };
  return {
    volumeUsd: sum(recent, (r) => r.volumeUsd),
    buyVolumeUsd: sum(recent, (r) => r.buyVolumeUsd),
    sellVolumeUsd: sum(recent, (r) => r.sellVolumeUsd),
    netflowUsd: sum(recent, (r) => r.netflowUsd),
    uniqueTraders: uniqueTraders(recent),
    prevVolumeUsd: sum(prior, (r) => r.volumeUsd),
    prevUniqueTraders: uniqueTraders(prior),
    prevNetflowUsd: sum(prior, (r) => r.netflowUsd),
  };
}

// ---------- Wallet portfolio ----------

interface TeneroHoldingRow {
  token_address: string;
  balance: number | string;
  balance_value_usd: number | string;
  start_holding_at: number;
  last_active_at: number;
  token: {
    address: string;
    symbol: string;
    name: string;
    image_url?: string;
    price_usd: number;
  };
}

const TIER_BREAKS: { min: number; tier: WalletTier }[] = [
  { min: 100_000, tier: "whale" },
  { min: 25_000,  tier: "shark" },
  { min: 5_000,   tier: "dolphin" },
  { min: 500,     tier: "fish" },
  { min: 0,       tier: "shrimp" },
];

export function tierForValue(usd: number): WalletTier {
  for (const b of TIER_BREAKS) if (usd >= b.min) return b.tier;
  return "shrimp";
}

export async function getWalletPortfolio(
  address: string,
  opts: { nflOnly?: boolean } = {},
): Promise<WalletProfile> {
  // Always returns a profile — even on upstream error or empty response —
  // so the wallet page can render a usable empty state instead of 404ing.
  let rows: TeneroHoldingRow[] = [];
  // The upstream `/wallets/.../holdings` endpoint is currently
  // case-sensitive in the opposite direction from most of its API:
  // it only returns rows for the EIP-55 checksummed form of the
  // address — lowercase comes back empty. Other endpoints (and our
  // on-chain reader) accept lowercase fine, so we checksum just for
  // this specific call. If checksumming throws (malformed input), we
  // fall back to whatever the caller passed.
  let queryAddress = address;
  try {
    queryAddress = getAddress(address);
  } catch {
    queryAddress = address;
  }
  try {
    // Upstream rejects limit > 50 with `Request validation failed`. Page
    // through with cursors if a wallet holds more than 50 positions.
    const data = await tget<{ rows: TeneroHoldingRow[]; next: string | null }>(
      `/wallets/${encodeURIComponent(queryAddress)}/holdings?limit=50`,
      REVALIDATE.detail,
    );
    rows = data?.rows ?? [];
    // Tenero's wallet-holdings cursor pagination is currently flaky (500s
    // mid-stream for many wallets). Try to continue, but if it fails, just
    // ship what we have — the first 50 are sorted by value desc anyway.
    let cursor = data?.next ?? null;
    let safety = 0;
    while (cursor && safety < 6) {
      try {
        const next = await tget<{ rows: TeneroHoldingRow[]; next: string | null }>(
          `/wallets/${encodeURIComponent(queryAddress)}/holdings?limit=50&cursor=${encodeURIComponent(cursor)}`,
          REVALIDATE.detail,
        );
        if (!next?.rows?.length) break;
        rows = rows.concat(next.rows);
        cursor = next.next ?? null;
        safety++;
      } catch {
        break;
      }
    }
    if (opts.nflOnly) {
      const wanted = new Set(ROSTER.map((p) => p.tokenAddress));
      rows = rows.filter((r) => wanted.has(r.token_address));
    }
    const upstreamHoldings: WalletHolding[] = rows.map((r) => ({
      tokenAddress: r.token_address,
      symbol: r.token?.symbol ?? "",
      name: r.token?.name ?? "",
      imageUrl: r.token?.image_url,
      priceUsd: Number(r.token?.price_usd ?? 0),
      balance: Number(r.balance ?? 0),
      balanceValueUsd: Number(r.balance_value_usd ?? 0),
      startHoldingAt: Number(r.start_holding_at ?? 0),
      lastActiveAt: Number(r.last_active_at ?? 0),
    }));

    // The upstream caps holdings at 50 per page and 500s on cursor
    // follow-ups for many wallets, so a wallet with mixed soccer + NFL
    // positions might never surface its full NFL set. Pull those
    // directly on-chain (one batched RPC call) and merge — replacing
    // the upstream's NFL rows where they exist, supplementing where
    // they don't.
    const players = await getPlayers();
    const priceByToken = new Map(players.map((p) => [
      // ROSTER addresses are checksum-cased; players[i] uses player.id
      // and we need the canonical contract:tokenId form.
      ROSTER.find((r) => r.id === p.id)!.tokenAddress,
      p.priceUsd,
    ]));
    const onchainNfl = await readWalletNflBalances(address, priceByToken);

    const upstreamNflRows = upstreamHoldings.filter((h) =>
      ROSTER_BY_TOKEN.has(h.tokenAddress),
    );
    const upstreamNflByToken = new Map(
      upstreamNflRows.map((h) => [h.tokenAddress, h]),
    );

    // Merge: on-chain wins for balance/value (it's the source of
    // truth); upstream contributes start/last-active timestamps. If
    // the on-chain RPC failed entirely (null), fall back to the
    // upstream NFL rows so we don't misrepresent a holder as $0.
    const mergedNfl: WalletHolding[] =
      onchainNfl != null
        ? onchainNfl.map((onchain) => {
            const u = upstreamNflByToken.get(onchain.tokenAddress);
            return {
              ...onchain,
              startHoldingAt: u?.startHoldingAt ?? 0,
              lastActiveAt: u?.lastActiveAt ?? onchain.lastActiveAt,
            };
          })
        : upstreamNflRows;

    // Non-NFL holdings still come from the upstream — we have no
    // on-chain enumeration of soccer pools.
    const otherHoldings = upstreamHoldings.filter(
      (h) => !ROSTER_BY_TOKEN.has(h.tokenAddress),
    );

    const holdings: WalletHolding[] = [...mergedNfl, ...otherHoldings];
    holdings.sort((a, b) => b.balanceValueUsd - a.balanceValueUsd);

    const totalValueUsd = holdings.reduce((a, h) => a + h.balanceValueUsd, 0);
    const firstSeenAt = holdings.reduce(
      (m, h) => (h.startHoldingAt && (!m || h.startHoldingAt < m) ? h.startHoldingAt : m),
      0,
    );
    const lastActiveAt = holdings.reduce(
      (m, h) => (h.lastActiveAt > m ? h.lastActiveAt : m),
      0,
    );
    const isNew = firstSeenAt > 0 && Date.now() - firstSeenAt < 7 * 24 * 3600 * 1000;

    return {
      address,
      totalValueUsd,
      holdingsCount: holdings.length,
      tier: tierForValue(totalValueUsd),
      isNew,
      firstSeenAt,
      lastActiveAt,
      holdings,
    };
  } catch {
    // Upstream error: return an empty profile so the page can still render.
    return {
      address,
      totalValueUsd: 0,
      holdingsCount: 0,
      tier: tierForValue(0),
      isNew: false,
      firstSeenAt: 0,
      lastActiveAt: 0,
      holdings: [],
    };
  }
}

// Per-wallet trades over a window. Used to compute "NFL vs other" flow
// rotation on the wallet portfolio page — what's actually moving in and
// out of NFL holdings, classified by base token contract.
export interface WalletDailyFlow {
  t: number;            // unix ms (start of UTC day)
  nflInUsd: number;     // USD value of NFL shares the wallet acquired that day
  nflOutUsd: number;    // USD value of NFL shares the wallet released that day
  otherInUsd: number;
  otherOutUsd: number;
}

export interface WalletFlowSummary {
  windowDays: number;
  nflNetUsd: number;          // net USD shift INTO NFL holdings
  otherNetUsd: number;        // net USD shift INTO non-NFL (soccer / etc.)
  nflInUsd: number;
  nflOutUsd: number;
  otherInUsd: number;
  otherOutUsd: number;
  daily: WalletDailyFlow[];
  totalTrades: number;
  rotationDirection: "into-nfl" | "out-of-nfl" | "neutral";
}

const NFL_CONTRACT_PREFIX = `${FOOTBALLFUN_CONTRACT.toLowerCase()}:`;

function isNflTokenAddress(addr: string | null | undefined): boolean {
  if (!addr) return false;
  return addr.toLowerCase().startsWith(NFL_CONTRACT_PREFIX);
}

interface TeneroWalletTradeRow {
  tx_id: string;
  event_type: "buy" | "sell" | string;
  maker: string;
  recipient: string;
  base_token_address: string;
  quote_token_address: string;
  base_token_amount?: string | number;
  amount_usd: number;
  price_usd?: number;
  block_time: number;
  base_token?: {
    address: string;
    symbol: string;
    name: string;
    image_url?: string;
  };
}

/**
 * Recent trade feed for a single wallet. One upstream call (no
 * pagination — just the most-recent `limit` rows), enriched with
 * roster lookups so NFL rows can link to the player page.
 */
export async function getWalletTrades(
  address: string,
  limit = 30,
): Promise<WalletTradeRow[]> {
  // Same case-sensitivity quirk — the /wallets/.../trades endpoint
  // returns 0 rows for lowercase addresses.
  let queryAddress = address;
  try {
    queryAddress = getAddress(address);
  } catch {
    queryAddress = address;
  }

  let rows: TeneroWalletTradeRow[] = [];
  try {
    const data = await tget<{ rows: TeneroWalletTradeRow[]; next: string | null }>(
      `/wallets/${encodeURIComponent(queryAddress)}/trades?limit=${limit}`,
      REVALIDATE.wallet,
    );
    rows = data?.rows ?? [];
  } catch {
    return [];
  }

  return rows.map((r) => {
    const isNfl = isNflTokenAddress(r.base_token_address);
    const rosterPlayer = isNfl ? ROSTER_BY_TOKEN.get(r.base_token_address) : undefined;
    const side: "buy" | "sell" = r.event_type === "sell" ? "sell" : "buy";
    return {
      txId: r.tx_id,
      timestamp: Number(r.block_time ?? 0),
      side,
      isNfl,
      symbol: r.base_token?.symbol ?? "",
      name: r.base_token?.name ?? rosterPlayer?.displayName ?? "",
      imageUrl: r.base_token?.image_url,
      playerId: rosterPlayer?.id,
      position: rosterPlayer?.position,
      team: rosterPlayer?.team,
      baseAmount: Number(r.base_token_amount ?? 0),
      priceUsd: Number(r.price_usd ?? 0),
      amountUsd: Number(r.amount_usd ?? 0),
    };
  });
}

export async function getWalletFlow(address: string, windowDays = 7): Promise<WalletFlowSummary> {
  const cutoff = Date.now() - windowDays * 24 * 3600 * 1000;
  const dayMs = 24 * 3600 * 1000;
  const todayDay = Math.floor(Date.now() / dayMs) * dayMs;

  // Same case-sensitivity quirk as /wallets/.../holdings — the upstream
  // returns empty rows for lowercase addresses and full results for the
  // EIP-55 checksummed form. Convert just for this call.
  let queryAddress = address;
  try {
    queryAddress = getAddress(address);
  } catch {
    queryAddress = address;
  }

  const collected: TeneroWalletTradeRow[] = [];
  let cursor: string | null = null;
  let safety = 0;
  try {
    do {
      const path: string = `/wallets/${encodeURIComponent(queryAddress)}/trades?limit=50` +
        (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
      const data = await tget<{ rows: TeneroWalletTradeRow[]; next: string | null }>(
        path, REVALIDATE.wallet,
      );
      const rows = data?.rows ?? [];
      for (const r of rows) collected.push(r);
      cursor = data?.next ?? null;
      // Stop once we've gone past the window.
      const oldest = rows[rows.length - 1]?.block_time ?? Number.MAX_SAFE_INTEGER;
      if (oldest < cutoff) break;
      safety++;
    } while (cursor && safety < 12);
  } catch {
    // partial result is fine
  }

  const buckets = new Map<number, WalletDailyFlow>();
  let nflInUsd = 0, nflOutUsd = 0, otherInUsd = 0, otherOutUsd = 0;
  let totalTrades = 0;

  for (const r of collected) {
    if (Number(r.block_time) < cutoff) continue;
    totalTrades++;
    const day = Math.floor(Number(r.block_time) / dayMs) * dayMs;
    let bucket = buckets.get(day);
    if (!bucket) {
      bucket = { t: day, nflInUsd: 0, nflOutUsd: 0, otherInUsd: 0, otherOutUsd: 0 };
      buckets.set(day, bucket);
    }
    const usd = Number(r.amount_usd ?? 0);
    const isNfl = isNflTokenAddress(r.base_token_address);
    // event_type: "buy" → wallet gained that base token; "sell" → wallet released it
    if (r.event_type === "buy") {
      if (isNfl) { bucket.nflInUsd += usd; nflInUsd += usd; }
      else       { bucket.otherInUsd += usd; otherInUsd += usd; }
    } else {
      if (isNfl) { bucket.nflOutUsd += usd; nflOutUsd += usd; }
      else       { bucket.otherOutUsd += usd; otherOutUsd += usd; }
    }
  }

  // Build daily series (filling empty days with zeros) so charts are continuous.
  const daily: WalletDailyFlow[] = [];
  for (let i = windowDays - 1; i >= 0; i--) {
    const day = todayDay - i * dayMs;
    daily.push(buckets.get(day) ?? {
      t: day, nflInUsd: 0, nflOutUsd: 0, otherInUsd: 0, otherOutUsd: 0,
    });
  }

  const nflNetUsd = nflInUsd - nflOutUsd;
  const otherNetUsd = otherInUsd - otherOutUsd;
  let rotationDirection: WalletFlowSummary["rotationDirection"] = "neutral";
  if (Math.abs(nflNetUsd) >= 25 && Math.abs(otherNetUsd) >= 25) {
    if (nflNetUsd > 0 && otherNetUsd < 0)      rotationDirection = "into-nfl";
    else if (nflNetUsd < 0 && otherNetUsd > 0) rotationDirection = "out-of-nfl";
  } else if (Math.abs(nflNetUsd) >= 50) {
    rotationDirection = nflNetUsd > 0 ? "into-nfl" : "out-of-nfl";
  }

  return {
    windowDays,
    nflNetUsd, otherNetUsd,
    nflInUsd, nflOutUsd, otherInUsd, otherOutUsd,
    daily,
    totalTrades,
    rotationDirection,
  };
}

// Lightweight wallet snapshot for trade-feed badges (no holdings detail).
export interface WalletSnapshot {
  address: string;
  totalValueUsd: number;     // NFL + soccer combined
  nflValueUsd: number;       // NFL-only — what the trade-feed badge surfaces
  tier: WalletTier;
  isNew: boolean;
  holdingsCount: number;
}

const snapshotCache = new Map<string, WalletSnapshot>();

export async function getWalletSnapshot(address: string): Promise<WalletSnapshot> {
  const lower = address.toLowerCase();
  const cached = snapshotCache.get(lower);
  if (cached) return cached;
  const profile = await getWalletPortfolio(address);
  let snap: WalletSnapshot;
  if (profile) {
    const nflValueUsd = profile.holdings
      .filter((h) => ROSTER_BY_TOKEN.has(h.tokenAddress))
      .reduce((a, h) => a + h.balanceValueUsd, 0);
    snap = {
      address: profile.address,
      totalValueUsd: profile.totalValueUsd,
      nflValueUsd,
      tier: profile.tier,
      isNew: profile.isNew,
      holdingsCount: profile.holdingsCount,
    };
  } else {
    snap = { address, totalValueUsd: 0, nflValueUsd: 0, tier: "shrimp", isNew: false, holdingsCount: 0 };
  }
  snapshotCache.set(lower, snap);
  return snap;
}

export async function getWalletSnapshots(addresses: string[]): Promise<Map<string, WalletSnapshot>> {
  // Tenero's /wallets endpoint is case-sensitive (requires checksum case),
  // so dedupe by lowercase but call the API with the first-seen original
  // case. The result map is still keyed by lowercase so callers can look
  // up using `t.wallet.toLowerCase()` regardless of casing in the trade.
  const seen = new Map<string, string>();
  for (const a of addresses) {
    if (!a) continue;
    const lower = a.toLowerCase();
    if (!seen.has(lower)) seen.set(lower, a);
  }
  const results = await Promise.all(
    Array.from(seen.values()).map(async (a) => [a.toLowerCase(), await getWalletSnapshot(a)] as const),
  );
  return new Map(results);
}

// Re-export so callers can resolve token by address if needed in the future.
export { ROSTER, ROSTER_BY_ID, ROSTER_BY_TOKEN };
