"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Keeps the "live" server-rendered sections (trade feed, ticker,
// movers) current without a manual page reload.
//
// The homepage is force-dynamic, but nothing re-requested it once
// loaded — so the feed sat frozen while the "LIVE" dot implied
// streaming, which read as "the feed isn't updating" (especially in a
// quiet market where real trades are 30+ min apart). router.refresh()
// is a soft refresh: it re-fetches the route's server components and
// merges the new RSC payload without dropping scroll position or
// client state, so there's no flicker.
//
// The underlying data is cached ~5 min (trade-history.json is ~2.8MB
// and the indexer cron only writes every 5 min), so refreshing more
// often than that mostly returns identical data — the interval just
// needs to be short enough that new trades surface promptly once the
// cache rolls over. 60s is the balance. Refreshes pause while the tab
// is hidden, and fire once immediately when it becomes visible again.
export function LiveRefresher({ intervalMs = 60_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, intervalMs]);

  return null;
}
