import { HeroPageSkeleton } from "@/components/PageSkeleton";

export default function Loading() {
  return <HeroPageSkeleton pillCount={2} statCount={4} bodyHeight={560} />;
}
