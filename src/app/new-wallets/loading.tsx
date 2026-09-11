import { HeroPageSkeleton } from "@/components/PageSkeleton";

// Unlocks route prefetching for the dynamic /new-wallets page so the
// nav click paints a skeleton instantly instead of waiting on the
// trade-index read + on-chain tail.
export default function Loading() {
  return <HeroPageSkeleton pillCount={2} statCount={4} bodyHeight={1400} />;
}
