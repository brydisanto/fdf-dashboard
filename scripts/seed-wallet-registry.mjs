#!/usr/bin/env node
/*
 * One-time seed for data/wallet-registry.json.
 *
 * Records, for every wallet, the first time it ACQUIRED an NFL player
 * share — the date it joined the market. Scans the full history of
 * FOOTBALLFUN_CONTRACT from its deployment block (2025-11-07) to the
 * chain tip.
 *
 * Two rules make this match "first NFL position" rather than "first
 * trade we happened to see":
 *
 *   1. Both event shapes count. ERC-1155 emits TransferSingle AND
 *      TransferBatch; reading only the former missed every wallet that
 *      received shares in bulk.
 *   2. Every inbound leg counts, not just AMM buys — mints, AMM buys,
 *      swap-ins, and plain wallet-to-wallet transfers. A wallet that
 *      was sent shares holds an NFL position from that moment.
 *
 * It also does NOT filter to the current 76-token roster. The contract
 * is NFL-only, so a delisted player's shares are still an NFL position,
 * and skipping them would date a wallet's arrival too late.
 *
 * Only each wallet's first tx gets a receipt lookup (for USD), so the
 * expensive pass scales with wallet count, not trade count.
 *
 *   node scripts/seed-wallet-registry.mjs            # dry run, prints summary
 *   node scripts/seed-wallet-registry.mjs --write    # writes data/wallet-registry.json
 *   FROM_BLOCK=40000000 node scripts/seed-wallet-registry.mjs --write
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  readRegistry, updateRegistry, computeNetUsd, fetchAllShareMovements,
  fetchBlock, fetchReceipt, rpc, hexToNum,
  PAIR_LC, FOOTBALLFUN_LC, LOGS_CHUNK_BLOCKS, ERC1155_TRANSFER_BATCH,
} from "./index-trades.mjs";

// Block in which 0x2EeF…5b56 was deployed (found by bisecting eth_getCode).
const DEPLOY_BLOCK = 37_869_067;
const FROM_BLOCK = Number(process.env.FROM_BLOCK || DEPLOY_BLOCK);
const CONCURRENCY = Number(process.env.CONCURRENCY || 6);
const ZERO = "0x0000000000000000000000000000000000000000";
const isAmm = (addr) => addr === PAIR_LC || addr === FOOTBALLFUN_LC;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function mapLimit(items, limit, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  }));
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

  // Pass 1: earliest acquisition per wallet. Memory stays flat — one
  // record per wallet, plus the legs of the txs that produced them.
  const earliest = new Map();   // wallet → { txHash, blockNumber, logIndex, tokenId, shares, fromAmm }
  const txLegs = new Map();     // txHash → [movement]
  let done = 0, totalMovements = 0, batchLegs = 0;
  const failed = [];

  const ingest = (movements) => {
    totalMovements += movements.length;
    for (const m of movements) {
      if (m.to === ZERO || isAmm(m.to)) continue;   // burns and AMM-side legs
      if (m.to === m.from) continue;
      if (m.log.topics[0] === ERC1155_TRANSFER_BATCH) batchLegs++;
      const blockNumber = hexToNum(m.log.blockNumber);
      const logIndex = hexToNum(m.log.logIndex);
      const cur = earliest.get(m.to);
      if (!cur || blockNumber < cur.blockNumber || (blockNumber === cur.blockNumber && logIndex < cur.logIndex)) {
        earliest.set(m.to, {
          txHash: m.log.transactionHash,
          blockNumber,
          logIndex,
          tokenId: m.tokenId,
          shares: Number(m.value) / 1e18,
          fromAmm: isAmm(m.from) || m.from === ZERO,
        });
      }
      const legs = txLegs.get(m.log.transactionHash);
      if (legs) legs.push(m); else txLegs.set(m.log.transactionHash, [m]);
    }
  };

  await mapLimit(chunks, CONCURRENCY, async ([from, to]) => {
    try {
      ingest(await fetchAllShareMovements(from, to));
    } catch (err) {
      failed.push([from, to]);
      console.error(`  chunk ${from}..${to} failed: ${err.message}`);
    }
    done++;
    if (done % 250 === 0) {
      console.error(`  ${done}/${chunks.length} chunks · ${totalMovements} movements · ${earliest.size} wallets so far`);
    }
  });

  // Failed chunks are almost always rate limits under concurrency.
  // Walk them again one at a time; anything still failing leaves a gap
  // that a later re-run fills.
  let unrecovered = 0;
  for (const [from, to] of failed) {
    await sleep(1500);
    try {
      ingest(await fetchAllShareMovements(from, to));
      console.error(`  recovered chunk ${from}..${to}`);
    } catch (err) {
      unrecovered++;
      console.error(`  chunk ${from}..${to} failed again: ${err.message}`);
    }
  }
  console.error(`Pass 1: ${totalMovements} movements, ${earliest.size} wallets, ${failed.length} chunks retried, ${unrecovered} unrecovered`);

  // Pass 2: block timestamp for every first acquisition, plus a receipt
  // for AMM buys so the first trade carries a USD amount.
  const firstTxs = Array.from(new Set(Array.from(earliest.values()).map((e) => e.txHash)));
  console.error(`Pass 2: resolving ${firstTxs.length} transactions`);
  const blockTimeCache = new Map();
  const usdByTxWallet = new Map();
  let processed = 0;
  const failedTxs = [];

  const processTx = async (txHash) => {
    const legs = txLegs.get(txHash) ?? [];
    const anyFromAmm = legs.some((m) => isAmm(m.from) || m.from === ZERO);
    let receipt = null;
    if (anyFromAmm) {
      receipt = await fetchReceipt(txHash);
      if (!receipt) throw new Error("no receipt");
    }
    const blockNumber = receipt
      ? hexToNum(receipt.blockNumber)
      : hexToNum(legs[0].log.blockNumber);
    if (!blockTimeCache.has(blockNumber)) {
      const block = await fetchBlock("0x" + blockNumber.toString(16));
      const ts = Number(BigInt(block.timestamp)) * 1000;
      if (!ts) throw new Error("block timestamp missing");
      blockTimeCache.set(blockNumber, ts);
    }
    if (receipt) {
      for (const wallet of new Set(legs.map((m) => m.to))) {
        usdByTxWallet.set(`${txHash}:${wallet}`, Math.abs(computeNetUsd(wallet, receipt.logs)));
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
    if (processed % 250 === 0) console.error(`  ${processed}/${firstTxs.length} transactions`);
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
  console.error(`Pass 2: ${failedTxs.length} txs retried, ${unrecoveredTxs} unrecovered`);

  const events = [];
  for (const [wallet, e] of earliest) {
    const blockTime = blockTimeCache.get(e.blockNumber) ?? 0;
    if (!blockTime) continue;
    events.push({
      wallet,
      blockNumber: e.blockNumber,
      blockTime,
      logIndex: e.logIndex,
      txId: e.txHash,
      tokenIdSuffix: e.tokenId,
      side: e.fromAmm ? "buy" : "transfer-in",
      shareAmount: e.shares,
      usdAmount: e.fromAmm ? (usdByTxWallet.get(`${e.txHash}:${wallet}`) ?? 0) : 0,
    });
  }

  // A full seed is authoritative — it read every share movement on the
  // contract, a superset of what any previous run saw — so it REPLACES
  // the registry rather than merging into it. Merging would keep the
  // old, too-late dates produced before batch events and transfers
  // counted. Entries for wallets this scan never saw are carried over
  // only as gap insurance (a chunk that failed both attempts).
  const prior = await readRegistry(registryPath);
  const before = Object.keys(prior.wallets).length;
  const registry = { updatedAt: 0, seededFromBlock: prior.seededFromBlock, wallets: {} };
  const added = updateRegistry(registry, events);
  let carried = 0;
  for (const [addr, e] of Object.entries(prior.wallets)) {
    if (!registry.wallets[addr]) { registry.wallets[addr] = e; carried++; }
  }
  if (carried > 0) console.error(`Carried ${carried} wallets from the prior registry (not seen in this scan)`);
  registry.seededFromBlock = registry.seededFromBlock > 0
    ? Math.min(registry.seededFromBlock, FROM_BLOCK)
    : FROM_BLOCK;

  const total = Object.keys(registry.wallets).length;
  const sides = {};
  for (const e of Object.values(registry.wallets)) sides[e.firstSide] = (sides[e.firstSide] ?? 0) + 1;
  const durationMs = Date.now() - start;

  if (process.argv.includes("--write")) {
    await fs.mkdir(path.dirname(registryPath), { recursive: true });
    await fs.writeFile(registryPath, JSON.stringify(registry, null, 2) + "\n", "utf8");
    console.error(`Wrote ${total} wallets (was ${before}, +${added}) in ${durationMs}ms`);
    console.error(`First-acquisition kinds: ${JSON.stringify(sides)}`);
  } else {
    console.log(JSON.stringify({
      total, before, added, carried, batchLegs, unrecoveredChunks: unrecovered, unrecoveredTxs, sides, durationMs,
    }, null, 2));
  }
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
