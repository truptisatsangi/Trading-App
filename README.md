# Trading Platform (Base) — Real-time Token Analytics

This repo is the **Phase-1 vertical slice** of a token launch + trading analytics platform on **Base (chain id 8453)**. It indexes on-chain events from ƒlaunch / PositionManager contracts, stores them as **canonical events**, derives **read models** (tokens, trades, prices, holders, fees), and serves them via **API + WebSocket** to a minimal web UI.

## End goal (PRD)

From `PRD.md`, the intended end state is:

- **Token discovery**: browse tokens sorted by market cap / volume / newest, with live updates.
- **Token detail**: chart candles across multiple timeframes, live trades feed, holders, fee receivers.
- **Portfolio**: positions with WAC cost basis, realized/unrealized PnL, live valuation.
- **Royalties**: creator earnings / fee splits with transparent breakdowns and time-bucketed charts.
- **Platform stats**: protocol-wide totals and top earners with live updates.
- **Performance & scale**: fast pagination (sub-200ms reads) and stable ingestion.

See `PRD.md` for contract addresses, event flows, and requirements.

## Repo structure

- **`apps/indexer-service`**: block polling + `eth_getLogs` → `canonical_events` + checkpoints + optional outbox for Kafka relay.
- **`apps/derivation-service`**: consumes canonical events (Kafka-primary or DB-poll fallback) → read-model tables + publishes derived changes (Redis and/or Kafka).
- **`apps/api-service`**: REST API used by the web UI.
- **`apps/realtime-service`**: WebSocket server with room subscriptions; broadcasts live updates.
- **`apps/web-ui`**: minimal Next.js UI (`/tokens`, `/tokens/[id]`).
- **`db/`**: shared DB utilities and **central migrations**.
- **`infra/`**: docker compose for Postgres/Redis/Kafka.
- **`scripts/qa`**: integrity harness (determinism replay, invariants, RPC sampling).
- **`flaunch-contracts/`**: contract sources + ABIs (reference / decoding).

## Database & schema ownership (important)

Schema is centralized in **`db/migrate.mjs`**.

- Services **do not** run `CREATE TABLE` / DDL on startup.
- Services only **connect** and assume migrations already ran.
- Run migrations before first start (and after DDL changes):

```bash
npm run migrate
```

## What's done so far

### Phase-1 ingestion + derivation pipeline

- **Indexer service** (`apps/indexer-service`):
  - block polling + provider-safe log chunking (`LOG_RANGE_LIMIT`)
  - ABI decoding for: `PoolCreated`, `PoolSwap`, `PoolStateUpdated`, `PoolFeesDistributed`, ERC-20 `Transfer`, ERC-721 `Transfer`, Chainlink `AnswerUpdated`
  - canonical schema with idempotent inserts on `(chain_id, tx_hash, log_index)`
  - checkpointing (`indexer_checkpoints`)
  - canonical event outbox (`canonical_event_outbox`) for Kafka relay
  - transient RPC retry + optional failover list

- **Derivation service** (`apps/derivation-service`):
  - builds: `tokens`, `token_pools`, `derived_trades`, `token_prices_current`, `token_prices_derived_current`, `token_candles_1m`,
    `token_holders_current`, `token_holder_counts`, `token_ownership_current`, `eth_usd_rates`, `token_fee_distributions`
  - replay safety: `derivation_checkpoints` + `derivation_applied_events`
  - optional derived-change publishing to Kafka and Redis pub/sub

### Looser coupling: centralized migrations

- Added **`db/migrate.mjs`** as the **single source** for applying all DDL (indexer + derivation tables/indexes).
- Updated repositories so `init()` only connects (no DDL on service startup).
- Kept `apps/*/init-schema` as thin wrappers around the shared migrate for convenience.

### Minimal edge layer + UI

- **API service**: serves token list/detail reads for the UI (DB-backed).
- **Realtime service**: websocket rooms + live updates (typically driven by Redis channel + DB reads).
- **Web UI**: minimal Next.js pages for tokens list and token detail with live refresh.

### QA harness

Under `scripts/qa`:

- deterministic replay checks
- invariant SQL checks
- RPC sampling against on-chain receipts/logs

## What we need to do next (in progress / to do)

Aligned to `PRD.md`:

- **Charts**: add more candle timeframes (15m/1h/4h/1d) + APIs (up to 1000 candles) + live candle-tip websocket updates.
- **Portfolio**: implement WAC cost basis, realized/unrealized PnL, and position endpoints + websocket rooms.
- **Royalties**: compute creator earnings across fee distribution mechanisms + 7-bar bucket charts.
- **Platform stats**: protocol-wide totals (volume/fees/tokens/holders) + top earners (24h), live tick updates.
- **Ops hardening**: query/index tuning for high-cardinality tables, replay/backfill tooling, metrics/alerts.

## Run locally

### 0) Prereqs

- Node.js + npm
- Docker
- A Base RPC URL (rate-limited providers may require tuning `LOG_RANGE_LIMIT`)

### 1) Start infrastructure (Postgres + Redis + optional Kafka)

```bash
cd infra
docker compose up -d
```

Defaults (see `infra/docker-compose.yml`):
- Postgres: `localhost:5433`, db `token_db`, user/pass `postgres/postgres`
- Redis: `localhost:6379`
- Kafka (optional): `localhost:9092`

### 2) Install root deps (for migrations)

From repo root:

```bash
npm install
```

### 3) Apply schema (required)

From repo root:

```bash
npm run migrate
```

### 4) Configure and start services

Copy env files:

```bash
cd apps/indexer-service && cp .env.example .env
cd ../derivation-service && cp .env.example .env
cd ../api-service && cp .env.example .env
cd ../realtime-service && cp .env.example .env
cd ../web-ui && cp .env.example .env.local
```

Start each service in its own terminal:

```bash
cd apps/indexer-service && npm install && npm run start
```

```bash
cd apps/derivation-service && npm install && npm run start
```

```bash
cd apps/api-service && npm install && npm run start
```

```bash
cd apps/realtime-service && npm install && npm run start
```

```bash
cd apps/web-ui && npm install && npm run dev
```

### 5) URLs / ports (defaults)

- **Indexer health**: `http://localhost:3001/health` (if `HEALTH_PORT=3001`)
- **Derivation health**: `http://localhost:3002/health` (if `HEALTH_PORT=3002`)
- **API**: `http://localhost:3003`
- **Realtime WS**: `ws://localhost:3004`
- **Web UI**: `http://localhost:3010`

### Optional: run integrity tests

```bash
cd scripts/qa
cp .env.example .env
npm install
npm run qa
```

## Notes / common pitfalls

- If you see `relation "tokens" does not exist`, you skipped migrations. Run `npm run migrate`.
- If your RPC is rate-limited, lower `LOG_RANGE_LIMIT` and/or add multiple `RPC_URLS` in `apps/indexer-service/.env`.
- Kafka is optional. By default, indexer Kafka relay is opt-in (`ENABLE_KAFKA=false`).
