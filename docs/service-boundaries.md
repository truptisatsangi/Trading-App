# Service Boundaries + Monorepo Layout (NestJS/Fastify)

Primary reference: [`PRD.md`](../PRD.md)

## Intent

This document tells the team:
- what services exist,
- what each service owns,
- how they communicate,
- and how to structure the monorepo so types/contracts stay consistent.

## Recommended repo layout

```
Trading_platform/
  docs/
    architecture.md
    tech-stack.md
    data-model.md
    realtime-events.md
    service-boundaries.md
    alternatives.md

  services/
    api-service/
    realtime-service/
    indexer-service/
    derivation-service/
    oracle-service/
    asset-service/

  packages/
    contracts/          # ABIs + address registry + event signatures
    db/                 # Prisma schema/migrations + DB access layer
    types/              # Shared TS types for read models + WS payloads
    config/             # Shared config loading + env schema
    observability/      # Logging/metrics/tracing helpers
    utils/              # common utilities (time bucketing, bigints, etc.)
```

## Service ownership (what goes where)

### `indexer-service`

**Owns**
- Base RPC log ingestion and block traversal strategy
- ABI decoding (via `packages/contracts`)
- Canonical normalized writes (via `packages/db`)
- Reorg safety + idempotency enforcement

**Reads**
- `packages/contracts` (ABIs, tracked addresses)

**Writes**
- Canonical normalized event tables (see `docs/data-model.md`)
- Index checkpoints / block tracking tables

**Produces**
- Internal queue/stream messages for new canonical events (optional, if derivation consumes from a stream rather than DB polling)

### `oracle-service`

**Owns**
- Chainlink ETH/USD ingestion (AnswerUpdated)
- Rate history persistence

**Writes**
- `events_chainlink_answer_updated` and/or a compact `eth_usd_rates` table

**Used by**
- `derivation-service` to compute USD values deterministically at event time

### `derivation-service` (workers)

**Owns**
- Deterministic derivation logic for all read models:
  - token stats (market cap, 24h volume, rankings)
  - trades feed + aggregates
  - holders + holder counts
  - positions (WAC, realized/unrealized PnL)
  - royalties + earnings buckets
  - OHLCV candles (ETH + USD, 1m/15m/1h/4h/1d)
  - activity feed
  - platform stats + top fee earners

**Reads**
- Canonical normalized tables
- Oracle rate history

**Writes**
- Derived read models (see `docs/data-model.md`)

**Publishes**
- Derived change events to Redis (the realtime bus)

### `realtime-service`

**Owns**
- WebSocket server
- Room subscription model (PRD: room-based subscriptions)
- Mapping derived-change events → WebSocket payloads

**Reads**
- Derived change events (Redis Streams/PubSub)

**Writes**
- none (optional: ephemeral connection state in Redis)

**Contracts**
- Must share message schemas with frontend via `packages/types` and `docs/realtime-events.md`

### `api-service`

**Owns**
- REST endpoints for PRD pages (pagination, filtering, sorting)
- Auth/rate limiting/validation boundaries

**Reads**
- Derived read models in Postgres/Timescale
- Redis cache for hot endpoints (optional)

**Writes**
- Only for user-driven operations (e.g., token creation metadata), not for analytics read models

### `asset-service`

**Owns**
- Token creation uploads
- SHA-256 hashing and dedup
- Object storage integration and metadata persistence

**Writes**
- Object storage (logo/image)
- `tokens` metadata fields (logo URL/hash, socials, description)

## Shared packages (what must be shared across services)

### `packages/contracts`

Contents:
- ABIs for all PositionManager versions, BidWall, FeeEscrow, FlaunchNFT, CollectionToken, ChainlinkAggregator, etc.
- Address registry per chain and per contract version
- Event signature mapping and decoding helpers

Why shared:
- Indexer must decode and normalize consistently across versions.
- Derivation must interpret versioned fields correctly.

### `packages/types`

Contents:
- DTOs for API responses used by frontend
- WS message envelope and payload types (`home.tokenPatch`, `token.candleTip`, etc.)
- Internal derived-change event types (bus format)

Why shared:
- Prevents drift between `derivation-service` producer and `realtime-service` consumer.

### `packages/db`

Contents:
- Prisma schema + migrations
- DB client wrapper, transaction helpers, common query utilities

Why shared:
- One authoritative schema for canonical + derived tables.

### `packages/config`

Contents:
- typed config loader (env schema)
- service-specific config namespaces:
  - rpc endpoints + failover
  - confirmation depth and reorg window
  - redis, postgres, object storage configs

### `packages/observability`

Contents:
- structured logger
- metrics helpers (index lag, worker backlog, ws send latency)
- tracing helpers

## Service-to-service communication (high level)

Preferred (baseline):
- `indexer-service` writes canonical events to DB
- `derivation-service` consumes canonical events (via DB cursor or a queue) and writes derived models
- `derivation-service` publishes derived-change events to Redis
- `realtime-service` consumes derived-change events and pushes WS diffs
- `api-service` reads derived models for HTTP responses

Optional enhancements:
- Use Redis Streams as the canonical “event bus” from indexer → derivation to reduce DB polling
- Use a second stream topic for derived-change events to segment `home`, `token`, `portfolio` consumers

## Deployment grouping (practical)

You can deploy services as separate containers with independent scaling:
- Scale `realtime-service` by WebSocket connections
- Scale `derivation-service` by worker concurrency
- Scale `indexer-service` primarily by RPC limits and backfill needs
- Scale `api-service` by HTTP QPS

