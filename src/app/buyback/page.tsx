import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { getPlayers } from "@/lib/data";
import { getBuyback, BUYBACK_WALLET } from "@/lib/data/buyback";
import { Card, Pill } from "@/components/ui";
import { BuybackChart } from "@/components/LazyCharts";
import { BuybackPlayersTable } from "@/components/BuybackPlayersTable";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Sk, SkBlock } from "@/components/PageSkeleton";
import { fmtNum, fmtTimeAgo, fmtUsd, shortAddr } from "@/lib/format";

export const metadata = {
  title: "Buyback Tracker · FDF Box Score",
  description:
    "Live tracking of the FDF buyback wallet: USDC deployed over time, treasury funding, every basket of player shares bought back, and what it currently holds.",
};

// The index refreshes on a cron; 60s keeps the page close to it without
// rebuilding the rollups on every request.
export const revalidate = 60;

export default function BuybackPage() {
  return (
    <div className="mx-auto max-w-[var(--max-w)] px-5 sm:px-8 py-6 sm:py-8">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 mono-eyebrow hover:text-[var(--color-text)]"
        style={{ fontSize: "10px" }}
      >
        <ArrowLeft className="h-3 w-3" />
        Back to market
      </Link>

      {/* Hero — static so it paints immediately. */}
      <div
        className="mt-3 relative rounded-[var(--r-14)] border border-[var(--color-line)]"
        style={{ background: "linear-gradient(135deg, var(--color-bench) 0%, var(--color-press) 100%)" }}
      >
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[var(--r-14)]">
          <div
            className="absolute inset-0 opacity-60"
            style={{
              backgroundImage:
                "linear-gradient(to right, color-mix(in oklab, var(--color-text) 4%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--color-text) 4%, transparent) 1px, transparent 1px)",
              backgroundSize: "48px 48px",
            }}
          />
          <div
            aria-hidden
            className="absolute"
            style={{
              right: -100,
              top: -100,
              width: 480,
              height: 480,
              background:
                "radial-gradient(circle, color-mix(in oklab, var(--accent) 16%, transparent), transparent 70%)",
            }}
          />
        </div>
        <div
          className="relative flex flex-col gap-5 sm:gap-6"
          style={{ padding: "clamp(20px, 4vw, 32px) clamp(18px, 4vw, 32px) clamp(18px, 4vw, 28px)" }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="brand">Buyback Wallet</Pill>
            <Suspense fallback={<Sk w={120} h={22} className="rounded-full" />}>
              <StatusPill />
            </Suspense>
          </div>
          <h1
            className="m-0 text-[var(--color-text)]"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 900,
              fontSize: "clamp(30px, 3.5vw, 48px)",
              lineHeight: 1,
              letterSpacing: "-0.005em",
              textTransform: "uppercase",
            }}
          >
            Buyback Tracker
          </h1>
          <p className="m-0 max-w-[80ch] text-[var(--color-text-muted)]" style={{ fontSize: "15px" }}>
            The treasury funds this wallet with USDC, and it uses that to buy back player shares
            from the pool, a basket of players per transaction. The shares it buys are then
            returned to the treasury, so its own balance is only what it holds in between.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={`https://basescan.org/address/${BUYBACK_WALLET}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-[var(--r-8)] border border-[var(--color-line)] px-3 py-1.5 transition-colors hover:bg-[var(--color-bench)]"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.08em",
                color: "var(--color-text-muted)",
              }}
            >
              {shortAddr(BUYBACK_WALLET, 6, 6)}
              <ExternalLink className="h-3 w-3" />
            </a>
            <Link
              href={`/wallet/${BUYBACK_WALLET}`}
              className="inline-flex items-center gap-1.5 rounded-[var(--r-8)] border border-[var(--color-line)] px-3 py-1.5 transition-colors hover:bg-[var(--color-bench)]"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.08em",
                color: "var(--color-text-muted)",
              }}
            >
              Portfolio view
            </Link>
          </div>
        </div>
      </div>

      <Suspense fallback={<BodySkeleton />}>
        <Body />
      </Suspense>
    </div>
  );
}

async function load() {
  const players = await getPlayers();
  const spot = new Map(players.map((p) => [p.id, p.priceUsd]));
  const supply = new Map(players.map((p) => [p.id, p.circulatingSupply]));
  return getBuyback(spot, supply);
}

async function StatusPill() {
  const r = await load();
  if (!r.available) return <Pill tone="warn">Index not built yet</Pill>;
  // A seed still in progress can have funding but no buys yet, and
  // fmtTimeAgo(0) would read as decades.
  if (!r.lastBuyAt) return <Pill tone="muted">No buys indexed yet</Pill>;
  return (
    <Pill tone={r.activeRecently ? "gain" : "muted"}>
      {r.activeRecently ? "Actively buying" : "Idle"} · last buy{" "}
      {fmtTimeAgo(r.lastBuyAt, r.generatedAt)}
    </Pill>
  );
}

async function Body() {
  const r = await load();

  if (!r.available) {
    return (
      <Card variant="press" className="mt-4">
        <p className="m-0 text-[var(--color-text-muted)]" style={{ fontSize: 14 }}>
          The buyback index has not been written yet. It is produced by the buyback indexer and
          committed to the data branch; the first run backfills the wallet&apos;s full history.
        </p>
      </Card>
    );
  }

  const unspent = r.usdcBalance;
  const deployedPct = r.totalFundedUsd > 0 ? (r.totalDeployedUsd / r.totalFundedUsd) * 100 : 0;

  return (
    <>
      <div className="stat-strip mt-4 grid grid-cols-2 md:grid-cols-4">
        <StatCell
          label="Total Deployed"
          value={fmtUsd(r.totalDeployedUsd, { compact: true })}
          sub={`${fmtNum(r.buyCount)} buys · avg ${fmtUsd(r.avgBuyUsd, { digits: 0 })}`}
        />
        <StatCell
          label="Shares Bought Back"
          value={fmtNum(r.totalShares, { compact: true })}
          sub="Player shares, all time"
        />
        <StatCell
          label="Avg Cost / Share"
          value={r.costPerShare > 0 ? `$${r.costPerShare.toFixed(5)}` : "—"}
          sub="Deployed ÷ shares bought"
        />
        <StatCell
          label="USDC Remaining"
          value={fmtUsd(unspent, { compact: true })}
          sub={`${Math.round(deployedPct)}% of funding deployed`}
        />
      </div>

      <div className="stat-strip mt-3 grid grid-cols-2 md:grid-cols-4">
        <StatCell label="Deployed · 24h" value={fmtUsd(r.deployed24h, { compact: true })} />
        <StatCell label="Deployed · 7d" value={fmtUsd(r.deployed7d, { compact: true })} />
        <StatCell label="Deployed · 30d" value={fmtUsd(r.deployed30d, { compact: true })} />
        <StatCell
          label="Held Right Now"
          value={fmtNum(r.heldShares, { compact: true })}
          sub={`${fmtNum(r.holdings.length)} players · ${fmtUsd(r.holdingsValueUsd, { compact: true })}`}
        />
      </div>

      {/* Bought minus returned should equal the balance at the indexed
          block. A gap means a share path the indexer has not accounted
          for, which is worth surfacing rather than hiding. */}
      {Math.abs(r.floatShares - r.heldShares) > Math.max(50, r.heldShares * 0.05) ? (
        <p
          className="mt-3"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--color-flag)",
          }}
        >
          Reconciliation gap: bought minus returned is {fmtNum(r.floatShares, { compact: true })}, on-chain balance is{" "}
          {fmtNum(r.heldShares, { compact: true })}
        </p>
      ) : null}

      <div className="mt-4">
        <SectionHead
          title="Deployment Over Time"
          hint="Amber bars: USDC spent buying that day · Blue bars: treasury funding in · Green line: running total for the selected range"
          right={<Pill tone="muted">{fmtNum(r.activeDays)} active days</Pill>}
        />
        <Card variant="press" padded={false}>
          <div className="p-5">
            <BuybackChart daily={r.daily} />
          </div>
        </Card>
      </div>

      <div className="mt-6">
        <SectionHead
          title="Buybacks by Player"
          hint="All-time totals per player · dollars are what each basket actually paid for that player"
          right={
            r.byPlayerComplete ? (
              <Pill tone="muted">{fmtNum(r.byPlayer.length)} players</Pill>
            ) : null
          }
        />
        <Card variant="press" padded={false}>
          {r.byPlayerComplete && r.byPlayer.length > 0 ? (
            <BuybackPlayersTable rows={r.byPlayer} now={r.generatedAt} />
          ) : (
            <p className="m-0 p-5 text-[var(--color-text-muted)]" style={{ fontSize: 14 }}>
              Per-player totals appear once the buyback index has been rebuilt with player-level
              tracking. Partial figures are held back rather than shown as complete.
            </p>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <SectionHead
            title="Currently Held"
            hint="Shares bought back and not yet returned to the treasury, at current spot"
            right={<Pill tone="muted">{fmtNum(r.holdings.length)} players</Pill>}
          />
          <Card variant="press" padded={false}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-[13px]">
                <thead style={{ background: "color-mix(in oklab, var(--color-press) 50%, transparent)" }}>
                  <tr className="border-b border-[var(--color-line)]">
                    <Th align="left" className="pl-5">#</Th>
                    <Th align="left">Player</Th>
                    <Th align="center">Shares</Th>
                    <Th align="center">% of Supply</Th>
                    <Th align="center" className="pr-5">Value</Th>
                  </tr>
                </thead>
                <tbody>
                  {r.holdings.map((h, i) => (
                    <tr
                      key={h.tokenIdSuffix}
                      className="transition-colors hover:bg-[var(--color-bench)]"
                      style={{ borderBottom: "1px solid var(--color-line)" }}
                    >
                      <Td align="left" className="pl-5" dim>{i + 1}</Td>
                      <td style={{ padding: "var(--row-pad-y) 12px" }}>
                        <div className="flex items-center gap-2.5">
                          {h.player ? <PlayerAvatar player={h.player} size="xs" /> : null}
                          <div className="min-w-0">
                            {h.player ? (
                              <Link
                                href={`/player/${h.player.id}`}
                                className="font-bold text-[var(--color-text)] hover:text-[var(--accent-soft)]"
                              >
                                {h.player.displayName}
                              </Link>
                            ) : (
                              <span className="font-bold text-[var(--color-text)]">
                                Token {h.tokenIdSuffix}
                              </span>
                            )}
                            {h.player ? (
                              <div
                                style={{
                                  fontFamily: "var(--font-mono)",
                                  fontSize: 10,
                                  letterSpacing: "0.12em",
                                  color: "var(--color-text-dim)",
                                  textTransform: "uppercase",
                                }}
                              >
                                {h.player.position} · {h.player.team}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <Td align="center" mono>{fmtNum(h.shares, { digits: 0 })}</Td>
                      <Td align="center" mono>
                        {h.shareOfSupply !== null ? (
                          <span style={{ color: h.shareOfSupply >= 1 ? "var(--accent-soft)" : "var(--color-text-muted)" }}>
                            {h.shareOfSupply.toFixed(2)}%
                          </span>
                        ) : (
                          <span style={{ color: "var(--color-text-dim)" }}>—</span>
                        )}
                      </Td>
                      <Td align="center" mono className="pr-5">
                        {h.valueUsd > 0 ? fmtUsd(h.valueUsd, { digits: 0 }) : "—"}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <SectionHead
            title="Recent Buys"
            hint="Newest first · each row is one basket purchase"
            right={<Pill tone="muted">{fmtNum(r.recent.length)} shown</Pill>}
          />
          <Card variant="press" padded={false}>
            <div className="max-h-[520px] overflow-y-auto">
              <table className="w-full text-[13px]">
                <thead
                  className="sticky top-0"
                  style={{ background: "color-mix(in oklab, var(--color-press) 92%, transparent)" }}
                >
                  <tr className="border-b border-[var(--color-line)]">
                    <Th align="left" className="pl-5">When</Th>
                    <Th align="center">Players</Th>
                    <Th align="center">Shares</Th>
                    <Th align="center" className="pr-5">Spent</Th>
                  </tr>
                </thead>
                <tbody>
                  {r.recent.map((b) => (
                    <tr key={b.tx} style={{ borderBottom: "1px solid var(--color-line)" }}>
                      <Td align="left" className="pl-5" dim>
                        <a
                          href={`https://basescan.org/tx/${b.tx}`}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:text-[var(--accent-soft)]"
                        >
                          {fmtTimeAgo(b.ts)}
                        </a>
                      </Td>
                      <Td align="center" mono>{b.tokens || "—"}</Td>
                      <Td align="center" mono>{fmtNum(b.shares, { digits: 0 })}</Td>
                      <Td align="center" mono className="pr-5">{fmtUsd(b.netUsd, { digits: 2 })}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>


          {r.funding.length > 0 ? (
            <div className="mt-4">
              <SectionHead title="Treasury Funding" hint="USDC sent to the wallet" />
              <Card variant="press" padded={false}>
                <table className="w-full text-[13px]">
                  <tbody>
                    {r.funding.slice(0, 8).map((f) => (
                      <tr key={f.tx} style={{ borderBottom: "1px solid var(--color-line)" }}>
                        <Td align="left" className="pl-5" dim>{fmtTimeAgo(f.ts)}</Td>
                        <Td align="left" dim>{shortAddr(f.from)}</Td>
                        <Td align="center" mono className="pr-5">
                          <span style={{ color: "var(--color-turf)" }}>+{fmtUsd(f.usdcIn, { compact: true })}</span>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>
          ) : null}
        </div>
      </div>

      <p
        className="mt-4"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--color-text-dim)",
        }}
      >
        Indexed through block {fmtNum(r.lastIndexedBlock)} · updated {fmtTimeAgo(r.updatedAt)}
      </p>
    </>
  );
}

function BodySkeleton() {
  return (
    <>
      <div
        className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-[1px] rounded-[var(--r-14)] overflow-hidden border border-[var(--color-line-strong)]"
        style={{ background: "var(--color-line-strong)" }}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-2"
            style={{ padding: "16px 18px", background: "color-mix(in oklab, var(--color-text) 6%, transparent)" }}
          >
            <Sk w={90} h={10} />
            <Sk w={130} h={26} />
            <Sk w={70} h={10} />
          </div>
        ))}
      </div>
      <div className="mt-4">
        <SkBlock h={320} />
      </div>
      <div className="mt-4">
        <SkBlock h={480} />
      </div>
    </>
  );
}

function StatCell({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="stat-cell">
      <div className="flex items-center gap-2">
        <span className="block h-px w-4 bg-[var(--accent)]" />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--color-text-muted)",
          }}
        >
          {label}
        </span>
      </div>
      <span
        className="leading-none"
        style={{
          fontFamily: "var(--font-mono)",
          fontWeight: 700,
          fontSize: 24,
          letterSpacing: "-0.03em",
          color: "var(--color-text)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
      {sub ? (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.14em",
            color: "var(--color-text-dim)",
            textTransform: "uppercase",
          }}
        >
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function SectionHead({ title, hint, right }: { title: string; hint?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: 22,
            letterSpacing: "0.02em",
            textTransform: "uppercase",
            lineHeight: 1.1,
          }}
        >
          {title}
        </h2>
        {hint ? <p className="mt-1 text-[12px] text-[var(--color-text-dim)]">{hint}</p> : null}
      </div>
      {right}
    </div>
  );
}

function Th({
  children,
  align,
  className,
}: {
  children: React.ReactNode;
  align: "left" | "center" | "right";
  className?: string;
}) {
  return (
    <th
      className={className}
      style={{
        textAlign: align,
        padding: "12px",
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        color: "var(--color-text-dim)",
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
  className,
  mono,
  dim,
}: {
  children: React.ReactNode;
  align: "left" | "center" | "right";
  className?: string;
  mono?: boolean;
  dim?: boolean;
}) {
  return (
    <td
      className={className}
      style={{
        padding: "var(--row-pad-y) 12px",
        textAlign: align,
        whiteSpace: "nowrap",
        fontFamily: mono || dim ? "var(--font-mono)" : undefined,
        fontVariantNumeric: mono || dim ? "tabular-nums" : undefined,
        fontSize: 12.5,
        color: dim ? "var(--color-text-dim)" : undefined,
      }}
    >
      {children}
    </td>
  );
}
