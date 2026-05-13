import clsx from "clsx";

// Reusable skeleton primitives for `loading.tsx` page shells.
// Lightweight, theme-aware (CSS vars), pulses via the global
// `animate-pulse` Tailwind utility.
//
// IMPORTANT: backgrounds must have enough contrast against the page
// substrate to actually look like a skeleton. The naive approach of
// tinting --color-bench is invisible on the dark theme because
// --color-bench (#131316) is only ~3% lighter than --color-stadium
// (#0B0B0D). Use --color-text-tinted blends instead — those scale
// with the theme and stay visible on both palettes.

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
    <div
      className={clsx(
        "block animate-pulse rounded",
        className,
      )}
      style={{
        width: typeof w === "number" ? `${w}px` : w ?? "100%",
        height: typeof h === "number" ? `${h}px` : h,
        // ~14% text color over transparent: visible on both
        // charcoal (#0B0B0D) and white substrates.
        background: "color-mix(in oklab, var(--color-text) 14%, transparent)",
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
        "animate-pulse rounded-[var(--r-14)] border border-[var(--color-line-strong)]",
        className,
      )}
      style={{
        height: typeof h === "number" ? `${h}px` : h,
        // 10% text over the page bg is clearly visible on dark
        // without overwhelming on white.
        background: "color-mix(in oklab, var(--color-text) 10%, transparent)",
      }}
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
        className="mt-3 relative rounded-[var(--r-14)] border border-[var(--color-line-strong)] overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, color-mix(in oklab, var(--color-text) 6%, transparent) 0%, color-mix(in oklab, var(--color-text) 10%, transparent) 100%)",
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
        className="mt-4 grid gap-[1px] rounded-[var(--r-14)] overflow-hidden border border-[var(--color-line-strong)]"
        style={{
          gridTemplateColumns: `repeat(${statCount}, minmax(0, 1fr))`,
          background: "var(--color-line-strong)",
        }}
      >
        {Array.from({ length: statCount }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-2"
            style={{
              padding: "16px 18px",
              background: "color-mix(in oklab, var(--color-text) 6%, transparent)",
            }}
          >
            <Sk w={90} h={10} />
            <Sk w={130} h={26} />
            <Sk w={70} h={10} />
          </div>
        ))}
      </div>
      {/* Body */}
      <div className="mt-6">
        <Sk w={260} h={22} />
        <div className="mt-4">
          <SkBlock h={bodyHeight} />
        </div>
      </div>
    </div>
  );
}
