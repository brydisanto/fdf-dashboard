#!/usr/bin/env node
/*
 * Indexer for the FDF buyback wallet.
 *
 * The cycle, in three steps:
 *   1. a treasury address sends the wallet USDC
 *   2. the wallet spends it into the FDF pair, buying back a BASKET of
 *      player shares that arrive as one ERC-1155 TransferBatch
 *   3. the wallet returns those shares to the treasury (the share
 *      contract), with no USDC coming back
 *
 * The shares are returned, not burned. The wallet's own balance is only
 * what it holds between a buy and the next return, so it is a small
 * fraction of what it has bought back.
 *
 * Three record types come out of a scan:
 *   funding — USDC into the wallet from anywhere other than the pair
 *   buy     — USDC out to the pair, refund netted off, shares received
 *   return  — shares sent back to the treasury, no USDC in return
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
import {
  rpc, hexToNum, parseTransferBatch, parseTransferSingle,
  ERC1155_TRANSFER_SINGLE, ERC1155_TRANSFER_BATCH,
} from "./index-trades.mjs";

const BUYBACK_WALLET = "0xd9dd74e1109fa6fb8772706594bcabfbedfb706d";
// First block in which the wallet had a nonce (found by bisecting
// eth_getTransactionCount). Nothing to scan before this.
const DEPLOY_BLOCK = 38_903_380;

const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const PAIR = "0x4fdce033b9f30019337ddc5cc028dc023580585e";
const PROXY = "0x2eef466e802ab2835ab81be63eebc55167d35b56";
const ERC20_TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
// Imported rather than redeclared: a local copy of the batch hash is
// exactly how this scan silently recorded zero shares for months of
// buys while the shared constant was already fixed.
const TRANSFER_SINGLE = ERC1155_TRANSFER_SINGLE;
const TRANSFER_BATCH = ERC1155_TRANSFER_BATCH;
// Emitted by the pair for every basket trade. Its data is five parallel
// arrays, one entry per player in the basket: token id, shares, USDC
// paid for that player (6dp), a small pool fee, and the protocol fee.
// The USDC array sums exactly to the buy's net spend, so it gives the
// real cost per player rather than an estimate. Buyer is topic 1.
const PAIR_TRADE_EVENT = "0x687289c2856f43779157318472d0a835253d93a290e03ee79b9e27b0e403493d";

const CHUNK = 2000;
// The public Base RPC caps eth_getLogs at 2,000 blocks and rate-limits
// hard, and every alternative endpoint is worse (50-block caps, no
// archive access, or getLogs unsupported). Keep few requests in flight.
const CONCURRENCY = Number(process.env.CONCURRENCY || 3);
// Cold seeds sample the wallet's nonce to find the stretches where it
// was actually transacting. It has sat idle for months at a time, and
// skipping those blocks removes most of the scan.
const NONCE_PROBE_BLOCKS = 50_000;
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

  const chainHead = hexToNum(await rpc("eth_blockNumber", [])) - SAFETY_LAG;
  const from = process.env.FROM_BLOCK
    ? Number(process.env.FROM_BLOCK)
    : store.lastIndexedBlock > 0
      ? store.lastIndexedBlock + 1
      : DEPLOY_BLOCK;
  // TO_BLOCK lets a cold seed run in stages that each save, so a long
  // backfill survives being interrupted. Normal runs leave it unset.
  const head = process.env.TO_BLOCK
    ? Math.min(Number(process.env.TO_BLOCK), chainHead)
    : chainHead;

  if (from > head) {
    console.error(`Nothing to scan: indexed through ${store.lastIndexedBlock}, head ${head}.`);
    return;
  }

  // Split the scan by what the wallet must sign.
  //
  // OUTFLOWS (USDC spent, shares returned) need a transaction from the
  // wallet, so its nonce moves. Probing the nonce finds every block range
  // where that can have happened, and the rest can be skipped safely.
  //
  // INFLOWS (treasury funding, shares sent in) need nothing from the
  // wallet — its nonce stays put. Skipping by nonce once hid ~$29K of
  // funding this way, so inflows are always scanned across every block.
  // That costs three queries per chunk instead of seven, which keeps a
  // cold seed affordable.
  const useProbe = process.env.FULL_SCAN !== "1" && (head - from) > 10 * NONCE_PROBE_BLOCKS;
  const active = useProbe ? await activeRanges(from, head) : [[from, head]];
  const chunks = [];
  const pushChunks = (a, b, mode) => {
    for (let f = a; f <= b; f += CHUNK) chunks.push([f, Math.min(f + CHUNK - 1, b), mode]);
  };
  let cursor = from;
  for (const [a, b] of active) {
    if (a > cursor) pushChunks(cursor, a - 1, "inflow");
    pushChunks(a, b, "full");
    cursor = b + 1;
  }
  if (cursor <= head) pushChunks(cursor, head, "inflow");
  const fullChunks = chunks.filter((c) => c[2] === "full").length;
  console.error(
    `Scanning ${head - from + 1} blocks (${from} → ${head}): ` +
    `${fullChunks} full chunks across ${active.length} active range(s), ` +
    `${chunks.length - fullChunks} inflow-only chunks`,
  );

  // Pass 1: every USDC leg touching the wallet, plus the share batches
  // it received. Grouped by tx so a buy's spend, refund and shares end
  // up on one record.
  const txs = new Map();
  const failed = [];
  let done = 0;

  const touch = (hash, block) => {
    let t = txs.get(hash);
    if (!t) txs.set(hash, (t = { hash, block, usdcOut: 0, usdcIn: 0, usdcFromPair: 0, funders: new Set(), shares: 0, tokens: 0, sharesOut: 0, tokensOut: 0, perToken: null }));
    return t;
  };

  const ingest = async ([a, b, mode]) => {
    const range = { fromBlock: "0x" + a.toString(16), toBlock: "0x" + b.toString(16) };
    const full = mode !== "inflow";
    // Sequential, not Promise.all: several parallel getLogs per chunk
    // times the worker count overwhelmed the public RPC and every chunk
    // came back rate-limited.
    const out = full ? await rpc("eth_getLogs", [{ ...range, address: USDC, topics: [ERC20_TRANSFER, topicAddr(BUYBACK_WALLET), null] }]) : [];
    const inc = await rpc("eth_getLogs", [{ ...range, address: USDC, topics: [ERC20_TRANSFER, null, topicAddr(BUYBACK_WALLET)] }]);
    const batch = await rpc("eth_getLogs", [{ ...range, address: PROXY, topics: [TRANSFER_BATCH, null, null, topicAddr(BUYBACK_WALLET)] }]);
    const single = await rpc("eth_getLogs", [{ ...range, address: PROXY, topics: [TRANSFER_SINGLE, null, null, topicAddr(BUYBACK_WALLET)] }]);
    // Returns carry no USDC at all, so they can only be found by asking
    // for share movements OUT of the wallet. Outflows need the wallet to
    // sign, so they only occur inside nonce-active ranges.
    const batchOut = full ? await rpc("eth_getLogs", [{ ...range, address: PROXY, topics: [TRANSFER_BATCH, null, topicAddr(BUYBACK_WALLET), null] }]) : [];
    const singleOut = full ? await rpc("eth_getLogs", [{ ...range, address: PROXY, topics: [TRANSFER_SINGLE, null, topicAddr(BUYBACK_WALLET), null] }]) : [];
    // Buys are wallet-signed, so the per-player breakdown is only needed
    // inside nonce-active ranges.
    const trades = full ? await rpc("eth_getLogs", [{ ...range, address: PAIR, topics: [PAIR_TRADE_EVENT, topicAddr(BUYBACK_WALLET)] }]) : [];
    for (const l of trades) {
      const t = touch(l.transactionHash, hexToNum(l.blockNumber));
      const per = t.perToken ?? (t.perToken = new Map());
      for (const leg of parsePairTrade(l)) {
        const cur = per.get(leg.tokenId) ?? { shares: 0, usd: 0 };
        cur.shares += leg.shares;
        cur.usd += leg.usd;
        per.set(leg.tokenId, cur);
      }
    }
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
    for (const l of batchOut) {
      const t = touch(l.transactionHash, hexToNum(l.blockNumber));
      for (const leg of parseTransferBatch(l)) {
        const shares = Number(leg.value) / 1e18;
        if (shares > 0) { t.sharesOut += shares; t.tokensOut++; }
      }
    }
    for (const l of singleOut) {
      const t = touch(l.transactionHash, hexToNum(l.blockNumber));
      const shares = Number(parseTransferSingle(l).value) / 1e18;
      if (shares > 0) { t.sharesOut += shares; t.tokensOut++; }
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
    if (t.usdcOut === 0 && t.usdcIn === 0 && t.sharesOut > 0) {
      // Shares go back to the treasury and no USDC moves.
      fresh.push({
        kind: "return",
        block: t.block,
        ts,
        tx: t.hash,
        shares: round(t.sharesOut, 4),
        tokens: t.tokensOut,
      });
    } else if (t.usdcOut > 0) {
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
    } else if (t.usdcOut === 0 && t.usdcIn === 0 && t.shares > 0) {
      // Shares arrive with no USDC moving: someone transferred them in
      // rather than the wallet buying them. Without this branch such a
      // tx matches nothing and is silently dropped, which makes shares
      // bought minus returned disagree with the on-chain balance.
      fresh.push({
        kind: "inflow",
        block: t.block,
        ts,
        tx: t.hash,
        shares: round(t.shares, 4),
        tokens: t.tokens,
      });
    } else if (t.usdcIn > 0.005 && t.funders.size > 0) {
      // Above a cent: zero-value USDC transfers land here otherwise and
      // show up as meaningless "+$0" funding rows.
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

  const known = new Set(store.events.map((e) => e.tx));
  const merged = new Map(store.events.map((e) => [e.tx, e.kind === "burn" ? { ...e, kind: "return" } : e]));
  for (const e of fresh) merged.set(e.tx, e);
  const events = [...merged.values()].sort((a, b) => a.block - b.block);

  // Cumulative buybacks per player. Kept as a running aggregate rather
  // than per-buy legs: ~4,600 baskets x ~28 players would push the file
  // past the 2MB fetch-cache ceiling. Only txs this run has not seen
  // before are added, so re-scanning an overlapping range is safe.
  //
  // An index written before this existed has buys but no aggregate, and
  // can never be completed incrementally; it is flagged incomplete so
  // the page can say so instead of showing partial totals as the truth.
  const hadAggregate = store.players && typeof store.players === "object";
  const players = hadAggregate ? structuredClone(store.players) : {};
  const playersComplete = hadAggregate ? store.playersComplete !== false : store.events.length === 0;
  for (const e of fresh) {
    if (e.kind !== "buy" || known.has(e.tx)) continue;
    const per = txs.get(e.tx)?.perToken;
    if (!per) continue;
    for (const [tokenId, leg] of per) {
      const p = players[tokenId] ?? (players[tokenId] = { shares: 0, usd: 0, baskets: 0, firstTs: e.ts, lastTs: e.ts });
      p.shares = round(p.shares + leg.shares, 4);
      p.usd = round(p.usd + leg.usd, 4);
      p.baskets += 1;
      if (e.ts < p.firstTs) p.firstTs = e.ts;
      if (e.ts > p.lastTs) p.lastTs = e.ts;
    }
  }

  // Holdings are read AT the block we indexed through, not at "latest".
  // Reading the tip instead compares a balance against events that stop
  // earlier, and while the wallet is actively buying that difference
  // looks exactly like missing data — it cost several full rescans to
  // realise the numbers were fine and the comparison was not.
  const holdings = await readHoldings(repoRoot, "0x" + head.toString(16));

  const out = {
    wallet: BUYBACK_WALLET,
    seededFromBlock: store.seededFromBlock > 0 ? Math.min(store.seededFromBlock, from) : from,
    // Only claim coverage we actually scanned. A staged seed advances
    // to its TO_BLOCK; the next stage resumes from there.
    lastIndexedBlock: unrecovered > 0 ? Math.max(store.lastIndexedBlock, from - 1) : head,
    updatedAt: Date.now(),
    usdcBalance: await usdcBalance("0x" + head.toString(16)),
    holdings,
    players,
    playersComplete,
    events,
  };

  const buys = events.filter((e) => e.kind === "buy");
  // "burn" is the label earlier runs wrote for the same event.
  const returns = events.filter((e) => e.kind === "return" || e.kind === "burn");
  const inflows = events.filter((e) => e.kind === "inflow");
  const sharesBought = buys.reduce((a, e) => a + e.shares, 0);
  const sharesReturned = returns.reduce((a, e) => a + e.shares, 0);
  const sharesIn = inflows.reduce((a, e) => a + e.shares, 0);
  const summary = {
    events: events.length,
    buys: buys.length,
    returns: returns.length,
    funding: events.filter((e) => e.kind === "funding").length,
    deployedUsd: round(buys.reduce((a, e) => a + e.netUsd, 0)),
    inflows: inflows.length,
    sharesBought: round(sharesBought, 1),
    sharesReturned: round(sharesReturned, 1),
    sharesTransferredIn: round(sharesIn, 1),
    // Should land close to the live holdings read; a big gap means a
    // share path the scan is still missing.
    impliedFloat: round(sharesBought + sharesIn - sharesReturned, 1),
    heldNow: round(holdings.reduce((a, h) => a + h.shares, 0), 1),
    // The same check on the dollar side: every USDC funded minus every
    // USDC deployed should be what the wallet still holds at this block.
    // This is the check that exposed the funding the nonce skip missed.
    fundedUsd: round(events.filter((e) => e.kind === "funding").reduce((a, e) => a + e.usdcIn, 0)),
    impliedUsdc: round(
      events.filter((e) => e.kind === "funding").reduce((a, e) => a + e.usdcIn, 0) -
      buys.reduce((a, e) => a + e.netUsd, 0),
    ),
    usdcNow: out.usdcBalance,
    // Per-player totals must add back up to the buy totals.
    playersComplete,
    players: Object.keys(players).length,
    playerSharesSum: round(Object.values(players).reduce((a, p) => a + p.shares, 0), 1),
    playerUsdSum: round(Object.values(players).reduce((a, p) => a + p.usd, 0)),
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

/**
 * Block ranges in which the wallet's nonce actually moved. Probing the
 * nonce is one cheap call per sample and lets a cold seed skip the long
 * dormant stretches instead of paying 2,000-block getLogs across them.
 * Boundary samples are kept so a range always covers the transactions
 * that fall between two probes.
 */
async function activeRanges(from, head) {
  const points = [];
  for (let b = from; b < head; b += NONCE_PROBE_BLOCKS) points.push(b);
  points.push(head);

  const nonces = new Array(points.length);
  let next = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < points.length) {
      const i = next++;
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          nonces[i] = hexToNum(await rpc("eth_getTransactionCount", [BUYBACK_WALLET, "0x" + points[i].toString(16)]));
          break;
        } catch { await sleep(500 * (attempt + 1)); }
      }
    }
  }));

  const ranges = [];
  for (let i = 1; i < points.length; i++) {
    const a = nonces[i - 1];
    const b = nonces[i];
    // Unknown nonce (probe failed) is treated as active so a failed
    // probe can never silently drop a block range.
    if (a === undefined || b === undefined || b > a) {
      const start = points[i - 1];
      const end = Math.min(points[i], head);
      const last = ranges[ranges.length - 1];
      if (last && start <= last[1] + 1) last[1] = end;
      else ranges.push([start, end]);
    }
  }
  return ranges;
}

/**
 * Decode the pair's basket-trade event. Data is five ABI-encoded
 * dynamic uint256 arrays of equal length: token ids, shares (18dp),
 * USDC paid per player (6dp), pool fee, protocol fee.
 */
function parsePairTrade(log) {
  const d = log.data.slice(2);
  const word = (i) => BigInt("0x" + d.slice(i * 64, (i + 1) * 64));
  const heads = [0, 1, 2].map((i) => Number(word(i)) / 32);
  const read = (h) => {
    const n = Number(word(h));
    return Array.from({ length: n }, (_, k) => word(h + 1 + k));
  };
  const [ids, shares, usd] = heads.map(read);
  return ids.map((id, k) => ({
    tokenId: id.toString(),
    shares: Number(shares[k] ?? 0n) / 1e18,
    usd: Number(usd[k] ?? 0n) / 1e6,
  }));
}

function round(n, dp = 2) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

async function usdcBalance(blockTag = "latest") {
  const data = "0x70a08231" + "0".repeat(24) + BUYBACK_WALLET.slice(2);
  const res = await rpc("eth_call", [{ to: USDC, data }, blockTag]);
  return round(Number(BigInt(res || "0x0")) / 1e6);
}

// balanceOfBatch across the whole roster in one call.
async function readHoldings(repoRoot, blockTag = "latest") {
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

  const res = await rpc("eth_call", [{ to: PROXY, data }, blockTag]);
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
