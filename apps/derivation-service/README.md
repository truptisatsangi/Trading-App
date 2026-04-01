# Derivation Service (MVP v1)

Consumes `canonical_events` and builds first refined/read-model tables:

- `derived_trades` (from `swap`)
- `token_prices_current` (from `price_update`)
- `token_holders_current` + `token_holder_counts` (from `transfer`)
- `derivation_checkpoints` (resume progress by canonical event id)

## Setup

```bash
cp .env.example .env
npm install
npm run start
```

## Verify refined data

```sql
SELECT COUNT(*) FROM derived_trades;
SELECT * FROM token_prices_current ORDER BY updated_at DESC LIMIT 20;
SELECT * FROM token_holder_counts ORDER BY updated_at DESC LIMIT 20;
SELECT * FROM derivation_checkpoints;
```

## Notes

- This is intentionally minimal for MVP progression from raw events to queryable read models.
- It does not yet compute OHLCV, USD conversion, WAC PnL, or royalties.
