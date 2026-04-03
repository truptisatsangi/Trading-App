import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL, EXPLORER_BASE, WS_URL } from "../../lib/config";
import {
  explorerAddressUrl,
  explorerTxUrl,
  formatEthPrice,
  formatUnits,
  formatUsd,
  priceValidationHint
} from "../../lib/format";

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

  const t = detail.token;
  const priceHint = t ? priceValidationHint(t.price_eth) : null;
  const ethUsd = t?.eth_usd;

  return (
    <main className="container">
      <p style={{ marginTop: 0 }}>
        <Link href="/tokens">← Back to tokens</Link>
      </p>

      <h1 className="page-title">Token</h1>
      <div className="panel">
        <div className="addr-line">
          <span className="muted">Contract</span>
        </div>
        <p className="mono" style={{ margin: "0.25rem 0" }}>
          {tokenId}
        </p>
        {explorerAddressUrl(EXPLORER_BASE, tokenId) && (
          <a href={explorerAddressUrl(EXPLORER_BASE, tokenId)} target="_blank" rel="noreferrer">
            Open on block explorer
          </a>
        )}

        <div className="addr-line" style={{ marginTop: "0.75rem" }}>
          <span className="muted">Creator</span>
        </div>
        <p className="mono" style={{ margin: "0.25rem 0" }}>
          {t?.creator_address || "—"}
        </p>
        {t?.creator_address && explorerAddressUrl(EXPLORER_BASE, t.creator_address) && (
          <a
            href={explorerAddressUrl(EXPLORER_BASE, t.creator_address)}
            target="_blank"
            rel="noreferrer"
          >
            Creator on explorer
          </a>
        )}

        <div className="addr-line" style={{ marginTop: "0.75rem" }}>
          <span className="muted">Pool / orientation</span>
        </div>
        <p style={{ margin: "0.25rem 0" }}>
          <span className="mono">{t?.pool_id || "—"}</span>
          {t?.currency_flipped != null && (
            <span className="muted"> · currency_flipped: {String(t.currency_flipped)}</span>
          )}
        </p>

        <div className="addr-line" style={{ marginTop: "0.75rem" }}>
          <span className="muted">Price (ETH)</span>
        </div>
        <p style={{ margin: "0.25rem 0", fontSize: "1.1rem", fontWeight: 600 }}>
          {t ? formatEthPrice(t.price_eth) : "—"}{" "}
          <span className="muted" style={{ fontWeight: 400 }}>
            · USD ≈ {formatUsd(t?.price_eth, ethUsd)}
          </span>
        </p>
        <p className="hint">
          24h volume (ETH, from 1m buckets):{" "}
          {t?.volume_24h_eth != null ? formatEthPrice(t.volume_24h_eth) : "—"} · Holders:{" "}
          {t?.holder_count ?? "—"}
        </p>
        {priceHint && <div className="warn">{priceHint}</div>}
      </div>

      <div className="panel">
        <h2>How price is computed (validation)</h2>
        <p className="hint">
          <strong>Spot price</strong> comes from the pool&apos;s Uniswap-style <code>sqrtPriceX96</code> on
          each indexed <code>PoolStateUpdated</code> event (stored in <code>token_prices_derived_current</code>
          ). That is the canonical mid price. Trade tables show raw <code>uni_amount*</code> for debugging; a
          single trade&apos;s ratio is not used as spot when it would be distorted by dust legs.
        </p>
      </div>

      {t?.fee_distribution && (
        <div className="panel">
          <h2>Fee distribution (indexed amounts)</h2>
          <p className="hint">
            Raw values from <code>PoolFeesDistributed</code>-style indexing; treat as wei-like
            integers unless you confirm decimals in the protocol.
          </p>
          <div className="table-wrap">
            <table className="data">
              <tbody>
                {Object.entries(t.fee_distribution).map(([k, v]) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td className="mono">{String(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <h2 className="page-title" style={{ fontSize: "1.1rem", marginTop: "1.25rem" }}>
        Last 20 trades
      </h2>
      <p className="hint">Full tx hash; uni amounts shown as 18-decimal units for readability.</p>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Block</th>
              <th>Tx</th>
              <th className="num">uni Δ0</th>
              <th className="num">uni Δ1</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {detail.trades.map((trade) => (
              <tr key={`${trade.tx_hash}:${trade.log_index}`}>
                <td>{trade.block_number}</td>
                <td>
                  <span className="mono">{trade.tx_hash}</span>
                  <br />
                  {explorerTxUrl(EXPLORER_BASE, trade.tx_hash) && (
                    <a
                      href={explorerTxUrl(EXPLORER_BASE, trade.tx_hash)}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: "0.8rem" }}
                    >
                      Explorer
                    </a>
                  )}
                </td>
                <td className="num mono">{formatUnits(trade.uni_amount0, 18)}</td>
                <td className="num mono">{formatUnits(trade.uni_amount1, 18)}</td>
                <td className="muted">{trade.indexed_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="page-title" style={{ fontSize: "1.1rem", marginTop: "1.25rem" }}>
        1m candles
      </h2>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Bucket</th>
              <th className="num">Open</th>
              <th className="num">High</th>
              <th className="num">Low</th>
              <th className="num">Close</th>
              <th className="num">Trades</th>
            </tr>
          </thead>
          <tbody>
            {detail.candles1m.map((candle) => (
              <tr key={candle.bucket_start}>
                <td className="muted">{candle.bucket_start}</td>
                <td className="num">{formatEthPrice(candle.open_price_eth)}</td>
                <td className="num">{formatEthPrice(candle.high_price_eth)}</td>
                <td className="num">{formatEthPrice(candle.low_price_eth)}</td>
                <td className="num">{formatEthPrice(candle.close_price_eth)}</td>
                <td className="num">{candle.trade_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
