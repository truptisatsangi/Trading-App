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
  // Determinism: exclude volatile timestamp columns (NOW()) from hashing.
  const selectMap = {
    tokens:
      "chain_id, token_address, creator_address, memecoin_treasury, token_id, created_block_number, created_tx_hash, created_log_index",
    token_pools:
      "chain_id, pool_id, token_address, position_manager_address, currency_flipped, created_block_number, created_tx_hash, created_log_index",
    derived_trades:
      "canonical_event_id, chain_id, block_number, tx_hash, log_index, pool_id, token_address, contract_address, fl_amount0, fl_amount1, fl_fee0, fl_fee1, isp_amount0, isp_amount1, isp_fee0, isp_fee1, uni_amount0, uni_amount1, uni_fee0, uni_fee1",
    token_prices_current:
      "chain_id, pool_id, contract_address, sqrt_price_x96, tick, protocol_fee, swap_fee, liquidity, source_block_number, source_tx_hash, source_log_index",
    token_holders_current:
      "chain_id, token_address, wallet_address, balance_numeric, updated_event_id",
    token_holder_counts: "chain_id, token_address, holder_count, updated_event_id",
    token_ownership_current:
      "chain_id, token_id, nft_contract_address, owner_address, source_tx_hash, source_log_index",
    eth_usd_rates:
      "chain_id, round_id, current_answer, updated_at_onchain, source_tx_hash, source_log_index",
    token_fee_distributions:
      "chain_id, pool_id, last_canonical_event_id, donate_amount, creator_amount, bidwall_amount, governance_amount, protocol_amount"
  };
  const selectCols = selectMap[tableName] ?? "*";

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
    FROM (SELECT ${selectCols} FROM ${tableName}) t
    `
  );
  return {
    checksum: result.rows[0].checksum,
    rowCount: Number(result.rows[0].row_count)
  };
}

