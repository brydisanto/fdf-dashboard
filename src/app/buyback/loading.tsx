import { HeroPageSkeleton } from "@/components/PageSkeleton";

// Unlocks route prefetching for /buyback.
export default function Loading() {
  return <HeroPageSkeleton pillCount={2} statCount={4} bodyHeight={900} />;
}
