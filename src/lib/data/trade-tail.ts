import "server-only";
import { createPublicClient, fallback, http, parseAbiItem, type Address } from "viem";
import { base } from "viem/chains";
import { ROSTER, FOOTBALLFUN_CONTRACT } from "./roster";
import type { IndexedTrade } from "./trade-indexer";

// On-the-fly tail scanner for trades the GitHub Actions trade indexer
// hasn't published yet. The indexer is scheduled every 5 minutes but
// the GH Actions free-tier scheduler can delay runs by 1-3 hours,
// leaving the Live Feed and rollups missing fresh activity.
//
// This module reads TransferSingle events from the FOOTBALLFUN proxy
// on Base for the block range (lastIndexedBlock+1 → head), matches
// each tx against USDC Transfers involving the FDFPair to attribute
// USD amounts, and emits IndexedTrade records in the same shape the
// snapshot file uses. The dashboard merges these on top of the
// snapshot trades to give an always-fresh feed.
//
// Cost: typically 1 + small-N RPC calls per render (`getBlockNumber`
// + 2-3 `getLogs`). Cached at module level for 60s so multiple
// concurrent renders dedupe to a single tail scan.

const FOOTBALLFUN_LC = FOOTBALLFUN_CONTRACT.toLowerCase();
const PAIR_ADDRESS = "0x4Fdce033b9F30019337dDC5cC028DC023580585e" as Address;
const PAIR_LC = PAIR_ADDRESS.toLowerCase();
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

const NFL_TOKEN_SET = new Set(ROSTER.map((p) => p.tokenIdSuffix));

// Base block time is ~2s. Used to derive timestamps without a per-block
// eth_getBlockByNumber call (which would dominate the cost on long
// tail scans). Off by at most a few seconds vs the actual block time
// — fine for "X minutes ago" relative display.
const BASE_BLOCK_TIME_MS = 2000;

// Bound how far back we'll tail-scan when the indexer file is missing
// or extremely stale (e.g. cold start, indexer broken for days). The
// snapshot covers history; this is just for fresh tail catchup.
const MAX_TAIL_BLOCKS = 5 * 60 * 30; // ~5h of blocks on Base

const BASE_RPCS = [
  "https://mainnet.base.org",
  "https://base.llamarpc.com",
  "https://base.publicnode.com",
];

const client = createPublicClient({
  chain: base,
  transport: fallback(
    BASE_RPCS.map((url) => http(url, { retryCount: 2, timeout: 30_000 })),
    { rank: false },
  ),
});

const TRANSFER_SINGLE_EVENT = parseAbiItem(
  "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)",
);

// USDC ERC-20 Transfer event signature — used to decode receipt logs
// for USD attribution. We pull receipts per tx (rather than a separate
// filtered getLogs) so the user's net USDC change is computed
// regardless of which contract sits on the counterparty side of the
// USDC move. Router upgrades or new bonding-curve paths can't quietly
// break this.
const USDC_TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const USDC_LC = USDC_ADDRESS.toLowerCase();

// Module cache so concurrent ISR regens / page renders share a single
// scan. 30s is short enough that fresh trades surface within half a
// minute once they land on-chain, long enough to amortize RPC cost
// across the burst of in-flight renders right after an ISR regen.
let cache: { ts: number; fromBlock: bigint; trades: IndexedTrade[] } | null = null;
const CACHE_TTL_MS = 30_000;

export async function tailNflTrades(lastIndexedBlock: number): Promise<IndexedTrade[]> {
  const now = Date.now();
  const fromBlock = BigInt(Math.max(0, lastIndexedBlock) + 1);

  if (cache && cache.fromBlock === fromBlock && now - cache.ts < CACHE_TTL_MS) {
    return cache.trades;
  }

  try {
    const head = await client.getBlockNumber();
    if (head < fromBlock) return [];

    // Clamp the scan window — if the indexer is way behind, don't try
    // to backfill days here; the snapshot covers older history.
    const span = head - fromBlock + 1n;
    const scanFrom = span > BigInt(MAX_TAIL_BLOCKS)
      ? head - BigInt(MAX_TAIL_BLOCKS) + 1n
      : fromBlock;

    // Just NFL share transfers. USD attribution comes from each tx's
    // receipt below — that way we're robust to USDC moving through
    // any contract (router, FOOTBALLFUN, or PAIR), not just PAIR.
    const shareLogs = await client.getLogs({
      address: FOOTBALLFUN_CONTRACT as Address,
      event: TRANSFER_SINGLE_EVENT,
      fromBlock: scanFrom,
      toBlock: head,
    });

    // Filter NFL share movements that involve a user wallet (skip
    // mints/burns and internal pair ↔ contract moves).
    type ShareLeg = {
      txHash: string;
      blockNumber: bigint;
      logIndex: number;
      tokenIdSuffix: string;
      from: string;
      to: string;
      shareAmount: number;
    };
    const legsByTx = new Map<string, ShareLeg[]>();
    for (const log of shareLogs) {
      const args = log.args as {
        from?: Address; to?: Address; id?: bigint; value?: bigint;
      };
      if (!args.from || !args.to || args.id == null || args.value == null) continue;
      const tokenIdSuffix = args.id.toString();
      if (!NFL_TOKEN_SET.has(tokenIdSuffix)) continue;
      const from = args.from.toLowerCase();
      const to = args.to.toLowerCase();
      if (from === ZERO_ADDR || to === ZERO_ADDR) continue;
      const txHash = log.transactionHash;
      if (!txHash) continue;
      const leg: ShareLeg = {
        txHash,
        blockNumber: log.blockNumber ?? 0n,
        logIndex: Number(log.logIndex ?? 0),
        tokenIdSuffix,
        from,
        to,
        shareAmount: Number(args.value) / 1e18,
      };
      const arr = legsByTx.get(txHash);
      if (arr) arr.push(leg);
      else legsByTx.set(txHash, [leg]);
    }

    if (legsByTx.size === 0) {
      cache = { ts: now, fromBlock, trades: [] };
      return [];
    }

    // Head timestamp anchors block-time derivation. Every other block's
    // timestamp is computed as (head - blockGap × 2s) — saves a getBlock
    // call per tx.
    const headBlock = await client.getBlock({ blockNumber: head });
    const headTimeMs = Number(headBlock.timestamp) * 1000;

    // Pull a receipt per tx in parallel so USDC attribution can sum
    // every USDC Transfer the user is involved in, regardless of
    // counterparty. One RPC per tx is fine since the tail typically
    // contains a handful of fresh trades.
    const txHashes = Array.from(legsByTx.keys());
    const receipts = await Promise.all(
      txHashes.map((hash) =>
        client.getTransactionReceipt({ hash: hash as `0x${string}` }).catch(() => null),
      ),
    );
    type UsdcMove = { from: string; to: string; value: bigint };
    const usdcByTx = new Map<string, UsdcMove[]>();
    receipts.forEach((receipt, i) => {
      if (!receipt) return;
      const moves: UsdcMove[] = [];
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== USDC_LC) continue;
        if (log.topics[0] !== USDC_TRANSFER_TOPIC) continue;
        const fromTopic = log.topics[1];
        const toTopic = log.topics[2];
        if (!fromTopic || !toTopic) continue;
        const from = ("0x" + fromTopic.slice(26)).toLowerCase();
        const to = ("0x" + toTopic.slice(26)).toLowerCase();
        const value = BigInt(log.data);
        moves.push({ from, to, value });
      }
      if (moves.length > 0) usdcByTx.set(txHashes[i], moves);
    });

    const isAmm = (addr: string) => addr === PAIR_LC || addr === FOOTBALLFUN_LC;
    const out: IndexedTrade[] = [];
    for (const [txHash, legs] of legsByTx) {
      // Pick the user wallet: the address on each leg that ISN'T an
      // AMM endpoint (PAIR or the FOOTBALLFUN proxy itself). All legs
      // in a tx share the same user.
      let userWallet: string | null = null;
      for (const leg of legs) {
        const candidate = isAmm(leg.from) ? leg.to : leg.from;
        if (!isAmm(candidate)) {
          userWallet = candidate;
          break;
        }
      }
      if (!userWallet) continue;

      // Compute net USDC for the user wallet in this tx.
      let netUsdRaw = 0n;
      const moves = usdcByTx.get(txHash) ?? [];
      for (const m of moves) {
        if (m.from === userWallet) netUsdRaw += m.value;
        if (m.to === userWallet) netUsdRaw -= m.value;
      }
      const absUsdRaw = netUsdRaw < 0n ? -netUsdRaw : netUsdRaw;
      const isSwap = legs.length > 1;
      const txUsdAmount = isSwap ? 0 : Number(absUsdRaw) / 1e6;

      const blockNumber = Number(legs[0].blockNumber);
      const blockTimeMs = headTimeMs - (Number(head) - blockNumber) * BASE_BLOCK_TIME_MS;

      for (const leg of legs) {
        let side: IndexedTrade["side"];
        // Either AMM endpoint counts as a trade leg. The PAIR-mediated
        // leg of an NFL ↔ NFL swap is the received side; the
        // FOOTBALLFUN-mediated leg is the burned/given side. Counting
        // only the PAIR leg drops the matching swap-out row.
        if (isAmm(leg.from) && leg.to === userWallet) {
          side = isSwap ? "swap-in" : "buy";
        } else if (leg.from === userWallet && isAmm(leg.to)) {
          side = isSwap ? "swap-out" : "sell";
        } else {
          // Wallet-to-wallet (e.g. marketplace transfer) — skip, not a
          // price-discovery event.
          continue;
        }
        out.push({
          txId: txHash,
          blockNumber,
          blockTime: blockTimeMs,
          logIndex: leg.logIndex,
          tokenIdSuffix: leg.tokenIdSuffix,
          wallet: userWallet,
          side,
          shareAmount: leg.shareAmount,
          usdAmount: txUsdAmount,
        });
      }
    }

    out.sort((a, b) => b.blockTime - a.blockTime);
    cache = { ts: now, fromBlock, trades: out };
    return out;
  } catch (err) {
    console.error("[tailNflTrades] failed:", err);
    if (cache) return cache.trades;
    return [];
  }
}
