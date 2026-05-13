import { HeroPageSkeleton } from "@/components/PageSkeleton";

// Critical: this file unlocks prefetching of the dynamic /wallets
// route. Without it, Next.js will NOT prefetch the route's payload
// and every nav click pays a full server roundtrip before any UI
// shows up. The Top Wallets aggregation (Top-K across 72 pools)
// can be slow on cold cache, so the skeleton matters a lot here.
export default function Loading() {
  return <HeroPageSkeleton pillCount={2} statCount={4} bodyHeight={520} />;
}
