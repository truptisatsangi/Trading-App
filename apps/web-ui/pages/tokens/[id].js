import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL, WS_URL } from "../../lib/config";
import { asNumber, shortAddress } from "../../lib/format";

function normalizeDetail(detail) {
  return {
    token: detail?.token ?? null,
    candles1m: Array.isArray(detail?.candles1m) ? detail.candles1m : [],
    trades: Array.isArray(detail?.trades) ? detail.trades.slice(0, 20) : []
  };
}

export default function TokenDetailPage({ tokenId, initialDetail }) {
  const [detail, setDetail] = useState(() => normalizeDetail(initialDetail));

  const refresh = useCallback(async () => {
    const res = await fetch(
      `${API_BASE_URL}/tokens/${tokenId}?tradeLimit=20&candleLimit=200`,
      { cache: "no-store" }
    );
    if (!res.ok) {
      return;
    }
    const body = await res.json();
    setDetail(normalizeDetail(body));
  }, [tokenId]);

  useEffect(() => {
    const room = `token:${tokenId.toLowerCase()}`;
    const ws = new WebSocket(WS_URL);
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ action: "subscribe", room }));
    });
    ws.addEventListener("message", (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type !== "token.tick") {
          return;
        }
        refresh();
      } catch {
        // Keep page alive on invalid websocket payloads.
      }
    });
    return () => ws.close();
  }, [refresh, tokenId]);

  return (
    <main>
      <p>
        <Link href="/tokens">Back to tokens</Link>
      </p>
      <h1>Token {shortAddress(tokenId)}</h1>
      <p>Price (ETH): {asNumber(detail.token?.price_eth).toFixed(8)}</p>

      <h2>Last 20 Trades</h2>
      <table>
        <thead>
          <tr>
            <th>Block</th>
            <th>Tx</th>
            <th>uniAmount0</th>
            <th>uniAmount1</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          {detail.trades.map((trade) => (
            <tr key={`${trade.tx_hash}:${trade.log_index}`}>
              <td>{trade.block_number}</td>
              <td>{shortAddress(trade.tx_hash)}</td>
              <td>{trade.uni_amount0}</td>
              <td>{trade.uni_amount1}</td>
              <td>{trade.indexed_at}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>1m Candles</h2>
      <table>
        <thead>
          <tr>
            <th>Bucket</th>
            <th>Open</th>
            <th>High</th>
            <th>Low</th>
            <th>Close</th>
            <th>Trades</th>
          </tr>
        </thead>
        <tbody>
          {detail.candles1m.map((candle) => (
            <tr key={candle.bucket_start}>
              <td>{candle.bucket_start}</td>
              <td>{candle.open_price_eth}</td>
              <td>{candle.high_price_eth}</td>
              <td>{candle.low_price_eth}</td>
              <td>{candle.close_price_eth}</td>
              <td>{candle.trade_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

export async function getServerSideProps(context) {
  const tokenId = String(context.params?.id || "").toLowerCase();
  const res = await fetch(`${API_BASE_URL}/tokens/${tokenId}?tradeLimit=20&candleLimit=200`);

  if (!res.ok) {
    return { notFound: true };
  }

  const initialDetail = await res.json();
  return {
    props: {
      tokenId,
      initialDetail: normalizeDetail(initialDetail)
    }
  };
}
