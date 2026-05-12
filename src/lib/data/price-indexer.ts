import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";

// Reader for the NFL price-history snapshots produced by the indexer
// at `scripts/index-prices.mjs`, run every 15 minutes via the
// `.github/workflows/index-prices.yml` cron and committed to the `data`
// branch. The deployed app reads it via raw.githubusercontent.com and
// uses it to compute accurate 1h/24h/7d % changes independent of the
// upstream's unreliable price_*_ago fields and sparse OHLC bars.
//
// Configure via env:
//   GRIDIRON_PRICE_SNAPSHOT_URL — raw GitHub URL to price-history.json
//     (e.g. https://raw.githubusercontent.com/<owner>/<repo>/data/data/price-history.json)
//
// In dev (or if no URL is configured), reads from the committed
// `data/price-history.json` file checked out at deploy time, with a
// fall-through to the local cache file written by the API route.

const CACHE_DIR = path.join(process.cwd(), ".gridiron-cache");
const SNAPSHOT_FILE = path.join(CACHE_DIR, "price-history.json");
const COMMITTED_FILE = path.join(process.cwd(), "data", "price-history.json");

export interface PriceSnapshot {
  ts: number;             // unix ms
  prices: number[];       // spot per token, aligned to tokenIds index
  supplies?: number[];    // circulating shares per token, aligned to tokenIds.
                          // Added 2026-05-12. Older snapshots may omit it; the
                          // reader falls back to current supply for those.
}

export interface PriceStore {
  tokenIds: string[];     // token suffix list — index aligns to `prices` arrays
  snapshots: PriceSnapshot[];
}

async function readSnapshotFromDisk(): Promise<PriceStore | null> {
  for (const file of [SNAPSHOT_FILE, COMMITTED_FILE]) {
    try {
      const raw = await fs.readFile(file, "utf8");
      const parsed = JSON.parse(raw) as Partial<PriceStore>;
      if (Array.isArray(parsed.tokenIds) && Array.isArray(parsed.snapshots)) {
        return {
          tokenIds: parsed.tokenIds,
          snapshots: parsed.snapshots,
        };
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

const REMOTE_URL = process.env.GRIDIRON_PRICE_SNAPSHOT_URL;
let remoteCache: { fetchedAt: number; store: PriceStore } | null = null;
// Snapshots refresh every 15 minutes upstream — match that cadence
// so we pick up the freshest snapshot exactly once per cycle.
const REMOTE_TTL_MS = 5 * 60 * 1000;

async function readSnapshotFromRemote(): Promise<PriceStore | null> {
  if (!REMOTE_URL) return null;
  if (remoteCache && Date.now() - remoteCache.fetchedAt < REMOTE_TTL_MS) {
    return remoteCache.store;
  }
  try {
    const res = await fetch(REMOTE_URL, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    const parsed = (await res.json()) as Partial<PriceStore>;
    if (!Array.isArray(parsed.tokenIds) || !Array.isArray(parsed.snapshots)) return null;
    const store: PriceStore = {
      tokenIds: parsed.tokenIds,
      snapshots: parsed.snapshots,
    };
    remoteCache = { fetchedAt: Date.now(), store };
    return store;
  } catch {
    return null;
  }
}

export async function readPriceHistory(): Promise<PriceStore | null> {
  const remote = await readSnapshotFromRemote();
  if (remote && remote.snapshots.length > 0) return remote;
  return readSnapshotFromDisk();
}

/**
 * For a given token suffix, find the historical spot price at-or-before
 * the target unix-ms timestamp. Walks the snapshots from newest to
 * oldest and returns the first one whose ts ≤ target. Returns null if
 * the snapshot history doesn't reach back that far (cold-start
 * scenario or token wasn't in the indexer's roster at that time).
 */
export function priceAt(
  store: PriceStore,
  tokenIdSuffix: string,
  targetMs: number,
): number | null {
  const tokenIdx = store.tokenIds.indexOf(tokenIdSuffix);
  if (tokenIdx < 0) return null;
  // Snapshots are appended chronologically (oldest first), so iterate
  // from the end for newest-first scan.
  for (let i = store.snapshots.length - 1; i >= 0; i--) {
    const s = store.snapshots[i];
    if (s.ts <= targetMs) {
      const p = s.prices[tokenIdx];
      return p > 0 ? p : null;
    }
  }
  return null;
}
