export type Position = "QB" | "RB" | "WR" | "TE" | "K" | "EDGE" | "LB" | "CB" | "S";

export type NflTeam =
  | "ARI" | "ATL" | "BAL" | "BUF" | "CAR" | "CHI" | "CIN" | "CLE"
  | "DAL" | "DEN" | "DET" | "GB"  | "HOU" | "IND" | "JAX" | "KC"
  | "LAC" | "LAR" | "LV"  | "MIA" | "MIN" | "NE"  | "NO"  | "NYG"
  | "NYJ" | "PHI" | "PIT" | "SEA" | "SF"  | "TB"  | "TEN" | "WAS";

export type Timeframe = "1H" | "24H" | "7D" | "30D" | "ALL";

export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  position: Position;
  team: NflTeam;
  jerseyNumber: number;
}

export interface TokenStats {
  playerId: string;
  priceUsd: number;
  change1h: number;
  change24h: number;
  change7d: number;
  marketCap: number;
  volume24h: number;
  // 7d rolling volume, sourced directly from the upstream `volume_7d_usd`
  // metric — free on every token row, no extra fetch.
  volume7d: number;
  trades24h: number;
  holders: number;
  circulatingSupply: number;
  // Shares parked in the AMM pool (illiquid relative to user wallets).
  poolSupply: number;
  // Shares actually held by user wallets — circulating minus pool reserves.
  activeSupply: number;
  maxSupply: number;
  tvl: number;
  ath: number;
  athDate: string;
  atl: number;
  atlDate: string;
}

export interface PlayerSummary extends Player, TokenStats {
  sparkline7d: number[];
}

export interface PricePoint {
  t: number;
  price: number;
  volume: number;
}

export type TradeFlow = "buy" | "sell" | "swap-in" | "swap-out";

export interface Trade {
  id: string;
  playerId: string;
  // Raw AMM event direction (buy = quote → base, sell = base → quote).
  side: "buy" | "sell";
  // Dashboard flow classification:
  //   buy       = Gold/USDC → player (inflow)
  //   sell      = player → Gold/USDC (outflow)
  //   swap-in   = user receives a player share via a player↔player swap
  //   swap-out  = user gives up a player share via a player↔player swap
  flow: TradeFlow;
  priceUsd: number;
  amount: number;
  totalUsd: number;
  // The trader's wallet — already resolved to the user side, not the
  // Sport.fun swap-router contract on swap legs.
  wallet: string;
  txHash: string;
  timestamp: number;
}

export interface HolderBucket {
  label: string;
  count: number;
  share: number;
}

export interface PoolStats {
  playerId: string;
  tvl: number;
  feeTier: number;
  volume24h: number;
  fees24h: number;
  apr: number;
  depthBuy: number;
  depthSell: number;
}

export interface MarketOverview {
  totalMarketCap: number;
  marketCapChange24h: number;
  totalVolume24h: number;
  volumeChange24h: number;
  totalTrades24h: number;
  activeWallets24h: number;
  totalHolders: number;
  totalTvl: number;
  listedPlayers: number;
  marketCapSeries: PricePoint[];
  volumeSeries: PricePoint[];
  funPriceUsd: number;
  funChange24h: number;
  goldPriceUsd?: number;
}

// Daily Sport.fun market stats (from /v1/sportsfun/market/stats).
// 90-day rolling window. Covers all sport.fun listed tokens, not NFL-only.
export interface MarketStatRow {
  date: string;          // YYYY-MM-DD
  t: number;             // unix ms (start of UTC day)
  volumeUsd: number;
  buyVolumeUsd: number;
  sellVolumeUsd: number;
  netflowUsd: number;    // buy - sell, positive = inflows dominant
  uniqueTraders: number;
  uniqueBuyers: number;
  uniqueSellers: number;
  uniquePools: number;
}

export type WindowKey = "24h" | "7d" | "30d";

export interface WindowStats {
  volumeUsd: number;
  buyVolumeUsd: number;
  sellVolumeUsd: number;
  netflowUsd: number;
  uniqueTraders: number;
  prevVolumeUsd: number;
  prevUniqueTraders: number;
  prevNetflowUsd: number;
}

export type WalletTier = "shrimp" | "fish" | "dolphin" | "shark" | "whale";

export interface WalletHolding {
  tokenAddress: string;
  symbol: string;
  name: string;
  imageUrl?: string;
  priceUsd: number;
  balance: number;
  balanceValueUsd: number;
  startHoldingAt: number;
  lastActiveAt: number;
}

export interface WalletTradeRow {
  txId: string;
  timestamp: number;          // unix ms
  side: "buy" | "sell";
  isNfl: boolean;
  // Display info — always present, sourced from the upstream's base_token.
  symbol: string;
  name: string;
  imageUrl?: string;
  // NFL-only enrichment from our roster lookup. Empty for Soccer rows.
  playerId?: string;
  position?: string;
  team?: string;
  // Amounts
  baseAmount: number;         // shares moved
  priceUsd: number;           // USD per share at trade time
  amountUsd: number;          // USD value of the trade
}

export interface WalletProfile {
  address: string;
  totalValueUsd: number;
  holdingsCount: number;
  tier: WalletTier;
  isNew: boolean;            // true if first holding < 7 days ago
  firstSeenAt: number;       // earliest start_holding_at across holdings
  lastActiveAt: number;
  holdings: WalletHolding[];
}
