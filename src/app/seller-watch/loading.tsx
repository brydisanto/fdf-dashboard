import { HeroPageSkeleton } from "@/components/PageSkeleton";

// Unlocks route prefetching for /seller-watch.
export default function Loading() {
  return <HeroPageSkeleton pillCount={2} statCount={4} bodyHeight={900} />;
}
