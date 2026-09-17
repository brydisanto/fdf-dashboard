#!/usr/bin/env node
/*
 * Indexer for the FDF buyback wallet.
 *
 * The wallet (an EOA) is funded with USDC from a treasury address, then
 * spends it into the FDF pair. Each spend is a single call that buys a
 * BASKET of player shares — they arrive as one ERC-1155 TransferBatch,
 * which is why a scanner that only reads TransferSingle sees nothing.
 * The shares are accumulated, not flipped.
 *
 * Two record types come out of a scan:
 *   funding — USDC into the wallet from anywhere other than the pair
 *   buy     — USDC out to the pair, with the refund netted off and the
 *             shares received in the same tx
 *
 * Output: data/buyback.json on the `data` branch, read by /buyback.
 *
 *   node scripts/index-buyback.mjs            # dry run, prints a summary
 *   node scripts/index-buyback.mjs --write    # writes data/buyback.json
 *   FROM_BLOCK=51400000 node scripts/index-buyback.mjs --write
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rpc, hexToNum, parseTransferBatch, parseTransferSingle } from "./index-trades.mjs";

const BUYBACK_WALLET = "0xd9dd74e1109fa6fb8772706594bcabfbedfb706d";
// First block in which the wallet had a nonce (found by bisecting
// eth_getTransactionCount). Nothing to scan before this.
const DEPLOY_BLOCK = 38_903_380;

const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const PAIR = "0x4fdce033b9f30019337ddc5cc028dc023580585e";
const PROXY = "0x2eef466e802ab2835ab81be63eebc55167d35b56";
const ERC20_TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TRANSFER_SINGLE = "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62";
const TRANSFER_BATCH = "0x4a39dc06d4c0dbc64b50af327290419e7f3a59c70ce5e23b9c0aef89ae40b0a3";

const CHUNK = 2000;
const CONCURRENCY = Number(process.env.CONCURRENCY || 6);
const SAFETY_LAG = 15;
const topicAddr = (a) => "0x" + "0".repeat(24) + a.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function mapLimit(items, limit, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]);
  }));
}

async function readStore(file) {
  try {
    const parsed = JSON.parse(await fs.readFile(file, "utf8"));
    if (Array.isArray(parsed.events) && typeof parsed.lastIndexedBlock === "number") return parsed;
  } catch { /* fall through */ }
  return { lastIndexedBlock: 0, events: [], holdings: [], updatedAt: 0 };
}

async function main() {
  const started = Date.now();
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const outPath = path.join(repoRoot, "data", "buyback.json");
  const store = await readStore(outPath);

  const head = hexToNum(await rpc("eth_blockNumber", [])) - SAFETY_LAG;
  const from = process.env.FROM_BLOCK
    ? Number(process.env.FROM_BLOCK)
    : store.lastIndexedBlock > 0
      ? store.lastIndexedBlock + 1
      : DEPLOY_BLOCK;

  if (from > head) {
    console.error(`Nothing to scan: indexed through ${store.lastIndexedBlock}, head ${head}.`);
    return;
  }

  const chunks = [];
  for (let f = from; f <= head; f += CHUNK) chunks.push([f, Math.min(f + CHUNK - 1, head)]);
  console.error(`Scanning ${head - from + 1} blocks (${from} → ${head}) in ${chunks.length} chunks`);

  // Pass 1: every USDC leg touching the wallet, plus the share batches
  // it received. Grouped by tx so a buy's spend, refund and shares end
  // up on one record.
  const txs = new Map();
  const failed = [];
  let done = 0;

  const touch = (hash, block) => {
    let t = txs.get(hash);
    if (!t) txs.set(hash, (t = { hash, block, usdcOut: 0, usdcIn: 0, usdcFromPair: 0, funders: new Set(), shares: 0, tokens: 0 }));
    return t;
  };

  const ingest = async ([a, b]) => {
    const range = { fromBlock: "0x" + a.toString(16), toBlock: "0x" + b.toString(16) };
    const [out, inc, batch, single] = await Promise.all([
      rpc("eth_getLogs", [{ ...range, address: USDC, topics: [ERC20_TRANSFER, topicAddr(BUYBACK_WALLET), null] }]),
      rpc("eth_getLogs", [{ ...range, address: USDC, topics: [ERC20_TRANSFER, null, topicAddr(BUYBACK_WALLET)] }]),
      rpc("eth_getLogs", [{ ...range, address: PROXY, topics: [TRANSFER_BATCH, null, null, topicAddr(BUYBACK_WALLET)] }]),
      rpc("eth_getLogs", [{ ...range, address: PROXY, topics: [TRANSFER_SINGLE, null, null, topicAddr(BUYBACK_WALLET)] }]),
    ]);
    for (const l of out) {
      const t = touch(l.transactionHash, hexToNum(l.blockNumber));
      t.usdcOut += Number(BigInt(l.data)) / 1e6;
    }
    for (const l of inc) {
      const t = touch(l.transactionHash, hexToNum(l.blockNumber));
      const sender = ("0x" + l.topics[1].slice(26)).toLowerCase();
      const amt = Number(BigInt(l.data)) / 1e6;
      t.usdcIn += amt;
      if (sender === PAIR) t.usdcFromPair += amt;
      else t.funders.add(sender);
    }
    for (const l of batch) {
      const t = touch(l.transactionHash, hexToNum(l.blockNumber));
      for (const leg of parseTransferBatch(l)) {
        const shares = Number(leg.value) / 1e18;
        if (shares > 0) { t.shares += shares; t.tokens++; }
      }
    }
    for (const l of single) {
      const t = touch(l.transactionHash, hexToNum(l.blockNumber));
      const p = parseTransferSingle(l);
      const shares = Number(p.value) / 1e18;
      if (shares > 0) { t.shares += shares; t.tokens++; }
    }
  };

  await mapLimit(chunks, CONCURRENCY, async (c) => {
    try { await ingest(c); } catch (err) { failed.push(c); }
    if (++done % 250 === 0) console.error(`  ${done}/${chunks.length} chunks · ${txs.size} txs`);
  });
  let unrecovered = 0;
  for (const c of failed) {
    await sleep(1200);
    try { await ingest(c); } catch { unrecovered++; console.error(`  chunk ${c[0]} failed twice`); }
  }
  console.error(`Pass 1: ${txs.size} txs, ${failed.length} chunks retried, ${unrecovered} unrecovered`);

  // Pass 2: block timestamps, one lookup per distinct block.
  const blocks = [...new Set([...txs.values()].map((t) => t.block))];
  console.error(`Pass 2: ${blocks.length} block timestamps`);
  const times = new Map();
  await mapLimit(blocks, CONCURRENCY, async (bn) => {
    for (let i = 0; i < 3; i++) {
      try {
        const b = await rpc("eth_getBlockByNumber", ["0x" + bn.toString(16), false]);
        times.set(bn, Number(BigInt(b.timestamp)) * 1000);
        return;
      } catch { await sleep(600 * (i + 1)); }
    }
  });

  const fresh = [];
  for (const t of txs.values()) {
    const ts = times.get(t.block);
    if (!ts) continue;
    if (t.usdcOut > 0) {
      // A spend into the pair. The refund is change from the basket
      // quote, so the real outlay is spend minus refund.
      fresh.push({
        kind: "buy",
        block: t.block,
        ts,
        tx: t.hash,
        usdcSpent: round(t.usdcOut),
        usdcRefund: round(t.usdcFromPair),
        netUsd: round(t.usdcOut - t.usdcFromPair),
        shares: round(t.shares, 4),
        tokens: t.tokens,
      });
    } else if (t.usdcIn > 0 && t.funders.size > 0) {
      fresh.push({
        kind: "funding",
        block: t.block,
        ts,
        tx: t.hash,
        usdcIn: round(t.usdcIn),
        from: [...t.funders][0],
      });
    }
  }

  const merged = new Map(store.events.map((e) => [e.tx, e]));
  for (const e of fresh) merged.set(e.tx, e);
  const events = [...merged.values()].sort((a, b) => a.block - b.block);

  // Current holdings, read live so the page always shows a real
  // position rather than one derived from summed events.
  const holdings = await readHoldings(repoRoot);

  const out = {
    wallet: BUYBACK_WALLET,
    seededFromBlock: store.seededFromBlock > 0 ? Math.min(store.seededFromBlock, from) : from,
    lastIndexedBlock: unrecovered > 0 ? Math.max(store.lastIndexedBlock, from - 1) : head,
    updatedAt: Date.now(),
    usdcBalance: await usdcBalance(),
    holdings,
    events,
  };

  const buys = events.filter((e) => e.kind === "buy");
  const summary = {
    events: events.length,
    buys: buys.length,
    funding: events.length - buys.length,
    deployedUsd: round(buys.reduce((a, e) => a + e.netUsd, 0)),
    sharesBought: round(buys.reduce((a, e) => a + e.shares, 0), 1),
    playersHeld: holdings.length,
    durationMs: Date.now() - started,
  };

  if (process.argv.includes("--write")) {
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, JSON.stringify(out, null, 2) + "\n", "utf8");
    console.error(`Wrote ${events.length} events (indexed through ${out.lastIndexedBlock}) in ${summary.durationMs}ms`);
    console.error(JSON.stringify(summary));
  } else {
    console.log(JSON.stringify({ ...summary, sample: events.slice(-4) }, null, 2));
  }
}

function round(n, dp = 2) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

async function usdcBalance() {
  const data = "0x70a08231" + "0".repeat(24) + BUYBACK_WALLET.slice(2);
  const res = await rpc("eth_call", [{ to: USDC, data }, "latest"]);
  return round(Number(BigInt(res || "0x0")) / 1e6);
}

// balanceOfBatch across the whole roster in one call.
async function readHoldings(repoRoot) {
  const rosterPath = path.join(repoRoot, "src", "lib", "data", "roster.ts");
  const src = await fs.readFile(rosterPath, "utf8");
  const rows = [...src.matchAll(/\[\s*"([a-z0-9-]+)",\s*"([^"]+)",\s*"(QB|RB|WR|TE)",\s*"([A-Z]+)",[^\]]*?"(\d+)"\s*\]/g)]
    .map((m) => ({ id: m[1], name: m[2], position: m[3], team: m[4], tokenIdSuffix: m[5] }));
  if (rows.length === 0) return [];

  const enc = (n) => n.toString(16).padStart(64, "0");
  let data = "0x4e1273f4" + enc(64n) + enc(BigInt(64 + 32 + 32 * rows.length)) + enc(BigInt(rows.length));
  for (const _ of rows) data += "0".repeat(24) + BUYBACK_WALLET.slice(2);
  data += enc(BigInt(rows.length));
  for (const r of rows) data += enc(BigInt(r.tokenIdSuffix));

  const res = await rpc("eth_call", [{ to: PROXY, data }, "latest"]);
  const body = res.slice(2 + 128);
  const out = [];
  rows.forEach((r, i) => {
    const shares = Number(BigInt("0x" + body.slice(i * 64, (i + 1) * 64))) / 1e18;
    if (shares > 0) out.push({ playerId: r.id, tokenIdSuffix: r.tokenIdSuffix, shares: round(shares, 4) });
  });
  return out.sort((a, b) => b.shares - a.shares);
}

main().catch((err) => {
  console.error("Buyback indexer failed:", err);
  process.exit(1);
});
