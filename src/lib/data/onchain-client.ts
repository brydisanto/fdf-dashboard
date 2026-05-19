import "server-only";
import { createPublicClient, fallback, http, type Address } from "viem";
import { base } from "viem/chains";
import { ROSTER, FOOTBALLFUN_CONTRACT } from "./roster";
import type { WalletHolding } from "../types";

// $FUN — Sport.fun's governance/utility token. Standard ERC-20 on Base.
export const FUN_TOKEN_ADDRESS = "0x16ee7ecac70d1028e7712751e2ee6ba808a7dd92";
export const FUN_TOKEN_DECIMALS = 18;

// Soccer.fun's ERC-1155 — Sport.fun's soccer player shares. Same ABI
// as FOOTBALLFUN_CONTRACT (ERC-1155 with balanceOfBatch); different
// contract, different token ID set. We discovered it via Tenero's
// /tokens endpoint while debugging wallets whose Soccer portfolio
// showed up as empty in the UI — the upstream /wallets/.../holdings
// path returns 0 rows for many wallets despite them clearly holding
// positions. Reading on-chain bypasses that gap entirely.
export const SOCCERFUN_CONTRACT = "0x71c8b0c5148edb0399d1edf9bf0c8c81dea16918";

// Direct Base RPC reads. Used to bypass the upstream API for things it
// either doesn't expose well (full wallet NFL portfolio) or rate-limits
// (high-volume reads). One batched eth_call returns all 72 NFL balances
// for any wallet — far cleaner than the upstream's broken pagination.

const BASE_RPCS = [
  "https://mainnet.base.org",
  "https://base.llamarpc.com",
  "https://base.publicnode.com",
];

// Fallback transport — viem cycles through the RPC list on failure. With
// only one transport configured the public Base RPC's occasional slow
// responses (~10s+) were causing readOnchainTokenState to silently
// timeout and fall back to Tenero's stale current_price field, which
// reads ~3% above the AMM mid. Three independent endpoints with a
// 30s ceiling each gives us much more headroom.
const client = createPublicClient({
  chain: base,
  transport: fallback(
    BASE_RPCS.map((url) => http(url, { retryCount: 2, timeout: 30_000 })),
    { rank: false },
  ),
});

const ERC1155_ABI = [
  {
    type: "function",
    name: "balanceOfBatch",
    stateMutability: "view",
    inputs: [
      { name: "accounts", type: "address[]" },
      { name: "ids", type: "uint256[]" },
    ],
    outputs: [{ type: "uint256[]" }],
  },
] as const;

const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

/**
 * Read a wallet's $FUN balance directly from Base. Decimal-adjusted to
 * a regular Number for display (precision loss is fine for the few
 * digits we render).
 */
export async function readFunBalance(address: string): Promise<number> {
  try {
    const raw = await client.readContract({
      address: FUN_TOKEN_ADDRESS as Address,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [address as Address],
    });
    return Number(raw) / 10 ** FUN_TOKEN_DECIMALS;
  } catch {
    return 0;
  }
}

/**
 * Bulk $FUN balance reader for the leaderboard. Uses Multicall3 —
 * unlike the NFL balanceOfBatch path, ERC-20 balanceOf takes a
 * single Address arg and returns a single uint256, so the multicall
 * decoding is unambiguous and reliable.
 *
 * Returns a Map keyed by lowercase address. The VALUE is `number | null`:
 *   - `number` (0 or positive): canonical on-chain balance
 *   - `null`: this wallet's call failed (rate limit, timeout, RPC drop)
 *
 * Callers MUST distinguish those two cases — collapsing both to 0
 * is what caused the top-wallets leaderboard to show "—" for whales
 * who actually hold $FUN, because a transient multicall failure was
 * being persisted as if the wallet had emptied its FUN position.
 */
export async function readManyFunBalances(
  addresses: string[],
): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  if (addresses.length === 0) return out;

  // 100 wallets per multicall — each inner call returns 32 bytes
  // so payload stays small.
  const CHUNK = 100;

  for (let i = 0; i < addresses.length; i += CHUNK) {
    const slice = addresses.slice(i, i + CHUNK);
    const contracts = slice.map((addr) => ({
      address: FUN_TOKEN_ADDRESS as Address,
      abi: ERC20_ABI,
      functionName: "balanceOf" as const,
      args: [addr as Address] as const,
    }));

    let results: { status: "success" | "failure"; result?: bigint }[];
    try {
      results = (await client.multicall({
        contracts,
        allowFailure: true,
      })) as { status: "success" | "failure"; result?: bigint }[];
    } catch {
      // Whole chunk failed — mark every wallet null so the caller can
      // fall back to whatever value it has from another source (e.g.
      // the indexer JSON) rather than misrepresenting them as zero.
      for (const addr of slice) out.set(addr.toLowerCase(), null);
      continue;
    }

    for (let j = 0; j < slice.length; j++) {
      const r = results[j];
      const addr = slice[j].toLowerCase();
      if (!r || r.status !== "success" || r.result == null) {
        out.set(addr, null);
        continue;
      }
      out.set(addr, Number(r.result) / 10 ** FUN_TOKEN_DECIMALS);
    }
  }

  return out;
}

const TOKEN_ID_BIG = ROSTER.map((p) => BigInt(p.tokenIdSuffix));
const SHARE_DECIMALS = 18; // confirmed via /tokens detail; balances are 1e18-scaled

/**
 * Read all 72 NFL player share balances for one wallet in a single RPC
 * call. Returns ONLY positions with balance > 0. Prices are filled from
 * the upstream players cache so the value column matches the rest of
 * the dashboard.
 */
export async function readWalletNflBalances(
  address: string,
  priceByTokenAddress: Map<string, number>,
): Promise<WalletHolding[] | null> {
  // Returns null on RPC failure so callers can distinguish "wallet
  // genuinely has no NFL" (returns []) from "we couldn't ask"
  // (returns null) and fall back to the upstream API instead of
  // misrepresenting a $9k holder as $0.
  const wallet = address as Address;
  const wallets = ROSTER.map(() => wallet);
  let raw: readonly bigint[];
  try {
    raw = await client.readContract({
      address: FOOTBALLFUN_CONTRACT as Address,
      abi: ERC1155_ABI,
      functionName: "balanceOfBatch",
      args: [wallets, TOKEN_ID_BIG],
    });
  } catch {
    return null;
  }

  const out: WalletHolding[] = [];
  const now = Date.now();
  for (let i = 0; i < ROSTER.length; i++) {
    const balanceRaw = raw[i] ?? 0n;
    if (balanceRaw === 0n) continue;
    const player = ROSTER[i];
    // Tokens are 18-decimal so divide by 1e18. Use Number for display
    // (loses precision past ~15 digits but our balances are 4-7 digits
    // of significand).
    const balance = Number(balanceRaw) / 10 ** SHARE_DECIMALS;
    const priceUsd = priceByTokenAddress.get(player.tokenAddress) ?? 0;
    out.push({
      tokenAddress: player.tokenAddress,
      symbol: player.symbol,
      name: player.displayName,
      imageUrl: undefined,
      priceUsd,
      balance,
      balanceValueUsd: +(balance * priceUsd).toFixed(2),
      // We don't have on-chain timestamps here without log replay.
      // The upstream's /wallets/holdings does — when present we fall
      // back to those. For balances that ONLY exist on-chain (not in
      // the upstream's top-50 holdings response), we leave blank.
      startHoldingAt: 0,
      lastActiveAt: now,
    });
  }
  out.sort((a, b) => b.balanceValueUsd - a.balanceValueUsd);
  return out;
}

/**
 * Same on-chain balance pattern as readWalletNflBalances, but
 * against the SoccerFun ERC-1155 contract and against a dynamic
 * token universe (Sport.fun keeps adding soccer players, so we
 * can't hardcode the list like we do for the 72 NFL roster).
 *
 * Caller supplies the token list (typically the result of
 * getSoccerTokenUniverse() in footballfun.ts) which has the token
 * metadata + current price. We do ONE batched eth_call across all
 * supplied tokens and return only positions with balance > 0.
 *
 * Returns null on RPC failure so callers can distinguish "wallet
 * has no soccer" from "we couldn't ask" and fall back gracefully.
 */
export interface SoccerTokenMeta {
  tokenAddress: string;     // "{SOCCERFUN_CONTRACT}:{tokenIdSuffix}"
  tokenIdSuffix: string;
  name: string;
  symbol: string;
  imageUrl?: string;
  priceUsd: number;
}
export async function readWalletSoccerBalances(
  address: string,
  tokens: SoccerTokenMeta[],
): Promise<WalletHolding[] | null> {
  if (tokens.length === 0) return [];
  const wallet = address as Address;
  const wallets = tokens.map(() => wallet);
  const tokenIds = tokens.map((t) => BigInt(t.tokenIdSuffix));
  let raw: readonly bigint[];
  try {
    raw = await client.readContract({
      address: SOCCERFUN_CONTRACT as Address,
      abi: ERC1155_ABI,
      functionName: "balanceOfBatch",
      args: [wallets, tokenIds],
    });
  } catch {
    return null;
  }

  const out: WalletHolding[] = [];
  const now = Date.now();
  for (let i = 0; i < tokens.length; i++) {
    const balanceRaw = raw[i] ?? 0n;
    if (balanceRaw === 0n) continue;
    const t = tokens[i];
    const balance = Number(balanceRaw) / 10 ** SHARE_DECIMALS;
    out.push({
      tokenAddress: t.tokenAddress,
      symbol: t.symbol,
      name: t.name,
      imageUrl: t.imageUrl,
      priceUsd: t.priceUsd,
      balance,
      balanceValueUsd: +(balance * t.priceUsd).toFixed(2),
      startHoldingAt: 0,   // no on-chain timestamps without log replay
      lastActiveAt: now,
    });
  }
  out.sort((a, b) => b.balanceValueUsd - a.balanceValueUsd);
  return out;
}

/**
 * Bulk variant — read many wallets' NFL balances using a flattened
 * balanceOfBatch call per chunk. Each chunk handles N wallets in
 * one straight eth_call: the wallets array becomes [w1×72, w2×72,
 * ..., wN×72] and the ids array becomes [t1..t72, t1..t72, ...] N
 * times. The contract returns a flat list of N×72 balances, which
 * we slice back per wallet.
 *
 * This is dramatically more reliable than per-wallet readContract
 * (which throttled on the public RPC and returned null for most
 * calls, leaving the leaderboard stuck with aggregated estimates)
 * AND simpler than wrapping per-wallet calls in Multicall3 (which
 * adds another layer of args-shape mismatch to debug).
 *
 * Returns a Map keyed by lowercase address. Chunks that error map
 * every wallet in that chunk to null so callers can fall back.
 */
export async function readManyWalletsNflBalances(
  addresses: string[],
  priceByTokenAddress: Map<string, number>,
): Promise<Map<string, WalletHolding[] | null>> {
  const out = new Map<string, WalletHolding[] | null>();
  if (addresses.length === 0) return out;

  // 25 wallets × 72 tokens = 1800 entries per call. Result payload
  // is ~58KB encoded — well under any RPC's response size limit.
  const CHUNK = 25;
  const now = Date.now();
  const tokenCount = ROSTER.length;

  for (let i = 0; i < addresses.length; i += CHUNK) {
    const slice = addresses.slice(i, i + CHUNK);
    // Flatten: each wallet repeated tokenCount times, token IDs
    // repeated for each wallet.
    const flatWallets: Address[] = [];
    const flatTokens: bigint[] = [];
    for (const addr of slice) {
      for (let k = 0; k < tokenCount; k++) {
        flatWallets.push(addr as Address);
        flatTokens.push(TOKEN_ID_BIG[k]);
      }
    }

    let raw: readonly bigint[];
    try {
      raw = await client.readContract({
        address: FOOTBALLFUN_CONTRACT as Address,
        abi: ERC1155_ABI,
        functionName: "balanceOfBatch",
        args: [flatWallets, flatTokens],
      });
    } catch {
      for (const addr of slice) out.set(addr.toLowerCase(), null);
      continue;
    }

    // Slice the flat result back per wallet.
    for (let j = 0; j < slice.length; j++) {
      const addr = slice[j];
      const offset = j * tokenCount;
      const holdings: WalletHolding[] = [];
      for (let k = 0; k < tokenCount; k++) {
        const balanceRaw = raw[offset + k] ?? 0n;
        if (balanceRaw === 0n) continue;
        const player = ROSTER[k];
        const balance = Number(balanceRaw) / 10 ** SHARE_DECIMALS;
        const priceUsd = priceByTokenAddress.get(player.tokenAddress) ?? 0;
        holdings.push({
          tokenAddress: player.tokenAddress,
          symbol: player.symbol,
          name: player.displayName,
          imageUrl: undefined,
          priceUsd,
          balance,
          balanceValueUsd: +(balance * priceUsd).toFixed(2),
          startHoldingAt: 0,
          lastActiveAt: now,
        });
      }
      holdings.sort((a, b) => b.balanceValueUsd - a.balanceValueUsd);
      out.set(addr.toLowerCase(), holdings);
    }
  }

  return out;
}

// ---------- On-chain token state (Phase 1: bypass Tenero /tokens) ----------
//
// The Sport.fun architecture (read from the verified contract source):
//   - PlayerV3 (proxy at FOOTBALLFUN_CONTRACT) is the ERC-1155 player
//     share contract. It also acts as the bonding-curve reserve — the
//     contract address itself holds every unsold share.
//   - FDFPair (at the address returned by PlayerV3.fdfPair()) is the
//     AMM pair contract. It holds the currency (USDC) on one side and
//     the player shares on the other side of each pool.
//
// To compute the spot price of any player token entirely on-chain:
//   price = currency_reserve_usd / token_reserve_count
//        = (USDC_in_pair / 1e6) / (shares_in_pair / 1e18)
//
// This matches Sport.fun's own UI display exactly (verified against
// Bijan/Allen/Cook — all within rounding).

// FDFPair contract address (Sport.fun's AMM). Resolved once via
// PlayerV3.fdfPair() and pinned here so reads don't pay an extra
// dispatch on every render. If Sport.fun ever rotates the pair, this
// will need to be re-resolved.
const FDFPAIR_ADDRESS = "0x4Fdce033b9F30019337dDC5cC028DC023580585e" as Address;

// USDC on Base has 6 decimals. Player shares have 18 decimals.
const USDC_DECIMALS = 6;

const PAIR_ABI = [
  {
    type: "function",
    name: "getCurrencyReserves",
    stateMutability: "view",
    inputs: [{ name: "_playerTokenIds", type: "uint256[]" }],
    outputs: [{ type: "uint256[]" }],
  },
] as const;

export interface OnchainTokenState {
  tokenAddress: string;        // ROSTER token address (contract:tokenId)
  priceUsd: number;            // spot = currency / token at curve mid
  totalSupply: number;         // user-facing share count
  circulatingSupply: number;   // shares held by user wallets (= total − contract balance)
  poolCurrencyUsd: number;     // USDC sitting in the pair for this token
  poolTokenCount: number;      // player shares sitting in the pair for this token
  tvlUsd: number;              // both sides of the pool in USD (= 2 × currency)
}

/**
 * Read the full pool state for every NFL token in two batched RPC
 * calls. Returns a Map keyed by token address (contract:tokenId).
 *
 *   Call 1: PAIR.getCurrencyReserves([72 token ids])
 *           → USDC reserves per token
 *   Call 2: PROXY.balanceOfBatch([PAIR, PAIR, ..., PROXY, PROXY, ...], [tokenIds × 2])
 *           → token reserves (PAIR side) + bonding-curve reserves (PROXY side)
 *
 * Total wall-time is ~200-500ms against the public Base RPC, cached
 * via the module-level memo below so subsequent renders within the
 * TTL pay nothing.
 */
let onchainStateCache: { ts: number; data: Map<string, OnchainTokenState> } | null = null;
// Module-level cache lifetime. 60s strikes the balance between
// freshness (live spot display, live market cap) and RPC load
// (one batched read across all 72 tokens per minute per worker).
// The historical-delta anchor uses 5-min bucketing on top, so spot
// can refresh faster than the anchor without producing jitter — the
// anchor only changes on a 5-min boundary.
const ONCHAIN_STATE_TTL_MS = 60_000;

export async function readOnchainTokenState(): Promise<Map<string, OnchainTokenState> | null> {
  const now = Date.now();
  if (onchainStateCache && now - onchainStateCache.ts < ONCHAIN_STATE_TTL_MS) {
    return onchainStateCache.data;
  }
  try {
    // Currency reserves (USDC, 6 decimals) per token from FDFPair.
    const currencyReserves = await client.readContract({
      address: FDFPAIR_ADDRESS,
      abi: PAIR_ABI,
      functionName: "getCurrencyReserves",
      args: [TOKEN_ID_BIG],
    });
    // Both: PAIR's share holdings (the AMM token side) AND PROXY's own
    // share holdings (the bonding-curve unminted reserve). One batched
    // call returns both in one round trip.
    const flatWallets: Address[] = [];
    const flatTokens: bigint[] = [];
    for (const tid of TOKEN_ID_BIG) {
      flatWallets.push(FDFPAIR_ADDRESS);
      flatTokens.push(tid);
    }
    for (const tid of TOKEN_ID_BIG) {
      flatWallets.push(FOOTBALLFUN_CONTRACT as Address);
      flatTokens.push(tid);
    }
    const balances = await client.readContract({
      address: FOOTBALLFUN_CONTRACT as Address,
      abi: ERC1155_ABI,
      functionName: "balanceOfBatch",
      args: [flatWallets, flatTokens],
    });
    const tokenCount = ROSTER.length;
    const pairBalances = balances.slice(0, tokenCount);
    const contractBalances = balances.slice(tokenCount);

    const TOTAL_SUPPLY = 25_000_000; // Every Sport.fun player has the same 25M cap.

    const out = new Map<string, OnchainTokenState>();
    for (let i = 0; i < ROSTER.length; i++) {
      const player = ROSTER[i];
      const currencyRaw = currencyReserves[i] ?? 0n;
      const pairTokenRaw = pairBalances[i] ?? 0n;
      const contractRaw = contractBalances[i] ?? 0n;

      const poolCurrencyUsd = Number(currencyRaw) / 10 ** USDC_DECIMALS;
      const poolTokenCount = Number(pairTokenRaw) / 10 ** SHARE_DECIMALS;
      const priceUsd =
        poolTokenCount > 0 ? poolCurrencyUsd / poolTokenCount : 0;
      const contractTokenCount = Number(contractRaw) / 10 ** SHARE_DECIMALS;
      // "Circulating" follows the upstream's convention: total supply
      // minus the bonding-curve reserve (the contract's self-balance).
      // The pair's token-side balance is INCLUDED in circulating —
      // it'll be subtracted later in the activeSupply derivation as a
      // platform-side wallet, consistent with the existing code path.
      const circulatingSupply = Math.max(0, TOTAL_SUPPLY - contractTokenCount);

      out.set(player.tokenAddress, {
        tokenAddress: player.tokenAddress,
        priceUsd,
        totalSupply: TOTAL_SUPPLY,
        circulatingSupply,
        poolCurrencyUsd,
        poolTokenCount,
        tvlUsd: poolCurrencyUsd * 2,
      });
    }

    onchainStateCache = { ts: now, data: out };
    return out;
  } catch (err) {
    // Logged at error level so Vercel surfaces it in the function logs.
    // When this fires, the dashboard silently falls back to Tenero's
    // current_price, which can read 2-3% above the AMM mid and inflate
    // every player's market cap (visible in the NFL Market Cap stat).
    console.error("[readOnchainTokenState] RPC failed:", err);
    if (onchainStateCache) return onchainStateCache.data;
    return null;
  }
}
