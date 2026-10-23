// TP per $100 spent — shared by the matrix table and its leader cards so
// the two can never disagree.
//
// TP is split only among a player's active shares. $100 buys 100 / price
// shares, which earn that fraction of the active pool:
//
//   tpWon × 100 / (price × activeShares)
//
// Kept in its own module (rather than tournament-matrix.ts) so the client
// table can import it without bundling every season's matrix JSON.

export function tpPer100(
  tpWon: number | undefined,
  price: number | undefined,
  activeShares: number | undefined,
): number | null {
  if (!tpWon || !price || price <= 0 || !activeShares) return null;
  return (tpWon * 100) / (price * activeShares);
}

// Compact display shared by the column and the leader card: one decimal
// below 100, whole numbers to 999, then #.#K so the column stays narrow.
export function fmtPer100(n: number | null | undefined): string {
  if (n == null || n <= 0) return "—";
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n >= 100 ? Math.round(n).toString() : n.toFixed(1);
}
