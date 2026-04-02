# QA Harness (integrity tests)

This folder contains **repeatable integrity tests** for the Phase-1 pipeline:

- **Deterministic replay**: copy canonical event slice \([A,B]\) into two fresh temp DBs, run derivation on both, and assert derived-table checksums match.
- **Invariant SQL checks**: assertions that must return **0 rows** (no negative balances, no null mappings, etc.).
- **RPC sampling**: sample canonical events and verify they match on-chain receipts/logs (contract address, topic0, log index).

## Setup

```bash
cd scripts/qa
cp .env.example .env
npm install
```

## Run all

```bash
npm run qa
```

## Run individually

```bash
npm run determinism
npm run invariants
npm run sampling
```

## Notes

- Determinism tests require Postgres credentials that can create/drop temporary databases.
- Sampling tests require a working `RPC_URL`.

