# Realtime Events (WebSocket) — Room Model + Payload Contracts

Primary reference: [`PRD.md`](../PRD.md)

## Overview

The realtime channel is **room-based**. Clients subscribe only to what they are viewing:

- `home:<chainId>`: homepage token grid updates and ranking changes
- `token:<tokenAddress>`: token detail live updates (price header, candle tip, new trades, holder count)
- `portfolio:<wallet>`: portfolio position value updates
- `royalties:<wallet>`: creator earnings updates
- `activity:<wallet>`: unified user activity feed updates

**Key rule**: the realtime-service only emits **derived diffs** that correspond to committed read-model updates.

## Connection and subscription

### WebSocket URL

- `wss://<domain>/ws`

### Client subscription messages (example)

```json
{ "op": "subscribe", "room": "home:8453" }
{ "op": "subscribe", "room": "token:0xTokenAddress" }
{ "op": "subscribe", "room": "portfolio:0xWallet" }
```

### Unsubscribe

```json
{ "op": "unsubscribe", "room": "token:0xTokenAddress" }
```

## Common envelope

All server→client messages use a consistent envelope:

```json
{
  "room": "token:0xTokenAddress",
  "type": "token.price",
  "ts": 1712345678901,
  "data": { }
}
```

Envelope fields:
- `room`: the room this message targets
- `type`: message type (namespaced)
- `ts`: server timestamp (ms)
- `data`: payload (type-specific)

## Room: `home:<chainId>`

Purpose (PRD): token discovery grid updates, live ranking changes.

### `home.tokenPatch`

Sent when one or more tokens’ homepage fields change.

```json
{
  "room": "home:8453",
  "type": "home.tokenPatch",
  "ts": 1712345678901,
  "data": {
    "patches": [
      {
        "tokenAddress": "0x...",
        "priceEth": "0.0000123",
        "priceUsd": "0.041",
        "marketCapEth": "123.45",
        "marketCapUsd": "410000.12",
        "volume24hEth": "5.12",
        "volume24hUsd": "17000.55",
        "priceChange24hPct": -3.12,
        "holderCount": 921,
        "lifetimeFeesEth": "1.23",
        "lifetimeFeesUsd": "4100.22"
      }
    ]
  }
}
```

### `home.rankDelta`

Sent when rankings change (market cap crosses, or sort keys update).

```json
{
  "room": "home:8453",
  "type": "home.rankDelta",
  "ts": 1712345678901,
  "data": {
    "sort": "marketCap",
    "deltas": [
      { "tokenAddress": "0xA", "oldRank": 12, "newRank": 11 },
      { "tokenAddress": "0xB", "oldRank": 11, "newRank": 12 }
    ]
  }
}
```

## Room: `token:<tokenAddress>`

Purpose (PRD): token detail page live header, OHLCV candle tip updates, trade feed prepend, holder count refresh.

### `token.price`

```json
{
  "room": "token:0x...",
  "type": "token.price",
  "ts": 1712345678901,
  "data": {
    "priceEth": "0.0000123",
    "priceUsd": "0.041",
    "marketCapEth": "123.45",
    "marketCapUsd": "410000.12",
    "volume24hEth": "5.12",
    "volume24hUsd": "17000.55",
    "priceChange24hPct": -3.12,
    "sqrtPriceX96": "79228162514264337593543950336"
  }
}
```

### `token.candleTip`

Update emitted on each swap for the current bucket for a timeframe/currency pair.

```json
{
  "room": "token:0x...",
  "type": "token.candleTip",
  "ts": 1712345678901,
  "data": {
    "timeframe": "1m",
    "currency": "usd",
    "bucketStartMs": 1712345640000,
    "o": "0.0410",
    "h": "0.0413",
    "l": "0.0408",
    "c": "0.0412",
    "v": "12345.67"
  }
}
```

### `token.tradePrepend`

Trade activity feed prepend (PRD: new trades prepend).

```json
{
  "room": "token:0x...",
  "type": "token.tradePrepend",
  "ts": 1712345678901,
  "data": {
    "trade": {
      "tradeId": "8453:0xTxHash:123",
      "side": "buy",
      "trader": "0xWallet",
      "amountToken": "1000000",
      "amountEth": "0.12",
      "amountUsd": "410.22",
      "feeEth": "0.003",
      "feeUsd": "10.25",
      "txHash": "0xTxHash",
      "blockNumber": 12345678,
      "logIndex": 123,
      "timestampMs": 1712345678000
    }
  }
}
```

### `token.holderCount`

Holder count refresh on transfers (PRD).

```json
{
  "room": "token:0x...",
  "type": "token.holderCount",
  "ts": 1712345678901,
  "data": {
    "holderCount": 922
  }
}
```

### `token.feeReceivers`

Fee receiver list changes (typically rare; emitted on configuration changes or newly detected recipients).

```json
{
  "room": "token:0x...",
  "type": "token.feeReceivers",
  "ts": 1712345678901,
  "data": {
    "members": [
      { "address": "0xCreator", "weightBps": 5000 },
      { "address": "0xCommunity", "weightBps": 3000 },
      { "address": "0xProtocol", "weightBps": 2000 }
    ]
  }
}
```

## Room: `portfolio:<wallet>`

Purpose (PRD): portfolio position values update on trades on held tokens.

### `portfolio.positionPatch`

```json
{
  "room": "portfolio:0xWallet",
  "type": "portfolio.positionPatch",
  "ts": 1712345678901,
  "data": {
    "patches": [
      {
        "tokenAddress": "0xToken",
        "balanceToken": "1230000",
        "balanceUsd": "502.12",
        "wacCostUsd": "430.00",
        "unrealizedPnlUsd": "72.12",
        "unrealizedPnlPct": 16.77
      }
    ]
  }
}
```

## Room: `royalties:<wallet>`

Purpose (PRD): creator earnings/royalties updates, including chart buckets.

### `royalties.tokenPatch`

```json
{
  "room": "royalties:0xWallet",
  "type": "royalties.tokenPatch",
  "ts": 1712345678901,
  "data": {
    "patches": [
      {
        "tokenAddress": "0xToken",
        "lifetimeFeesEarnedEth": "0.12",
        "lifetimeFeesEarnedUsd": "410.22",
        "userFeeShareBps": 2500,
        "tokenMarketCapUsd": "410000.12"
      }
    ]
  }
}
```

### `royalties.earningsBuckets`

```json
{
  "room": "royalties:0xWallet",
  "type": "royalties.earningsBuckets",
  "ts": 1712345678901,
  "data": {
    "period": "7d",
    "currency": "usd",
    "buckets": [
      { "startMs": 1711750000000, "endMs": 1711836400000, "value": "12.3" },
      { "startMs": 1711836400000, "endMs": 1711922800000, "value": "8.1" }
    ]
  }
}
```

## Room: `activity:<wallet>`

Purpose (PRD): unified activity feed (buys/sells, launches, fee claims).

### `activity.prepend`

```json
{
  "room": "activity:0xWallet",
  "type": "activity.prepend",
  "ts": 1712345678901,
  "data": {
    "items": [
      {
        "activityId": "8453:0xTxHash:123",
        "kind": "swap",
        "tokenAddress": "0xToken",
        "side": "sell",
        "amountUsd": "123.45",
        "txHash": "0xTxHash",
        "timestampMs": 1712345678000
      }
    ]
  }
}
```

## Derived change events (internal bus format)

`derivation-service` publishes internal events that drive WS, e.g.:

- `token_stats.updated` (tokenAddress, changedFields)
- `candle_tip.updated` (tokenAddress, timeframe, currency, bucketStartMs)
- `trade.inserted` (tokenAddress, tradeId)
- `holder_count.updated` (tokenAddress)
- `portfolio.updated` (wallet, tokenAddresses[])
- `royalties.updated` (wallet, tokenAddresses[])
- `activity.inserted` (wallet, activityId)

These internal events should include enough routing metadata to emit to:
- token room
- home room (if ranking keys changed)
- portfolio room (if wallet holds the token)

