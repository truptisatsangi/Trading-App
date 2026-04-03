import dotenv from "dotenv";
import http from "node:http";
import { Client } from "pg";
import { createClient } from "redis";
import { WebSocketServer } from "ws";

dotenv.config();

const port = Number(process.env.PORT ?? 3004);
const chainId = Number(process.env.CHAIN_ID ?? 8453);
const redisChannel = process.env.REDIS_DERIVED_CHANNEL ?? "derived.changes.v1";
const db = new Client({
  connectionString: process.env.DB_URL ?? "postgres://postgres:postgres@localhost:5433/token_db"
});

const rooms = new Map();

function addToRoom(room, ws) {
  if (!rooms.has(room)) {
    rooms.set(room, new Set());
  }
  rooms.get(room).add(ws);
}

function removeFromAllRooms(ws) {
  for (const members of rooms.values()) {
    members.delete(ws);
  }
}

function broadcast(room, payload) {
  const members = rooms.get(room);
  if (!members?.size) {
    return;
  }
  const message = JSON.stringify(payload);
  for (const ws of members) {
    if (ws.readyState === ws.OPEN) {
      ws.send(message);
    }
  }
}

const WEI = "1000000000000000000";
const ETH_USD_SCALE = "100000000";

async function fetchTokenSnapshot(tokenAddress) {
  const tokenRes = await db.query(
    `
    SELECT
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
      ) AS eth_usd
    FROM tokens t
    LEFT JOIN token_prices_derived_current p
      ON p.chain_id = t.chain_id
     AND p.token_address = t.token_address
    LEFT JOIN token_holder_counts hc
      ON hc.chain_id = t.chain_id
     AND hc.token_address = t.token_address
    WHERE t.chain_id = $1 AND t.token_address = $2
    LIMIT 1
    `,
    [chainId, tokenAddress]
  );
  const candleRes = await db.query(
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
    LIMIT 1
    `,
    [chainId, tokenAddress]
  );

  return {
    token: tokenRes.rows[0] ?? null,
    latestCandle1m: candleRes.rows[0] ?? null
  };
}

async function run() {
  await db.connect();

  const redis = createClient({
    url: process.env.REDIS_URL ?? "redis://localhost:6379"
  });
  await redis.connect();
  await redis.subscribe(redisChannel, async (raw) => {
    try {
      const change = JSON.parse(raw);
      if (
        !change.tokenAddress ||
        (change.type !== "swap" && change.type !== "price_update")
      ) {
        return;
      }
      const tokenAddress = String(change.tokenAddress).toLowerCase();
      const snapshot = await fetchTokenSnapshot(tokenAddress);

      broadcast("tokens", {
        type: "token.updated",
        tokenAddress,
        token: snapshot.token
      });
      broadcast(`token:${tokenAddress}`, {
        type: "token.tick",
        tokenAddress,
        token: snapshot.token,
        latestCandle1m: snapshot.latestCandle1m,
        source: change
      });
    } catch (error) {
      console.error("[realtime] failed to process redis message:", error);
    }
  });

  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        service: "realtime-service"
      })
    );
  });
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws) => {
    ws.send(
      JSON.stringify({
        type: "welcome",
        usage: {
          subscribeAllTokens: { action: "subscribe", room: "tokens" },
          subscribeOneToken: {
            action: "subscribe",
            room: "token:0x..."
          }
        }
      })
    );

    ws.on("message", (message) => {
      try {
        const payload = JSON.parse(message.toString("utf8"));
        if (payload.action === "subscribe" && payload.room) {
          addToRoom(String(payload.room).toLowerCase(), ws);
          ws.send(
            JSON.stringify({
              type: "subscribed",
              room: String(payload.room).toLowerCase()
            })
          );
        }
      } catch {
        ws.send(
          JSON.stringify({
            type: "error",
            message: "invalid_json"
          })
        );
      }
    });

    ws.on("close", () => {
      removeFromAllRooms(ws);
    });
  });

  server.listen(port, () => {
    console.log(`[realtime] listening on :${port}`);
  });
}

run().catch((error) => {
  console.error("[realtime] fatal:", error);
  process.exit(1);
});
