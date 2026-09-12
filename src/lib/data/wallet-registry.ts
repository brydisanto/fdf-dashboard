import "server-only";

// Reader for data/wallet-registry.json on the `data` branch: every
// wallet's first-ever NFL trade, maintained by scripts/index-trades.mjs
// on each cron run and seeded once by scripts/seed-wallet-registry.mjs
// from the contract's deployment block. This is what makes "new
// wallet" mean first NFL trade ever rather than first trade inside
// the 30-day trade-history window.

export type FirstAcquisition =
  | "buy"          // bought from the AMM (or minted on the curve)
  | "swap-in"      // received in a player-for-player swap
  | "transfer-in"  // sent the shares by another wallet
  | "sell"         // legacy rows only, see below
  | "swap-out";

export interface RegistryEntry {
  firstSeenAt: number;      // unix ms
  firstBlock: number;
  firstLogIndex?: number;
  firstTx: string;
  firstToken: string;       // tokenIdSuffix
  // How the wallet first got NFL shares. "sell"/"swap-out" only appear
  // in rows written before the seed read TransferBatch events — a
  // wallet cannot sell shares it never received, so such a row means
  // the acquisition was missed and the date is too late.
  firstSide: FirstAcquisition;
  firstShares: number;
  firstUsd: number;
}

export interface WalletRegistry {
  updatedAt: number;
  seededFromBlock: number;
  wallets: Record<string, RegistryEntry>;
}

const REMOTE_URL = process.env.GRIDIRON_WALLET_REGISTRY_URL
  ?? "https://raw.githubusercontent.com/brydisanto/fdf-dashboard/data/data/wallet-registry.json";

let remoteCache: { fetchedAt: number; registry: WalletRegistry } | null = null;
const REMOTE_TTL_MS = 5 * 60 * 1000; // matches the indexer cadence

export async function readWalletRegistry(): Promise<WalletRegistry | null> {
  if (remoteCache && Date.now() - remoteCache.fetchedAt < REMOTE_TTL_MS) {
    return remoteCache.registry;
  }
  try {
    // no-store + module cache, same reasoning as trade-indexer.ts: the
    // file grows without bound and Next's fetch cache refuses >2MB.
    const res = await fetch(REMOTE_URL, { cache: "no-store" });
    if (!res.ok) return remoteCache?.registry ?? null;
    const parsed = (await res.json()) as Partial<WalletRegistry>;
    if (!parsed.wallets || typeof parsed.wallets !== "object") return remoteCache?.registry ?? null;
    const registry: WalletRegistry = {
      updatedAt: Number(parsed.updatedAt ?? 0),
      seededFromBlock: Number(parsed.seededFromBlock ?? 0),
      wallets: parsed.wallets,
    };
    remoteCache = { fetchedAt: Date.now(), registry };
    return registry;
  } catch {
    return remoteCache?.registry ?? null;
  }
}
