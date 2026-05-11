import Link from "next/link";
import { fmtNum, fmtTimeAgo, fmtUsd, shortAddr } from "@/lib/format";
import type { TopHolder, WalletSnapshot } from "@/lib/data";
import { WalletBadge } from "./WalletBadge";

// Largest holders for a single player. Renders inside a press card on
// the player detail page. Resolves wallet tier badges from the same
// `WalletSnapshot` map the trade feed uses.
export function LargestHoldersTable({
  holders,
  wallets,
  priceUsd,
}: {
  holders: TopHolder[];
  wallets?: Record<string, WalletSnapshot>;
  // Current player price — converts each holder's balance into a USD
  // value so the table reads like a leaderboard, not just shares.
  priceUsd: number;
}) {
  if (holders.length === 0) {
    return (
      <div className="px-5 py-12 text-center text-sm text-[var(--color-text-muted)]">
        No holders yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-[13px]">
        <thead style={{ background: "color-mix(in oklab, var(--color-press) 50%, transparent)" }}>
          <tr className="border-b border-[var(--color-line)]">
            <Th align="left" className="pl-5">#</Th>
            <Th align="left">Wallet</Th>
            <Th>Balance</Th>
            <Th>Value</Th>
            <Th>Share</Th>
            <Th>First Held</Th>
            <Th className="pr-5">Last Active</Th>
          </tr>
        </thead>
        <tbody>
          {holders.map((h, i) => {
            const snap = wallets?.[h.address.toLowerCase()];
            const valueUsd = h.balance * priceUsd;
            return (
              <tr
                key={h.address}
                className="transition-colors duration-[180ms] ease-out hover:bg-[color-mix(in_oklab,var(--color-press)_50%,transparent)]"
                style={{ borderBottom: "1px solid var(--color-line)" }}
              >
                <td
                  className="pl-5"
                  style={{
                    padding: "var(--row-pad-y) 8px var(--row-pad-y) 20px",
                    fontFamily: "var(--font-mono)",
                    fontWeight: 700,
                    color: "var(--color-text-dim)",
                    fontSize: 11,
                    textAlign: "left",
                  }}
                >
                  {i + 1}
                </td>
                <td className="px-3" style={{ padding: "var(--row-pad-y) 12px", textAlign: "left" }}>
                  {snap && snap.totalValueUsd > 0 ? (
                    <WalletBadge
                      address={snap.address}
                      tier={snap.tier}
                      totalValueUsd={snap.totalValueUsd}
                      nflValueUsd={snap.nflValueUsd}
                      isNew={snap.isNew}
                    />
                  ) : (
                    <Link
                      href={`/wallet/${h.address}`}
                      className="inline-flex items-center gap-1 hover:text-[var(--color-text)]"
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        color: "var(--color-text-muted)",
                      }}
                    >
                      {shortAddr(h.address, 6, 6)}
                    </Link>
                  )}
                </td>
                <NumCell>{fmtNum(h.balance, { compact: true })}</NumCell>
                <NumCell className="font-semibold">{fmtUsd(valueUsd, { compact: true })}</NumCell>
                <NumCell>
                  {h.sharePct >= 0.01 ? `${h.sharePct.toFixed(2)}%` : "<0.01%"}
                </NumCell>
                <NumCell className="text-[var(--color-text-muted)]">
                  {h.startHoldingAt ? fmtTimeAgo(h.startHoldingAt) : "—"}
                </NumCell>
                <td
                  className="pr-5"
                  style={{
                    padding: "var(--row-pad-y) 12px",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    fontVariantNumeric: "tabular-nums",
                    color: "var(--color-text-muted)",
                  }}
                >
                  {h.lastActiveAt ? fmtTimeAgo(h.lastActiveAt) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function NumCell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td
      className={className}
      style={{
        padding: "var(--row-pad-y) 12px",
        fontFamily: "var(--font-mono)",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {children}
    </td>
  );
}

function Th({
  children,
  align = "left",
  className,
}: {
  children: React.ReactNode;
  align?: "left" | "center" | "right";
  className?: string;
}) {
  const cls = `px-3 py-3${className ? ` ${className}` : ""}`;
  return (
    <th
      className={cls}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: "var(--color-text-dim)",
        textAlign: align,
      }}
    >
      {children}
    </th>
  );
}
