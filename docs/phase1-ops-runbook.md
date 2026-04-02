# Phase 1 Ops Runbook

## Local stack

```bash
docker compose -f infra/docker-compose.yml up -d
```

Services:
- Postgres/Timescale: `localhost:5433`
- Redis: `localhost:6379`
- Kafka: `localhost:9092`

## Health checks

- Indexer: `curl http://localhost:3001/health`
- Derivation: `curl http://localhost:3002/health`

## Baseline operational metrics (SQL)

Canonical ingest volume:

```sql
SELECT event_type, COUNT(*) AS total
FROM canonical_events
GROUP BY event_type
ORDER BY total DESC;
```

Indexer checkpoint lag:

```sql
SELECT name, chain_id, last_processed_block, updated_at
FROM indexer_checkpoints
ORDER BY updated_at DESC;
```

Outbox pending rows:

```sql
SELECT topic, COUNT(*) AS pending
FROM canonical_event_outbox
WHERE published_at IS NULL
GROUP BY topic;
```

Derivation replay safety:

```sql
SELECT COUNT(*) AS applied_events
FROM derivation_applied_events;
```

## Incident hints

- If provider rejects `eth_getLogs` range, reduce `LOG_RANGE_LIMIT`.
- If Kafka unavailable, canonical writes continue; outbox rows accumulate and relay catches up later.
- If derivation restarts, idempotent apply table prevents duplicate transfer balance application.
