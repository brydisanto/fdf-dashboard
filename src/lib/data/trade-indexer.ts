import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { FOOTBALLFUN_CONTRACT } from "./roster";

// Reader for the NFL trade event index produced by scripts/index-trades.mjs
// (run every 5 min via .github/workflows/index-trades.yml). The deployed
// app reads it via raw.githubusercontent.com to power the Live Trade
// Feed and per-wallet/per-token trade views — independent of Tenero's
// /trades endpoints.
//
// Configure via env:
//   GRIDIRON_TRADE_HISTORY_URL — raw GitHub URL to trade-history.json
//     (e.g. https://raw.githubusercontent.com/<owner>/<repo>/data/data/trade-history.json)

const CACHE_DIR = path.join(process.cwd(), ".gridiron-cache");
const SNAPSHOT_FILE = path.join(CACHE_DIR, "trade-history.json");
const COMMITTED_FILE = path.join(process.cwd(), "data", "trade-history.json");

export interface IndexedTrade {
  txId: string;
  blockNumber: number;
  blockTime: number;        // unix ms
  logIndex: number;
  tokenIdSuffix: string;    // e.g. "1877680294"
  wallet: string;           // user wallet (lowercase)
  side: "buy" | "sell" | "swap-in" | "swap-out";
  shareAmount: number;
  usdAmount: number;
}

export interface TradeStore {
  lastIndexedBlock: number;
  trades: IndexedTrade[];
}

async function readSnapshotFromDisk(): Promise<TradeStore | null> {
  for (const file of [SNAPSHOT_FILE, COMMITTED_FILE]) {
    try {
      const raw = await fs.readFile(file, "utf8");
      const parsed = JSON.parse(raw) as Partial<TradeStore>;
      if (Array.isArray(parsed.trades) && typeof parsed.lastIndexedBlock === "number") {
        return {
          lastIndexedBlock: parsed.lastIndexedBlock,
          trades: parsed.trades,
        };
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

const REMOTE_URL = process.env.GRIDIRON_TRADE_HISTORY_URL;
let remoteCache: { fetchedAt: number; store: TradeStore } | null = null;
// Remote refresh aligned with the indexer cadence (5 min).
const REMOTE_TTL_MS = 5 * 60 * 1000;

async function readSnapshotFromRemote(): Promise<TradeStore | null> {
  if (!REMOTE_URL) return null;
  if (remoteCache && Date.now() - remoteCache.fetchedAt < REMOTE_TTL_MS) {
    return remoteCache.store;
  }
  try {
    const res = await fetch(REMOTE_URL, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    const parsed = (await res.json()) as Partial<TradeStore>;
    if (!Array.isArray(parsed.trades) || typeof parsed.lastIndexedBlock !== "number") return null;
    const store: TradeStore = {
      lastIndexedBlock: parsed.lastIndexedBlock,
      trades: parsed.trades,
    };
    remoteCache = { fetchedAt: Date.now(), store };
    return store;
  } catch {
    return null;
  }
}

export async function readTradeHistory(): Promise<TradeStore | null> {
  const remote = await readSnapshotFromRemote();
  if (remote && remote.trades.length > 0) return remote;
  return readSnapshotFromDisk();
}

// Map a token suffix → the full token address used by the rest of the
// data layer (contract:tokenId).
export function tokenAddressFromSuffix(suffix: string): string {
  return `${FOOTBALLFUN_CONTRACT}:${suffix}`;
}
