import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL, EXPLORER_BASE, WS_URL } from "../../lib/config";
import {
  asNumber,
  explorerAddressUrl,
  formatEthPrice,
  formatUsd,
  priceValidationHint
} from "../../lib/format";

const SORTS = [
  { id: "price", label: "Price (ETH)", key: "price_eth" },
  { id: "volume", label: "24h volume (ETH)", key: "volume_24h_eth" },
  { id: "newest", label: "Newest", key: "created_at" },
  { id: "holders", label: "Holders", key: "holder_count" }
];

function sortTokens(tokens, sortId) {
  const spec = SORTS.find((s) => s.id === sortId) || SORTS[0];
  const key = spec.key;
  return [...tokens].sort((a, b) => {
    if (key === "created_at") {
      return new Date(b[key] || 0) - new Date(a[key] || 0);
    }
    return asNumber(b[key]) - asNumber(a[key]);
  });
}

export default function TokensPage({ initialTokens }) {
  const [sortId, setSortId] = useState("price");
  const [tokensById, setTokensById] = useState(() => {
    const map = {};
    for (const token of initialTokens) {
      map[token.token_address] = token;
    }
    return map;
  });

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ action: "subscribe", room: "tokens" }));
    });
    ws.addEventListener("message", (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type !== "token.updated" || !msg.token?.token_address) {
          return;
        }
        setTokensById((prev) => ({
          ...prev,
          [msg.token.token_address]: {
            ...(prev[msg.token.token_address] || {}),
            ...msg.token
          }
        }));
      } catch {
        // Ignore malformed messages to keep UI stable.
      }
    });
    return () => ws.close();
  }, []);

  const tokens = useMemo(
    () => sortTokens(Object.values(tokensById), sortId),
    [tokensById, sortId]
  );

  return (
    <main className="container">
      <h1 className="page-title">Token discovery</h1>
      <p className="page-meta">
        Sorted list with full contract addresses for verification. USD uses the latest indexed
        ETH/USD oracle when available.
      </p>

      <div className="toolbar">
        <label className="sort">
          Sort by{" "}
          <select
            className="sort-select"
            value={sortId}
            onChange={(e) => setSortId(e.target.value)}
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <span className="muted">
          Total: {tokens.length}{" "}
          <span className="badge">live</span>
        </span>
      </div>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Token contract</th>
              <th>Creator</th>
              <th className="num">Price (ETH)</th>
              <th className="num">Price (USD)</th>
              <th className="num">Volume 24h (ETH)</th>
              <th className="num">Holders</th>
            </tr>
          </thead>
          <tbody>
            {tokens.map((token) => {
              const priceHint = priceValidationHint(token.price_eth);
              const ethUsd = token.eth_usd;
              const vol = token.volume_24h_eth;
              return (
                <tr key={token.token_address}>
                  <td>
                    <div className="mono">
                      <Link href={`/tokens/${token.token_address}`}>
                        {token.token_address}
                      </Link>
                    </div>
                    {explorerAddressUrl(EXPLORER_BASE, token.token_address) && (
                      <div className="muted" style={{ fontSize: "0.8rem" }}>
                        <a
                          href={explorerAddressUrl(EXPLORER_BASE, token.token_address)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View on explorer
                        </a>
                      </div>
                    )}
                    {priceHint && (
                      <div className="warn" style={{ marginTop: "0.35rem" }}>
                        {priceHint}
                      </div>
                    )}
                  </td>
                  <td>
                    {token.creator_address ? (
                      <>
                        <div className="mono">{token.creator_address}</div>
                        {explorerAddressUrl(EXPLORER_BASE, token.creator_address) && (
                          <div className="muted" style={{ fontSize: "0.8rem" }}>
                            <a
                              href={explorerAddressUrl(EXPLORER_BASE, token.creator_address)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Explorer
                            </a>
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="num">{formatEthPrice(token.price_eth)}</td>
                  <td className="num">{formatUsd(token.price_eth, ethUsd)}</td>
                  <td className="num">
                    {vol != null && vol !== ""
                      ? formatEthPrice(vol)
                      : "—"}
                  </td>
                  <td className="num">
                    {token.holder_count != null ? token.holder_count : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

    </main>
  );
}

export async function getServerSideProps() {
  const response = await fetch(`${API_BASE_URL}/tokens?limit=100&offset=0`);
  const body = await response.json();
  return {
    props: {
      initialTokens: body.data || []
    }
  };
}
