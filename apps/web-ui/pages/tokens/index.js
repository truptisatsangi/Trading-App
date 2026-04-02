import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL, WS_URL } from "../../lib/config";
import { asNumber, shortAddress } from "../../lib/format";

function sortTokens(tokens) {
  return [...tokens].sort((a, b) => asNumber(b.price_eth) - asNumber(a.price_eth));
}

export default function TokensPage({ initialTokens }) {
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

  const tokens = useMemo(() => sortTokens(Object.values(tokensById)), [tokensById]);

  return (
    <main>
      <h1>Tokens</h1>
      <p>Total: {tokens.length}</p>
      <table>
        <thead>
          <tr>
            <th>Token</th>
            <th>Creator</th>
            <th>Price (ETH)</th>
            <th>Volume (24h)</th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((token) => (
            <tr key={token.token_address}>
              <td>
                <Link href={`/tokens/${token.token_address}`}>{shortAddress(token.token_address)}</Link>
              </td>
              <td>{shortAddress(token.creator_address)}</td>
              <td>{asNumber(token.price_eth).toFixed(8)}</td>
              <td>{token.volume_24h_eth ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
