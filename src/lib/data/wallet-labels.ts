// Friendly labels for known wallets — surfaces names in place of
// mono addresses on the leaderboard, badges, and wallet detail
// hero. Keys are stored lowercase; lookups normalize the input.

export interface WalletLabel {
  name: string;
  // Optional flag — labelled wallets that should be visually
  // de-emphasized on leaderboards (e.g. internal/system wallets
  // that aren't real participants). Not used yet but reserved.
  systemWallet?: boolean;
}

const RAW: Record<string, WalletLabel> = {
  "0x4fdce033b9f30019337ddc5cc028dc023580585e": { name: "FDF Marketplace", systemWallet: true },
};

// Pre-lowercase the keys so callers don't have to.
const WALLET_LABELS: Record<string, WalletLabel> = Object.fromEntries(
  Object.entries(RAW).map(([addr, label]) => [addr.toLowerCase(), label]),
);

export function getWalletLabel(address: string | null | undefined): WalletLabel | null {
  if (!address) return null;
  return WALLET_LABELS[address.toLowerCase()] ?? null;
}
