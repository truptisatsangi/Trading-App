# Derivation Service (Phase 1 Hardening)

Consumes canonical events (Kafka-primary or DB-poll fallback) and builds refined read-model tables:

- `tokens` + `token_pools` (from `pool_created`)
- `derived_trades` (from `swap`, mapped to token via `pool_id`)
- `token_prices_current` (from `price_update`)
- `token_holders_current` + `token_holder_counts` (from `transfer`)
- `token_ownership_current` (from `nft_transfer`)
- `eth_usd_rates` (from `answer_updated`)
- `token_fee_distributions` (from `pool_fees_distributed`)
- `derivation_checkpoints` + `derivation_applied_events` for replay safety
- optional derived-change publishing to Kafka and Redis

## Setup

```bash
cp .env.example .env
npm install
npm run start
```

## Verify refined data

```sql
SELECT COUNT(*) FROM derived_trades;
SELECT COUNT(*) FROM tokens;
SELECT COUNT(*) FROM token_pools;
SELECT * FROM token_prices_current ORDER BY updated_at DESC LIMIT 20;
SELECT * FROM token_holder_counts ORDER BY updated_at DESC LIMIT 20;
SELECT * FROM token_ownership_current ORDER BY updated_at DESC LIMIT 20;
SELECT * FROM eth_usd_rates ORDER BY indexed_at DESC LIMIT 20;
SELECT * FROM token_fee_distributions ORDER BY updated_at DESC LIMIT 20;
SELECT * FROM derivation_checkpoints;
SELECT COUNT(*) FROM derivation_applied_events;
```

## Kafka + Redis hybrid

- `USE_KAFKA_PRIMARY=true`: consume from `canonical.events.v1`.
- `USE_KAFKA_PRIMARY=false`: poll canonical events from Postgres by event id.
- Derived changes can be emitted to:
  - Kafka (`derived.changes.v1`)
  - Redis pub/sub channel (`derived.changes.v1`)

## Health and baseline metrics

- Enable health endpoint with `HEALTH_PORT`, then:

```bash
curl http://localhost:3002/health
```

The response includes processed count and last handled event type/time.

## Notes

- This phase focuses on production reliability and core read models.
- OHLCV/WAC/PnL/royalties analytics enrichment can layer on top of these read models.
