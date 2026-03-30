# Tech Stack — Token Launch & Trading Platform (Base)

Primary reference: [`PRD.md`](../PRD.md)

## Recommended stack (baseline)

This stack prioritizes: (1) deterministic indexing/derivation, (2) fast read APIs, (3) room-based realtime diffs, (4) operational simplicity.

### Language/runtime

- **Node.js + TypeScript**
  - **Why**: strong ecosystem for WebSockets, EVM tooling, and rapid iteration; type-safety for event payloads and DB models.
  - **Alternatives**:
    - **Go**: excellent concurrency and predictable performance; slightly slower iteration and less ergonomic EVM ABI tooling vs TS.
    - **Python (FastAPI)**: high dev velocity; can be harder at high concurrency for WS unless carefully engineered.
    - **Rust**: top performance; higher implementation complexity.

### Backend framework

- **NestJS (with Fastify adapter)**
  - **Why**: modular architecture, DI, consistent patterns across multiple services, excellent TS ergonomics. Fastify offers lower overhead than Express.
  - **Alternatives**:
    - **Fastify (direct)**: minimal and fast; you build more structure yourself.
    - **Express**: very common; generally slower and less structured.
    - **tRPC**: great type-safety for a TS fullstack; less standard for public APIs and large teams unless everyone is TS.

### Blockchain interaction

- **`ethers`**
  - **Why**: mature ABI decoding, providers, widely adopted for EVM indexing tasks.
  - **Alternatives**:
    - **viem**: modern and fast; excellent, increasingly popular.
    - **web3.js**: older ecosystem, less favored today.

### Database (core read models)

- **PostgreSQL**
  - **Why**: relational integrity for tokens/users/positions/royalties; powerful indexing for cursor pagination; proven operationally.
  - **Alternatives**:
    - **MySQL**: viable; fewer native time-series ergonomics.
    - **DynamoDB**: can scale, but complex query patterns for multi-sorts and analytics.

### Time-series / OHLCV storage

- **TimescaleDB (extension on PostgreSQL)**
  - **Why**: hypertables for candles and time windows, still “one database” operationally; good fit for 1m/15m/1h/4h/1d candles.
  - **Alternatives**:
    - **ClickHouse**: very fast analytics and aggregations; higher operational complexity and different query model.
    - **Postgres only**: simplest; may degrade as candle volume grows.

### Cache + realtime fanout

- **Redis**
  - **Why**:
    - cache hot pages (homepage rankings, token headers)
    - coordinate workers (queues/streams)
    - fanout derived changes to WebSocket dispatcher
  - **Alternatives**:
    - **Memcached**: cache only (no streams/queues).
    - **NATS JetStream**: strong messaging/streaming; more ops overhead than Redis for early stages.

### Messaging / worker orchestration

- **BullMQ (Redis-backed)** and/or **Redis Streams consumer groups**
  - **Why**: retries, backoff, concurrency controls for derivation jobs; Streams provide ordered event consumption semantics.
  - **Alternative**: **Kafka**
    - **Use Kafka when**: you need long retention + multi-day replay, very high throughput, many independent consumers, and a heavier event backbone.

### WebSockets

- **Native WebSocket server (`ws`) or NestJS WebSocket gateway** + room routing in `realtime-service`
  - **Why**: low protocol overhead, high concurrency; room model matches PRD subscription requirement.
  - **Alternatives**:
    - **Socket.IO**: great ergonomics and fallbacks; more overhead and a custom protocol.
    - **SSE**: simpler for one-way updates; not as flexible for interactive subscription flows.

### ORM / migrations

- **Prisma**
  - **Why**: schema-driven workflow, strong TS types, reliable migrations, good team ergonomics.
  - **Alternatives**:
    - **TypeORM**: flexible; more runtime magic and migration discipline needed.
    - **Drizzle**: strong TS; smaller ecosystem vs Prisma.

### API style

- **REST + OpenAPI**
  - **Why**: straightforward caching and pagination; maps well to PRD list endpoints; good interoperability.
  - **Alternative**: **GraphQL**
    - **Use when**: frontend needs flexible nested queries and you can enforce strict pagination/cost limits.

### Object storage (token logos)

- **S3-compatible object storage** (AWS S3, Cloudflare R2, MinIO for local)
  - **Why**: durable, cheap, CDN-friendly; supports large uploads and caching.
  - **Alternatives**:
    - **Supabase Storage**: simple managed experience.
    - **GCS/Azure Blob**: comparable.

### Observability

- **Structured logs** + **metrics** + **tracing**
  - **Why**: you must track index lag, worker backlog, WS delivery latency to hit the 2-second requirement.
  - **Alternatives**:
    - OpenTelemetry + Prometheus/Grafana
    - Datadog/New Relic (managed)

## Why this stack fits the PRD (quick mapping)

- **Realtime updates**: WebSockets + Redis fanout + derived change events
- **Fast pagination**: Postgres indexes + cursor pagination + cache hot pages
- **TradingView-quality candles**: Timescale hypertables + incremental candle-tip updates on swaps
- **Accurate WAC/PnL**: deterministic derivations + persisted historical oracle conversions
- **Royalties transparency**: normalized fee events + deterministic split resolution + pre-aggregated user/token summaries

