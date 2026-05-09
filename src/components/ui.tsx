import clsx from "clsx";

type CardVariant = "default" | "feature" | "press";

export function Card({
  className,
  children,
  padded = true,
  variant = "default",
}: {
  className?: string;
  children: React.ReactNode;
  padded?: boolean;
  variant?: CardVariant;
}) {
  return (
    <div
      className={clsx(
        "card relative",
        // border-radius 14, 1px line, bench bg by default
        "rounded-[var(--r-14)] border border-[var(--color-line)] bg-[var(--color-bench)]",
        // feature: subtle gradient + amber hairline at top
        variant === "feature" && "card-feature",
        // press: inset surface with field-grid pattern
        variant === "press" && "card-press field-grid bg-[var(--color-press)]",
        padded && "p-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  hint,
  right,
  className,
}: {
  title: React.ReactNode;
  hint?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("mb-4 flex items-start justify-between gap-4", className)}>
      <div>
        <div
          className="text-[var(--color-text)]"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: "18px",
            letterSpacing: "0.02em",
            lineHeight: 1.1,
            textTransform: "uppercase",
          }}
        >
          {title}
        </div>
        {hint ? (
          <div className="mt-1 text-[12px] text-[var(--color-text-dim)]">{hint}</div>
        ) : null}
      </div>
      {right ? <div className="flex items-center gap-3">{right}</div> : null}
    </div>
  );
}

export function Delta({
  value,
  className,
  digits = 2,
  withSign = true,
}: {
  value: number;
  className?: string;
  digits?: number;
  withSign?: boolean;
}) {
  // Tri-state: up / down / flat (when value === 0)
  const flat = value === 0;
  const positive = value > 0;
  const sign = withSign ? (positive ? "+" : "") : "";
  const glyph = flat ? "◆" : positive ? "▲" : "▼";
  return (
    <span
      className={clsx(
        "mono inline-flex items-baseline gap-0.5 whitespace-nowrap",
        flat
          ? "text-[var(--color-text-dim)]"
          : positive
            ? "text-[var(--color-turf)]"
            : "text-[var(--color-penalty)]",
        className,
      )}
      style={{
        fontFamily: "var(--font-mono)",
        fontWeight: 700,
        fontSize: "12px",
        letterSpacing: "-0.01em",
      }}
    >
      <span aria-hidden style={{ fontSize: "9px" }}>{glyph}</span>
      <span>
        {sign}
        {value.toFixed(digits)}%
      </span>
    </span>
  );
}

type PillTone = "muted" | "brand" | "gain" | "loss" | "warn" | "info" | "outline" | "ghost";

export function Pill({
  children,
  tone = "muted",
  className,
}: {
  children: React.ReactNode;
  tone?: PillTone;
  className?: string;
}) {
  const tones: Record<PillTone, string> = {
    muted:
      "border-[var(--color-line)] bg-[var(--color-press)] text-[var(--color-text-muted)]",
    brand:
      "border-[var(--accent-line)] bg-[var(--accent-tint)] text-[var(--accent-soft)]",
    gain:
      "border-[color-mix(in_oklab,var(--color-turf)_35%,transparent)] bg-[color-mix(in_oklab,var(--color-turf)_10%,transparent)] text-[var(--color-turf)]",
    loss:
      "border-[color-mix(in_oklab,var(--color-penalty)_35%,transparent)] bg-[color-mix(in_oklab,var(--color-penalty)_10%,transparent)] text-[var(--color-penalty)]",
    warn:
      "border-[color-mix(in_oklab,var(--color-flag)_35%,transparent)] bg-[color-mix(in_oklab,var(--color-flag)_10%,transparent)] text-[var(--color-flag)]",
    info:
      "border-[color-mix(in_oklab,var(--color-broadcast)_35%,transparent)] bg-[color-mix(in_oklab,var(--color-broadcast)_10%,transparent)] text-[var(--color-broadcast)]",
    outline:
      "border-[var(--color-line)] bg-transparent text-[var(--color-text-muted)]",
    ghost:
      "border-transparent bg-transparent text-[var(--color-text-muted)]",
  };
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-[var(--r-4)] border px-2 py-1",
        tones[tone],
        className,
      )}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "10.5px",
        fontWeight: 700,
        letterSpacing: "0.14em",
        lineHeight: 1,
        textTransform: "uppercase",
      }}
    >
      {children}
    </span>
  );
}

// Card-feature gradient + hairline are class-based so they respond
// to data-attribute theme switches. Inline minimal styles:
import "./ui.feature.css";
