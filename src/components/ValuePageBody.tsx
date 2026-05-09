"use client";

import { useState } from "react";
import { Card, CardHeader, Pill } from "./ui";
import { ValueScatter } from "./ValueScatter";
import { ValueTable, type ValueRow } from "./ValueTable";
import type { Position } from "@/lib/types";

// Owns the position filter state for /value so the scatter chart and
// the table both react to the same toggle. Renders the scatter card
// directly above the table card.
export function ValuePageBody({
  rows,
  total,
  matched,
}: {
  rows: ValueRow[];
  total: number;
  matched: number;
}) {
  const [pos, setPos] = useState<Position | "ALL">("QB");

  return (
    <>
      <Card className="mt-6">
        <CardHeader
          title="Rank Disparity Spectrum"
          hint="Each dot is a player · X = industry − FDF rank · Y = industry rank · click to drill in"
          right={
            <div
              className="flex items-center gap-3"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              <span className="inline-flex items-center gap-1.5 text-[var(--color-turf)]">
                <span className="inline-block h-2 w-2 rounded-full bg-[var(--color-turf)]" />
                Undervalued
              </span>
              <span className="inline-flex items-center gap-1.5 text-[var(--color-text-muted)]">
                <span className="inline-block h-2 w-2 rounded-full bg-[var(--color-text-muted)]" />
                Fair
              </span>
              <span className="inline-flex items-center gap-1.5 text-[var(--color-penalty)]">
                <span className="inline-block h-2 w-2 rounded-full bg-[var(--color-penalty)]" />
                Overvalued
              </span>
            </div>
          }
        />
        <ValueScatter rows={rows} pos={pos} />
      </Card>

      <Card className="mt-6">
        <CardHeader
          title="Rank Disparity Table"
          hint="FDF market rank vs FP / UD / ESPN industry consensus"
          right={<Pill tone="muted">{matched} matched · {total - matched} unranked</Pill>}
        />
        <ValueTable rows={rows} pos={pos} onPosChange={setPos} />
      </Card>
    </>
  );
}
