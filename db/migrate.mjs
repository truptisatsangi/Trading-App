/**
 * Single source for applying DB schema. Run before indexer / derivation / API / realtime:
 *   npm run migrate
 * or: node db/migrate.mjs
 *
 * Requires DB_URL (or defaults below). Creates the database if missing, then applies DDL.
 * Services no longer run CREATE TABLE on startup — they assume migrate has been applied.
 */
import dotenv from "dotenv";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "pg";
import { ensureDatabaseExists } from "./ensureDatabase.js";
import {
  CREATE_CANONICAL_EVENTS_BLOCK_HASH_INDEX_SQL,
  CREATE_CANONICAL_EVENTS_CHAIN_ID_INDEX_SQL,
  CREATE_CANONICAL_EVENTS_INDEX_SQL,
  CREATE_CANONICAL_OUTBOX_INDEX_SQL,
  CREATE_CANONICAL_OUTBOX_TABLE_SQL,
  CREATE_CANONICAL_EVENTS_TABLE_SQL,
  CREATE_CHECKPOINTS_TABLE_SQL
} from "../apps/indexer-service/src/models/canonicalEvents.js";
import {
  CREATE_DERIVATION_APPLIED_EVENTS_TABLE_SQL,
  CREATE_DERIVATION_CHECKPOINTS_TABLE_SQL,
  CREATE_DERIVED_TRADES_INDEX_SQL,
  CREATE_DERIVED_TRADES_TABLE_SQL,
  CREATE_ETH_USD_RATES_TABLE_SQL,
  CREATE_TOKEN_CANDLES_1M_INDEX_SQL,
  CREATE_TOKEN_CANDLES_1M_TABLE_SQL,
  CREATE_TOKEN_FEE_DISTRIBUTIONS_TABLE_SQL,
  CREATE_TOKEN_HOLDER_COUNTS_TABLE_SQL,
  CREATE_TOKEN_HOLDERS_CURRENT_TABLE_SQL,
  CREATE_TOKEN_OWNERSHIP_CURRENT_TABLE_SQL,
  CREATE_TOKEN_POOLS_TABLE_SQL,
  CREATE_TOKEN_PRICES_CURRENT_TABLE_SQL,
  CREATE_TOKEN_PRICES_DERIVED_CURRENT_TABLE_SQL,
  CREATE_TOKEN_SUPPLIES_CURRENT_TABLE_SQL,
  CREATE_TOKENS_TABLE_SQL
} from "../apps/derivation-service/src/models/readModels.js";

dotenv.config();

const defaultDbUrl = "postgres://postgres:postgres@localhost:5433/token_db";

/** @type {{ name: string, sql: string }[]} */
const STEPS = [
  { name: "canonical_events", sql: CREATE_CANONICAL_EVENTS_TABLE_SQL },
  { name: "canonical_events indexes", sql: CREATE_CANONICAL_EVENTS_INDEX_SQL },
  { name: "canonical_events block_hash index", sql: CREATE_CANONICAL_EVENTS_BLOCK_HASH_INDEX_SQL },
  { name: "canonical_events chain_id+id index", sql: CREATE_CANONICAL_EVENTS_CHAIN_ID_INDEX_SQL },
  { name: "indexer_checkpoints", sql: CREATE_CHECKPOINTS_TABLE_SQL },
  { name: "canonical_event_outbox", sql: CREATE_CANONICAL_OUTBOX_TABLE_SQL },
  { name: "canonical_event_outbox index", sql: CREATE_CANONICAL_OUTBOX_INDEX_SQL },

  { name: "derivation_checkpoints", sql: CREATE_DERIVATION_CHECKPOINTS_TABLE_SQL },
  { name: "derivation_applied_events", sql: CREATE_DERIVATION_APPLIED_EVENTS_TABLE_SQL },
  { name: "derived_trades", sql: CREATE_DERIVED_TRADES_TABLE_SQL },
  { name: "derived_trades index", sql: CREATE_DERIVED_TRADES_INDEX_SQL },
  {
    name: "derived_trades.token_address (legacy compat)",
    sql: "ALTER TABLE derived_trades ADD COLUMN IF NOT EXISTS token_address TEXT"
  },
  { name: "token_prices_current", sql: CREATE_TOKEN_PRICES_CURRENT_TABLE_SQL },
  { name: "token_prices_derived_current", sql: CREATE_TOKEN_PRICES_DERIVED_CURRENT_TABLE_SQL },
  { name: "token_supplies_current", sql: CREATE_TOKEN_SUPPLIES_CURRENT_TABLE_SQL },
  { name: "token_candles_1m", sql: CREATE_TOKEN_CANDLES_1M_TABLE_SQL },
  { name: "token_candles_1m index", sql: CREATE_TOKEN_CANDLES_1M_INDEX_SQL },
  {
    name: "token_candles_1m hypertable (TimescaleDB)",
    sql: `
    DO $$
    BEGIN
      PERFORM create_hypertable(
        'token_candles_1m',
        'bucket_start',
        if_not_exists => TRUE,
        migrate_data  => TRUE
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'create_hypertable skipped: %', SQLERRM;
    END $$;
    `
  },
  {
    name: "token_candles_1m compression (TimescaleDB)",
    sql: `
    DO $$
    BEGIN
      ALTER TABLE token_candles_1m SET (
        timescaledb.compress,
        timescaledb.compress_segmentby = 'chain_id,token_address'
      );
      PERFORM add_compression_policy(
        'token_candles_1m',
        INTERVAL '7 days',
        if_not_exists => TRUE
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'compression policy skipped: %', SQLERRM;
    END $$;
    `
  },
  { name: "token_holders_current", sql: CREATE_TOKEN_HOLDERS_CURRENT_TABLE_SQL },
  { name: "token_holder_counts", sql: CREATE_TOKEN_HOLDER_COUNTS_TABLE_SQL },
  { name: "tokens", sql: CREATE_TOKENS_TABLE_SQL },
  { name: "token_pools", sql: CREATE_TOKEN_POOLS_TABLE_SQL },
  { name: "token_ownership_current", sql: CREATE_TOKEN_OWNERSHIP_CURRENT_TABLE_SQL },
  { name: "eth_usd_rates", sql: CREATE_ETH_USD_RATES_TABLE_SQL },
  { name: "token_fee_distributions", sql: CREATE_TOKEN_FEE_DISTRIBUTIONS_TABLE_SQL }
];

/**
 * Apply all schema steps. Idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
 * @param {string} [connectionString]
 */
export async function runMigrations(connectionString) {
  const dbUrl = connectionString || process.env.DB_URL || defaultDbUrl;
  await ensureDatabaseExists(dbUrl, "[migrate]");

  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    for (const step of STEPS) {
      await client.query(step.sql);
      console.log(`[migrate] ${step.name}`);
    }
    console.log("[migrate] done");
  } finally {
    await client.end();
  }
}

async function main() {
  await runMigrations();
}

const isMain =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main().catch((err) => {
    console.error("[migrate] fatal:", err);
    process.exit(1);
  });
}
