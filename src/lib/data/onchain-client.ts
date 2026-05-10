import "server-only";
import { createPublicClient, http, type Address } from "viem";
import { base } from "viem/chains";
import { ROSTER, FOOTBALLFUN_CONTRACT } from "./roster";
import type { WalletHolding } from "../types";

// $FUN — Sport.fun's governance/utility token. Standard ERC-20 on Base.
export const FUN_TOKEN_ADDRESS = "0x16ee7ecac70d1028e7712751e2ee6ba808a7dd92";
export const FUN_TOKEN_DECIMALS = 18;

// Direct Base RPC reads. Used to bypass the upstream API for things it
// either doesn't expose well (full wallet NFL portfolio) or rate-limits
// (high-volume reads). One batched eth_call returns all 72 NFL balances
// for any wallet — far cleaner than the upstream's broken pagination.

const BASE_RPCS = [
  "https://mainnet.base.org",
  "https://base.llamarpc.com",
  "https://base.publicnode.com",
];

const client = createPublicClient({
  chain: base,
  transport: http(BASE_RPCS[0], { retryCount: 2, timeout: 10_000 }),
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
 * Returns a Map keyed by lowercase address. Wallets whose individual
 * call failed map to 0 (treated as "no balance" for the leaderboard
 * column — different from null, which we use elsewhere to mean "we
 * couldn't read at all").
 */
export async function readManyFunBalances(
  addresses: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
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
      for (const addr of slice) out.set(addr.toLowerCase(), 0);
      continue;
    }

    for (let j = 0; j < slice.length; j++) {
      const r = results[j];
      const addr = slice[j].toLowerCase();
      if (!r || r.status !== "success" || r.result == null) {
        out.set(addr, 0);
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
