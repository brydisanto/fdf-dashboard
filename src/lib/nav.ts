// Single source for the site nav, shared by the desktop bar and the
// mobile panel. Top-level items are links or groups; groups render as a
// dropdown on desktop and as a labeled section on mobile.

export interface NavLinkItem {
  href: string;
  label: string;
  short?: string;     // tighter label for the desktop bar
  hint?: string;      // one line under the label in dropdowns
  flame?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavLinkItem[];
}

export type NavEntry = NavLinkItem | NavGroup;

export const isGroup = (e: NavEntry): e is NavGroup => "items" in e;

export const NAV: NavEntry[] = [
  { href: "/", label: "Overview" },
  { href: "/#players", label: "Players" },
  { href: "/#trades", label: "Live Feed" },
  {
    label: "Wallets",
    items: [
      { href: "/wallets", label: "Top Wallets", hint: "Biggest holders and what they own" },
      { href: "/new-wallets", label: "New Wallets", hint: "First-time buyers as they arrive" },
      { href: "/seller-watch", label: "Seller Watch", hint: "Who is selling, which players are safest" },
    ],
  },
  {
    label: "Scoring",
    items: [
      { href: "/scoring", label: "Weekly Scoring", hint: "Fantasy points by player, week by week" },
      { href: "/tournament-matrix", label: "Tournament Matrix", hint: "Season finishes, TP won and TP per $100" },
    ],
  },
  { href: "/buyback", label: "Buyback" },
  { href: "/on-fire", label: "On Fire", flame: true },
];

/** True when `href` is the page at `pathname` (hash links never match). */
export function isActive(href: string, pathname: string): boolean {
  if (href.includes("#")) return false;
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
