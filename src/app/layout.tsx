import type { Metadata } from "next";
import { Geist, Big_Shoulders, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const display = Big_Shoulders({
  subsets: ["latin"],
  weight: ["500", "700", "800", "900"],
  variable: "--font-display-raw",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono-raw",
});

export const metadata: Metadata = {
  title: "Gridiron — NFL Player Token Market",
  description:
    "Real-time market intelligence for tokenized NFL player shares. Prices, pools, holders, and trades across every listed athlete.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${display.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--color-line)] bg-[color-mix(in_oklab,var(--color-stadium)_85%,transparent)] backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[var(--max-w)] items-center justify-between px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-3 group">
          <BrandMark />
          <div className="leading-none">
            <div
              className="font-bold uppercase"
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 900,
                fontSize: "22px",
                letterSpacing: "0.04em",
              }}
            >
              GRIDIRON
            </div>
            <div className="mono-eyebrow mt-1" style={{ fontSize: "9.5px" }}>
              NFL · PLAYER TOKEN MARKET
            </div>
          </div>
        </Link>
        <nav className="hidden md:flex items-center gap-1 text-sm">
          <NavLink href="/">Market</NavLink>
          <NavLink href="/#players">Players</NavLink>
          <NavLink href="/value">Value</NavLink>
          <NavLink href="/#trades">Trades</NavLink>
          <NavLink href="/#pools">Pools</NavLink>
        </nav>
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-[var(--r-8)] border border-[var(--color-line)] bg-[var(--color-bench)]">
          <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-turf)]" />
          <span className="mono-eyebrow" style={{ fontSize: "10px" }}>LIVE · BASE</span>
        </div>
      </div>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-[var(--r-8)] px-3 py-1.5 text-[13px] font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bench)] transition-colors"
    >
      {children}
    </Link>
  );
}

function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-[var(--color-line)] py-6 text-xs text-[var(--color-text-dim)]">
      <div className="mx-auto flex max-w-[var(--max-w)] flex-col gap-2 px-5 sm:px-8 md:flex-row md:items-center md:justify-between">
        <div>Gridiron · Independent NFL token analytics. Not affiliated with the NFL or Sport.fun.</div>
        <div className="mono-eyebrow" style={{ fontSize: "10px" }}>LIVE MARKET DATA · BASE</div>
      </div>
    </footer>
  );
}

// Field decal — rounded square with amber stroke on a stadium-dark
// fill, two horizontal yard lines, a vertical center hash post, and
// four hash ticks. Colors pull from CSS vars so the mark follows the
// accent.
function BrandMark() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 64 64"
      aria-label="Gridiron"
      className="shrink-0"
    >
      <rect
        x="3"
        y="3"
        width="58"
        height="58"
        rx="12"
        fill="var(--color-stadium)"
        stroke="var(--accent)"
        strokeWidth="2"
      />
      {/* Yard lines */}
      <g stroke="var(--accent)" strokeOpacity="0.35" strokeWidth="1">
        <line x1="12" y1="20" x2="52" y2="20" />
        <line x1="12" y1="44" x2="52" y2="44" />
      </g>
      {/* Center hash post */}
      <line
        x1="32"
        y1="14"
        x2="32"
        y2="50"
        stroke="var(--accent)"
        strokeWidth="2"
      />
      {/* Hash ticks left + right of center */}
      <g stroke="var(--accent)" strokeWidth="2">
        <line x1="22" y1="26" x2="28" y2="26" />
        <line x1="36" y1="26" x2="42" y2="26" />
        <line x1="22" y1="38" x2="28" y2="38" />
        <line x1="36" y1="38" x2="42" y2="38" />
      </g>
    </svg>
  );
}
