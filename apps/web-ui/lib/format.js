export function shortAddress(value) {
  if (!value) {
    return "-";
  }
  if (value.length < 12) {
    return value;
  }
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Format a decimal string / number for display (ETH price). */
export function formatEthPrice(value) {
  const n = asNumber(value, NaN);
  if (!Number.isFinite(n)) {
    return "—";
  }
  if (n === 0) {
    return "0";
  }
  const abs = Math.abs(n);
  if (abs >= 1e9 || (abs < 1e-8 && abs > 0)) {
    return n.toExponential(6);
  }
  if (abs >= 1) {
    return n.toLocaleString("en-US", { maximumFractionDigits: 8 });
  }
  return n.toLocaleString("en-US", { maximumFractionDigits: 12 });
}

/** Fixed locale + manual $ prefix so SSR (Node) and client match — avoid `style: "currency"` (US$ vs $). */
export function formatUsd(eth, ethUsd) {
  const e = asNumber(eth, NaN);
  const u = asNumber(ethUsd, NaN);
  if (!Number.isFinite(e) || !Number.isFinite(u)) {
    return "—";
  }
  const usd = e * u;
  const abs = Math.abs(usd);
  const formatted = abs.toLocaleString("en-US", {
    maximumFractionDigits: 6,
    minimumFractionDigits: 0
  });
  return usd < 0 ? `-$${formatted}` : `$${formatted}`;
}

/** Integer string (wei) → decimal human string. */
export function formatUnits(str, decimals = 18) {
  const raw = String(str ?? "0").trim();
  if (raw === "" || raw === "-") {
    return "0";
  }
  const neg = raw.startsWith("-");
  let v;
  try {
    v = BigInt(neg ? raw.slice(1) : raw);
  } catch {
    return String(str);
  }
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  const frac = v % base;
  const fracStr = frac
    .toString()
    .padStart(Number(decimals), "0")
    .replace(/0+$/, "");
  const core = fracStr ? `${whole}.${fracStr}` : `${whole}`;
  return neg && v !== 0n ? `-${core}` : core;
}

/**
 * Heuristic: spot from a single swap can look extreme if the token leg is tiny or pool orientation is wrong.
 */
export function priceValidationHint(priceEth) {
  const n = asNumber(priceEth, NaN);
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  if (n > 1e6 || (n < 1e-12 && n > 0)) {
    return "This value is derived from the last swap amounts (|ΔETH| / |Δtoken|). Very large or tiny numbers often mean a dust-sized leg or a pool-orientation issue—compare with a block explorer.";
  }
  return null;
}

export function explorerAddressUrl(base, address) {
  if (!address || !base) {
    return null;
  }
  return `${base.replace(/\/$/, "")}/address/${address}`;
}

export function explorerTxUrl(base, txHash) {
  if (!txHash || !base) {
    return null;
  }
  return `${base.replace(/\/$/, "")}/tx/${txHash}`;
}
