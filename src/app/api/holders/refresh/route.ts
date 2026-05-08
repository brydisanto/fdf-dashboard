import { NextResponse } from "next/server";
import { refreshUniqueHolderSnapshot } from "@/lib/data/holder-indexer";

export const dynamic = "force-dynamic";
export const maxDuration = 600; // up to 10 min for the full pagination

/**
 * POST /api/holders/refresh
 *
 * Trigger a full unique-holder rescan. Paginates every NFL pool to
 * convergence (~3-7 minutes against the upstream 100/min rate limit),
 * dedupes wallet addresses, persists the snapshot + appends to history.
 *
 * Designed to be called by a cron once per hour. Protect with the
 * HOLDERS_REFRESH_SECRET env var:
 *
 *   curl -X POST https://gridiron.example.com/api/holders/refresh \
 *        -H "Authorization: Bearer $HOLDERS_REFRESH_SECRET"
 *
 * Vercel cron config (vercel.json):
 *   {
 *     "crons": [
 *       { "path": "/api/holders/refresh", "schedule": "0 * * * *" }
 *     ]
 *   }
 *
 * GET is also supported for ad-hoc local triggering. In production it's
 * blocked unless the secret matches.
 */
export async function POST(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const expected = process.env.HOLDERS_REFRESH_SECRET;
  if (expected && !auth.endsWith(expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const snapshot = await refreshUniqueHolderSnapshot();
  return NextResponse.json({ ok: true, snapshot });
}

export async function GET(request: Request) {
  // Local development convenience. Locked behind the same secret in
  // production.
  if (process.env.NODE_ENV === "production") {
    const auth = request.headers.get("authorization") ?? "";
    const expected = process.env.HOLDERS_REFRESH_SECRET;
    if (!expected || !auth.endsWith(expected)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  const snapshot = await refreshUniqueHolderSnapshot();
  return NextResponse.json({ ok: true, snapshot });
}
