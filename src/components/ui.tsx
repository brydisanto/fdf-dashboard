import clsx from "clsx";

export function Card({
  className,
  children,
  padded = true,
}: {
  className?: string;
  children: React.ReactNode;
  padded?: boolean;
}) {
  return (
    <div
      className={clsx(
        "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]",
        padded && "p-4 sm:p-5",
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
    <div className={clsx("mb-3 flex items-end justify-between gap-3", className)}>
      <div>
        <div className="text-sm font-semibold tracking-tight">{title}</div>
        {hint ? (
          <div className="mt-0.5 text-xs text-[var(--color-text-dim)]">{hint}</div>
        ) : null}
      </div>
      {right}
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
  const positive = value >= 0;
  const sign = withSign ? (positive ? "+" : "") : "";
  return (
    <span
      className={clsx(
        "tabular font-medium",
        positive ? "text-[var(--color-gain)]" : "text-[var(--color-loss)]",
        className,
      )}
    >
      {sign}
      {value.toFixed(digits)}%
    </span>
  );
}

export function Pill({
  children,
  tone = "muted",
  className,
}: {
  children: React.ReactNode;
  tone?: "muted" | "brand" | "gain" | "loss";
  className?: string;
}) {
  const tones: Record<string, string> = {
    muted: "bg-[var(--color-surface-2)] text-[var(--color-text-muted)] border-[var(--color-border)]",
    brand: "bg-[var(--color-brand)]/10 text-[var(--color-brand-soft)] border-[var(--color-brand)]/30",
    gain:  "bg-[var(--color-gain)]/10 text-[var(--color-gain)] border-[var(--color-gain)]/30",
    loss:  "bg-[var(--color-loss)]/10 text-[var(--color-loss)] border-[var(--color-loss)]/30",
  };
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
