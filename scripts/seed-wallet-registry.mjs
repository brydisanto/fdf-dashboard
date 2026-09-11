#!/usr/bin/env node
/*
 * One-time seed for data/wallet-registry.json.
 *
 * Scans every TransferSingle event on FOOTBALLFUN_CONTRACT from a start
 * block (default: the contract's deployment block, 2025-11-07) to the
 * chain tip and records each wallet's FIRST NFL trade. Only the first
 * tx per wallet gets a receipt + block lookup, so the expensive part
 * scales with wallet count, not trade count.
 *
 * After this runs once and the file is committed to the `data`
 * branch, scripts/index-trades.mjs keeps it current on every cron
 * run. Re-running is safe: existing entries are only replaced by a
 * strictly earlier trade.
 *
 *   node scripts/seed-wallet-registry.mjs            # dry run, prints summary
 *   node scripts/seed-wallet-registry.mjs --write    # writes data/wallet-registry.json
 *   FROM_BLOCK=40000000 node scripts/seed-wallet-registry.mjs --write
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  readRegistry, updateRegistry, parseTransferSingle, computeNetUsd,
  fetchTransferLogs, fetchBlock, fetchReceipt, rpc, hexToNum,
  NFL_TOKEN_SET, PAIR_LC, FOOTBALLFUN_LC, LOGS_CHUNK_BLOCKS,
} from "./index-trades.mjs";

// Block in which 0x2EeF…5b56 was deployed (found by bisecting eth_getCode).
const DEPLOY_BLOCK = 37_869_067;
const FROM_BLOCK = Number(process.env.FROM_BLOCK || DEPLOY_BLOCK);
const CONCURRENCY = Number(process.env.CONCURRENCY || 6);
const ZERO = "0x0000000000000000000000000000000000000000";
const isAmm = (addr) => addr === PAIR_LC || addr === FOOTBALLFUN_LC;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

async function main() {
  const start = Date.now();
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const registryPath = path.join(repoRoot, "data", "wallet-registry.json");

  const head = hexToNum(await rpc("eth_blockNumber", [])) - 15;
  const chunks = [];
  for (let from = FROM_BLOCK; from <= head; from += LOGS_CHUNK_BLOCKS) {
    chunks.push([from, Math.min(from + LOGS_CHUNK_BLOCKS - 1, head)]);
  }
  console.error(`Scanning ${head - FROM_BLOCK + 1} blocks (${FROM_BLOCK} → ${head}) in ${chunks.length} chunks, concurrency ${CONCURRENCY}`);

  // Pass 1: every NFL share transfer, grouped by tx, keeping only the
  // earliest tx per wallet as we go (memory stays flat).
  const earliestTxByWallet = new Map(); // wallet → { txHash, blockNumber, logIndex }
  const txEntries = new Map();          // txHash → [{ log, parsed }]
  let done = 0;
  let totalLogs = 0;
  const failed = [];
  const ingest = (logs) => {
    totalLogs += logs.length;
    for (const log of logs) {
      const parsed = parseTransferSingle(log);
      if (!NFL_TOKEN_SET.has(parsed.tokenId)) continue;
      if (parsed.from === ZERO || parsed.to === ZERO) continue;
      // Only trade legs count (one side is the AMM). A wallet-to-wallet
      // transfer must not become a wallet's "first trade": pass 2 would
      // find no trade leg in that tx and the wallet would be dropped
      // from the registry entirely.
      if (!isAmm(parsed.from) && !isAmm(parsed.to)) continue;
      const candidate = isAmm(parsed.from) ? parsed.to : parsed.from;
      if (isAmm(candidate)) continue;
      const blockNumber = hexToNum(log.blockNumber);
      const logIndex = hexToNum(log.logIndex);
      const tx = log.transactionHash;
      const cur = earliestTxByWallet.get(candidate);
      if (!cur || blockNumber < cur.blockNumber || (blockNumber === cur.blockNumber && logIndex < cur.logIndex)) {
        earliestTxByWallet.set(candidate, { txHash: tx, blockNumber, logIndex });
      }
      if (!txEntries.has(tx)) txEntries.set(tx, []);
      txEntries.get(tx).push({ log, parsed });
    }
  };
  await mapLimit(chunks, CONCURRENCY, async ([from, to]) => {
    try {
      ingest(await fetchTransferLogs(from, to));
    } catch (err) {
      failed.push([from, to]);
      console.error(`  chunk ${from}..${to} failed: ${err.message}`);
    }
    done++;
    if (done % 250 === 0) {
      console.error(`  ${done}/${chunks.length} chunks · ${totalLogs} logs · ${earliestTxByWallet.size} wallets so far`);
    }
  });
  // Failed chunks were almost always rate limits under concurrency.
  // Walk them again one at a time with a pause; a chunk that still
  // fails leaves a gap that a later re-run fills.
  let unrecovered = 0;
  for (const [from, to] of failed) {
    await sleep(1500);
    try {
      ingest(await fetchTransferLogs(from, to));
      console.error(`  recovered chunk ${from}..${to}`);
    } catch (err) {
      unrecovered++;
      console.error(`  chunk ${from}..${to} failed again: ${err.message}`);
    }
  }
  console.error(`Pass 1 done: ${totalLogs} logs, ${earliestTxByWallet.size} wallets, ${failed.length} chunks retried, ${unrecovered} unrecovered`);
  if (unrecovered > 0) {
    console.error("Some chunks failed — re-run to fill gaps (existing entries are kept unless an earlier trade is found).");
  }

  // Pass 2: receipt + block for each wallet's first tx only. A tx can
  // carry legs for several wallets (batch distributions), so legs are
  // grouped per wallet rather than attributed to the first one seen.
  const firstTxs = Array.from(new Set(Array.from(earliestTxByWallet.values()).map((e) => e.txHash)));
  console.error(`Pass 2: fetching ${firstTxs.length} receipts`);
  const blockTimeCache = new Map();
  const trades = [];
  let processed = 0;
  const failedTxs = [];
  const processTx = async (txHash) => {
    const entries = txEntries.get(txHash) ?? [];
    const receipt = await fetchReceipt(txHash);
    if (!receipt) throw new Error("no receipt");
    const blockNumber = hexToNum(receipt.blockNumber);
    let blockTime = blockTimeCache.get(blockNumber);
    if (!blockTime) {
      const block = await fetchBlock(receipt.blockNumber);
      blockTime = Number(BigInt(block.timestamp)) * 1000;
      if (!blockTime) throw new Error("block timestamp missing");
      blockTimeCache.set(blockNumber, blockTime);
    }
    const legsByWallet = new Map();
    for (const e of entries) {
      const w = isAmm(e.parsed.from) ? e.parsed.to : e.parsed.from;
      if (!legsByWallet.has(w)) legsByWallet.set(w, []);
      legsByWallet.get(w).push(e);
    }
    for (const [userWallet, legs] of legsByWallet) {
      const isSwap = legs.length > 1;
      for (const { log, parsed } of legs) {
        const side = isAmm(parsed.from)
          ? (isSwap ? "swap-in" : "buy")
          : (isSwap ? "swap-out" : "sell");
        trades.push({
          txId: txHash,
          blockNumber,
          blockTime,
          logIndex: hexToNum(log.logIndex),
          tokenIdSuffix: parsed.tokenId,
          wallet: userWallet,
          side,
          shareAmount: Number(parsed.value) / 1e18,
          usdAmount: isSwap ? 0 : Math.abs(computeNetUsd(userWallet, receipt.logs)),
        });
      }
    }
  };
  await mapLimit(firstTxs, CONCURRENCY, async (txHash) => {
    try {
      await processTx(txHash);
    } catch (err) {
      failedTxs.push(txHash);
      console.error(`  tx ${txHash} failed: ${err.message}`);
    }
    processed++;
    if (processed % 250 === 0) console.error(`  ${processed}/${firstTxs.length} receipts`);
  });
  let unrecoveredTxs = 0;
  for (const txHash of failedTxs) {
    await sleep(1500);
    try {
      await processTx(txHash);
      console.error(`  recovered tx ${txHash}`);
    } catch (err) {
      unrecoveredTxs++;
      console.error(`  tx ${txHash} failed again: ${err.message}`);
    }
  }
  console.error(`Pass 2 done: ${failedTxs.length} txs retried, ${unrecoveredTxs} unrecovered`);

  const registry = await readRegistry(registryPath);
  const added = updateRegistry(registry, trades);
  registry.seededFromBlock = registry.seededFromBlock > 0
    ? Math.min(registry.seededFromBlock, FROM_BLOCK)
    : FROM_BLOCK;

  const total = Object.keys(registry.wallets).length;
  const durationMs = Date.now() - start;
  if (process.argv.includes("--write")) {
    await fs.mkdir(path.dirname(registryPath), { recursive: true });
    await fs.writeFile(registryPath, JSON.stringify(registry, null, 2) + "\n", "utf8");
    console.error(`Wrote ${total} wallets (+${added}) to ${registryPath} in ${durationMs}ms`);
  } else {
    const sample = Object.entries(registry.wallets).sort((a, b) => a[1].firstSeenAt - b[1].firstSeenAt).slice(0, 3);
    console.log(JSON.stringify({ total, added, unrecoveredChunks: unrecovered, unrecoveredTxs, durationMs, earliest: sample }, null, 2));
  }
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
