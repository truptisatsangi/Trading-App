export const CREATE_DERIVATION_CHECKPOINTS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS derivation_checkpoints (
  name TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  last_event_id BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(name, chain_id)
);
`;

export const CREATE_DERIVATION_APPLIED_EVENTS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS derivation_applied_events (
  processor_name TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  dedupe_key TEXT NOT NULL,
  canonical_event_id BIGINT,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(processor_name, chain_id, dedupe_key)
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
  token_address TEXT,
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

export const CREATE_TOKENS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS tokens (
  chain_id INTEGER NOT NULL,
  token_address TEXT NOT NULL,
  creator_address TEXT,
  memecoin_treasury TEXT,
  token_id TEXT,
  created_block_number BIGINT NOT NULL,
  created_tx_hash TEXT NOT NULL,
  created_log_index INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(chain_id, token_address)
);
`;

export const CREATE_TOKEN_POOLS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS token_pools (
  chain_id INTEGER NOT NULL,
  pool_id TEXT NOT NULL,
  token_address TEXT NOT NULL,
  position_manager_address TEXT NOT NULL,
  currency_flipped BOOLEAN,
  created_block_number BIGINT NOT NULL,
  created_tx_hash TEXT NOT NULL,
  created_log_index INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(chain_id, pool_id)
);
`;

export const CREATE_TOKEN_OWNERSHIP_CURRENT_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS token_ownership_current (
  chain_id INTEGER NOT NULL,
  token_id TEXT NOT NULL,
  nft_contract_address TEXT NOT NULL,
  owner_address TEXT NOT NULL,
  source_tx_hash TEXT NOT NULL,
  source_log_index INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(chain_id, nft_contract_address, token_id)
);
`;

export const CREATE_ETH_USD_RATES_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS eth_usd_rates (
  chain_id INTEGER NOT NULL,
  round_id TEXT NOT NULL,
  current_answer TEXT NOT NULL,
  updated_at_onchain BIGINT,
  source_tx_hash TEXT NOT NULL,
  source_log_index INTEGER NOT NULL,
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(chain_id, round_id)
);
`;

export const CREATE_TOKEN_FEE_DISTRIBUTIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS token_fee_distributions (
  chain_id INTEGER NOT NULL,
  pool_id TEXT NOT NULL,
  last_canonical_event_id BIGINT NOT NULL,
  donate_amount TEXT NOT NULL DEFAULT '0',
  creator_amount TEXT NOT NULL DEFAULT '0',
  bidwall_amount TEXT NOT NULL DEFAULT '0',
  governance_amount TEXT NOT NULL DEFAULT '0',
  protocol_amount TEXT NOT NULL DEFAULT '0',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(chain_id, pool_id)
);
`;
