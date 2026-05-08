import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[var(--color-bg)] text-[var(--color-text)]">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[var(--color-bg)]/85 backdrop-blur supports-[backdrop-filter]:bg-[var(--color-bg)]/70">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 group">
          <Logo />
          <div className="leading-tight">
            <div className="font-bold tracking-tight text-[15px]">GRIDIRON</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-dim)]">
              NFL Player Token Market
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
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline-flex items-center gap-2 text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">
            <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-gain)]" />
            Live · Base
          </span>
        </div>
      </div>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-md px-3 py-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] transition-colors"
    >
      {children}
    </Link>
  );
}

function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-[var(--color-border)] py-6 text-xs text-[var(--color-text-dim)]">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-2 px-4 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div>Gridiron · Independent NFL token analytics. Not affiliated with the NFL or Sport.fun.</div>
        <div>Live market data from Base · refreshed continuously.</div>
      </div>
    </footer>
  );
}

function Logo() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 32 32"
      aria-hidden="true"
      className="shrink-0"
    >
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#ff9248" />
          <stop offset="1" stopColor="#ff5e1a" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#g)" />
      <path
        d="M16 6c-3.6 0-7.4 1.6-7.4 1.6s-1.4 4.6 0 8.4c1.4 3.8 4.4 7.6 7.4 9.4 3-1.8 6-5.6 7.4-9.4 1.4-3.8 0-8.4 0-8.4S19.6 6 16 6Z"
        fill="#1b1004"
        opacity="0.85"
      />
      <path
        d="M11 13.6h10M11 16h10M11 18.4h10M16 11v11"
        stroke="#ffd6b3"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}
