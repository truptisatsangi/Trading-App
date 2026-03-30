# Alternatives Matrix (with PRD trade-offs)

Primary reference: [`PRD.md`](../PRD.md)

This compares major architectural choices and when to pick them, specifically against your PRD needs:
- realtime within ~2 seconds
- TradingView-quality candles (5 timeframes, up to 1000)
- sub-200ms paginated APIs
- 15k tokens + 5k concurrent WebSockets

## 1) Indexing approach

### Option A — Custom indexer (recommended baseline)

**What it is**: `indexer-service` fetches logs, decodes ABIs, persists canonical normalized events, `derivation-service` builds read models.

- **Pros**
  - Full control over WAC/PnL semantics and candle-tip behavior
  - Easy to add contract versions and special-case decoding
  - Deterministic rebuild from canonical events
- **Cons**
  - More engineering work than using an indexing platform
  - Must implement reorg safety and backfills correctly

### Option B — The Graph / Subgraphs

- **Pros**
  - Offloads a lot of ingestion/query plumbing
  - Familiar to many web3 teams
- **Cons (PRD-specific)**
  - Candle-tip incremental updates and WAC/PnL logic are often easier in a custom derivation pipeline
  - Realtime within 2 seconds still needs your own WS layer and change propagation design

### Option C — Third-party indexed datasets

Examples: managed EVM data providers.

- **Pros**
  - Fast time-to-market
- **Cons**
  - Vendor lock-in and cost
  - Harder to ensure semantic correctness for custom fee splits/royalties

## 2) Messaging backbone (Redis Streams vs Kafka vs NATS)

### Option A — Redis Streams / BullMQ (recommended baseline)

- **Pros**
  - Simple ops footprint (Redis already needed for cache + realtime fanout)
  - Good enough throughput for early and mid stages
  - Consumer groups support “at least once” processing + retries
- **Cons**
  - Not ideal for very long retention and massive multi-consumer ecosystems

### Option B — Kafka

- **Pros**
  - Best-in-class durable log, retention, replay, and many independent consumers
  - Excellent for “event platform” architectures
- **Cons (PRD-specific)**
  - Operational overhead is higher
  - Not necessary unless you expect very high event throughput and many downstream services (risk engine, ML, notifications, data lake, etc.)

### Option C — NATS JetStream

- **Pros**
  - Strong streaming semantics; simpler than Kafka in some setups
- **Cons**
  - Still an additional system to operate vs Redis-only baseline

## 3) OHLCV analytics store (TimescaleDB vs ClickHouse)

### Option A — Postgres + TimescaleDB (recommended baseline)

- **Pros**
  - One DB technology for both relational read models and candles
  - Hypertables fit time-bucket queries well
  - Easier operations than a second analytics DB
- **Cons**
  - At very high scale, ClickHouse can outperform for heavy aggregate scans

### Option B — ClickHouse

- **Pros**
  - Extremely fast for OHLCV, windowed aggregations, ranking queries
- **Cons**
  - Another operational system; replication/backups/query patterns differ from Postgres
  - More careful data modeling required

## 4) Realtime transport (ws vs Socket.IO vs SSE)

### Option A — WebSockets (`ws`) (recommended baseline)

- **Pros**
  - Lowest overhead; high concurrency
  - Clean “room subscription” model
- **Cons**
  - You implement reconnection/backoff conventions yourself (usually fine)

### Option B — Socket.IO

- **Pros**
  - Very ergonomic rooms/acks/reconnect handling
- **Cons**
  - More protocol overhead; may reduce max connection density per node

### Option C — SSE (Server-Sent Events)

- **Pros**
  - Very simple one-way stream
- **Cons (PRD-specific)**
  - Room subscription model and multiplexing is less natural than WS
  - Harder to do high-frequency multi-room updates efficiently

## 5) API style (REST vs GraphQL)

### Option A — REST + OpenAPI (recommended baseline)

- **Pros**
  - Predictable performance and caching
  - Cursor pagination is straightforward
  - Easy to keep endpoints fast (<200ms) and well-indexed
- **Cons**
  - Some UI pages may need multiple calls (can be solved with composite endpoints)

### Option B — GraphQL

- **Pros**
  - Frontend can request exactly what it needs
- **Cons (PRD-specific)**
  - Large list endpoints require strict pagination/cost controls to avoid slow queries
  - Caching can be harder

## 6) ORM (Prisma vs TypeORM vs Drizzle)

- **Prisma (recommended)**: best team ergonomics + migrations + type safety
- **TypeORM**: flexible but requires discipline; runtime behavior can surprise
- **Drizzle**: strong TS, lightweight; smaller ecosystem than Prisma

## 7) Managed vs self-hosted Base node

- **Managed RPC (recommended)**: fastest path; use two providers for failover
- **Self-hosted node**: more control and sometimes cost control at scale; significant ops burden

