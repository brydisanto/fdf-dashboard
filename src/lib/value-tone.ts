// Magnitude-shaded color ramp for the rank-disparity Δ used on /value.
// Shared between the table cells and the scatter so a "MILDLY OVER"
// row in the table reads the same color as its dot in the scatter.
//
// |Δ| ≤ 1   FAIR              text-muted gray
// 1–3       MILDLY UNDER/OVER  pale green / yellow
// 3–6       UNDER/OVERVALUED   turf green / orange
// 6+        STRONGLY UNDER/OVER vivid turf / penalty red

export type DeltaTier =
  | "fair"
  | "unranked"
  | "under-mild"
  | "under-mod"
  | "under-sev"
  | "over-mild"
  | "over-mod"
  | "over-sev";

export interface DeltaTone {
  fg: string;
  tier: DeltaTier;
}

// Foreground references CSS custom properties (--tone-*) so the NFL
// light theme can substitute darker, more saturated values in
// globals.css without having to fork this logic.
export function deltaTone(value: number | null): DeltaTone {
  if (value == null) return { fg: "var(--color-text-dim)", tier: "unranked" };
  const abs = Math.abs(value);
  if (abs <= 1) return { fg: "var(--color-text-muted)", tier: "fair" };
  if (value < 0) {
    if (abs <= 3) return { fg: "var(--tone-under-mild)", tier: "under-mild" };
    if (abs <= 6) return { fg: "var(--tone-under-mod)",  tier: "under-mod" };
    return { fg: "var(--tone-under-sev)", tier: "under-sev" };
  }
  if (abs <= 3) return { fg: "var(--tone-over-mild)", tier: "over-mild" };
  if (abs <= 6) return { fg: "var(--tone-over-mod)",  tier: "over-mod" };
  return { fg: "var(--tone-over-sev)", tier: "over-sev" };
}
