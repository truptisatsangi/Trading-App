import { withClient } from "./db.js";
import { loadEnv } from "./loadEnv.js";

loadEnv();

const DB_URL = process.env.DB_URL;
const CHAIN_ID = Number(process.env.CHAIN_ID ?? "8453");

if (!DB_URL) {
  throw new Error("DB_URL is required");
}

const INVARIANTS = [
  {
    name: "no_negative_balances",
    sql: `
      SELECT chain_id, token_address, wallet_address, balance_numeric
      FROM token_holders_current
      WHERE chain_id = $1 AND balance_numeric < 0
      LIMIT 50
    `
  },
  {
    name: "holder_count_matches_current",
    sql: `
      SELECT thc.chain_id, thc.token_address, thc.holder_count, derived.cnt
      FROM token_holder_counts thc
      JOIN (
        SELECT chain_id, token_address, COUNT(*)::bigint AS cnt
        FROM token_holders_current
        WHERE chain_id = $1 AND balance_numeric > 0
        GROUP BY chain_id, token_address
      ) AS derived
        ON derived.chain_id = thc.chain_id AND derived.token_address = thc.token_address
      WHERE thc.chain_id = $1 AND thc.holder_count <> derived.cnt
      LIMIT 50
    `
  },
  {
    name: "no_null_token_mapping_in_trades",
    sql: `
      SELECT canonical_event_id, chain_id, pool_id, token_address
      FROM derived_trades
      WHERE chain_id = $1 AND token_address IS NULL
      LIMIT 50
    `
  },
  {
    name: "token_pools_token_exists",
    sql: `
      SELECT tp.chain_id, tp.pool_id, tp.token_address
      FROM token_pools tp
      LEFT JOIN tokens t
        ON t.chain_id = tp.chain_id AND t.token_address = tp.token_address
      WHERE tp.chain_id = $1 AND t.token_address IS NULL
      LIMIT 50
    `
  },
  {
    name: "prices_have_nonnegative_liquidity",
    sql: `
      SELECT chain_id, pool_id, liquidity
      FROM token_prices_current
      WHERE chain_id = $1 AND liquidity ~ '^[0-9]+$' = false
      LIMIT 50
    `
  }
];

async function main() {
  const failures = [];

  await withClient(DB_URL, async (client) => {
    for (const inv of INVARIANTS) {
      const res = await client.query(inv.sql, [CHAIN_ID]);
      if (res.rows.length) {
        failures.push({
          name: inv.name,
          sampleRows: res.rows
        });
      }
    }
  });

  if (failures.length) {
    console.error("[qa] Invariants FAILED:");
    for (const f of failures) {
      console.error(`- ${f.name}: sample_rows=${f.sampleRows.length}`);
      console.error(JSON.stringify(f.sampleRows.slice(0, 3), null, 2));
    }
    process.exit(1);
  }

  console.log(`[qa] Invariants PASSED for chain_id=${CHAIN_ID}`);
}

main().catch((e) => {
  console.error("[qa] invariants fatal:", e);
  process.exit(1);
});

