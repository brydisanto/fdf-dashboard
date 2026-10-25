import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  getSellerWatch,
  FAST_EXIT_RATE,
  LARGE_HOLDER_USD,
  MIN_NET_SELL_USD,
  type HeavySeller,
  type SellerWatchPlayer,
} from "@/lib/data/seller-watch";
import { Card, Pill } from "@/components/ui";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { SellerWatchPlayersTable } from "@/components/SellerWatchPlayersTable";
import { Sk, SkBlock } from "@/components/PageSkeleton";
import { fmtNum, fmtTimeAgo, fmtUsd, shortAddr } from "@/lib/format";

export const metadata = {
  title: "Seller Watch · FDF Box Score",
  description:
    "Which players have the most stock sitting with wallets that are selling hard right now, and which are safest to hold.",
};

// Holdings are read on-chain per build; 10 minutes keeps it fresh
// without re-reading every heavy seller's balances on each request.
export const revalidate = 600;

const AT_RISK_SHOWN = 8;
const SAFE_SHOWN = 8;

export default function SellerWatchPage() {
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
                "radial-gradient(circle, color-mix(in oklab, var(--color-penalty) 14%, transparent), transparent 70%)",
            }}
          />
        </div>
        <div
          className="relative flex flex-col gap-5 sm:gap-6"
          style={{ padding: "clamp(20px, 4vw, 32px) clamp(18px, 4vw, 32px) clamp(18px, 4vw, 28px)" }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="brand">Seller Watch</Pill>
            <Suspense fallback={<Sk w={150} h={22} className="rounded-full" />}>
              <PressurePill />
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
            Seller Watch
          </h1>
          <p className="m-0 max-w-[80ch] text-[var(--color-text-muted)]" style={{ fontSize: 15 }}>
            Which players have the most stock sitting with wallets that are selling hard right now,
            and which have the least. A heavy seller is any wallet that sold at least{" "}
            {fmtUsd(MIN_NET_SELL_USD, { digits: 0 })} more than it bought in the last 7 days. What
            they still hold is read on-chain, so it shows what could still hit the market.
          </p>
        </div>
      </div>

      <Suspense fallback={<BodySkeleton />}>
        <Body />
      </Suspense>
    </div>
  );
}

async function PressurePill() {
  const r = await getSellerWatch();
  if (!r.available) return <Pill tone="warn">Trade index unavailable</Pill>;
  if (r.bought7d <= 0) return <Pill tone="loss">Selling only · 7d</Pill>;
  const ratio = r.sold7d / r.bought7d;
  return (
    <Pill tone={ratio >= 1.5 ? "loss" : ratio <= 0.8 ? "gain" : "muted"}>
      {ratio >= 1
        ? `Sells ${ratio.toFixed(1)}x buys · 7d`
        : `Buys ${(1 / ratio).toFixed(1)}x sells · 7d`}
    </Pill>
  );
}

async function Body() {
  const r = await getSellerWatch();

  if (!r.available) {
    return (
      <Card variant="press" className="mt-4">
        <p className="m-0 text-[var(--color-text-muted)]" style={{ fontSize: 14 }}>
          The trade index could not be loaded, so seller activity is unavailable right now.
        </p>
      </Card>
    );
  }

  const fast = r.sellers.filter((s) => s.kind === "fast");
  const large = r.sellers.filter((s) => s.kind === "large");
  const atRisk = r.players.filter((p) => !p.tier).slice(0, AT_RISK_SHOWN);
  const safe = [
    ...r.players.filter((p) => p.tier === "safest").sort((a, b) => a.fastPct + a.largePct - (b.fastPct + b.largePct)),
    ...r.players.filter((p) => p.tier === "steady").sort((a, b) => a.fastPct + a.largePct - (b.fastPct + b.largePct)),
  ].slice(0, SAFE_SHOWN);
  const snapshot = r.activeSharesAt
    ? new Date(r.activeSharesAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    : null;

  return (
    <>
      <div className="stat-strip mt-4 grid grid-cols-2 md:grid-cols-4">
        <StatCell label="Sold · 7d" value={fmtUsd(r.sold7d, { compact: true })} sub="Shares sold for USDC" />
        <StatCell label="Bought · 7d" value={fmtUsd(r.bought7d, { compact: true })} sub="Shares bought with USDC" />
        <StatCell
          label="Heavy Sellers"
          value={fmtNum(r.sellers.length)}
          sub={`${fast.length} fast · ${large.length} large`}
        />
        <StatCell
          label="Still Held by Sellers"
          value={fmtUsd(r.overhangUsd, { compact: true })}
          sub="At current prices"
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div>
          <SectionHead
            title="Most at Risk"
            hint="Most stock held by wallets that are selling, weakest buying"
            right={<Pill tone="loss">Top {atRisk.length}</Pill>}
          />
          <Card variant="press" padded={false}>
            {atRisk.map((p) => <SignalRow key={p.player.id} p={p} tone="risk" />)}
          </Card>
        </div>
        <div>
          <SectionHead
            title="Safest to Hold"
            hint="Little stock with sellers, buying keeping pace, price holding up"
            right={<Pill tone="gain">{safe.length} players</Pill>}
          />
          <Card variant="press" padded={false}>
            {safe.length > 0 ? (
              safe.map((p) => <SignalRow key={p.player.id} p={p} tone="safe" />)
            ) : (
              <p className="m-0 p-5 text-[var(--color-text-muted)]" style={{ fontSize: 14 }}>
                No player passes every check this week.
              </p>
            )}
          </Card>
        </div>
      </div>

      <div className="mt-6">
        <SectionHead
          title="All Players"
          hint={`Fast sellers sell ${Math.round(FAST_EXIT_RATE * 100)}%+ of their position a week · large holders are worth ${fmtUsd(LARGE_HOLDER_USD, { compact: true })}+ and sell slowly but steadily · hover a header for details`}
        />
        <Card variant="press" padded={false}>
          <SellerWatchPlayersTable rows={r.players} />
        </Card>
      </div>

      <div className="mt-6">
        <SectionHead
          title="Heavy Sellers"
          hint="Exit pace = sold this week as a share of what they sold plus what they still hold"
          right={<Pill tone="muted">{fmtNum(r.sellers.length)} wallets</Pill>}
        />
        <Card variant="press" padded={false}>
          <SellersTable sellers={r.sellers} />
        </Card>
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
        Holdings read on-chain {fmtTimeAgo(r.generatedAt)}
        {snapshot ? ` · active shares from Sport.fun, ${snapshot}` : ""} · dollar values at current
        prices, before slippage
      </p>
    </>
  );
}

function SignalRow({ p, tone }: { p: SellerWatchPlayer; tone: "risk" | "safe" }) {
  const accent = tone === "risk" ? "var(--color-penalty)" : "var(--color-turf)";
  return (
    <div
      className="flex items-start gap-3 px-5 py-3.5"
      style={{ borderBottom: "1px solid var(--color-line)" }}
    >
      <PlayerAvatar player={p.player} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <Link
            href={`/player/${p.player.id}`}
            className="font-bold text-[var(--color-text)] hover:text-[var(--accent-soft)]"
          >
            {p.player.displayName}
          </Link>
          <span style={{ ...MONO_SMALL, color: "var(--color-text-dim)" }}>
            {p.player.position} · {p.player.team}
          </span>
          {tone === "safe" && p.tier === "steady" ? (
            <span style={{ ...MONO_SMALL, color: "var(--color-text-muted)" }}>· steady</span>
          ) : null}
        </div>
        <ul className="m-0 mt-1 list-none p-0" style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>
          {p.reasons.map((reason) => (
            <li key={reason} className="flex gap-2">
              <span aria-hidden style={{ color: accent }}>→</span>
              {reason}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1" style={{ ...MONO_SMALL, fontVariantNumeric: "tabular-nums" }}>
        <span style={{ color: p.change7d >= 0 ? "var(--color-turf)" : "var(--color-penalty)", fontSize: 12 }}>
          {p.change7d >= 0 ? "+" : ""}
          {Math.round(p.change7d)}% 7d
        </span>
        <span style={{ color: "var(--color-text-dim)" }}>
          {(p.fastPct + p.largePct).toFixed(0)}% w/ sellers
        </span>
      </div>
    </div>
  );
}

function SellersTable({ sellers }: { sellers: HeavySeller[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-[13px]">
        <thead style={{ background: "color-mix(in oklab, var(--color-press) 50%, transparent)" }}>
          <tr className="border-b border-[var(--color-line)]">
            <Th align="left" className="pl-5">Wallet</Th>
            <Th align="center">Type</Th>
            <Th align="center">Net sold 7d</Th>
            <Th align="center">Sold 3d</Th>
            <Th align="center">Still holds</Th>
            <Th align="center">Exit pace</Th>
            <Th align="center">Weeks selling</Th>
            <Th align="left" className="pr-5">Biggest positions</Th>
          </tr>
        </thead>
        <tbody>
          {sellers.map((s) => (
            <tr key={s.wallet} style={{ borderBottom: "1px solid var(--color-line)" }}>
              <Td align="left" className="pl-5" mono>
                <Link href={`/wallet/${s.wallet}`} className="hover:text-[var(--accent-soft)]">
                  {shortAddr(s.wallet, 6, 4)}
                </Link>
              </Td>
              <Td align="center">
                {s.kind === "fast" ? (
                  <Pill tone="loss">Fast</Pill>
                ) : s.kind === "large" ? (
                  <Pill tone="warn">Large</Pill>
                ) : (
                  <Pill tone="outline">Slow</Pill>
                )}
              </Td>
              <Td align="center" mono strong>{fmtUsd(s.netSold7d, { digits: 0 })}</Td>
              <Td align="center" mono dim={s.sold3d <= 0}>
                {s.sold3d > 0 ? fmtUsd(s.sold3d, { digits: 0 }) : "—"}
              </Td>
              <Td align="center" mono>{fmtUsd(s.holdUsd, { digits: 0 })}</Td>
              <Td align="center" mono>
                <span style={{ color: s.kind === "fast" ? "var(--color-penalty)" : undefined }}>
                  {Math.round(s.exitRate * 100)}% / wk
                </span>
              </Td>
              <Td align="center" mono>
                {s.weeksSelling}/{s.weeksTracked}
              </Td>
              <Td align="left" className="pr-5">
                <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                  {s.top.map((t) => `${t.player.displayName} ${fmtUsd(t.usd, { compact: true })}`).join(" · ")}
                </span>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <SkBlock h={520} />
        <SkBlock h={520} />
      </div>
      <div className="mt-6">
        <SkBlock h={640} />
      </div>
    </>
  );
}

const MONO_SMALL: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

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
  strong,
}: {
  children: React.ReactNode;
  align: "left" | "center" | "right";
  className?: string;
  mono?: boolean;
  dim?: boolean;
  strong?: boolean;
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
        fontWeight: strong ? 700 : undefined,
        fontSize: 12.5,
        color: dim ? "var(--color-text-dim)" : undefined,
      }}
    >
      {children}
    </td>
  );
}
