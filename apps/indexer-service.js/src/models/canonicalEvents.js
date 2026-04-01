export const CREATE_CANONICAL_EVENTS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS canonical_events (
  id BIGSERIAL PRIMARY KEY,
  chain_id INTEGER NOT NULL,
  block_number BIGINT NOT NULL,
  block_hash TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  contract_address TEXT NOT NULL,
  event_type TEXT NOT NULL,
  topic0 TEXT NOT NULL,
  pool_id TEXT,
  token_address TEXT,
  payload JSONB NOT NULL,
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(chain_id, tx_hash, log_index)
);
`;

export const CREATE_CANONICAL_EVENTS_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS canonical_events_event_type_block_idx
  ON canonical_events(event_type, block_number DESC, log_index DESC);
`;

export const CREATE_CHECKPOINTS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS indexer_checkpoints (
  name TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  last_processed_block BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(name, chain_id)
);
`;

