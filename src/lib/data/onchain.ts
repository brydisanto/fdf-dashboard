/* eslint-disable @typescript-eslint/no-unused-vars */
/*
 * On-chain reads for Sport.fun's NFL player share contract on Base.
 *
 * This module is the planned successor to `footballfun.ts` for everything
 * that doesn't strictly need an indexer. It reads directly from a Base
 * RPC via viem — no upstream API, no rate limit, no third-party
 * dependency.
 *
 * Status: SCAFFOLD. No exports are wired into the data layer yet.
 * Below is the implementation plan + the contract surface we need.
 *
 * ---------------------------------------------------------------------
 * Sport.fun NFL player share contract:  0x2EeF466e802Ab2835aB81BE63eEbc55167d35b56
 * Chain:                                Base (chainId 8453)
 * Token model:                          ERC-1155-style multitoken
 * Quote asset:                          USDC (0x833589fcd6edb6e08f4c7c32d4f71b54bda02913)
 *
 * What's cheap to read directly (a few eth_calls per page render):
 *   - balanceOf(address, tokenId)              — wallet's holding of one player
 *   - balanceOfBatch(addresses[], ids[])       — many at once
 *   - totalSupply(tokenId) [if exposed]        — total supply per player
 *   - Pool reserves                            — for live spot price
 *   - Token URI / metadata                     — for symbol/name/image
 *
 * What needs an indexer (= path 3, the subgraph):
 *   - Historical holder counts by day
 *   - Total volume / inflow / outflow / swap aggregates over time
 *   - Trade history for any given pool or wallet beyond the most recent
 *   - Daily netflow, unique trader counts, new-wallet counts
 *
 * ---------------------------------------------------------------------
 * Migration plan:
 *
 *   Phase 1 (no infra) — replace LIVE reads with viem:
 *     - getPlayerLivePrice(tokenId): read pool reserves, return spot price
 *     - getPlayerSupply(tokenId):    return totalSupply / circulating
 *     - getWalletBalance(addr, ids): batched balanceOf for portfolio reads
 *     This kills the upstream dependency for the bulk of read traffic
 *     (mcap, prices, supplies) while keeping a tiny call budget.
 *
 *   Phase 2 (subgraph) — own the historical data:
 *     - Deploy a subgraph indexing the contract on Base. Schema below.
 *     - Replace getMarketStats / getNflDailyVolume / getUniqueNflHolderCount
 *       / getRecentTradesGlobal / getNflFlowRollup with GraphQL queries.
 *     - Subgraph hosting options:
 *         a) The Graph Network (decentralized, ~$10/mo to publish)
 *         b) Goldsky (managed; faster setup, ~$50/mo for production)
 *         c) Self-host graph-node on a VPS ($5-20/mo)
 *
 *   Phase 3 (decommission upstream) — once 1+2 cover everything, remove
 *   `footballfun.ts` and rename `onchain.ts` + `subgraph.ts` to be the
 *   primary data layer. The public API in `lib/data/index.ts` stays the
 *   same; only the implementation swaps.
 *
 * ---------------------------------------------------------------------
 * Subgraph schema sketch (subgraph.yaml + schema.graphql):
 *
 *   type Player @entity {
 *     id: ID!                        # tokenId
 *     symbol: String!
 *     totalSupply: BigInt!
 *     holderCount: Int!
 *     totalTransfers: Int!
 *   }
 *
 *   type Holder @entity {
 *     id: ID!                        # `${wallet}-${tokenId}`
 *     wallet: Bytes!
 *     player: Player!
 *     balance: BigInt!
 *     firstHeldAt: BigInt!           # block timestamp
 *     lastActivityAt: BigInt!
 *   }
 *
 *   type Wallet @entity {
 *     id: ID!                        # address
 *     firstSeenAt: BigInt!
 *     lastActivityAt: BigInt!
 *     activeNflHoldings: Int!
 *     totalNflBalanceUsd: BigDecimal!
 *   }
 *
 *   type DailyMarketStat @entity {
 *     id: ID!                        # YYYY-MM-DD
 *     date: String!
 *     buyVolumeUsd: BigDecimal!
 *     sellVolumeUsd: BigDecimal!
 *     swapVolumeUsd: BigDecimal!
 *     uniqueTraders: Int!
 *     newWallets: Int!
 *     uniqueHolders: Int!            # snapshot at end of day
 *   }
 *
 *   type Trade @entity {
 *     id: ID!                        # `${txHash}-${logIndex}`
 *     txHash: Bytes!
 *     timestamp: BigInt!
 *     player: Player!
 *     wallet: Wallet!
 *     side: String!                  # "buy" | "sell" | "swap-in" | "swap-out"
 *     priceUsd: BigDecimal!
 *     amount: BigInt!
 *     totalUsd: BigDecimal!
 *   }
 *
 * Event handlers:
 *   - TransferSingle(operator, from, to, id, value)
 *       → upsert Player.totalTransfers, recompute Holder balances,
 *         derive trade type from from/to (mint/router/wallet), update
 *         DailyMarketStat.
 *   - Swap event from each pool contract
 *       → Trade entity with priceUsd from event amounts.
 *
 * ---------------------------------------------------------------------
 * Until phase 1 is wired up, this file just exports the constants used
 * by both layers so we have one source of truth for the contract address
 * and chain config.
 */

export const FOOTBALLFUN_CONTRACT = "0x2EeF466e802Ab2835aB81BE63eEbc55167d35b56";
export const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const BASE_CHAIN_ID = 8453;

// Public Base RPCs (no API key needed). Rotate through these in the
// viem client to spread load.
export const BASE_RPCS = [
  "https://mainnet.base.org",
  "https://base.publicnode.com",
  "https://base.llamarpc.com",
  "https://1rpc.io/base",
];

// ERC-1155 read methods we need from the player share contract.
// (Filled in once we install viem and ship phase 1.)
export const ERC1155_READ_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "id", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
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
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "uri",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ type: "string" }],
  },
] as const;

// Phase 1 stubs — to be implemented once `viem` is added to the project.
//
// import { createPublicClient, http } from "viem";
// import { base } from "viem/chains";
//
// export const publicClient = createPublicClient({
//   chain: base,
//   transport: http(BASE_RPCS[0]),
// });
//
// export async function readBalanceBatch(
//   wallets: `0x${string}`[],
//   tokenIds: bigint[],
// ): Promise<bigint[]> {
//   return publicClient.readContract({
//     address: FOOTBALLFUN_CONTRACT,
//     abi: ERC1155_READ_ABI,
//     functionName: "balanceOfBatch",
//     args: [wallets, tokenIds],
//   });
// }
