# Indexer Service (Step 1 MVP)

This MVP implements only:

- block polling + `eth_getLogs`
- ABI decoding for `PoolSwap`, `PoolStateUpdated`, and ERC-20 `Transfer`
- canonical event schema
- idempotent inserts on `(chain_id, tx_hash, log_index)`
- basic checkpointing

## Tracked event types

- `swap` (from `PoolSwap`)
- `price_update` (from `PoolStateUpdated`)
- `transfer` (from ERC-20 `Transfer`, for configured token addresses only)

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
