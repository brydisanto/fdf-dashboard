import type { Metadata } from "next";
import { Geist, Big_Shoulders, JetBrains_Mono } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import Link from "next/link";
import { Flame } from "lucide-react";
import { Suspense } from "react";
import { MobileNav } from "@/components/MobileNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { TickerStrip } from "@/components/TickerStrip";
import "./globals.css";

// Google Analytics 4 measurement ID. Loaded via @next/third-parties so
// the gtag.js script is deferred until after hydration and SPA
// navigations are tracked automatically via history events.
const GA_ID = "G-Y16WBKHFJT";

// Runs in <head> before any paint so the stored theme is applied
// before the first frame. Avoids the dark-flash → light-snap that
// would happen if we waited for ThemeToggle's effect to fire.
const THEME_INIT_SCRIPT = `
(function(){
  try {
    var t = localStorage.getItem("fdf-theme");
    if (t === "nfl") document.documentElement.setAttribute("data-theme", "nfl");
  } catch (e) {}
})();
`;

const body = Geist({
  subsets: ["latin"],
  variable: "--font-body-raw",
});

const display = Big_Shoulders({
  subsets: ["latin"],
  weight: ["500", "700", "800", "900"],
  variable: "--font-display-raw",
  // next/font has no size-adjust metrics for Big Shoulders (build
  // warning: "Failed to find font override values"), so it can't
  // synthesize a matched fallback. Give it explicit condensed-ish
  // fallbacks and skip the auto-adjust attempt.
  fallback: ["Arial Narrow", "Impact", "sans-serif"],
  adjustFontFallback: false,
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono-raw",
});

export const metadata: Metadata = {
  title: "FDF Box Score — NFL Player Token Market",
  description:
    "Real-time price action, trade feed, top wallets, trends, value assessment and more for every tokenized athlete on Sport.fun's NFL market. Includes 72 players. This is how Real Football™ is played.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${body.variable} ${display.variable} ${mono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        {/* Global live ticker — rolls movers + "THIS IS REAL FOOTBALL™"
            on every page. Suspense fallback is null so a cold ticker
            fetch never blocks page content from streaming in. */}
        <Suspense fallback={null}>
          <TickerStrip />
        </Suspense>
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
      <GoogleAnalytics gaId={GA_ID} />
    </html>
  );
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--color-line)] bg-[color-mix(in_oklab,var(--color-stadium)_85%,transparent)] backdrop-blur">
      <div className="relative mx-auto flex h-16 max-w-[var(--max-w)] items-center justify-between px-5 sm:px-8">
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
              FDF BOX SCORE
            </div>
            <div className="mono-eyebrow mt-1" style={{ fontSize: "9.5px" }}>
              NFL · PLAYER TOKEN MARKET
            </div>
          </div>
        </Link>
        {/* Desktop nav — md+ */}
        <nav className="hidden md:flex items-center gap-1 text-sm">
          <NavLink href="/">Overview</NavLink>
          <NavLink href="/#players">Players</NavLink>
          <NavLink href="/#trades">Live Feed</NavLink>
          <NavLink href="/wallets">Top Wallets</NavLink>
          <NavLink href="/tournament-matrix">2025 Data</NavLink>
          <NavLink href="/on-fire" icon={<Flame className="h-3.5 w-3.5" strokeWidth={2} />}>
            On Fire
          </NavLink>
          <NavLinkHighlighted href="/value">Value Plays</NavLinkHighlighted>
          <span className="mx-1 h-5 w-px bg-[var(--color-line)]" aria-hidden />
          <ThemeToggle />
        </nav>
        {/* Mobile hamburger + slide-down panel */}
        <MobileNav />
      </div>
    </header>
  );
}

function NavLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-[var(--r-8)] px-3 py-1.5 text-[13px] font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bench)] transition-colors"
    >
      {icon}
      <span>{children}</span>
    </Link>
  );
}

// Accent-filled chip variant — used to make a single nav item stand out
// as the primary call-to-action (Value Tool right now).
function NavLinkHighlighted({
  href,
  icon,
  children,
}: {
  href: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="ml-1 inline-flex items-center gap-1.5 rounded-[var(--r-8)] border px-3 py-1.5 text-[13px] font-bold transition-colors"
      style={{
        borderColor: "var(--accent-line)",
        background: "var(--accent-tint)",
        color: "var(--accent-soft)",
      }}
    >
      {icon}
      <span>{children}</span>
    </Link>
  );
}

function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-[var(--color-line)] py-6 text-xs text-[var(--color-text-dim)]">
      <div className="mx-auto flex max-w-[var(--max-w)] flex-col gap-2 px-5 sm:px-8 md:flex-row md:items-center md:justify-between">
        <div>
          Built by{" "}
          <a
            href="https://x.com/brydisanto"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-[var(--accent-soft)] hover:text-[var(--color-text)] hover:underline"
          >
            @brydisanto
          </a>
          {" · "}
          FDF Box Score · Independent NFL token analytics. Not affiliated with the NFL or Sport.fun.
        </div>
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
      aria-label="FDF Box Score"
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
