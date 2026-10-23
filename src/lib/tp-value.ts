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
