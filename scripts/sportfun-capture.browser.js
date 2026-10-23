/*
 * Weekly Sport.fun capture for the 2026 tournament matrix.
 *
 * Runs INSIDE a signed-in pro.football.fun tab (every endpoint it calls
 * needs the session's bearer token, which never leaves the page). Use a
 * lightweight page such as https://pro.football.fun/api/nfl/v1/config:
 * the full app page can freeze under a long-running script.
 *
 * Usage in the tab's console / a javascript tool:
 *   1. Paste this file, then call:
 *        sportfunCapture(["<tournamentId already captured>", ...])
 *      It runs in the background; poll window.__capture.status until it
 *      reads "done" or starts with "error".
 *   2. Read window.__capture.chunks.length, then window.__capture.chunks[i]
 *      one at a time (each under ~900 chars, because tool output is
 *      capped). Concatenate them in order into one file.
 *   3. node scripts/merge-sportfun-capture.mjs <that file>
 *
 * Output is a line-oriented text format so it survives being chunked:
 *   W|<tournamentId>|<firstKickoffISO>|<lastKickoffISO>   new completed week
 *   S|<POS>|tid36.rank36.ptsEnc36.tp,...                    that week's standings
 *   R|tid36|MMDD.y36,MMDD.y36,...                           TP history (2026 season)
 *   A|tid36.active36,...                                    active shares now
 * ptsEnc = round((points + 20) * 100); rank "_" = listed but did not play.
 *
 * Lessons baked in from doing this by hand:
 *   - /players/?limit=200 (NOT includePicksOnly=true, which errors)
 *   - sequential requests with a pause; parallel bursts get throttled
 *   - the tournaments list only returns the latest ten, so earlier weeks
 *     must already be in the capture file (they are)
 */
/* eslint-disable */
window.sportfunCapture = function sportfunCapture(knownTournamentIds) {
  // Match on the first 8 characters: some captured weeks were recorded
  // with shortened ids, and the prefix is unique across tournaments.
  const known = new Set((knownTournamentIds || []).map((id) => String(id).slice(0, 8)));
  const cap = (window.__capture = { status: "starting", chunks: [] });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const token = (() => {
    for (const store of [localStorage, sessionStorage]) {
      for (let i = 0; i < store.length; i++) {
        const m = (store.getItem(store.key(i)) || "").match(/eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/);
        if (m) return m[0];
      }
    }
    return null;
  })();
  const get = async (path) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const res = await fetch(path, { headers: { Authorization: "Bearer " + token } });
        if (res.status === 401) throw new Error("401 - not signed in to Sport.fun in this browser");
        const json = await res.json();
        if (json && json.data !== undefined) return json.data;
      } catch (err) {
        if (/401/.test(err.message)) throw err;
      }
      await sleep(1500 * (attempt + 1));
    }
    throw new Error("request kept failing: " + path);
  };
  const b36 = (n) => Math.round(Number(n)).toString(36);

  (async () => {
    try {
      if (!token) throw new Error("no Sport.fun session token in this tab - sign in first");
      const lines = [];

      cap.status = "players";
      const players = await get("/api/nfl/v3/players/?limit=200");
      const tidByPlayerId = new Map(players.map((p) => [p.id, p.oPlayerId]));
      lines.push("A|" + players.map((p) => `${b36(p.oPlayerId)}.${b36(p.globalShares?.active ?? 0)}`).join(","));

      cap.status = "tournaments";
      const tournaments = (await get("/api/nfl/v3/tournaments/"))
        .filter((t) => t.seasonYear === 2026 && t.status === "Completed" && t.startDate >= "2026-09-01")
        .filter((t) => !known.has(t.id.slice(0, 8)))
        .sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
      for (const t of tournaments) {
        lines.push(`W|${t.id}|${t.firstFixtureStartDate}|${t.lastFixtureStartDate}`);
        for (const pos of ["QB", "RB", "WR", "TE"]) {
          cap.status = `standings ${t.id.slice(0, 8)} ${pos}`;
          const rows = await get(`/api/nfl/v3/tournaments/${t.id}/standings/${pos}?limit=200&offset=0`);
          lines.push(`S|${pos}|` + rows.map((r) => [
            b36(tidByPlayerId.get(r.playerId)),
            r.ranking == null ? "_" : r.ranking.toString(36),
            b36((r.score + 20) * 100),
            r.reward > 0 ? 1 : 0,
          ].join(".")).join(","));
          await sleep(800);
        }
      }

      let n = 0;
      for (const p of players) {
        cap.status = `rewards ${++n}/${players.length}`;
        const data = await get(`/api/nfl/v3/tournaments/players/${p.id}/rewards`);
        const pts = (data.datasets?.[0]?.data ?? []).filter((q) => q.x >= "2026-09-01");
        lines.push(`R|${b36(p.oPlayerId)}|` + pts.map((q) => `${q.x.slice(5, 7)}${q.x.slice(8, 10)}.${b36(q.y || 0)}`).join(","));
        await sleep(450);
      }

      const text = lines.join("\n");
      for (let i = 0; i < text.length; i += 900) cap.chunks.push(text.slice(i, i + 900));
      cap.newWeeks = tournaments.length;
      cap.status = "done";
    } catch (err) {
      cap.status = "error: " + err.message;
    }
  })();
  return "started";
};
