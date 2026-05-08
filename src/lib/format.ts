export function fmtUsd(n: number, opts: { compact?: boolean; digits?: number } = {}) {
  const { compact, digits } = opts;
  if (!Number.isFinite(n)) return "—";
  if (compact) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: digits ?? 2,
    }).format(n);
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits ?? 2,
    maximumFractionDigits: digits ?? 2,
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
  return fmtUsd(n, { digits: 6 });
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
