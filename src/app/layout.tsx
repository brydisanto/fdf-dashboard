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
      className="rounded-[var(--r-8)] px-3 py-1.5 text-[13px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bench)] transition-colors"
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

// Field-grid mark — a 32×32 rounded square with amber outline,
// three horizontal yard lines, a vertical center spine, and faint
// X-laces at ~60% opacity. Inherits colors from CSS vars so it
// follows the accent.
function BrandMark() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 32 32"
      aria-hidden="true"
      className="shrink-0"
    >
      <rect
        x="1"
        y="1"
        width="30"
        height="30"
        rx="6"
        fill="var(--accent-tint)"
        stroke="var(--accent)"
        strokeWidth="1.2"
      />
      {/* Yard lines @ 25%, 50%, 75% */}
      <g stroke="var(--accent)" strokeWidth="1" opacity="0.55">
        <line x1="4" x2="28" y1="9" y2="9" />
        <line x1="4" x2="28" y1="16" y2="16" />
        <line x1="4" x2="28" y1="23" y2="23" />
      </g>
      {/* Vertical spine */}
      <line
        x1="16"
        x2="16"
        y1="4"
        y2="28"
        stroke="var(--accent)"
        strokeWidth="1.5"
      />
      {/* X laces */}
      <g stroke="var(--accent-soft)" strokeWidth="1" opacity="0.6">
        <line x1="13" x2="19" y1="13" y2="19" />
        <line x1="19" x2="13" y1="13" y2="19" />
      </g>
    </svg>
  );
}
