# web-ui

Minimal Next.js UI for the trading platform vertical slice.

## Pages

- `/tokens`: token list with live price updates.
- `/tokens/[id]`: token detail showing current price, last 20 trades, and 1m candles with live refresh.

## Run

1. Copy `.env.example` to `.env.local` and adjust URLs if needed.
2. Install dependencies:

```bash
npm install
```

3. Start:

```bash
npm run dev
```

Default app URL: `http://localhost:3010`
