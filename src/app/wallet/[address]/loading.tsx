import { HeroPageSkeleton } from "@/components/PageSkeleton";

export default function Loading() {
  return <HeroPageSkeleton pillCount={3} statCount={4} bodyHeight={560} />;
}
