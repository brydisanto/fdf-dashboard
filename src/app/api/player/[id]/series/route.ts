import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getPriceSeries } from "@/lib/data";
import type { Timeframe } from "@/lib/types";

// Lazy-load price series for 30D / ALL timeframes. The player page only
// fetches the default 7D server-side; the chart calls this route when
// the user clicks a different tab. Saves a Tenero OHLC roundtrip + a
// price-history snapshot scan per page render for the bigger windows.

const VALID: ReadonlySet<Timeframe> = new Set(["7D", "30D", "ALL"]);

export const revalidate = 300;

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const tf = req.nextUrl.searchParams.get("tf") as Timeframe | null;
  if (!tf || !VALID.has(tf)) {
    return NextResponse.json({ error: "invalid tf" }, { status: 400 });
  }
  const points = await getPriceSeries(id, tf);
  return NextResponse.json(
    { points },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    },
  );
}
