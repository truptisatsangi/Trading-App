export const CREATE_DERIVATION_CHECKPOINTS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS derivation_checkpoints (
  name TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  last_event_id BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(name, chain_id)
);
`;

export const CREATE_DERIVED_TRADES_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS derived_trades (
  canonical_event_id BIGINT PRIMARY KEY,
  chain_id INTEGER NOT NULL,
  block_number BIGINT NOT NULL,
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  pool_id TEXT NOT NULL,
  contract_address TEXT NOT NULL,
  fl_amount0 TEXT NOT NULL,
  fl_amount1 TEXT NOT NULL,
  fl_fee0 TEXT NOT NULL,
  fl_fee1 TEXT NOT NULL,
  isp_amount0 TEXT NOT NULL,
  isp_amount1 TEXT NOT NULL,
  isp_fee0 TEXT NOT NULL,
  isp_fee1 TEXT NOT NULL,
  uni_amount0 TEXT NOT NULL,
  uni_amount1 TEXT NOT NULL,
  uni_fee0 TEXT NOT NULL,
  uni_fee1 TEXT NOT NULL,
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

export const CREATE_DERIVED_TRADES_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS derived_trades_pool_block_idx
  ON derived_trades(pool_id, block_number DESC, log_index DESC);
`;

export const CREATE_TOKEN_PRICES_CURRENT_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS token_prices_current (
  chain_id INTEGER NOT NULL,
  pool_id TEXT NOT NULL,
  contract_address TEXT NOT NULL,
  sqrt_price_x96 TEXT NOT NULL,
  tick INTEGER NOT NULL,
  protocol_fee INTEGER NOT NULL,
  swap_fee INTEGER NOT NULL,
  liquidity TEXT NOT NULL,
  source_block_number BIGINT NOT NULL,
  source_tx_hash TEXT NOT NULL,
  source_log_index INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(chain_id, pool_id)
);
`;

export const CREATE_TOKEN_HOLDERS_CURRENT_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS token_holders_current (
  chain_id INTEGER NOT NULL,
  token_address TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  balance_numeric NUMERIC(78, 0) NOT NULL DEFAULT 0,
  updated_event_id BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(chain_id, token_address, wallet_address)
);
`;

export const CREATE_TOKEN_HOLDER_COUNTS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS token_holder_counts (
  chain_id INTEGER NOT NULL,
  token_address TEXT NOT NULL,
  holder_count BIGINT NOT NULL,
  updated_event_id BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(chain_id, token_address)
);
`;
