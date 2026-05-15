export function fmtUsd(n: number, opts: { compact?: boolean; digits?: number } = {}) {
  const { compact, digits } = opts;
  if (!Number.isFinite(n)) return "—";
  if (compact) {
    // Default precision: whole dollars below $1000 (e.g. $319), one decimal
    // at thousands+ so the compact notation still resolves (e.g. $5.1K,
    // $1.2M). Callers can override via `digits`.
    const defaultDigits = Math.abs(n) < 1000 ? 0 : 1;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: digits ?? defaultDigits,
    }).format(n);
  }
  // Non-compact dollar values default to whole dollars below $1000
  // (e.g. $319 — no cents for sub-thousand amounts) and keep cents at
  // $1000+ where the extra precision still scans.
  const defaultDigits = Math.abs(n) < 1000 ? 0 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits ?? defaultDigits,
    maximumFractionDigits: digits ?? defaultDigits,
  }).format(n);
}

export function fmtNum(n: number, opts: { compact?: boolean; digits?: number } = {}) {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    notation: opts.compact ? "compact" : "standard",
    maximumFractionDigits: opts.digits ?? 0,
  }).format(n);
}

export function fmtPct(n: number, digits = 2) {
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

export function fmtPrice(n: number) {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1000) return fmtUsd(n, { digits: 2 });
  if (n >= 1)    return fmtUsd(n, { digits: 3 });
  if (n >= 0.01) return fmtUsd(n, { digits: 4 });
  // Cap sub-cent prices at 5 decimals so e.g. $0.008240 → $0.00824
  // (matches Sport.fun's display precision).
  return fmtUsd(n, { digits: 5 });
}

export function fmtTimeAgo(ts: number, now = Date.now()) {
  const s = Math.max(1, Math.round((now - ts) / 1000));
  if (s < 60)        return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60)        return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24)        return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export function shortAddr(addr: string, head = 4, tail = 4) {
  if (!addr || addr.length <= head + tail + 2) return addr;
  return `${addr.slice(0, head + 2)}…${addr.slice(-tail)}`;
}

// Compact display name: first initial of the first given name + any
// middle tokens + last name. The roster parser collapses everything
// before the last whitespace into `firstName`, so players whose names
// have a middle particle (e.g. firstName "Amon-Ra St.", lastName
// "Brown") would render as "A. Brown" under the naive
// `${firstName[0]}. ${lastName}` pattern — losing the particle.
// This helper splits firstName on whitespace, abbreviates just the
// first token, and keeps middle tokens intact.
export function shortPlayerName(firstName: string, lastName: string): string {
  if (!firstName) return lastName ?? "";
  const parts = firstName.trim().split(/\s+/);
  const initial = parts[0]?.[0] ? `${parts[0][0]}.` : "";
  const middle = parts.slice(1).join(" ");
  const tail = [middle, lastName].filter(Boolean).join(" ");
  return tail ? `${initial} ${tail}` : initial;
}
