#!/usr/bin/env node
/*
 * Standalone NFL trade event indexer.
 *
 * Phase 2 of the on-chain migration: replace Tenero's /trades endpoints
 * with our own event-log index. Scans ERC-1155 TransferSingle events
 * from the FOOTBALLFUN_CONTRACT on Base, filters to NFL token IDs,
 * fetches per-tx receipts to derive USD amounts from USDC transfers,
 * and persists to data/trade-history.json on the data branch.
 *
 * Runs from GitHub Actions cron every ~5 minutes. Cold-start scans
 * back ~7 days (~302k blocks at 2s/block on Base). Incremental updates
 * scan only blocks since lastIndexedBlock — usually 150-200 blocks per
 * run, so the steady-state cost is tiny.
 *
 * Local dry-run (prints summary, doesn't write):
 *   node scripts/index-trades.mjs
 *
 * Local write:
 *   node scripts/index-trades.mjs --write
 *
 * Output schema:
 *   {
 *     lastIndexedBlock: number,
 *     trades: Array<{
 *       txId: string,
 *       blockNumber: number,
 *       blockTime: number,       // unix ms
 *       logIndex: number,
 *       tokenIdSuffix: string,
 *       wallet: string,          // user wallet (lowercase)
 *       side: "buy" | "sell" | "swap-in" | "swap-out",
 *       shareAmount: number,     // shares moved (decimal-adjusted)
 *       usdAmount: number,       // USD value of the trade
 *     }>
 *   }
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FOOTBALLFUN_CONTRACT = "0x2EeF466e802Ab2835aB81BE63eEbc55167d35b56";
const PAIR = "0x4Fdce033b9F30019337dDC5cC028DC023580585e";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const FOOTBALLFUN_LC = FOOTBALLFUN_CONTRACT.toLowerCase();
const PAIR_LC = PAIR.toLowerCase();
const USDC_LC = USDC.toLowerCase();

const ERC1155_TRANSFER_SINGLE =
  "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62";
const ERC1155_TRANSFER_BATCH =
  "0x4a39dc06d4c0dbc64b50af327290419e7f3a59c70ce5e23b9c0aef89ae40b0a3";
const ERC20_TRANSFER =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";

// Cold-start: 30 days × 24h × 1800 blocks/h (2s/block) = 1,296,000 blocks.
// Matches HISTORY_LIMIT_MS so the cold-start fills the full retention
// window. Big initial scan but only runs once.
const COLD_START_LOOKBACK_BLOCKS = 30 * 24 * 1800;
const HISTORY_LIMIT_MS = 30 * 24 * 3600 * 1000; // keep last 30 days

// If the existing file's earliest trade isn't 30 days old yet, treat
// this run as a backfill — scan from (now - 30d) back to the existing
// earliest block and merge. Subsequent runs are normal incremental.
const BACKFILL_TARGET_MS = HISTORY_LIMIT_MS;

// eth_getLogs max range on public Base RPC. Some endpoints accept more,
// but 10k is the safe ceiling.
// eth_getLogs chunk size. Public Base RPC silently truncates responses
// that exceed ~10k logs — Sport.fun is busy enough that a 10k-block
// chunk can blow past that cap on active days, dropping events with
// no error. (This was the cause of missing trades like the Josh Allen
// sell at block 45,948,382: the chunk that contained it returned a
// truncated subset and the sell wasn't in it.) 2,000 blocks ≈ 70 min
// of chain time on Base — comfortably under the cap even at peak
// activity, and we still recursively split if a chunk somehow does
// hit the threshold (see fetchTransferLogs).
const LOGS_CHUNK_BLOCKS = 2_000;

// Treat any chunk that returns this many logs (or more) as suspicious
// — the RPC may have truncated. Halve the chunk and re-query the two
// halves to be safe. Effectively self-healing against the silent cap.
const LOGS_TRUNCATION_THRESHOLD = 9_500;

// Head-of-chain safety lag. Public Base RPC log indexing can lag the
// chain tip by a few blocks — if we scan up to `latestBlock` and the
// RPC hasn't indexed the most-recent logs yet, we silently miss
// trades AND advance `lastIndexedBlock` past them, losing them
// forever. Stop short of the tip and let the NEXT run pick them up.
// 15 blocks ≈ 30s at 2s/block.
const SAFETY_LAG_BLOCKS = 15;

// Roster of NFL token suffixes — must match src/lib/data/roster.ts.
const TOKEN_ID_SUFFIXES = [
  "67997479","769476837","401615555","79420307","1886297532","833812969",
  "608240281","1627881947","1733678391","646914359","88065636","403250563",
  "2050898691","1877680294","298000720","1045355498","656282335","1613245508",
  "1511237082","532139037","1229893067","1704342915","1708223670","33526712",
  "1072658622","1207389650","1561296583","1591779333","626101435","184212668",
  "1029815641","1634868202","509502421","637063064","1835372287","1096457743",
  "344873876","1694187555","1987964071","439100286","850942466","1955323065",
  "1737560144","350071857","1339944146","942484606","1809188809","1924940894",
  "2018186111","1094525731","679992678","2111895848","1957905857","892204822",
  "363339787","1631265816","1965487160","1892649533","280776288","1986714215",
  "972599423","1597935612","1257875488","268596935","202647757","708089183",
  "1049357910","543182829","1953241833","946323199","2078797761","1378093404",
];
const NFL_TOKEN_SET = new Set(TOKEN_ID_SUFFIXES);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rpc(method, params, attempt = 0) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) {
    if (attempt < 4) {
      await sleep(500 * (attempt + 1) ** 2);
      return rpc(method, params, attempt + 1);
    }
    throw new Error(`RPC ${method} failed: ${json.error.message}`);
  }
  return json.result;
}

function hexToNum(hex) {
  return Number(BigInt(hex));
}

function topicToAddress(topic) {
  return ("0x" + topic.slice(26)).toLowerCase();
}

// Parse a TransferSingle log into { tokenId, from, to, value }
function parseTransferSingle(log) {
  const from = topicToAddress(log.topics[2]);
  const to = topicToAddress(log.topics[3]);
  const tokenIdHex = log.data.slice(2, 66);
  const valueHex = log.data.slice(66, 130);
  return {
    from,
    to,
    tokenId: BigInt("0x" + tokenIdHex).toString(),
    value: BigInt("0x" + valueHex),
  };
}

// Parse an ERC-20 Transfer log into { from, to, value }
function parseErc20Transfer(log) {
  return {
    from: topicToAddress(log.topics[1]),
    to: topicToAddress(log.topics[2]),
    value: BigInt(log.data),
  };
}

/**
 * Compute the net USD spent or received by `wallet` in this tx, by
 * summing USDC Transfer events. Positive = user paid net USD.
 */
function computeNetUsd(wallet, logs) {
  const w = wallet.toLowerCase();
  let netRaw = 0n; // user-paid minus user-received, in USDC raw units (6 decimals)
  for (const log of logs) {
    if (log.address.toLowerCase() !== USDC_LC) continue;
    if (log.topics[0] !== ERC20_TRANSFER) continue;
    const t = parseErc20Transfer(log);
    if (t.from === w) netRaw += t.value;
    if (t.to === w) netRaw -= t.value;
  }
  return Number(netRaw) / 1e6;
}

// Fetch all TransferSingle logs from FOOTBALLFUN_CONTRACT in a block
// range. Self-healing: if the RPC returns at or above the truncation
// threshold for this window, halve the range and recurse — that lets
// us silently work around the public Base RPC's undocumented response
// cap without missing events.
async function fetchTransferLogs(fromBlock, toBlock) {
  const logs = await rpc("eth_getLogs", [{
    address: FOOTBALLFUN_CONTRACT,
    topics: [ERC1155_TRANSFER_SINGLE],
    fromBlock: "0x" + fromBlock.toString(16),
    toBlock: "0x" + toBlock.toString(16),
  }]);
  if (logs.length >= LOGS_TRUNCATION_THRESHOLD && toBlock > fromBlock) {
    if (process.env.GRIDIRON_VERBOSE) {
      console.error(`  ⚠ chunk ${fromBlock}..${toBlock} returned ${logs.length} logs (possible truncation) — splitting`);
    }
    const mid = Math.floor((fromBlock + toBlock) / 2);
    const [a, b] = await Promise.all([
      fetchTransferLogs(fromBlock, mid),
      fetchTransferLogs(mid + 1, toBlock),
    ]);
    return [...a, ...b];
  }
  return logs;
}

async function fetchBlock(numberHex) {
  return rpc("eth_getBlockByNumber", [numberHex, false]);
}

async function fetchReceipt(txHash) {
  return rpc("eth_getTransactionReceipt", [txHash]);
}

async function main() {
  const startWall = Date.now();
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const repoRoot = path.resolve(__dirname, "..");
  const outPath = path.join(repoRoot, "data", "trade-history.json");

  // Resume from prior snapshot if it exists.
  let existing = { lastIndexedBlock: 0, trades: [] };
  try {
    const raw = await fs.readFile(outPath, "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed?.lastIndexedBlock === "number" && Array.isArray(parsed.trades)) {
      existing = parsed;
    }
  } catch {}

  const latestHex = await rpc("eth_blockNumber", []);
  const latestBlock = hexToNum(latestHex);
  // Block we'll actually scan up to (and later persist as the new
  // lastIndexedBlock). Holding back from the tip avoids missing
  // logs that the RPC hasn't indexed yet.
  const safeLatestBlock = Math.max(0, latestBlock - SAFETY_LAG_BLOCKS);

  // We now scan TWO ranges per run, additively:
  //   1. INCREMENTAL forward scan from lastIndexedBlock+1 to chain
  //      tip — this is the recent activity that must NOT be skipped.
  //   2. BACKFILL older scan into the 30-day window — only if the
  //      file's earliest trade hasn't reached the target window yet.
  //
  // Both ranges are scanned; lastIndexedBlock is only advanced by the
  // forward scan. The previous logic was XOR (either backfill OR
  // incremental), which meant whenever the file's earliestTrade
  // happened to drift past the target as old trades aged out, the
  // backfill branch fired, scanned pre-Sport.fun blocks, found
  // nothing, and STILL advanced lastIndexedBlock to chain tip —
  // silently skipping every new block since the previous run. That
  // was the "trade feed missing recent transactions" bug.
  const ranges = [];

  // Forward / incremental range (mandatory on every run).
  let forwardFrom;
  if (existing.lastIndexedBlock <= 0) {
    forwardFrom = Math.max(0, safeLatestBlock - COLD_START_LOOKBACK_BLOCKS);
  } else {
    forwardFrom = existing.lastIndexedBlock + 1;
  }
  if (forwardFrom <= safeLatestBlock) {
    ranges.push({ kind: "forward", from: forwardFrom, to: safeLatestBlock });
  }

  // Backfill range (only when the file doesn't yet span the retention window).
  if (existing.trades.length > 0) {
    const earliestTrade = Math.min(...existing.trades.map((t) => t.blockTime));
    const targetEarliest = Date.now() - BACKFILL_TARGET_MS;
    if (earliestTrade > targetEarliest) {
      const earliestBlock = Math.min(...existing.trades.map((t) => t.blockNumber));
      const backfillFrom = Math.max(0, safeLatestBlock - Math.floor(BACKFILL_TARGET_MS / 2000));
      const backfillTo = earliestBlock - 1;
      if (backfillFrom <= backfillTo) {
        ranges.push({ kind: "backfill", from: backfillFrom, to: backfillTo });
        console.error(`Backfill needed: file earliest ${new Date(earliestTrade).toISOString()}, target ${new Date(targetEarliest).toISOString()}`);
      }
    }
  }

  // --rescan-blocks N (env GRIDIRON_RESCAN_BLOCKS=N) re-scans the
  // most recent N blocks regardless. Used to recover from past
  // truncation (RPC silently dropped logs). Dedup by (txId,
  // logIndex) makes this safe any time. Adds to the range set so
  // the forward incremental still runs alongside.
  const rescanArg = process.argv.find((a) => a.startsWith("--rescan-blocks="));
  const rescanBlocks = rescanArg
    ? parseInt(rescanArg.slice("--rescan-blocks=".length), 10)
    : process.env.GRIDIRON_RESCAN_BLOCKS
    ? parseInt(process.env.GRIDIRON_RESCAN_BLOCKS, 10)
    : 0;
  if (Number.isFinite(rescanBlocks) && rescanBlocks > 0) {
    ranges.push({
      kind: "rescan",
      from: Math.max(0, safeLatestBlock - rescanBlocks),
      to: safeLatestBlock,
    });
    console.error(`Rescan mode: re-scanning last ${rescanBlocks} blocks`);
  }

  if (ranges.length === 0) {
    console.error(`Nothing to scan: chain tip at ${safeLatestBlock}, lastIndexedBlock at ${existing.lastIndexedBlock}, file is current.`);
  }
  for (const r of ranges) {
    console.error(`Scanning blocks ${r.from} → ${r.to} (${r.to - r.from + 1} blocks) [${r.kind.toUpperCase()}]`);
  }

  // Step 1: collect all TransferSingle logs from the player share contract.
  const allLogs = [];
  for (const range of ranges) {
    for (let cursor = range.from; cursor <= range.to; cursor += LOGS_CHUNK_BLOCKS) {
      const end = Math.min(cursor + LOGS_CHUNK_BLOCKS - 1, range.to);
      const logs = await fetchTransferLogs(cursor, end);
      allLogs.push(...logs);
      if (process.env.GRIDIRON_VERBOSE) {
        console.error(`  [${range.kind}] ${cursor}..${end}: +${logs.length} logs (total ${allLogs.length})`);
      }
    }
  }
  console.error(`Found ${allLogs.length} TransferSingle logs`);

  // Filter to NFL tokens + non-noise (skip 0x0 mint/burn, skip
  // contract-internal moves where neither side is a user wallet).
  const nflLogs = [];
  for (const log of allLogs) {
    const parsed = parseTransferSingle(log);
    if (!NFL_TOKEN_SET.has(parsed.tokenId)) continue;
    // Skip mints/burns
    if (parsed.from === "0x0000000000000000000000000000000000000000") continue;
    if (parsed.to === "0x0000000000000000000000000000000000000000") continue;
    nflLogs.push({ log, parsed });
  }
  console.error(`After NFL filter: ${nflLogs.length} share transfers`);

  // Step 2: group by tx_id (multiple legs in one tx = a swap).
  const txGroups = new Map();
  for (const entry of nflLogs) {
    const tx = entry.log.transactionHash;
    if (!txGroups.has(tx)) txGroups.set(tx, []);
    txGroups.get(tx).push(entry);
  }
  console.error(`Distinct trade txs: ${txGroups.size}`);

  // Step 3: for each tx, fetch the receipt (for USDC transfers) and
  // the block (for timestamp), then build Trade records.
  const blockTimeCache = new Map();
  const newTrades = [];
  let txProcessed = 0;
  for (const [txHash, entries] of txGroups) {
    txProcessed++;
    if (process.env.GRIDIRON_VERBOSE && txProcessed % 25 === 0) {
      console.error(`  processed ${txProcessed}/${txGroups.size} txs`);
    }
    let receipt;
    try {
      receipt = await fetchReceipt(txHash);
    } catch (err) {
      console.error(`  receipt fetch failed for ${txHash}: ${err.message}`);
      continue;
    }
    if (!receipt) continue;

    const blockNumber = hexToNum(receipt.blockNumber);
    const blockNumHex = receipt.blockNumber;
    let blockTime = blockTimeCache.get(blockNumber);
    if (blockTime == null) {
      try {
        const block = await fetchBlock(blockNumHex);
        blockTime = Number(BigInt(block.timestamp)) * 1000;
        blockTimeCache.set(blockNumber, blockTime);
      } catch {
        blockTime = 0;
      }
    }

    // Determine the user wallet — it's the address on the user side of
    // each leg (NOT the AMM endpoints). Sport.fun routes share moves
    // through both PAIR (for paired trades) and FOOTBALLFUN_CONTRACT
    // (for bonding-curve mint/burn during swaps), so a leg's "AMM"
    // side can be either address.
    const isAmm = (addr) => addr === PAIR_LC || addr === FOOTBALLFUN_LC;
    let userWallet = null;
    for (const { parsed } of entries) {
      const candidate = isAmm(parsed.from) ? parsed.to : parsed.from;
      if (!isAmm(candidate)) {
        userWallet = candidate;
        break;
      }
    }
    if (!userWallet) continue; // contract-internal move, skip

    // Classify each leg's side. NFL ↔ NFL swaps emit one leg through
    // PAIR (the received side) AND one through FOOTBALLFUN_CONTRACT
    // (the burned/given side) — counting only the PAIR leg drops the
    // matching swap-out from the feed. Treat both AMM endpoints as
    // trade legs.
    const isSwap = entries.length > 1;
    for (const { log, parsed } of entries) {
      let side;
      const shares = Number(parsed.value) / 1e18;
      if (isAmm(parsed.from) && parsed.to === userWallet) {
        side = isSwap ? "swap-in" : "buy";
      } else if (parsed.from === userWallet && isAmm(parsed.to)) {
        side = isSwap ? "swap-out" : "sell";
      } else {
        // User-to-user transfer (e.g. marketplace transfer) — skip for
        // now since it's not a price-discovery event.
        continue;
      }

      // For non-swap legs the USD amount comes from the user's net
      // USDC movement. For swap legs there's no net USDC, so we use
      // 0 — the UI can derive a fair value from the current spot.
      const usdAmount = isSwap ? 0 : Math.abs(computeNetUsd(userWallet, receipt.logs));

      newTrades.push({
        txId: txHash,
        blockNumber,
        blockTime,
        logIndex: hexToNum(log.logIndex),
        tokenIdSuffix: parsed.tokenId,
        wallet: userWallet,
        side,
        shareAmount: shares,
        usdAmount,
      });
    }
  }

  // Merge with existing trades, dedupe by (txId, logIndex), trim to
  // history window.
  const cutoff = Date.now() - HISTORY_LIMIT_MS;
  const merged = new Map();
  for (const t of existing.trades) {
    if (t.blockTime >= cutoff) {
      merged.set(`${t.txId}:${t.logIndex}`, t);
    }
  }
  for (const t of newTrades) {
    if (t.blockTime >= cutoff) {
      merged.set(`${t.txId}:${t.logIndex}`, t);
    }
  }
  const trades = Array.from(merged.values()).sort((a, b) => b.blockTime - a.blockTime);

  // Advance the indexed-through pointer to whichever forward
  // boundary we actually scanned. If only backfill+rescan happened
  // (no forward range), preserve the existing pointer instead of
  // advancing — never claim coverage we didn't actually scan.
  // Cap at safeLatestBlock so the SAFETY_LAG_BLOCKS tail gets
  // picked up by the next run after the RPC indexes those logs.
  const forwardRange = ranges.find((r) => r.kind === "forward");
  const scannedForwardTo = forwardRange ? forwardRange.to : 0;
  const newLastIndexed = Math.max(existing.lastIndexedBlock, scannedForwardTo);
  const store = { lastIndexedBlock: newLastIndexed, trades };
  const json = JSON.stringify(store, null, 2) + "\n";
  const durationMs = Date.now() - startWall;

  const write = process.argv.includes("--write");
  if (write) {
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, json, "utf8");
    console.error(`Wrote ${trades.length} trades (chain tip ${latestBlock}, indexed through ${safeLatestBlock}) in ${durationMs}ms`);
  } else {
    console.log(JSON.stringify({
      lastIndexedBlock: newLastIndexed,
      newTrades: newTrades.length,
      totalTrades: trades.length,
      durationMs,
      preview: trades.slice(0, 5),
    }, null, 2));
  }
}

main().catch((err) => {
  console.error("Indexer failed:", err);
  process.exit(1);
});
