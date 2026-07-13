"use client";

import dynamic from "next/dynamic";

// Client-side-only wrappers for every recharts consumer.
//
// recharts is the single largest JS chunk (~105KB gzip). None of its
// charts render anything useful during SSR anyway — ResponsiveContainer
// measures the DOM, so the server output is an empty box. Loading the
// library after hydration takes it off the critical path for first
// paint and interactivity.
//
// `ssr: false` must live in a client module (next/dynamic in a Server
// Component neither code-splits nor accepts ssr:false — see
// node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md), which
// is exactly what this file is. Import charts from here in pages;
// import the real modules only for types.
//
// Each `loading` placeholder matches the real component's rendered
// height so the swap-in doesn't shift layout.

function Box({ height }: { height: number }) {
  return (
    <div
      className="w-full animate-pulse rounded-lg"
      style={{ height, background: "color-mix(in oklab, var(--color-press) 60%, transparent)" }}
      aria-hidden
    />
  );
}

export const MarketCapChart = dynamic(
  () => import("./MarketCharts").then((m) => m.MarketCapChart),
  { ssr: false, loading: () => <Box height={280} /> },
);

// Composite section: 3 flow tiles + volume bar chart (200px) + hourly
// pulse chart (200px) with headers. ~430px on desktop.
export const MarketPulse = dynamic(
  () => import("./MarketPulse").then((m) => m.MarketPulse),
  { ssr: false, loading: () => <Box height={430} /> },
);

// 320px chart + ~36px timeframe-button row above it.
export const PlayerPriceChart = dynamic(
  () => import("./PlayerPriceChart").then((m) => m.PlayerPriceChart),
  { ssr: false, loading: () => <Box height={356} /> },
);

export const WalletFlowChart = dynamic(
  () => import("./WalletFlowChart").then((m) => m.WalletFlowChart),
  { ssr: false, loading: () => <Box height={200} /> },
);

// The wallet page renders this at size={220}; keep the placeholder in
// sync if that changes.
export const CompositionPie = dynamic(
  () => import("./CompositionPie").then((m) => m.CompositionPie),
  {
    ssr: false,
    loading: () => (
      <div
        className="animate-pulse rounded-full"
        style={{ width: 220, height: 220, background: "color-mix(in oklab, var(--color-press) 60%, transparent)" }}
        aria-hidden
      />
    ),
  },
);

export const ValueScatter = dynamic(
  () => import("./ValueScatter").then((m) => m.ValueScatter),
  { ssr: false, loading: () => <Box height={320} /> },
);
