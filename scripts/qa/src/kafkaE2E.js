import crypto from "node:crypto";
import { Kafka } from "kafkajs";
import { loadEnv } from "./loadEnv.js";
import { withClient, buildDbUrlLike } from "./db.js";
import { EventRepository } from "../../../apps/indexer-service/src/repositories/eventRepo.js";
import { KafkaPublisher } from "../../../apps/indexer-service/src/publishers/kafkaPublisher.js";
import { OutboxRelay } from "../../../apps/indexer-service/src/publishers/outboxRelay.js";
import { KafkaSubscriber } from "../../../apps/derivation-service/src/subscribers/kafkaSubscriber.js";

loadEnv();

const DB_URL = process.env.DB_URL;
const CHAIN_ID = Number(process.env.CHAIN_ID ?? "8453");
const BROKERS = String(process.env.KAFKA_BROKERS || "")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);

if (!DB_URL) throw new Error("DB_URL is required");

function suffix() {
  return crypto.randomBytes(4).toString("hex");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  if (!BROKERS.length) {
    console.log("[qa] kafka-e2e skipped: KAFKA_BROKERS is empty");
    return;
  }

  const kafka = new Kafka({ clientId: `qa-harness-${suffix()}`, brokers: BROKERS });
  const admin = kafka.admin();
  await admin.connect();

  const topic = `qa.canonical.events.${suffix()}`;
  await admin.createTopics({
    waitForLeaders: true,
    topics: [{ topic, numPartitions: 1, replicationFactor: 1 }]
  });

  const adminDbUrl = buildDbUrlLike(DB_URL, "postgres");
  const dbName = `qa_kafka_${suffix()}`;
  const tempDbUrl = buildDbUrlLike(DB_URL, dbName);

  await withClient(adminDbUrl, async (pgAdmin) => {
    await pgAdmin.query(`CREATE DATABASE "${dbName}"`);
  });

  let repo = null;
  let relay = null;
  let publisher = null;
  let received = 0;

  try {
    repo = new EventRepository(tempDbUrl);
    await repo.init();

    const configForPublisher = {
      kafkaBrokers: BROKERS,
      kafkaClientId: `qa-indexer-${suffix()}`
    };
    publisher = new KafkaPublisher(configForPublisher);
    await publisher.init();

    const relayConfig = {
      kafkaCanonicalTopic: topic,
      kafkaOutboxBatchSize: 100,
      kafkaOutboxPollMs: 50
    };
    relay = new OutboxRelay(relayConfig, repo, publisher);

    // Start consumer (derivation subscriber) first
    const subConfig = {
      kafkaBrokers: BROKERS,
      kafkaClientId: `qa-derivation-${suffix()}`,
      kafkaGroupId: `qa-derivation-group-${suffix()}`,
      kafkaCanonicalTopic: topic
    };

    const messages = [];
    const subscriber = new KafkaSubscriber(subConfig, async (event) => {
      messages.push(event);
      received = messages.length;
    });
    await subscriber.start();

    // Seed outbox rows by inserting canonical events with outbox topic = our temp topic
    const expected = 5;
    for (let i = 0; i < expected; i++) {
      await repo.insertCanonicalEventWithOutbox(
        {
          chainId: CHAIN_ID,
          blockNumber: 1000 + i,
          blockHash: `0x${"aa".repeat(32)}`,
          parentHash: `0x${"bb".repeat(32)}`,
          blockTimestamp: new Date().toISOString(),
          txHash: `0x${String(i + 1).padStart(64, "0")}`,
          logIndex: i,
          contractAddress: `0x${"11".repeat(20)}`,
          topic0: `0x${"22".repeat(32)}`,
          eventType: "swap",
          poolId: `0x${"33".repeat(32)}`,
          tokenAddress: null,
          payload: { i }
        },
        topic
      );
    }

    // Run relay loop briefly (in background-ish)
    relay.start();

    const deadline = Date.now() + 15000;
    while (Date.now() < deadline && received < expected) {
      await sleep(100);
    }

    relay.stop();
    await subscriber.stop();

    if (received !== expected) {
      throw new Error(`[qa] kafka-e2e failed: expected ${expected} messages, got ${received}`);
    }

    console.log(`[qa] kafka-e2e PASSED: produced+consumed ${received} messages on ${topic}`);
  } finally {
    try {
      if (relay) relay.stop();
    } catch {}
    try {
      if (publisher) await publisher.close();
    } catch {}
    try {
      if (repo) await repo.close();
    } catch {}

    // drop temp db
    await withClient(adminDbUrl, async (pgAdmin) => {
      await pgAdmin.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [dbName]
      );
      await pgAdmin.query(`DROP DATABASE IF EXISTS "${dbName}"`);
    });

    try {
      await admin.deleteTopics({ topics: [topic] });
    } catch {
      // ignore
    }
    await admin.disconnect();
  }
}

main().catch((e) => {
  console.error("[qa] kafka-e2e fatal:", e);
  process.exit(1);
});

