// Constants safe to import from both server and client components.

// Sport.fun platform fees by trade type.
export const FEE_RATE_BUY = 0.03;   // Gold/USDC → player
export const FEE_RATE_SELL = 0.03;  // player → Gold/USDC
export const FEE_RATE_SWAP = 0.05;  // player ↔ player

// Backwards-compatible alias used by the pools table (buy/sell tier).
export const POOL_FEE_RATE = FEE_RATE_BUY;
