// Backwards-compatible re-exports. The canonical NFL roster now lives in
// roster.ts and is sourced from Tenero's live token list. Components that
// still import PLAYERS / PLAYERS_BY_ID from here continue to work.

import { ROSTER, ROSTER_BY_ID } from "./roster";
import type { Player } from "../types";

export const PLAYERS: Player[] = ROSTER;
export const PLAYERS_BY_ID: Map<string, Player> = ROSTER_BY_ID;

export const TEAM_NAMES: Record<string, string> = {
  ARI: "Cardinals", ATL: "Falcons", BAL: "Ravens", BUF: "Bills",
  CAR: "Panthers",  CHI: "Bears",   CIN: "Bengals", CLE: "Browns",
  DAL: "Cowboys",   DEN: "Broncos", DET: "Lions",   GB: "Packers",
  HOU: "Texans",    IND: "Colts",   JAX: "Jaguars", KC: "Chiefs",
  LAC: "Chargers",  LAR: "Rams",    LV: "Raiders",  MIA: "Dolphins",
  MIN: "Vikings",   NE: "Patriots", NO: "Saints",   NYG: "Giants",
  NYJ: "Jets",      PHI: "Eagles",  PIT: "Steelers",SEA: "Seahawks",
  SF: "49ers",      TB: "Buccaneers",TEN: "Titans", WAS: "Commanders",
};

// Per design system v0.2 ("Broadcast Booth"). Single source of truth
// for the team-color accents on table rows, avatar rims, and ticker
// dots. Keys match the `team` field on Player; uppercase abbreviations.
export const TEAM_COLORS: Record<string, string> = {
  ARI: "#97233F", ATL: "#A71930", BAL: "#241773", BUF: "#00338D",
  CAR: "#0085CA", CHI: "#0B162A", CIN: "#FB4F14", CLE: "#311D00",
  DAL: "#041E42", DEN: "#FB4F14", DET: "#0076B6", GB: "#203731",
  HOU: "#03202F", IND: "#002C5F", JAX: "#101820", KC: "#E31837",
  LAC: "#0080C6", LAR: "#003594", LV: "#000000",  MIA: "#008E97",
  MIN: "#4F2683", NE: "#002244",  NO: "#101820",  NYG: "#0B2265",
  NYJ: "#125740", PHI: "#004C54", PIT: "#FFB612", SEA: "#002244",
  SF: "#AA0000",  TB: "#D50A0A",  TEN: "#0C2340", WAS: "#5A1414",
};
