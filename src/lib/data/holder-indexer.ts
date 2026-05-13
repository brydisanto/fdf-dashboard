import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { ROSTER, FOOTBALLFUN_CONTRACT } from "./roster";

// Background indexer for unique NFL holder counts.
//
// Reads snapshots produced by the GitHub Actions cron at
// `.github/workflows/index-holders.yml`, which runs `scripts/index-holders.mjs
// --write` and commits the result to the repo's `data` branch. The
// deployed app fetches from raw.githubusercontent.com — zero extra
// infrastructure, zero monthly cost, snapshots persist forever in
// the repo's git history.
//
// Configure via env:
//   GRIDIRON_HOLDER_SNAPSHOT_URL — raw GitHub URL to unique-holders.json
//     (e.g. https://raw.githubusercontent.com/<owner>/<repo>/data/data/unique-holders.json)
//
// In dev (or if no URL is configured), reads from the local
// `data/unique-holders.json` file, which the Node script writes when
// run with `--write`. This makes `npm run index:holders` produce the
// same payload locally that the cron produces in CI.
//
// Schema:
//   {
//     current: { ts, count, largestPoolHolderCount, pools, durationMs, fullScan },
//     history: Array<{ ts, count }>   // last 720 entries (~30 days hourly)
//   }

const CACHE_DIR = path.join(process.cwd(), ".gridiron-cache");
const SNAPSHOT_FILE = path.join(CACHE_DIR, "unique-holders.json");
// The GitHub Actions cron writes here; checked into the `data` branch.
const COMMITTED_FILE = path.join(process.cwd(), "data", "unique-holders.json");
const SWAP_ROUTER_LC = FOOTBALLFUN_CONTRACT.toLowerCase();

const HISTORY_LIMIT = 720;            // 30 days × 24 hourly samples
const HOLDERS_PAGE_LIMIT = 50;        // upstream cap
const HOLDERS_MAX_PAGES_PER_POOL = 30;

const UPSTREAM_BASE = "https://api.tenero.io/v1/sportsfun";

export interface HolderSnapshot {
  ts: number;
  count: number;
  largestPoolHolderCount: number;
  pools: number;
  durationMs: number;
  fullScan: boolean;
}

export interface HolderHistoryPoint {
  ts: number;
  count: number;
}

interface HolderStore {
  current: HolderSnapshot | null;
  history: HolderHistoryPoint[];
}

interface UpstreamHolderRow {
  wallet_address: string;
  balance: string | number;
}

interface UpstreamHoldersResponse {
  data: { rows: UpstreamHolderRow[]; next: string | null } | null;
}

async function readSnapshotFromDisk(): Promise<HolderStore> {
  // Try the in-process refresh cache first (used by the local API
  // route handler), then the committed `data/unique-holders.json`
  // (populated by the GitHub Actions cron when checked out at deploy
  // time), and finally fall back to empty.
  for (const file of [SNAPSHOT_FILE, COMMITTED_FILE]) {
    try {
      const raw = await fs.readFile(file, "utf8");
      const parsed = JSON.parse(raw) as HolderStore;
      return {
        current: parsed.current ?? null,
        history: Array.isArray(parsed.history) ? parsed.history : [],
      };
    } catch {
      /* try next */
    }
  }
  return { current: null, history: [] };
}

// Default to the project's own data branch — works without env var config.
const REMOTE_URL = process.env.GRIDIRON_HOLDER_SNAPSHOT_URL
  ?? "https://raw.githubusercontent.com/brydisanto/fdf-dashboard/data/data/unique-holders.json";
let remoteCache: { fetchedAt: number; store: HolderStore } | null = null;
const REMOTE_TTL_MS = 5 * 60 * 1000;

async function readSnapshotFromRemote(): Promise<HolderStore | null> {
  if (!REMOTE_URL) return null;
  if (remoteCache && Date.now() - remoteCache.fetchedAt < REMOTE_TTL_MS) {
    return remoteCache.store;
  }
  try {
    const res = await fetch(REMOTE_URL, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    const parsed = (await res.json()) as HolderStore;
    const store = {
      current: parsed.current ?? null,
      history: Array.isArray(parsed.history) ? parsed.history : [],
    };
    remoteCache = { fetchedAt: Date.now(), store };
    return store;
  } catch {
    return null;
  }
}

async function writeSnapshotToDisk(store: HolderStore): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(SNAPSHOT_FILE, JSON.stringify(store, null, 2), "utf8");
}

// Plain `fetch` (NOT through Next.js fetch cache) — the indexer wants
// fresh upstream data on each run, not the page-render cache.
async function uget(path: string): Promise<UpstreamHoldersResponse | null> {
  const url = `${UPSTREAM_BASE}${path}`;
  let attempt = 0;
  while (attempt < 4) {
    const res = await fetch(url, { cache: "no-store" });
    if (res.status === 429) {
      await sleep(500 * (attempt + 1) ** 2);
      attempt++;
      continue;
    }
    if (!res.ok) return null;
    return (await res.json()) as UpstreamHoldersResponse;
  }
  return null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Run the full holder scan: paginate every NFL pool to convergence,
 * dedupe addresses, exclude the AMM contract, write a fresh snapshot.
 * Designed to be called from a cron handler — takes minutes, not
 * milliseconds.
 *
 * Concurrency is intentionally low (chunks of 2) to stay under the
 * upstream's 100/min IP rate limit when running on a server with no
 * other concurrent traffic.
 */
export async function refreshUniqueHolderSnapshot(): Promise<HolderSnapshot> {
  const start = Date.now();
  const set = new Set<string>();
  let largestPool = 0;
  let truncatedAny = false;
  const concurrency = 2;

  for (let i = 0; i < ROSTER.length; i += concurrency) {
    const batch = ROSTER.slice(i, i + concurrency);
    const results = await Promise.all(batch.map(async (player) => {
      const poolAddrs = new Set<string>();
      let cursor: string | null = null;
      let pages = 0;
      let truncated = false;
      while (pages < HOLDERS_MAX_PAGES_PER_POOL) {
        const path =
          `/tokens/${encodeURIComponent(player.tokenAddress)}/holders` +
          `?limit=${HOLDERS_PAGE_LIMIT}` +
          (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
        const data: UpstreamHoldersResponse | null = await uget(path);
        const rows = data?.data?.rows ?? [];
        for (const r of rows) {
          const addr = r.wallet_address?.toLowerCase();
          if (!addr) continue;
          if (addr === SWAP_ROUTER_LC) continue;
          if (Number(r.balance ?? 0) <= 0) continue;
          poolAddrs.add(addr);
        }
        cursor = data?.data?.next ?? null;
        pages++;
        if (!cursor) break;
      }
      if (cursor) truncated = true;
      return { addrs: poolAddrs, truncated };
    }));
    for (const r of results) {
      if (r.truncated) truncatedAny = true;
      if (r.addrs.size > largestPool) largestPool = r.addrs.size;
      for (const a of r.addrs) set.add(a);
    }
  }

  const snapshot: HolderSnapshot = {
    ts: Date.now(),
    count: set.size,
    largestPoolHolderCount: largestPool,
    pools: ROSTER.length,
    durationMs: Date.now() - start,
    fullScan: !truncatedAny,
  };

  const store = await readSnapshotFromDisk();
  store.current = snapshot;
  store.history.push({ ts: snapshot.ts, count: snapshot.count });
  if (store.history.length > HISTORY_LIMIT) {
    store.history = store.history.slice(-HISTORY_LIMIT);
  }
  await writeSnapshotToDisk(store);
  return snapshot;
}

export async function readHolderSnapshot(): Promise<HolderStore> {
  const remote = await readSnapshotFromRemote();
  if (remote && remote.current) return remote;
  return readSnapshotFromDisk();
}

export async function readLatestHolderCount(): Promise<HolderSnapshot | null> {
  const store = await readHolderSnapshot();
  return store.current;
}
