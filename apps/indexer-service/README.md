# Indexer Service (Phase 1 Hardening)

This service now implements:

- block polling + `eth_getLogs`
- provider-safe log chunking (`LOG_RANGE_LIMIT`)
- ABI decoding for:
  - `PoolCreated`
  - `PoolSwap`
  - `PoolStateUpdated`
  - `PoolFeesDistributed`
  - ERC-20 `Transfer`
  - ERC-721 `Transfer`
  - Chainlink `AnswerUpdated`
- canonical event schema
- idempotent inserts on `(chain_id, tx_hash, log_index)`
- checkpointing
- canonical event outbox for Kafka relay
- transient RPC retry and provider failover list
- optional `/health` endpoint

## Tracked canonical event types

- `pool_created`
- `swap` (from `PoolSwap`)
- `price_update` (from `PoolStateUpdated`)
- `pool_fees_distributed`
- `transfer` (from ERC-20 `Transfer`)
- `nft_transfer` (from ERC-721 `Transfer`)
- `answer_updated` (from Chainlink `AnswerUpdated`)

## Setup

1. Copy env:

```bash
cp .env.example .env
```

2. Install deps:

```bash
npm install
```

3. Start:

```bash
npm run start
```

## Canonical table verification

Run the following query against your DB:

```sql
SELECT event_type, COUNT(*) AS total
FROM canonical_events
GROUP BY event_type
ORDER BY total DESC;
```

You should see rows for `swap` and `price_update` quickly if RPC/DB config is correct.
`transfer` rows appear when `TOKEN_ADDRESSES` is configured.

Address defaults:
- PositionManager/AnyPositionManager defaults are Base mainnet addresses from `PRD.md`.
- You can override them with `POSITION_MANAGER_ADDRESSES`.

Checkpoint verification:

```sql
SELECT name, chain_id, last_processed_block, updated_at
FROM indexer_checkpoints
WHERE name = 'base-indexer';
```

Outbox verification:

```sql
SELECT topic, COUNT(*) AS pending
FROM canonical_event_outbox
WHERE published_at IS NULL
GROUP BY topic;
```

## Health and baseline metrics

- Enable health endpoint with `HEALTH_PORT`, then check:

```bash
curl http://localhost:3001/health
```

The payload includes recent ingestion stats (`lastRangeFrom`, `lastInserted`, `lastSkipped`, timestamps).

## Runbook snippets

- **RPC range limit errors**: reduce `LOG_RANGE_LIMIT` and keep chunking enabled.
- **Transient RPC failures**: use multiple URLs via `RPC_URLS` and keep retries enabled.
- **Kafka relay lag**: inspect `canonical_event_outbox` pending rows and broker health.
