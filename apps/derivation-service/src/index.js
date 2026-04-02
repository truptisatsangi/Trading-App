import { config } from "./config/derivationConfig.js";
import http from "node:http";
import { handlePriceUpdateEvent } from "./derivations/price/priceCalculator.js";
import { DerivedKafkaPublisher } from "./publishers/kafkaPublisher.js";
import { DerivedRedisPublisher } from "./publishers/redisPublisher.js";
import { ReadModelRepo } from "./repositories/readModelRepo.js";
import { KafkaSubscriber } from "./subscribers/kafkaSubscriber.js";
import { handlePoolCreatedEvent } from "./workers/poolCreatedWorker.js";
import { handleTradeEvent } from "./workers/tradeWorker.js";
import { handleTransferEvent } from "./workers/transferWorker.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processEvent(repo, event) {
  const evt = normalizeEvent(event);
  if (!evt.chain_id) {
    return { handled: false, change: null };
  }

  const applied = await repo.applyEventWithIdempotency(
    config.processorName,
    config.checkpointName,
    evt.chain_id,
    evt,
    async (tx) => {
      switch (evt.event_type) {
        case "pool_created":
          await handlePoolCreatedEvent(repo, tx, evt);
          break;
        case "swap":
          await handleTradeEvent(repo, tx, evt);
          break;
        case "price_update":
          await handlePriceUpdateEvent(repo, tx, evt);
          break;
        case "transfer":
          await handleTransferEvent(repo, tx, evt);
          break;
        case "nft_transfer":
          await repo.upsertNftOwnership(tx, evt);
          break;
        case "answer_updated":
          await repo.upsertEthUsdRate(tx, evt);
          break;
        case "pool_fees_distributed":
          await repo.upsertPoolFeeDistribution(tx, evt);
          break;
        default:
          break;
      }
    }
  );

  return {
    handled: applied,
    change: {
      key: `${evt.event_type}:${evt.chain_id}:${evt.tx_hash ?? "na"}:${evt.log_index ?? "na"}`,
      type: evt.event_type,
      chainId: evt.chain_id,
      poolId: evt.pool_id ?? null,
      tokenAddress: evt.token_address ?? null,
      eventId: evt.id ?? null,
      txHash: evt.tx_hash ?? null
    }
  };
}

function normalizeEvent(event) {
  if (event.chain_id != null) {
    return event;
  }

  return {
    id: event.id ?? null,
    chain_id: event.chainId,
    block_number: event.blockNumber ?? null,
    tx_hash: event.txHash ?? null,
    log_index: event.logIndex ?? null,
    contract_address: event.contractAddress ?? null,
    event_type: event.eventType,
    pool_id: event.poolId ?? null,
    token_address: event.tokenAddress ?? null,
    payload: event.payload ?? {}
  };
}

async function runPollMode(repo, publishChange) {
  let checkpointId = Number(
    (await repo.getCheckpoint(config.checkpointName, config.chainId)) ?? 0
  );

  console.log(`[derivation] polling mode from canonical event id ${checkpointId}`);

  while (true) {
    const events = await repo.getCanonicalEventsAfterId(
      config.chainId,
      checkpointId,
      config.eventBatchSize
    );

    if (!events.length) {
      await sleep(config.pollIntervalMs);
      continue;
    }

    let processed = 0;
    for (const event of events) {
      const result = await processEvent(repo, event);
      checkpointId = Number(event.id);
      if (result.handled) {
        processed += 1;
        await publishChange(result.change);
      }
    }

    console.log(
      `[derivation] poll processed=${processed} checkpoint_event_id=${checkpointId}`
    );
  }
}

async function runKafkaMode(repo, publishChange) {
  console.log("[derivation] kafka-primary mode enabled");
  const subscriber = new KafkaSubscriber(config, async (messageEvent) => {
    const result = await processEvent(repo, messageEvent);
    if (result.handled) {
      await publishChange(result.change);
    }
  });
  await subscriber.start();
}

async function run() {
  const stats = {
    mode: config.useKafkaPrimary ? "kafka" : "poll",
    handled: 0,
    lastEventType: null,
    lastHandledAt: null
  };

  if (config.healthPort > 0) {
    http
      .createServer((req, res) => {
        if (req.url === "/health") {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              status: "ok",
              service: "derivation-service",
              stats
            })
          );
          return;
        }
        res.writeHead(404);
        res.end();
      })
      .listen(config.healthPort, () => {
        console.log(`[derivation] health endpoint on :${config.healthPort}`);
      });
  }

  const repo = new ReadModelRepo(config.dbUrl);
  await repo.init();

  const kafkaPublisher = new DerivedKafkaPublisher(config);
  const redisPublisher = new DerivedRedisPublisher(config);
  await kafkaPublisher.init();
  await redisPublisher.init();

  const publishChange = async (change) => {
    if (!change) {
      return;
    }
    stats.handled += 1;
    stats.lastEventType = change.type;
    stats.lastHandledAt = new Date().toISOString();
    await kafkaPublisher.publish(change);
    await redisPublisher.publish(change);
  };

  if (config.useKafkaPrimary) {
    await runKafkaMode(repo, publishChange);
  } else {
    await runPollMode(repo, publishChange);
  }
}

run().catch((error) => {
  console.error("[derivation] fatal:", error);
  process.exit(1);
});
