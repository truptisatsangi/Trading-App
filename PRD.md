# PRD — Token Launch & Trading Platform Backend

**Chain**: Base (EVM L2)

---

### 1. Token Discovery

Users browse and discover tokens. The homepage shows a paginated grid of all tokens sorted by market cap.

**Per token:**

- Name, symbol, creator, logo
- Price and market cap (ETH + USD)
- 24h volume and price change %
- Sparkline chart (24h)
- Holder count, lifetime trading fees
- Fee receiver members (creators, revenue split recipients)

**Sorting options**: Market cap, 24h volume, most traded, newest

**Live updates**: Prices, volumes, and rankings update in real time via WebSocket as trades happen.

---

### 2. Token Detail Page

Full details for a single token.


| Section           | Description                                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| Price header      | Current price + market cap, updating live                                                                        |
| TradingView chart | OHLCV candles across 5 timeframes: 1m, 15m, 1h, 4h, 1d — up to 1000 candles per request, both ETH and USD prices |
| Trade activity    | Paginated list of all buys/sells with amounts, fees, trader address, tx hash                                     |
| Holders           | Paginated list of all holders sorted by balance, with USD value                                                  |
| Token info        | Metadata (description, socials), pool details, fair launch status, bid wall                                      |
| Fee receivers     | Who earns trading fees on this token and their percentage split                                                  |


**Live updates**: Chart candles update on each trade, new trades prepend to activity feed, holder counts refresh.

---

### 3. User Positions (Portfolio)

A user's trading positions across all tokens.

**Per position:**

- Token info (symbol, name, logo)
- Current balance in tokens and USD
- Average cost basis (Weighted Average Cost method)
- Unrealized PnL (amount + percentage)
- Realized PnL from closed/sold positions

**Sorting**: Active positions first, then by USD value descending.
**Pagination**: Limit/offset with total count.

---

### 4. User Royalties (Creator Earnings)

Tokens where a user earns creator fees — through direct ownership, revenue splits, or fee claims.

**Per token:**

- Lifetime fees earned (ETH + USD)
- Token market cap
- User's fee share percentage
- Royalty member list (who else earns fees on this token)

**Summary**: Total portfolio fees, total market cap across all owned tokens.

**Earnings chart**: 7-bar bucketed chart showing earnings over time:

- 1 day period: 7 bars, ~3.4h each
- 7 day period: 7 bars, 1 day each
- All time: 7 bars, equal time spans

---

### 5. Activity Feed

Unified history of everything a user has done:

- Buys and sells
- Token launches
- Fee claims (from various fee distribution mechanisms)

Paginated, sorted by time, with token info and USD amounts.

---

### 6. Platform Stats

Protocol-wide metrics:

- Total trading volume (ETH + USD)
- Total fees generated
- Total tokens launched
- Total unique holders
- Top fee earners (24h)

**Live updates**: Protocol fee counter ticks on every trade via WebSocket.

### 7. Token Creation

- Image upload (hashed with SHA-256)
- Metadata upload (name, description, socials)

---

## On-Chain Contracts (Base, Chain ID 8453)

All data is derived from indexing events emitted by these contracts.


| Contract                     | Address(es)                                                                                                                                                                                                                                                                                                                                 | Purpose                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **PositionManager v1**       | `0x51Bba15255406Cfe7099a42183302640ba7dAFDC`                                                                                                                                                                                                                                                                                                | Core — pool creation, swaps (3-phase: FairLaunch/ISP/Uniswap), fee distribution, price state |
| **PositionManager v1.1**     | `0xf785bb58059fab6fb19bdda2cb9078d9e546efdc`                                                                                                                                                                                                                                                                                                | Same as v1, updated pool creation params                                                     |
| **PositionManager v1.1.1**   | `0xb903b0ab7bcee8f5e4d8c9b10a71aac7135d6fdc`                                                                                                                                                                                                                                                                                                | Same as v1.1                                                                                 |
| **PositionManager v1.1.4**   | `0x23321f11a6d44fd1ab790044fdfde5758c902fdc`                                                                                                                                                                                                                                                                                                | Same as v1.1                                                                                 |
| **AnyPositionManager**       | `0x2ad43d0618b1d8a0cc75cf716cf0bf64070725dc`, `0x8dc3b85e1dc1c846ebf3971179a751896842e5dc`                                                                                                                                                                                                                                                  | Same as PositionManager but for imported (non-native) ERC-20 tokens                          |
| **FairLaunch**               | `0xCc7A4A00072ccbeEEbd999edc812C0ce498Fb63B`, `0x4dc442403e8c758425b93c59dc737da522f32640`                                                                                                                                                                                                                                                  | Bonding curve launch phase before Uniswap V4 pool                                            |
| **BidWall**                  | `0x66681f10BA90496241A25e33380004f30Dfd8aa8`, `0x7f22353d1634223a802D1c1Ea5308Ddf5DD0ef9c`                                                                                                                                                                                                                                                  | Automated floor price support — repositions liquidity                                        |
| **AnyBidWall**               | `0x2154c604df568A5285284D1c4918DC98C39240df`                                                                                                                                                                                                                                                                                                | Bid wall for imported tokens                                                                 |
| **FeeEscrow**                | `0x72e6f7948b1B1A343B477F39aAbd2E35E6D27dde`                                                                                                                                                                                                                                                                                                | Holds creator fees until claimed                                                             |
| **FlaunchNFT (ERC-721)**     | `0x6A53F8b799bE11a2A3264eF0bfF183dCB12d9571` (v1), `0xb4512bf57d50fbcb64a3adf8b17a79b2a204c18c` (v1.1), `0x0cf6bdf0a85a9d6763361037985b76c8893553af` (v1.1.1), `0x516af52d0c629b5e378da4dc64ecb0744ce10109` (v1.1.4), `0xf175a370eb26ea26c42caaecd10ee723ed844c50` (AnyFlaunch), `0xc5b2e8f197407263f4b62a35c71bfc394ecf95d5` (AnyFlaunch2) | NFT representing token ownership — Transfer = ownership change                               |
| **CollectionToken (ERC-20)** | Dynamic (deployed per token)                                                                                                                                                                                                                                                                                                                | The memecoin itself — Transfer events track all holder balances                              |
| **TreasuryManagerFactory**   | `0x48af8b28DDC5e5A86c4906212fc35Fa808CA8763`                                                                                                                                                                                                                                                                                                | Deploys fee manager contracts per token                                                      |
| **AddressFeeSplitManager**   | Dynamic (deployed per token)                                                                                                                                                                                                                                                                                                                | Splits trading fees to multiple wallets by weight                                            |
| **StakingManager**           | Dynamic (deployed per token)                                                                                                                                                                                                                                                                                                                | Community stakes tokens to earn a share of trading fees                                      |
| **BuyBackManager**           | Dynamic (deployed per token)                                                                                                                                                                                                                                                                                                                | Auto-buys back the token using accumulated trading fees                                      |
| **RevenueManager**           | Dynamic (deployed per token)                                                                                                                                                                                                                                                                                                                | Simple single-owner revenue distribution                                                     |
| **MemecoinTreasury**         | Dynamic (deployed per token)                                                                                                                                                                                                                                                                                                                | Per-token treasury — holds ETH, can execute on-chain actions                                 |
| **ChainlinkAggregator**      | `0x57d2d46Fc7ff2A7142d479F2f59e1E3F95447077`                                                                                                                                                                                                                                                                                                | ETH/USD price oracle — `AnswerUpdated` events set the global exchange rate                   |
| **TokenImporter**            | `0xb47af90ae61bc916ea4b4bacffae4570e7435842`, `0x6fb66f4fc262dc86e12136c481ba7c411e668197`                                                                                                                                                                                                                                                  | Imports existing ERC-20 tokens into the platform                                             |
| **FeeExemptions**            | `0xfdCE459071c74b732B2dEC579Afb38Ea552C4e06`                                                                                                                                                                                                                                                                                                | Per-address trading fee overrides                                                            |
| **ActionManager**            | `0xeC2a53F572cFD952aAA3a8359Ac54B31d0A186a4`, `0xFB5c20c4E60c9c64648DD3692437E3E313Add4A4`                                                                                                                                                                                                                                                  | Approves/unapproves treasury actions                                                         |


**Key event flows:**

- **Token launch**: `PoolCreated` → Coin + Pool + BidWall + FairLaunch + initial holdings
- **Trade**: `PoolSwap` → balances, PnL (WAC), OHLCV candles, volume
- **Price update**: `PoolStateUpdated` → sqrtPriceX96 → derived price + market cap
- **Fee distribution**: `PoolFeesDistributed` → splits to creator, community, bid wall, governance, protocol
- **Holder tracking**: `Transfer (ERC-20)` → balance updates, holder count
- **Ownership**: `Transfer (ERC-721)` → token creator/owner change
- **ETH/USD rate**: `AnswerUpdated (Chainlink)` → global rate for all USD conversions

---

## Real-Time Requirements

Every user-facing data point that changes with trades should update live without page refresh:


| What updates                 | When                                      |
| ---------------------------- | ----------------------------------------- |
| Token prices + market caps   | Every trade                               |
| 24h volume                   | Every trade                               |
| Homepage rankings            | When a token's market cap crosses another |
| TradingView chart candle tip | Every trade on that token                 |
| Trade activity feed          | Every new swap                            |
| Holder counts                | Every transfer                            |
| Protocol fee counter         | Every trade                               |
| Portfolio position values    | Every trade on held tokens                |


**Delivery**: WebSocket with room-based subscriptions. Clients subscribe to what they're viewing (a homepage page, a specific token, their portfolio) and receive only relevant updates.

---

## End Goal

A fully real-time token analytics backend where:

1. **Every trade updates the UI within 2 seconds** — prices, charts, volumes, rankings, portfolio values all reflect the latest on-chain state without polling or page refresh.
2. **All data is paginated and fast** — holders (thousands), trades (tens of thousands), positions, royalties — all browsable with sub-200ms API responses.
3. **Charts match TradingView quality** — 5 timeframes, up to 1000 candles, both ETH and USD denominated, with live candle tip updates as trades execute.
4. **Portfolio PnL is accurate and intuitive** — WAC cost basis, incremental USD accumulation (historical values don't shift with ETH price changes), clear active/closed position tracking.
5. **Creator royalties are fully transparent** — see exactly who earns what percentage, historical earnings bucketed into visual charts, all fee distribution types supported.
6. **The system scales** — 15,000+ tokens, 5,000+ concurrent WebSocket connections, handles traffic spikes from viral token launches without degradation.

