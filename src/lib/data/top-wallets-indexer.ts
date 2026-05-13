// Reads the precomputed leaderboard from data/top-wallets.json on the
// `data` branch. Built by scripts/index-top-wallets.mjs on a 10-minute
// GitHub Actions cron. Replaces the live Top-K aggregation + on-chain
// refinement that was costing 10–30s per cold render.

export interface TopWalletIndexRow {
  address: string;
  balances: Record<string, number>; // tokenIdSuffix → decimal-adjusted balance
  funBalance: number;
  firstHeldAt: number;
  lastActiveAt: number;
  positions: number;
}

export interface TopWalletIndex {
  ts: number;
  generatedAt: string;
  durationMs: number;
  candidateCount: number;
  wallets: TopWalletIndexRow[];
}

const REMOTE_URL = process.env.GRIDIRON_TOP_WALLETS_URL
  ?? "https://raw.githubusercontent.com/brydisanto/fdf-dashboard/data/data/top-wallets.json";

let remoteCache: { fetchedAt: number; index: TopWalletIndex } | null = null;
const REMOTE_TTL_MS = 5 * 60 * 1000; // 5 min — the cron writes every 10

export async function readTopWalletsIndex(): Promise<TopWalletIndex | null> {
  if (!REMOTE_URL) return null;
  if (remoteCache && Date.now() - remoteCache.fetchedAt < REMOTE_TTL_MS) {
    return remoteCache.index;
  }
  try {
    const res = await fetch(REMOTE_URL, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    const parsed = (await res.json()) as Partial<TopWalletIndex>;
    if (!Array.isArray(parsed.wallets) || typeof parsed.ts !== "number") return null;
    const index: TopWalletIndex = {
      ts: parsed.ts,
      generatedAt: parsed.generatedAt ?? "",
      durationMs: parsed.durationMs ?? 0,
      candidateCount: parsed.candidateCount ?? 0,
      wallets: parsed.wallets as TopWalletIndexRow[],
    };
    remoteCache = { fetchedAt: Date.now(), index };
    return index;
  } catch {
    return null;
  }
}
