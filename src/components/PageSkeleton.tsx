import clsx from "clsx";

// Reusable skeleton primitives for `loading.tsx` page shells.
// Lightweight, theme-aware (CSS vars), pulses via the global
// `animate-pulse` Tailwind utility.

export function Sk({
  w,
  h = 16,
  className,
  style,
}: {
  w?: number | string;
  h?: number | string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={clsx(
        "inline-block animate-pulse rounded bg-[color-mix(in_oklab,var(--color-text)_8%,transparent)]",
        className,
      )}
      style={{
        width: typeof w === "number" ? `${w}px` : w ?? "100%",
        height: typeof h === "number" ? `${h}px` : h,
        ...style,
      }}
    />
  );
}

export function SkBlock({
  h = 200,
  className,
}: {
  h?: number | string;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "animate-pulse rounded-[var(--r-14)] border border-[var(--color-line)] bg-[color-mix(in_oklab,var(--color-bench)_60%,transparent)]",
        className,
      )}
      style={{ height: typeof h === "number" ? `${h}px` : h }}
    />
  );
}

// Generic page skeleton: optional back-link + hero + stat-strip + body.
export function HeroPageSkeleton({
  pillCount = 2,
  statCount = 4,
  bodyHeight = 480,
}: {
  pillCount?: number;
  statCount?: number;
  bodyHeight?: number;
}) {
  return (
    <div className="mx-auto max-w-[var(--max-w)] px-5 sm:px-8 py-6 sm:py-8">
      {/* Back link */}
      <Sk w={120} h={12} />
      {/* Hero block */}
      <div
        className="mt-3 relative rounded-[var(--r-14)] border border-[var(--color-line)] overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, var(--color-bench) 0%, var(--color-press) 100%)",
        }}
      >
        <div
          className="flex flex-col gap-6"
          style={{ padding: "32px 32px 28px" }}
        >
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: pillCount }).map((_, i) => (
              <Sk key={i} w={120} h={22} className="rounded-full" />
            ))}
          </div>
          <Sk w="55%" h={48} />
          <Sk w="70%" h={14} />
        </div>
      </div>
      {/* Stat strip */}
      <div
        className="stat-strip mt-4 grid"
        style={{ gridTemplateColumns: `repeat(${statCount}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: statCount }).map((_, i) => (
          <div key={i} className="stat-cell">
            <Sk w={90} h={10} />
            <Sk w={130} h={26} />
            <Sk w={70} h={10} />
          </div>
        ))}
      </div>
      {/* Body */}
      <div className="mt-4">
        <Sk w={260} h={22} />
        <div className="mt-4">
          <SkBlock h={bodyHeight} />
        </div>
      </div>
    </div>
  );
}
