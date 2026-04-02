export const CREATE_CANONICAL_EVENTS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS canonical_events (
  id BIGSERIAL PRIMARY KEY,
  chain_id INTEGER NOT NULL,
  block_number BIGINT NOT NULL,
  block_hash TEXT NOT NULL,
  parent_hash TEXT,
  block_timestamp TIMESTAMPTZ,
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

export const CREATE_CANONICAL_EVENTS_BLOCK_HASH_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS canonical_events_block_hash_idx
  ON canonical_events(chain_id, block_number DESC, block_hash);
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

export const CREATE_CANONICAL_OUTBOX_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS canonical_event_outbox (
  outbox_id BIGSERIAL PRIMARY KEY,
  canonical_event_id BIGINT NOT NULL REFERENCES canonical_events(id) ON DELETE CASCADE,
  chain_id INTEGER NOT NULL,
  topic TEXT NOT NULL,
  event_key TEXT NOT NULL,
  payload JSONB NOT NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(topic, event_key)
);
`;

export const CREATE_CANONICAL_OUTBOX_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS canonical_event_outbox_unpublished_idx
  ON canonical_event_outbox(topic, published_at, outbox_id)
  WHERE published_at IS NULL;
`;

