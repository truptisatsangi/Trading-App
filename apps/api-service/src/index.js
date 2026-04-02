import dotenv from "dotenv";
import express from "express";
import { Client } from "pg";

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 3003);
const chainId = Number(process.env.CHAIN_ID ?? 8453);
const db = new Client({
  connectionString: process.env.DB_URL ?? "postgres://postgres:postgres@localhost:5433/token_db"
});

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
      t.token_address,
      t.creator_address,
      t.created_at,
      p.price_eth,
      p.updated_at AS price_updated_at
    FROM tokens t
    LEFT JOIN token_prices_derived_current p
      ON p.chain_id = t.chain_id
     AND p.token_address = t.token_address
    WHERE t.chain_id = $1
    ORDER BY COALESCE(p.price_eth, 0) DESC, t.created_at DESC
    LIMIT $2 OFFSET $3
    `,
    [chainId, limit, offset]
  );

  res.json({
    data: result.rows,
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
      t.token_address,
      t.creator_address,
      t.created_at,
      p.pool_id,
      p.price_eth,
      p.updated_at AS price_updated_at
    FROM tokens t
    LEFT JOIN token_prices_derived_current p
      ON p.chain_id = t.chain_id
     AND p.token_address = t.token_address
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
    token: tokenRes.rows[0],
    candles1m: candlesRes.rows,
    trades: tradesRes.rows
  });
});

async function run() {
  await db.connect();
  app.listen(port, () => {
    console.log(`[api] listening on :${port}`);
  });
}

run().catch((error) => {
  console.error("[api] fatal:", error);
  process.exit(1);
});
