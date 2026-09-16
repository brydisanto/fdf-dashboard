import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Value Plays is parked. Temporary (307) so browsers and search
  // engines don't cache it, which keeps the path free to bring back.
  async redirects() {
    return [{ source: "/value", destination: "/", permanent: false }];
  },
  turbopack: {
    root: path.join(__dirname),
  },
  experimental: {
    // Client cache TTLs for prefetched page segments.
    //   dynamic: 30s — matches our `export const revalidate = 30`
    //     on /player, /wallet, /wallets, /on-fire. Without this
    //     the default is 0s in Next 15+, so every back/forward
    //     and every revisit within seconds triggers a full server
    //     roundtrip.
    //   static: 300s — default; covers /loading.tsx shells and
    //     any static asset boundaries.
    staleTimes: {
      dynamic: 30,
      static: 300,
    },
  },
};

export default nextConfig;
