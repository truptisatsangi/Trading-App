import dotenv from "dotenv";

dotenv.config();

function readInt(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  dbUrl: process.env.DB_URL || "postgres://postgres:postgres@localhost:5433/token_db",
  chainId: readInt(process.env.CHAIN_ID, 8453),
  checkpointName: process.env.CHECKPOINT_NAME || "derivation-v1",
  eventBatchSize: readInt(process.env.EVENT_BATCH_SIZE, 200),
  pollIntervalMs: readInt(process.env.POLL_INTERVAL_MS, 3000)
};
