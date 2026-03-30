# Data Model (DB) — Normalized Events + Derived Read Models

Primary reference: [`PRD.md`](../PRD.md)

## Design principles

- **Two-tier model**
  - **Normalized canonical events**: append-only, idempotent, reorg-aware facts (source of truth for derivation).
  - **Derived read models**: query-optimized tables backing APIs and WebSocket diffs.
- **Deterministic derivations**: derived tables can be rebuilt from canonical events + oracle history.
- **Cursor pagination first**: high-cardinality lists use stable cursor keys (time/block + tx/log index).
- **Write amplification is acceptable** in derived tables to keep read endpoints under ~200ms.

## Storage choices

- **PostgreSQL**: canonical + derived relational read models
- **TimescaleDB**: OHLCV hypertables and time-window aggregations
- **Redis**: cache and realtime fanout (not the source of truth)

## Canonical normalized tables (source of truth)

All canonical event tables share these identifying columns:

- `chain_id` (8453 for Base)
- `block_number`
- `block_hash`
- `tx_hash`
- `log_index`
- `block_timestamp` (ms or timestamptz)

Uniqueness:
- `UNIQUE(chain_id, tx_hash, log_index)`

### `chain_blocks` (optional but recommended)

Tracks block metadata and supports reorg handling.

Fields:
- `chain_id`, `block_number` (PK with chain_id)
- `block_hash`
- `parent_hash`
- `timestamp`
- `is_canonical` (bool)

### `events_pool_created`

From `PoolCreated`.

Fields (outline):
- `token_address` (CollectionToken)
- `pool_address` (if applicable)
- `creator_address`
- `position_manager_address` (versioned)
- `fair_launch_address` / phase metadata (if emitted)
- `bid_wall_address` (if emitted)
- initial parameters needed for token registry

### `events_pool_swap`

From `PoolSwap`.

Fields (outline):
- `token_address`
- `pool_address`
- `trader_address`
- `side` (buy/sell)
- `amount_token`
- `amount_eth` (or base token amount)
- `fee_eth`
- `sqrt_price_x96` (if present)
- `liquidity` / tick info (if present)

### `events_pool_state_updated`

From `PoolStateUpdated`.

Fields:
- `token_address`
- `sqrt_price_x96`
- any additional state needed for price derivation

### `events_pool_fees_distributed`

From `PoolFeesDistributed`.

Fields:
- `token_address`
- `total_fee_eth`
- recipient breakdown or pointers to manager contracts (if event does not include recipients)
- `protocol_fee_eth`, `creator_fee_eth`, etc. (if split is explicit)

### `events_erc20_transfer`

From `Transfer` (CollectionToken ERC-20).

Fields:
- `token_address`
- `from_address`
- `to_address`
- `amount`

### `events_erc721_transfer`

From NFT `Transfer` (FlaunchNFT).

Fields:
- `nft_contract_address`
- `token_id`
- `from_address`
- `to_address`
- resolved `token_address` (platform token mapped to NFT token_id) if possible

### `events_chainlink_answer_updated`

From Chainlink `AnswerUpdated`.

Fields:
- `aggregator_address`
- `answer` (ETH/USD with decimals)
- `round_id` (if available)

## Derived read models (API/WS backing)

### `tokens`

Token registry and static metadata.

Fields:
- `token_address` (PK)
- `symbol`, `name`
- `creator_address`
- `logo_url` / `logo_hash`
- `description`, `socials_json`
- `created_at` (from PoolCreated block time)
- `position_manager_version` / addresses for related contracts

### `token_stats_current`

Fast reads for homepage and token header.

Fields:
- `token_address` (PK)
- `price_eth`, `price_usd`
- `market_cap_eth`, `market_cap_usd`
- `volume_24h_eth`, `volume_24h_usd`
- `price_change_24h_pct`
- `holder_count`
- `lifetime_fees_eth`, `lifetime_fees_usd`
- ranking keys:
  - `rank_key_market_cap`
  - `rank_key_volume_24h`
  - `rank_key_most_traded` (definition agreed by product)

Indexes:
- `(rank_key_market_cap DESC, token_address)`
- `(rank_key_volume_24h DESC, token_address)`
- `(created_at DESC, token_address)`

### `trades`

Token trade activity feed (PRD: paginated buys/sells with amounts, fees, trader, tx hash).

Fields:
- `trade_id` (PK; e.g., `chain:tx_hash:log_index`)
- `token_address` (indexed)
- `side`, `trader_address`
- `amount_token`, `amount_eth`, `amount_usd`
- `fee_eth`, `fee_usd`
- `tx_hash`, `block_number`, `log_index`, `timestamp`

Indexes:
- `(token_address, block_number DESC, log_index DESC)` for token feed cursor
- `(trader_address, block_number DESC, log_index DESC)` for user activity derivations

### `holders_current`

Current balance per holder per token.

Fields:
- `token_address`
- `holder_address`
- `balance_token`
- `balance_usd` (derived from current price)
- `updated_at_block` / `updated_at_ts`

PK:
- `(token_address, holder_address)`

Indexes:
- `(token_address, balance_token DESC, holder_address)` for holders list sorting

### `positions_current`

Current user positions (WAC basis).

Fields:
- `wallet_address`
- `token_address`
- `units` (current token units)
- `wac_cost_usd` (cost basis for remaining units; stable over time)
- `realized_pnl_usd` (accumulated)
- `last_trade_block` / `last_trade_ts`

PK:
- `(wallet_address, token_address)`

Derived columns (computed at query time or materialized):
- `current_value_usd = units * token_stats_current.price_usd`
- `unrealized_pnl_usd = current_value_usd - wac_cost_usd`

Indexes:
- `(wallet_address, units DESC, token_address)`
- `(wallet_address, current_value_usd DESC)` (materialized if needed for fast sorting)

### `royalty_members`

Who earns fees on a token and their share.

Fields:
- `token_address`
- `member_address`
- `weight_bps`
- `source` (creator/revenue_split/staking/buyback/etc.)

PK:
- `(token_address, member_address)`

### `royalties_user_token_agg`

Lifetime fees earned per user per token (PRD).

Fields:
- `wallet_address`
- `token_address`
- `user_fee_share_bps`
- `lifetime_earned_eth`
- `lifetime_earned_usd`

PK:
- `(wallet_address, token_address)`

### `royalties_earnings_buckets`

7-bar charts (1d, 7d, all-time). This can be computed on read, but pre-aggregation is recommended.

Fields:
- `wallet_address`
- `period` (`1d`/`7d`/`all`)
- `bucket_index` (0..6)
- `bucket_start_ts`
- `bucket_end_ts`
- `earned_eth`
- `earned_usd`

Indexes:
- `(wallet_address, period, bucket_index)`

### `activity_feed`

Unified user activity (PRD: buys/sells, token launches, fee claims).

Fields:
- `activity_id` (PK; derived from event)
- `wallet_address`
- `kind` (`swap`/`launch`/`fee_claim`)
- `token_address`
- `amount_usd`
- `tx_hash`, `block_number`, `log_index`, `timestamp`

Indexes:
- `(wallet_address, block_number DESC, log_index DESC)` (cursor pagination)

### `platform_stats_current`

Protocol-wide metrics (PRD).

Fields:
- `id` (single row key)
- `total_volume_eth`, `total_volume_usd`
- `total_fees_eth`, `total_fees_usd`
- `total_tokens_launched`
- `total_unique_holders`

### `platform_top_fee_earners_24h`

Ranked view/table for “Top fee earners (24h)”.

Fields:
- `wallet_address`
- `fees_24h_eth`, `fees_24h_usd`
- `rank_key`

Indexes:
- `(rank_key DESC)`

## OHLCV candles (TimescaleDB hypertables)

Candles are required for:
- timeframes: `1m`, `15m`, `1h`, `4h`, `1d`
- currencies: `eth`, `usd`
- limit: up to 1000 per request
- incremental “candle tip” updates on each swap

Recommended schema: one hypertable with dimensions:
- `token_address`
- `timeframe`
- `currency`
- `bucket_start_ts`

### `ohlcv_candles`

Fields:
- `token_address`
- `timeframe` (enum)
- `currency` (enum)
- `bucket_start_ts` (timestamptz)
- `o`, `h`, `l`, `c` (numeric)
- `v` (numeric volume; definition agreed: token volume or USD/ETH volume)
- `trade_count` (optional)

PK / uniqueness:
- `UNIQUE(token_address, timeframe, currency, bucket_start_ts)`

Indexes:
- `(token_address, timeframe, currency, bucket_start_ts DESC)`

Write pattern:
- On each swap, compute `bucket_start_ts` from the swap timestamp and timeframe.
- Upsert the candle row for that bucket:
  - if new bucket: set `o=h=l=c=price`, `v=...`
  - else: update `h/l/c`, increment `v`

## Critical pagination indexes (PRD performance)

- Token trades: `(token_address, block_number DESC, log_index DESC)`
- Holders: `(token_address, balance_token DESC, holder_address)`
- Activity: `(wallet_address, block_number DESC, log_index DESC)`
- Tokens homepage sorts:
  - market cap: `(rank_key_market_cap DESC, token_address)`
  - 24h volume: `(rank_key_volume_24h DESC, token_address)`
  - newest: `(created_at DESC, token_address)`

## Reorg safety notes (DB-level)

- Canonical tables store `block_hash` to detect reorg changes.
- Keep an indexer checkpoint table that marks blocks as “finalized” after depth N.
- Derivation workers should be able to recompute derived tables for a bounded rollback window.

