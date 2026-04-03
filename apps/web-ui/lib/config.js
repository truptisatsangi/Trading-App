export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3003";

export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3004";

/** Base URL for block explorer (no trailing slash), e.g. https://basescan.org */
export const EXPLORER_BASE =
  process.env.NEXT_PUBLIC_EXPLORER_BASE || "https://basescan.org";
