import { HeroPageSkeleton } from "@/components/PageSkeleton";

// Unlocks prefetching for /scoring the same way the other routes do.
// The page itself is static (the scores are a committed snapshot), so
// this rarely shows — but without the file Next skips the prefetch.
export default function Loading() {
  return <HeroPageSkeleton pillCount={2} statCount={4} bodyHeight={900} />;
}
