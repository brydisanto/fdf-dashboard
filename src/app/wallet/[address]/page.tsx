import Link from "next/link";
import { ArrowLeft, ChevronRight, ExternalLink, Fish, Sparkles } from "lucide-react";
import { getWalletPortfolio, getWalletFlow, getWalletFunPosition } from "@/lib/data";
import { ROSTER_BY_TOKEN } from "@/lib/data/roster";
import { Card, CardHeader, Pill } from "@/components/ui";
import { tierLabel, TIER_META } from "@/components/WalletBadge";
import { CompositionPie, type CompositionSlice } from "@/components/CompositionPie";
import { WalletFlowChart } from "@/components/WalletFlowChart";
import { WalletHoldingsTable } from "@/components/WalletHoldingsTable";
import { fmtNum, fmtTimeAgo, fmtUsd, shortAddr } from "@/lib/format";

export const revalidate = 60;

// Soccer slice color — broadcast-blue, distinct from amber + turf so
// the dominance bar / composition donut read at a glance.
const COLOR_SOCCER = "var(--color-broadcast)";

export default async function WalletPage(props: PageProps<"/wallet/[address]">) {
  const { address } = await props.params;
  const [profile, flow, fun] = await Promise.all([
    getWalletPortfolio(address),
    getWalletFlow(address, 7),
    getWalletFunPosition(address),
  ]);
  const nflHoldings = profile.holdings.filter((h) => ROSTER_BY_TOKEN.has(h.tokenAddress));
  const soccerHoldings = profile.holdings.filter((h) => !ROSTER_BY_TOKEN.has(h.tokenAddress));
  const nflValue = nflHoldings.reduce((a, h) => a + h.balanceValueUsd, 0);
  const soccerValue = soccerHoldings.reduce((a, h) => a + h.balanceValueUsd, 0);
  const totalPortfolioValue = profile.totalValueUsd + fun.valueUsd;
  // NFL Dominance = NFL share of sport allocation (NFL + Soccer).
  // $FUN excluded since it's a utility token, not a sport bet.
  const sportValue = nflValue + soccerValue;
  const nflDominance = sportValue > 0 ? (nflValue / sportValue) * 100 : 0;
  const firstNflHoldAt = nflHoldings.reduce<number>(
    (m, h) => (h.startHoldingAt && (!m || h.startHoldingAt < m) ? h.startHoldingAt : m),
    0,
  );

  // Top NFL holding by USD — drives the TOP HOLDING stat cell.
  const topNflHolding = nflHoldings.slice().sort((a, b) => b.balanceValueUsd - a.balanceValueUsd)[0];

  const slices: CompositionSlice[] = [
    { key: "nfl", label: "NFL", value: nflValue, color: "var(--accent)" },
    { key: "soccer", label: "Soccer", value: soccerValue, color: COLOR_SOCCER },
    { key: "fun", label: "$FUN", value: fun.valueUsd, color: "var(--color-turf)" },
  ];

  const tier = TIER_META[profile.tier];
  // Fish-icon size scales with tier so the visual weight matches the
  // wallet's portfolio class — same convention WalletBadge uses inline.
  const tierIconPx = profile.tier === "whale" ? 56
    : profile.tier === "shark" ? 48
    : profile.tier === "dolphin" ? 42
    : profile.tier === "fish" ? 38
    : 32;

  return (
    <div className="mx-auto max-w-[var(--max-w)] px-5 sm:px-8 py-6 sm:py-8">
      <Breadcrumb
        items={[
          { label: "Market", href: "/" },
          { label: "Wallets" },
          { label: shortAddr(address, 6, 6) },
        ]}
      />

      {/* Hero */}
      <div className="detail-hero wallet-hero-stripe relative mt-3">
        <div className="detail-hero-grid" />
        <div
          aria-hidden
          className="pointer-events-none absolute"
          style={{
            right: -100,
            top: -100,
            width: 480,
            height: 480,
            background: `radial-gradient(circle, color-mix(in oklab, var(--color-broadcast) 15%, transparent), transparent 70%)`,
          }}
        />
        <div className="relative grid items-center gap-8 p-7 sm:grid-cols-[auto_1fr_auto] sm:p-9">
          {/* Tier glyph — Fish icon, sized + colored to match the
              wallet's tier (matches WalletBadge convention). */}
          <div
            className="flex items-center justify-center rounded-full bg-[var(--color-press)]"
            style={{
              width: 92,
              height: 92,
              boxShadow: `inset 0 0 0 2px ${tier.color}`,
            }}
            aria-hidden
          >
            <Fish width={tierIconPx} height={tierIconPx} style={{ color: tier.color }} />
          </div>

          {/* Meta column */}
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center rounded-[var(--r-4)] border px-2 py-1 ${tier.pillBg} ${tier.pillBorder} ${tier.pillText}`}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                }}
              >
                {tierLabel(profile.tier)}
              </span>
              {profile.isNew ? (
                <Pill tone="warn">
                  <Sparkles className="mr-1 inline h-3 w-3" />
                  NEW WALLET
                </Pill>
              ) : null}
              <Pill tone="muted">{profile.holdingsCount} HOLDINGS</Pill>
              {flow.rotationDirection === "into-nfl" ? <Pill tone="gain">ROTATING INTO NFL</Pill> : null}
              {flow.rotationDirection === "out-of-nfl" ? <Pill tone="loss">ROTATING OUT OF NFL</Pill> : null}
            </div>
            <h1
              className="m-0"
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 800,
                fontSize: "clamp(28px, 3.5vw, 48px)",
                lineHeight: 1,
                letterSpacing: "0.005em",
              }}
            >
              {shortAddr(address, 6, 6).toUpperCase()}
            </h1>
            <div
              className="flex flex-wrap items-center gap-x-4 gap-y-1"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--color-text-dim)",
              }}
            >
              <span>FIRST SEEN {profile.firstSeenAt ? fmtTimeAgo(profile.firstSeenAt) : "—"}</span>
              <span>·</span>
              <span>LAST ACTIVE {profile.lastActiveAt ? fmtTimeAgo(profile.lastActiveAt) : "—"}</span>
              {firstNflHoldAt > 0 ? (
                <>
                  <span>·</span>
                  <span>
                    FIRST NFL POSITION{" "}
                    <span className="text-[var(--color-text)]">{fmtDate(firstNflHoldAt)}</span>
                  </span>
                </>
              ) : null}
              <a
                href={`https://basescan.org/address/${address}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 hover:text-[var(--color-text)]"
              >
                BASESCAN <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>

          {/* Twin value boxes */}
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-end">
            <ValueBox
              label="NFL Portfolio Value"
              value={fmtUsd(nflValue, { compact: true })}
              sub={`${nflHoldings.length} player position${nflHoldings.length === 1 ? "" : "s"}`}
              accent
            />
            <ValueBox
              label="Total Portfolio"
              value={fmtUsd(totalPortfolioValue, { compact: true })}
              sub="NFL + Soccer + $FUN"
            />
          </div>
        </div>
      </div>

      {/* Stat strip — 4-cell hairline grid (NFL Dominance lives in the
          dedicated card below, so it's not duplicated here). */}
      <div
        className="stat-strip mt-4 grid"
        style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}
      >
        <StatCell
          label="Holdings"
          value={fmtNum(profile.holdingsCount)}
          sub={`NFL ${nflHoldings.length} · SOCCER ${soccerHoldings.length}`}
        />
        <StatCell
          label="Top Holding"
          value={topNflHolding ? topPlayerName(topNflHolding) : "—"}
          sub={topNflHolding ? `${fmtUsd(topNflHolding.balanceValueUsd, { compact: true })} VALUE` : "NO NFL POSITIONS"}
        />
        <StatCell
          label="7D Net Flow · NFL"
          value={`${flow.nflNetUsd >= 0 ? "+" : ""}${fmtUsd(flow.nflNetUsd, { compact: true })}`}
          sub={
            flow.rotationDirection === "into-nfl" ? "ROTATING IN"
              : flow.rotationDirection === "out-of-nfl" ? "ROTATING OUT"
              : "STEADY"
          }
          tone={flow.nflNetUsd >= 0 ? "gain" : "loss"}
        />
        <StatCell
          label="Wallet Age"
          value={profile.firstSeenAt ? fmtTimeAgo(profile.firstSeenAt).replace(" ago", "").toUpperCase() : "—"}
          sub="FIRST SEEN"
        />
      </div>

      {/* Dominance bar */}
      {sportValue > 0 ? (
        <Card className="mt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <div className="sm:min-w-[200px]">
              <div className="mono-eyebrow text-[var(--accent-soft)]" style={{ fontSize: 10 }}>
                NFL DOMINANCE
              </div>
              <div
                className="mt-1 leading-none text-[var(--accent-soft)]"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontWeight: 700,
                  fontSize: 36,
                  letterSpacing: "-0.03em",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {nflDominance.toFixed(0)}%
              </div>
              <div className="mt-1 text-[11px] leading-snug text-[var(--color-text-muted)]">
                NFL share of this wallet&apos;s sport allocation. $FUN excluded.
              </div>
            </div>
            <div className="flex-1">
              <div
                className="flex items-center justify-between"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                }}
              >
                <span className="text-[var(--accent-soft)]">
                  NFL · {fmtUsd(nflValue, { compact: true })}
                </span>
                <span className="text-[var(--color-broadcast)]">
                  {fmtUsd(soccerValue, { compact: true })} · SOCCER
                </span>
              </div>
              {/* Two-segment bar — NFL accent + Soccer broadcast-blue */}
              <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-[var(--color-press)] ring-1 ring-[var(--color-line)]">
                <div className="h-full bg-[var(--accent)]" style={{ width: `${nflDominance}%` }} />
                <div className="h-full bg-[var(--color-broadcast)]" style={{ width: `${100 - nflDominance}%` }} />
              </div>
              <div
                className="mt-1.5 flex items-center justify-between"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  fontVariantNumeric: "tabular-nums",
                  color: "var(--color-text-muted)",
                }}
              >
                <span>{nflDominance.toFixed(1)}% NFL</span>
                <span>{(100 - nflDominance).toFixed(1)}% Soccer</span>
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      {/* Composition donut */}
      <Card className="mt-4">
        <CardHeader
          title="Portfolio Composition"
          hint="Where this wallet's value sits across NFL shares, Soccer shares, and $FUN"
        />
        <div className="grid items-center gap-6 sm:grid-cols-[auto_1fr]">
          <div className="flex justify-center">
            <CompositionPie slices={slices} total={totalPortfolioValue} size={220} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <SliceTile
              label="NFL"
              value={fmtUsd(nflValue, { compact: true })}
              pct={pct(nflValue, totalPortfolioValue)}
              sub={`${nflHoldings.length} player position${nflHoldings.length === 1 ? "" : "s"}`}
              color="var(--accent)"
            />
            <SliceTile
              label="Soccer"
              value={fmtUsd(soccerValue, { compact: true })}
              pct={pct(soccerValue, totalPortfolioValue)}
              sub={`${soccerHoldings.length} non-NFL position${soccerHoldings.length === 1 ? "" : "s"}`}
              color={COLOR_SOCCER}
            />
            <SliceTile
              label="$FUN"
              value={fmtUsd(fun.valueUsd, { compact: true })}
              pct={pct(fun.valueUsd, totalPortfolioValue)}
              sub={`${fmtNum(fun.balance, { compact: true, digits: 2 })} @ ${fmtUsd(fun.priceUsd, { digits: 4 })}`}
              color="var(--color-turf)"
              extra={
                <span style={{ color: fun.change24h >= 0 ? "var(--color-turf)" : "var(--color-penalty)" }}>
                  {fun.change24h >= 0 ? "+" : ""}
                  {fun.change24h.toFixed(1)}% 24H
                </span>
              }
            />
          </div>
        </div>
      </Card>

      {/* 7-day flow chart */}
      <Card className="mt-4">
        <CardHeader
          title="7-Day Holding Flow · NFL vs Soccer"
          hint="Daily net dollar shift between NFL and Soccer positions (buys − sells)"
          right={
            <div
              className="flex items-center gap-3"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-sm bg-[var(--accent)]" /> NFL
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-sm bg-[var(--color-broadcast)]" /> Soccer
              </span>
            </div>
          }
        />
        <WalletFlowChart flow={flow} soccerColor={COLOR_SOCCER} />
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <FootStat label="NFL bought" value={fmtUsd(flow.nflInUsd, { compact: true })} />
          <FootStat label="NFL sold" value={fmtUsd(flow.nflOutUsd, { compact: true })} />
          <FootStat label="Soccer bought" value={fmtUsd(flow.otherInUsd, { compact: true })} />
          <FootStat label="Soccer sold" value={fmtUsd(flow.otherOutUsd, { compact: true })} />
        </div>
      </Card>

      {/* NFL holdings — press card */}
      <div className="mt-4">
        <SectionHead
          title="NFL Holdings"
          hint={`${nflHoldings.length} of ${profile.holdingsCount} positions · sortable & paginated`}
          right={<Pill tone="brand">{fmtUsd(nflValue, { compact: true })}</Pill>}
        />
        <Card variant="press" padded={false}>
          <WalletHoldingsTable rows={nflHoldings} variant="nfl" />
        </Card>
      </div>

      {/* Soccer holdings — press card */}
      <div className="mt-4">
        <SectionHead
          title="Soccer Holdings"
          hint={`${soccerHoldings.length} non-NFL positions on Sport.fun`}
          right={<Pill tone="info">{fmtUsd(soccerValue, { compact: true })}</Pill>}
        />
        <Card variant="press" padded={false}>
          <WalletHoldingsTable rows={soccerHoldings} variant="other" />
        </Card>
      </div>
    </div>
  );
}

function pct(part: number, total: number): number {
  return total > 0 ? (part / total) * 100 : 0;
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Resolve the actual NFL player display name from the roster
// (tokenAddress → roster entry). Falls back to whatever the holding
// row carries if we can't match.
function topPlayerName(h: { tokenAddress: string; name: string }): string {
  const player = ROSTER_BY_TOKEN.get(h.tokenAddress);
  if (player) return `${player.firstName} ${player.lastName}`.toUpperCase();
  return h.name.toUpperCase();
}

function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav
      className="inline-flex items-center gap-1.5 rounded-[var(--r-4)] border border-[var(--color-line)] bg-[var(--color-bench)] px-3 py-1.5"
      aria-label="Breadcrumb"
    >
      {items.map((it, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          {i > 0 ? <ChevronRight className="h-3 w-3 text-[var(--color-text-dim)]" strokeWidth={1.5} /> : <ArrowLeft className="h-3 w-3 text-[var(--color-text-dim)]" strokeWidth={1.5} />}
          {it.href ? (
            <Link
              href={it.href}
              className="mono-eyebrow hover:text-[var(--color-text)]"
              style={{ fontSize: 10 }}
            >
              {it.label}
            </Link>
          ) : (
            <span className="mono-eyebrow text-[var(--color-text)]" style={{ fontSize: 10 }}>
              {it.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}

function ValueBox({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
}) {
  const accentBox = accent
    ? {
        background: "var(--accent-tint)",
        borderColor: "var(--accent-line)",
        color: "var(--accent-soft)",
      }
    : {
        background: "var(--color-press)",
        borderColor: "var(--color-line)",
        color: "var(--color-text)",
      };
  return (
    <div
      className="rounded-[var(--r-8)] border px-4 py-3"
      style={{ background: accentBox.background, borderColor: accentBox.borderColor }}
    >
      <div className="mono-eyebrow" style={{ fontSize: 10, color: accent ? "var(--accent-soft)" : "var(--color-text-dim)" }}>
        {label}
      </div>
      <div
        className="leading-none"
        style={{
          fontFamily: "var(--font-mono)",
          fontWeight: 700,
          fontSize: 36,
          letterSpacing: "-0.04em",
          color: accentBox.color,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      <div className="mt-1 text-[11px] text-[var(--color-text-muted)]">{sub}</div>
    </div>
  );
}

function StatCell({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: "gain" | "loss";
}) {
  const fg = tone === "gain" ? "var(--color-turf)" : tone === "loss" ? "var(--color-penalty)" : "var(--color-text)";
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
          fontSize: 22,
          letterSpacing: "-0.03em",
          color: fg,
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

function SliceTile({
  label,
  value,
  pct,
  sub,
  color,
  extra,
}: {
  label: string;
  value: string;
  pct: number;
  sub: string;
  color: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--r-8)] border border-[var(--color-line)] bg-[var(--color-press)] p-3.5">
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-sm" style={{ background: color }} />
        <span className="mono-eyebrow" style={{ fontSize: 10 }}>
          {label}
        </span>
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span
          className="leading-tight"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 18,
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </span>
        <span className="text-[11px] text-[var(--color-text-muted)]">{pct.toFixed(1)}%</span>
      </div>
      <div className="mt-1 text-[11px] text-[var(--color-text-muted)]">
        {sub}
        {extra ? <> · {extra}</> : null}
      </div>
    </div>
  );
}

function FootStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--r-4)] border border-[var(--color-line)] bg-[var(--color-press)] px-3 py-2">
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.16em",
          color: "var(--color-text-dim)",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        className="mt-0.5"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 14,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function SectionHead({
  title,
  hint,
  right,
}: {
  title: string;
  hint?: string;
  right?: React.ReactNode;
}) {
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
