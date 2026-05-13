import { HeroPageSkeleton } from "@/components/PageSkeleton";

// Root loading shell. Mostly affects the very first cold render
// of `/` and back-to-home navigations.
export default function Loading() {
  return <HeroPageSkeleton pillCount={2} statCount={4} bodyHeight={620} />;
}
