// 72 NFL player tokens listed on Sport.fun (Football.fun's NFL market).
// Captured from api.tenero.io/v1/sportsfun/tokens on 2025-12-12 via live
// inspection. The contract is shared across every player; only the
// numeric tokenId differs per player.
//
// Each row: [id, displayName, position, team, symbol, jerseyNumber, tokenIdSuffix]

import type { Player, Position, NflTeam } from "../types";

export const FOOTBALLFUN_CONTRACT =
  "0x2EeF466e802Ab2835aB81BE63eEbc55167d35b56";

type Row = readonly [string, string, Position, NflTeam, string, number, string];

const ROWS: Row[] = [
  // QBs
  ["josh-allen",         "Josh Allen",          "QB", "BUF", "JA17",  17, "67997479"],
  ["dak-prescott",       "Dak Prescott",        "QB", "DAL", "DP4",    4, "769476837"],
  ["lamar-jackson",      "Lamar Jackson",       "QB", "BAL", "LJ8",    8, "401615555"],
  ["jalen-hurts",        "Jalen Hurts",         "QB", "PHI", "JH1",    1, "79420307"],
  ["caleb-williams",     "Caleb Williams",      "QB", "CHI", "CW18",  18, "1886297532"],
  ["bo-nix",             "Bo Nix",              "QB", "DEN", "BN10",  10, "833812969"],
  ["drake-maye",         "Drake Maye",          "QB", "NE",  "DM10",  10, "608240281"],
  ["jared-goff",         "Jared Goff",          "QB", "DET", "JG16",  16, "1627881947"],
  ["justin-herbert",     "Justin Herbert",      "QB", "LAC", "JH10",  10, "1733678391"],
  ["patrick-mahomes",    "Patrick Mahomes",     "QB", "KC",  "PM15",  15, "646914359"],
  ["jordan-love",        "Jordan Love",         "QB", "GB",  "JL10",  10, "88065636"],
  ["baker-mayfield",     "Baker Mayfield",      "QB", "TB",  "BM6",    6, "403250563"],

  // RBs
  ["christian-mccaffrey","Christian McCaffrey", "RB", "SF",  "CM23",  23, "2050898691"],
  ["bijan-robinson",     "Bijan Robinson",      "RB", "ATL", "BR7",    7, "1877680294"],
  ["jahmyr-gibbs",       "Jahmyr Gibbs",        "RB", "DET", "JG0",    0, "298000720"],
  ["jonathan-taylor",    "Jonathan Taylor",     "RB", "IND", "JT28",  28, "1045355498"],
  ["devon-achane",       "De'Von Achane",       "RB", "MIA", "DA28",  28, "656282335"],
  ["saquon-barkley",     "Saquon Barkley",      "RB", "PHI", "SB26",  26, "1613245508"],
  ["josh-jacobs",        "Josh Jacobs",         "RB", "GB",  "JJ8",    8, "1511237082"],
  ["james-cook",         "James Cook III",      "RB", "BUF", "JC4",    4, "532139037"],
  ["ashton-jeanty",      "Ashton Jeanty",       "RB", "LV",  "AJ2",    2, "1229893067"],
  ["kyren-williams",     "Kyren Williams",      "RB", "LAR", "KW23",  23, "1704342915"],
  ["bucky-irving",       "Bucky Irving",        "RB", "TB",  "BI7",    7, "1708223670"],
  ["derrick-henry",      "Derrick Henry",       "RB", "BAL", "DH22",  22, "33526712"],
  ["javonte-williams",   "Javonte Williams",    "RB", "DAL", "JW33",  33, "1072658622"],
  ["jaylen-warren",      "Jaylen Warren",       "RB", "PIT", "JW30",  30, "1207389650"],
  ["chase-brown",        "Chase Brown",         "RB", "CIN", "CB30",  30, "1561296583"],
  ["rico-dowdle",        "Rico Dowdle",         "RB", "CAR", "RD5",    5, "1591779333"],
  ["travis-etienne",     "Travis Etienne Jr.",  "RB", "JAX", "TE1",    1, "626101435"],
  ["jk-dobbins",         "J.K. Dobbins",        "RB", "DEN", "JD27",  27, "184212668"],
  ["alvin-kamara",       "Alvin Kamara",        "RB", "NO",  "AK41",  41, "1029815641"],
  ["kenneth-walker",     "Kenneth Walker III",  "RB", "SEA", "KW9",    9, "1634868202"],
  ["isiah-pacheco",      "Isiah Pacheco",       "RB", "KC",  "IP10",  10, "509502421"],
  ["treveyon-henderson", "TreVeyon Henderson",  "RB", "NE",  "TH32",  32, "637063064"],
  ["omarion-hampton",    "Omarion Hampton",     "RB", "LAC", "OH8",    8, "1835372287"],
  ["dandre-swift",       "D'Andre Swift",       "RB", "CHI", "DS4",    4, "1096457743"],

  // WRs
  ["puka-nacua",         "Puka Nacua",          "WR", "LAR", "PN12",  12, "344873876"],
  ["jamarr-chase",       "Ja'Marr Chase",       "WR", "CIN", "JC1",    1, "1694187555"],
  ["justin-jefferson",   "Justin Jefferson",    "WR", "MIN", "JJ18",  18, "1987964071"],
  ["jaxon-smith-njigba", "Jaxon Smith-Njigba",  "WR", "SEA", "JS11",  11, "439100286"],
  ["ceedee-lamb",        "CeeDee Lamb",         "WR", "DAL", "CL88",  88, "850942466"],
  ["amon-ra-st-brown",   "Amon-Ra St. Brown",   "WR", "DET", "ASB14", 14, "1955323065"],
  ["nico-collins",       "Nico Collins",        "WR", "HOU", "NC12",  12, "1737560144"],
  ["rashee-rice",        "Rashee Rice",         "WR", "KC",  "RR4",    4, "350071857"],
  ["drake-london",       "Drake London",        "WR", "ATL", "DL5",    5, "1339944146"],
  ["zay-flowers",        "Zay Flowers",         "WR", "BAL", "ZF4",    4, "942484606"],
  ["dk-metcalf",         "DK Metcalf",          "WR", "PIT", "DM4",    4, "1809188809"],
  ["jaylen-waddle",      "Jaylen Waddle",       "WR", "MIA", "JW17",  17, "1924940894"],
  ["aj-brown",           "A.J. Brown",          "WR", "PHI", "AB11",  11, "2018186111"],
  ["chris-olave",        "Chris Olave",         "WR", "NO",  "CO12",  12, "1094525731"],
  ["brian-thomas",       "Brian Thomas Jr.",    "WR", "JAX", "BT7",    7, "679992678"],
  ["garrett-wilson",     "Garrett Wilson",      "WR", "NYJ", "GW5",    5, "2111895848"],
  ["ladd-mcconkey",      "Ladd McConkey",       "WR", "LAC", "LM15",  15, "1957905857"],
  ["tetairoa-mcmillan",  "Tetairoa McMillan",   "WR", "CAR", "TM4",    4, "892204822"],
  ["emeka-egbuka",       "Emeka Egbuka",        "WR", "TB",  "EE2",    2, "363339787"],
  ["khalil-shakir",      "Khalil Shakir",       "WR", "BUF", "KS10",  10, "1631265816"],
  ["rome-odunze",        "Rome Odunze",         "WR", "CHI", "RO15",  15, "1965487160"],
  ["stefon-diggs",       "Stefon Diggs",        "WR", "NE",  "SD8",    8, "1892649533"],
  ["michael-pittman",    "Michael Pittman Jr.", "WR", "IND", "MP11",  11, "280776288"],
  ["courtland-sutton",   "Courtland Sutton",    "WR", "DEN", "CS14",  14, "1986714215"],

  // TEs
  ["brock-bowers",       "Brock Bowers",        "TE", "LV",  "BB89",  89, "972599423"],
  ["trey-mcbride",       "Trey McBride",        "TE", "ARI", "TM85",  85, "1597935612"],
  ["george-kittle",      "George Kittle",       "TE", "SF",  "GK85",  85, "1257875488"],
  ["tyler-warren",       "Tyler Warren",        "TE", "IND", "TW84",  84, "268596935"],
  ["sam-laporta",        "Sam LaPorta",         "TE", "DET", "SL87",  87, "202647757"],
  ["oronde-gadsden",     "Oronde Gadsden",      "TE", "LAC", "OG86",  86, "708089183"],
  ["dallas-goedert",     "Dallas Goedert",      "TE", "PHI", "DG88",  88, "1049357910"],
  ["travis-kelce",       "Travis Kelce",        "TE", "KC",  "TK87",  87, "543182829"],
  ["jake-ferguson",      "Jake Ferguson",       "TE", "DAL", "JF87",  87, "1953241833"],
  ["hunter-henry",       "Hunter Henry",        "TE", "NE",  "HH85",  85, "946323199"],
  ["mark-andrews",       "Mark Andrews",        "TE", "BAL", "MA89",  89, "2078797761"],
  ["dalton-kincaid",     "Dalton Kincaid",      "TE", "BUF", "DK86",  86, "1378093404"],
];

export interface NflPlayer extends Player {
  displayName: string;
  symbol: string;
  tokenAddress: string;
  tokenIdSuffix: string;
}

export const ROSTER: NflPlayer[] = ROWS.map(([id, displayName, position, team, symbol, jersey, suffix]) => {
  const stripped = displayName.replace(/\s+(Jr\.|Sr\.|II|III|IV)$/i, "").trim();
  const idx = stripped.lastIndexOf(" ");
  const firstName = idx >= 0 ? stripped.slice(0, idx) : stripped;
  const lastName  = idx >= 0 ? stripped.slice(idx + 1) : "";
  return {
    id,
    displayName,
    firstName,
    lastName,
    position,
    team,
    jerseyNumber: jersey,
    symbol,
    tokenAddress: `${FOOTBALLFUN_CONTRACT}:${suffix}`,
    tokenIdSuffix: suffix,
  };
});

export const ROSTER_BY_ID = new Map(ROSTER.map((p) => [p.id, p]));
export const ROSTER_BY_TOKEN = new Map(ROSTER.map((p) => [p.tokenAddress, p]));
