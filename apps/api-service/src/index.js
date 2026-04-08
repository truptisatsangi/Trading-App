import dotenv from "dotenv";
import express from "express";
import { Pool } from "pg";
import { fetchMemecoinCreator } from "./memecoinCreator.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 3003);
const chainId = Number(process.env.CHAIN_ID ?? 8453);
const rpcUrl = process.env.RPC_URL ?? "";
const db = new Pool({
  connectionString: process.env.DB_URL ?? "postgres://postgres:postgres@localhost:6432/token_db"
});

/** On-chain Memecoin.creator() when DB row is empty (see Memecoin.sol). */
async function enrichCreatorAddress(row) {
  if (row.creator_address || !rpcUrl) {
    return row;
  }
  const creator = await fetchMemecoinCreator(rpcUrl, row.token_address);
  if (!creator) {
    return row;
  }
  await db.query(
    `
    UPDATE tokens
    SET creator_address = $1
    WHERE chain_id = $2
      AND token_address = $3
      AND (creator_address IS NULL OR creator_address = '')
    `,
    [creator, chainId, row.token_address]
  );
  return { ...row, creator_address: creator };
}

const WEI = "1000000000000000000";
const ETH_USD_SCALE = "100000000";

/** Shared token columns (no joins that duplicate rows). */
const TOKEN_ROW_SELECT = `
  t.token_address,
  t.creator_address,
  t.created_at,
  t.memecoin_treasury,
  t.token_id,
  p.pool_id,
  p.price_eth,
  p.updated_at AS price_updated_at,
  (
    SELECT tp.currency_flipped
    FROM token_pools tp
    WHERE tp.chain_id = t.chain_id AND tp.token_address = t.token_address
    ORDER BY tp.created_block_number DESC
    LIMIT 1
  ) AS currency_flipped,
  hc.holder_count,
  (
    SELECT COALESCE(SUM(c.volume_eth_raw::numeric), 0) / ${WEI}::numeric
    FROM token_candles_1m c
    WHERE c.chain_id = t.chain_id
      AND c.token_address = t.token_address
      AND c.bucket_start >= NOW() - INTERVAL '24 hours'
  ) AS volume_24h_eth,
  (
    SELECT e.current_answer::numeric / ${ETH_USD_SCALE}::numeric
    FROM eth_usd_rates e
    WHERE e.chain_id = t.chain_id
    ORDER BY e.indexed_at DESC NULLS LAST
    LIMIT 1
  ) AS eth_usd,
  ts.total_supply_raw,
  ts.decimals AS supply_decimals,
  (
    CASE
      WHEN p.price_eth IS NULL OR ts.total_supply_raw IS NULL THEN NULL
      ELSE p.price_eth * (ts.total_supply_raw::numeric / POWER(10::numeric, COALESCE(ts.decimals, 18)))
    END
  ) AS market_cap_eth,
  (
    CASE
      WHEN p.price_eth IS NULL OR ts.total_supply_raw IS NULL THEN NULL
      ELSE p.price_eth
        * (ts.total_supply_raw::numeric / POWER(10::numeric, COALESCE(ts.decimals, 18)))
        * COALESCE(
          (
            SELECT e.current_answer::numeric / ${ETH_USD_SCALE}::numeric
            FROM eth_usd_rates e
            WHERE e.chain_id = t.chain_id
            ORDER BY e.indexed_at DESC NULLS LAST
            LIMIT 1
          ),
          0
        )
    END
  ) AS market_cap_usd
`;

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "api-service"
  });
});

app.get("/tokens", async (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50)));
  const offset = Math.max(0, Number(req.query.offset ?? 0));

  const result = await db.query(
    `
    SELECT
      ${TOKEN_ROW_SELECT}
    FROM tokens t
    LEFT JOIN token_prices_derived_current p
      ON p.chain_id = t.chain_id
     AND p.token_address = t.token_address
    LEFT JOIN token_holder_counts hc
      ON hc.chain_id = t.chain_id
     AND hc.token_address = t.token_address
    LEFT JOIN token_supplies_current ts
      ON ts.chain_id = t.chain_id
     AND ts.token_address = t.token_address
    WHERE t.chain_id = $1
    ORDER BY COALESCE(
      p.price_eth * (COALESCE(ts.total_supply_raw, '0')::numeric / POWER(10::numeric, COALESCE(ts.decimals, 18))),
      0
    ) DESC, t.created_at DESC
    LIMIT $2 OFFSET $3
    `,
    [chainId, limit, offset]
  );

  const data = await Promise.all(result.rows.map((row) => enrichCreatorAddress(row)));

  res.json({
    data,
    pagination: {
      limit,
      offset,
      count: result.rowCount
    }
  });
});

app.get("/tokens/:id", async (req, res) => {
  const tokenAddress = String(req.params.id).toLowerCase();
  const candleLimit = Math.min(1000, Math.max(1, Number(req.query.candleLimit ?? 240)));
  const tradeLimit = Math.min(500, Math.max(1, Number(req.query.tradeLimit ?? 100)));

  const tokenRes = await db.query(
    `
    SELECT
      ${TOKEN_ROW_SELECT},
      fd.pool_id AS fee_pool_id,
      fd.donate_amount AS fee_donate_amount,
      fd.creator_amount AS fee_creator_amount,
      fd.bidwall_amount AS fee_bidwall_amount,
      fd.governance_amount AS fee_governance_amount,
      fd.protocol_amount AS fee_protocol_amount
    FROM tokens t
    LEFT JOIN token_prices_derived_current p
      ON p.chain_id = t.chain_id
     AND p.token_address = t.token_address
    LEFT JOIN token_holder_counts hc
      ON hc.chain_id = t.chain_id
     AND hc.token_address = t.token_address
    LEFT JOIN token_supplies_current ts
      ON ts.chain_id = t.chain_id
     AND ts.token_address = t.token_address
    LEFT JOIN token_fee_distributions fd
      ON fd.chain_id = t.chain_id
     AND fd.pool_id = COALESCE(
       p.pool_id,
       (SELECT tp2.pool_id FROM token_pools tp2
        WHERE tp2.chain_id = t.chain_id AND tp2.token_address = t.token_address
        ORDER BY tp2.created_block_number DESC
        LIMIT 1)
     )
    WHERE t.chain_id = $1 AND t.token_address = $2
    LIMIT 1
    `,
    [chainId, tokenAddress]
  );

  if (!tokenRes.rows.length) {
    res.status(404).json({
      error: "token_not_found",
      tokenAddress
    });
    return;
  }

  const row = await enrichCreatorAddress(tokenRes.rows[0]);
  const token = {
    token_address: row.token_address,
    creator_address: row.creator_address,
    created_at: row.created_at,
    memecoin_treasury: row.memecoin_treasury,
    token_id: row.token_id,
    pool_id: row.pool_id,
    price_eth: row.price_eth,
    price_updated_at: row.price_updated_at,
    currency_flipped: row.currency_flipped,
    holder_count: row.holder_count,
    volume_24h_eth: row.volume_24h_eth,
    eth_usd: row.eth_usd,
    total_supply_raw: row.total_supply_raw,
    supply_decimals: row.supply_decimals,
    market_cap_eth: row.market_cap_eth,
    market_cap_usd: row.market_cap_usd,
    fee_distribution:
      row.fee_pool_id != null
        ? {
            donate_amount: row.fee_donate_amount,
            creator_amount: row.fee_creator_amount,
            bidwall_amount: row.fee_bidwall_amount,
            governance_amount: row.fee_governance_amount,
            protocol_amount: row.fee_protocol_amount
          }
        : null
  };

  const [candlesRes, tradesRes] = await Promise.all([
    db.query(
      `
      SELECT
        bucket_start,
        open_price_eth,
        high_price_eth,
        low_price_eth,
        close_price_eth,
        volume_token_raw,
        volume_eth_raw,
        trade_count
      FROM token_candles_1m
      WHERE chain_id = $1
        AND token_address = $2
      ORDER BY bucket_start DESC
      LIMIT $3
      `,
      [chainId, tokenAddress, candleLimit]
    ),
    db.query(
      `
      SELECT
        canonical_event_id,
        block_number,
        tx_hash,
        log_index,
        pool_id,
        uni_amount0,
        uni_amount1,
        fl_amount0,
        fl_amount1,
        isp_amount0,
        isp_amount1,
        indexed_at
      FROM derived_trades
      WHERE chain_id = $1
        AND token_address = $2
      ORDER BY block_number DESC, log_index DESC
      LIMIT $3
      `,
      [chainId, tokenAddress, tradeLimit]
    )
  ]);

  res.json({
    token,
    candles1m: candlesRes.rows,
    trades: tradesRes.rows
  });
});

async function run() {
  app.listen(port, () => {
    console.log(`[api] listening on :${port}`);
  });
}

run().catch((error) => {
  console.error("[api] fatal:", error);
  process.exit(1);
});
