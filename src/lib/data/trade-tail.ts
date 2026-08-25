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
//
// Sized to the real indexer lag, not a worst case. The cron runs every
// 5 min and lands reliably (observed gaps: 8-50 min), so 90 min is
// generous headroom. The old value was 5h, which pulled 500+ txs and
// therefore 500+ receipt RPCs per scan — enough to get ~half of them
// rate-limited by the public Base RPC, which surfaced as "$0.00000/$0"
// rows in the live feed. Keeping the window tight is what actually
// fixes that; the throttle below is the safety net.
const MAX_TAIL_BLOCKS = 90 * 30; // ~90 min of blocks on Base (2s blocks)

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

    // Pull a receipt per tx so USDC attribution can sum every USDC
    // Transfer the user is involved in, regardless of counterparty.
    //
    // THROTTLED, with retry. This used to be a single Promise.all over
    // every tx in the window. MAX_TAIL_BLOCKS is ~5h of blocks, which
    // in practice is 500+ txs, so the tail fired 500+ concurrent
    // eth_getTransactionReceipt calls at the public Base RPC. It
    // rate-limited roughly half of them, each rejection was swallowed
    // by `.catch(() => null)`, and every affected trade silently lost
    // its USDC moves — rendering "$0.00000 / $0" in the live feed while
    // still showing a correct share amount. Measured: 574 concurrent
    // calls -> 272 failures (~47%), matching the ~53/75 zero rows.
    //
    // A small concurrency window plus one retry keeps the whole batch
    // under the rate limit. Failures are counted, not silently
    // discarded, so a degraded RPC is visible in the logs instead of
    // quietly turning into $0 rows.
    // Cap by TX COUNT, not just block span. Volume is bursty — a quiet
    // 10-min window is ~12 txs, but a busy hour is 500+. Only the newest
    // trades actually need USD attribution here: the feed renders 75
    // rows and anything older is already in the indexed snapshot with a
    // real usdAmount. Fetching receipts for the whole burst is what
    // pushed the RPC into rate-limiting. Newest-first so the cap drops
    // the oldest (already-covered) txs; those still return a trade, and
    // indexedToTrade values them at spot rather than $0.
    const allTxHashes = Array.from(legsByTx.keys());
    const txOrder = new Map<string, number>();
    for (const [tx, legs] of legsByTx) {
      txOrder.set(tx, Math.max(...legs.map((l) => Number(l.blockNumber))));
    }
    const MAX_RECEIPT_TXS = 120;
    const txHashes = allTxHashes
      .sort((a, b) => (txOrder.get(b) ?? 0) - (txOrder.get(a) ?? 0))
      .slice(0, MAX_RECEIPT_TXS);
    const RECEIPT_CONCURRENCY = 8;
    let receiptFailures = 0;
    const receipts: (Awaited<ReturnType<typeof client.getTransactionReceipt>> | null)[] =
      new Array(txHashes.length).fill(null);

    const fetchReceipt = async (hash: string) => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          return await client.getTransactionReceipt({ hash: hash as `0x${string}` });
        } catch {
          // Brief backoff before the single retry; most failures here
          // are transient rate-limits rather than missing receipts.
          if (attempt === 0) await new Promise((r) => setTimeout(r, 250));
        }
      }
      receiptFailures++;
      return null;
    };

    for (let i = 0; i < txHashes.length; i += RECEIPT_CONCURRENCY) {
      const slice = txHashes.slice(i, i + RECEIPT_CONCURRENCY);
      const batch = await Promise.all(slice.map((h) => fetchReceipt(h)));
      for (let k = 0; k < batch.length; k++) receipts[i + k] = batch[k];
    }
    if (receiptFailures > 0) {
      console.error(
        `[trade-tail] ${receiptFailures}/${txHashes.length} receipts failed after retry — ` +
        `those trades will fall back to spot pricing rather than showing $0.`,
      );
    }
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

      // Compute net USDC for this trade.
      //
      // Primary: net against the user's own wallet. Exact when the user
      // pays the AMM directly.
      //
      // Fallback: net against the AMM side (PAIR / proxy). Many trades
      // route USDC through an intermediary — an aggregator, a smart
      // wallet, or a relayer — so no USDC Transfer ever touches the
      // address that received the shares. Wallet-side netting then sums
      // to zero and the row rendered "$0.00000 / $0" in the live feed
      // even though the trade had real value. The AMM leg is always
      // present (that's where the liquidity moves), so netting on it
      // recovers the amount. Fee legs paid out of the pool are included,
      // so this is the gross trade value — matching what the batch
      // indexer records for directly-routed trades.
      const moves = usdcByTx.get(txHash) ?? [];
      let netUsdRaw = 0n;
      for (const m of moves) {
        if (m.from === userWallet) netUsdRaw += m.value;
        if (m.to === userWallet) netUsdRaw -= m.value;
      }
      if (netUsdRaw === 0n) {
        for (const m of moves) {
          if (isAmm(m.to) && !isAmm(m.from)) netUsdRaw += m.value;   // into pool = buy
          if (isAmm(m.from) && !isAmm(m.to)) netUsdRaw -= m.value;   // out of pool = sell
        }
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
