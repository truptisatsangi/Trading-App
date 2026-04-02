export const DERIVED_TABLES = [
  "tokens",
  "token_pools",
  "derived_trades",
  "token_prices_current",
  "token_holders_current",
  "token_holder_counts",
  "token_ownership_current",
  "eth_usd_rates",
  "token_fee_distributions"
];

export async function computeTableChecksums(client, tables = DERIVED_TABLES) {
  const out = {};
  for (const table of tables) {
    out[table] = await checksumTable(client, table);
  }
  return out;
}

async function checksumTable(client, tableName) {
  // Order by a stable key when available; fallback to row_to_json text ordering.
  const orderByMap = {
    tokens: "chain_id, token_address",
    token_pools: "chain_id, pool_id",
    derived_trades: "canonical_event_id",
    token_prices_current: "chain_id, pool_id",
    token_holders_current: "chain_id, token_address, wallet_address",
    token_holder_counts: "chain_id, token_address",
    token_ownership_current: "chain_id, nft_contract_address, token_id",
    eth_usd_rates: "chain_id, round_id",
    token_fee_distributions: "chain_id, pool_id"
  };
  const orderBy = orderByMap[tableName] ?? "1";

  // We hash each row's JSON, then aggregate hashes deterministically.
  const result = await client.query(
    `
    SELECT
      COALESCE(
        md5(
          string_agg(
            md5(row_to_json(t)::text),
            '' ORDER BY ${orderBy}
          )
        ),
        md5('')
      ) AS checksum,
      COUNT(*)::bigint AS row_count
    FROM ${tableName} t
    `
  );
  return {
    checksum: result.rows[0].checksum,
    rowCount: Number(result.rows[0].row_count)
  };
}

