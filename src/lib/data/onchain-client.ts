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
