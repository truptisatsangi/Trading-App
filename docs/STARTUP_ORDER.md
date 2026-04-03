# Service startup order (local / staging)

This stack is **layered**: infrastructure → database → **schema** → ingest/processing → **edge (API / realtime / UI)**. Starting edge services before the schema exists causes errors such as `relation "tokens" does not exist`.

## 1. Infrastructure

```bash
cd infra
docker compose up -d
```

Brings up Postgres (e.g. `localhost:5433`), Redis, and optionally Kafka. Ensure `DB_URL` in each app matches Postgres (user, password, host, port, database name).

From the repo root (once):

```bash
npm install
```

Installs `pg`, `dotenv`, and shared `db/` scripts.

## 2. Database and schema (run before API / realtime / UI on a fresh DB)

Schema and optional database creation are centralized in **`db/migrate.mjs`**. Services **do not** run `CREATE TABLE` on startup; they only connect and assume migrations have been applied.

**Apply schema** (idempotent, safe to re-run):

```bash
# From repo root (recommended)
npm run migrate
```

Alternatively, either app’s legacy script runs the same migrate (uses that app’s `DB_URL` from config):

```bash
cd apps/indexer-service && npm run init-schema
# or
cd apps/derivation-service && npm run init-schema
```

## 3. Data pipeline (long-running)

| Order | Service | Role |
|------|---------|------|
| 1 | **indexer-service** | Chain → `canonical_events` |
| 2 | **derivation-service** | Canonical events → `tokens`, prices, candles, … |

Configure `ENABLE_KAFKA` / `USE_KAFKA_PRIMARY` only if Kafka is running; otherwise use DB polling modes per each service’s `.env.example`.

## 4. Edge (after schema + usually after some derivation has run)

| Order | Service | Role |
|------|---------|------|
| 1 | **api-service** | REST for web UI |
| 2 | **realtime-service** | WebSocket + Redis; **queries `tokens` and related tables** |
| 3 | **web-ui** | `npm run dev` (development) or `npm run build && npm run start` (production) |

**Realtime** subscribes to Redis and runs SQL against the read model. If `tokens` does not exist, you see `relation "tokens" does not exist` — run **`npm run migrate`** (or an app’s `init-schema`) before realtime.

## 5. One-page checklist (fresh machine)

1. `docker compose up -d` in `infra/`
2. `npm install` at repo root
3. `npm run migrate` at repo root
4. Start indexer → derivation → api → realtime → web-ui

The **`init-schema`** scripts in indexer/derivation remain as thin wrappers around the shared migrate so you can prepare the DB **without** starting the full loops.
