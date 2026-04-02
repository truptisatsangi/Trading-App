import dotenv from "dotenv";

dotenv.config();

function readInt(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBool(value, fallback) {
  if (value == null) {
    return fallback;
  }
  return String(value).toLowerCase() === "true";
}

function hasKafkaBrokers() {
  return (
    String(process.env.KAFKA_BROKERS || "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean).length > 0
  );
}

export const config = {
  dbUrl: process.env.DB_URL || "postgres://postgres:postgres@localhost:5433/token_db",
  chainId: readInt(process.env.CHAIN_ID, 8453),
  checkpointName: process.env.CHECKPOINT_NAME || "derivation-v1",
  eventBatchSize: readInt(process.env.EVENT_BATCH_SIZE, 200),
  pollIntervalMs: readInt(process.env.POLL_INTERVAL_MS, 3000),
  processorName: process.env.PROCESSOR_NAME || "derivation-service",
  useKafkaPrimary: readBool(process.env.USE_KAFKA_PRIMARY, hasKafkaBrokers()),
  kafkaClientId: process.env.KAFKA_CLIENT_ID || "derivation-service",
  kafkaGroupId: process.env.KAFKA_GROUP_ID || "derivation-v1",
  kafkaBrokers: (process.env.KAFKA_BROKERS || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean),
  kafkaCanonicalTopic: process.env.KAFKA_CANONICAL_TOPIC || "canonical.events.v1",
  enableKafkaDerivedPublish:
    String(process.env.ENABLE_KAFKA_DERIVED_PUBLISH || "true").toLowerCase() === "true",
  kafkaDerivedTopic: process.env.KAFKA_DERIVED_TOPIC || "derived.changes.v1",
  enableRedisPublish: readBool(process.env.ENABLE_REDIS_PUBLISH, true),
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  redisDerivedChannel: process.env.REDIS_DERIVED_CHANNEL || "derived.changes.v1",
  healthPort: readInt(process.env.HEALTH_PORT, 0)
};
