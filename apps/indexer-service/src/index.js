import { JsonRpcProvider } from "ethers";
import http from "node:http";
import { config } from "./config/indexerConfig.js";
import { BlockTracker } from "./listeners/blockTracker.js";
import { LogFetcher } from "./listeners/logFetcher.js";
import { processLog } from "./processors/eventProcessor.js";
import { EventRepository } from "./repositories/eventRepo.js";
import { KafkaPublisher } from "./publishers/kafkaPublisher.js";
import { OutboxRelay } from "./publishers/outboxRelay.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientRpcError(error) {
  const code = String(error?.code ?? "");
  const message = `${error?.message ?? ""} ${error?.shortMessage ?? ""}`.toLowerCase();

  if (
    ["EHOSTUNREACH", "ECONNRESET", "ENOTFOUND", "ETIMEDOUT", "ECONNREFUSED"].includes(code)
  ) {
    return true;
  }

  return (
    message.includes("temporary internal error") ||
    message.includes("could not coalesce error") ||
    message.includes("timeout") ||
    message.includes("network") ||
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("ehostunreach")
  );
}

async function withTransientRetry(label, action) {
  let attempt = 0;

  while (true) {
    try {
      return await action();
    } catch (error) {
      if (!isTransientRpcError(error)) {
        throw error;
      }

      attempt += 1;
      const waitMs = Math.min(1000 * 2 ** (attempt - 1), 30000);
      console.warn(
        `[indexer] transient error during ${label} (attempt ${attempt}): ${error.message}. Retrying in ${waitMs}ms`
      );
      await sleep(waitMs);
    }
  }
}

class ProviderPool {
  constructor(rpcUrls, chainId) {
    const uniqueUrls = Array.from(new Set(rpcUrls.filter(Boolean)));
    this.providers = uniqueUrls.map((url) => new JsonRpcProvider(url, chainId));
    this.index = 0;
  }

  current() {
    return this.providers[this.index];
  }

  rotate() {
    if (this.providers.length > 1) {
      this.index = (this.index + 1) % this.providers.length;
      console.warn(`[indexer] switched provider to index ${this.index}`);
    }
  }

  async getBlockNumber() {
    try {
      return await this.current().getBlockNumber();
    } catch (error) {
      this.rotate();
      throw error;
    }
  }

  async getLogs(filter) {
    try {
      return await this.current().getLogs(filter);
    } catch (error) {
      this.rotate();
      throw error;
    }
  }

  async getBlock(blockNumber) {
    try {
      return await this.current().getBlock(blockNumber);
    } catch (error) {
      this.rotate();
      throw error;
    }
  }
}

async function run() {
  const stats = {
    lastRangeFrom: null,
    lastRangeTo: null,
    lastInserted: 0,
    lastSkipped: 0,
    lastLoopAt: null
  };

  if (config.healthPort > 0) {
    http
      .createServer((req, res) => {
        if (req.url === "/health") {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              status: "ok",
              service: "indexer-service",
              stats
            })
          );
          return;
        }
        res.writeHead(404);
        res.end();
      })
      .listen(config.healthPort, () => {
        console.log(`[indexer] health endpoint on :${config.healthPort}`);
      });
  }

  const pool = new ProviderPool(
    [config.rpcUrl, ...config.rpcUrls],
    config.chainId
  );
  const repository = new EventRepository(config.dbUrl);
  await repository.init();

  const blockTracker = new BlockTracker(config, repository, pool);
  const logFetcher = new LogFetcher(pool, config);

  let relay = null;
  let kafkaPublisher = null;
  if (config.enableKafka) {
    kafkaPublisher = new KafkaPublisher(config);
    await kafkaPublisher.init();
    relay = new OutboxRelay(config, repository, kafkaPublisher);
    relay.start();
    console.log("[indexer] kafka outbox relay started");
  }

  let checkpointBlock = await blockTracker.getStartBlock();

  console.log(`[indexer] starting from block ${checkpointBlock}`);

  while (true) {
    const head = await withTransientRetry("getFinalizedHead", () =>
      blockTracker.getFinalizedHead()
    );

    // Reorg detection + rollback:
    // If we have stored events for recent blocks, compare stored block_hash vs provider block hash.
    // On mismatch, rollback last N blocks and re-index.
    if (checkpointBlock > 0 && config.reorgReplayWindow > 0) {
      const probeBlock = Math.max(0, checkpointBlock);
      const storedHash = await repository.getStoredBlockHash(config.chainId, probeBlock);
      if (storedHash) {
        const onchain = await withTransientRetry(`getBlock ${probeBlock}`, () =>
          pool.getBlock(probeBlock)
        );
        const onchainHash = onchain?.hash ?? null;
        if (onchainHash && storedHash !== onchainHash) {
          const rollbackFrom = Math.max(0, checkpointBlock - config.reorgReplayWindow + 1);
          console.warn(
            `[indexer] reorg detected at block ${probeBlock}. Rolling back from block ${rollbackFrom} (window=${config.reorgReplayWindow})`
          );
          await repository.rollbackFromBlock(
            config.chainId,
            rollbackFrom,
            config.checkpointName
          );
          checkpointBlock = rollbackFrom - 1;
          continue;
        }
      }
    }

    if (checkpointBlock >= head) {
      await sleep(config.pollIntervalMs);
      continue;
    }

    const fromBlock = checkpointBlock + 1;
    const toBlock = Math.min(head, checkpointBlock + config.blockBatchSize);
    const rawLogs = await withTransientRetry(
      `fetchLogs ${fromBlock}-${toBlock}`,
      () => logFetcher.fetchLogs(fromBlock, toBlock)
    );

    const blockMetaByNumber = new Map();

    const uniqueBlockNumbers = Array.from(
      new Set(rawLogs.map((log) => Number(log.blockNumber)))
    );
    for (const blockNumber of uniqueBlockNumbers) {
      const block = await withTransientRetry(`getBlock ${blockNumber}`, () =>
        pool.getBlock(blockNumber)
      );
      blockMetaByNumber.set(blockNumber, block);
    }

    // Build the full batch of parsed events, skipping decode errors up front.
    const eventBatch = [];
    let skipped = 0;

    for (const log of rawLogs) {
      const parsed = processLog(log);
      if (!parsed || parsed.eventType === "decode_error") {
        skipped += 1;
        continue;
      }

      const blockMeta = blockMetaByNumber.get(Number(log.blockNumber));
      eventBatch.push({
        chainId: config.chainId,
        blockNumber: Number(log.blockNumber),
        blockHash: log.blockHash,
        parentHash: blockMeta?.parentHash ?? null,
        blockTimestamp: blockMeta?.timestamp
          ? new Date(Number(blockMeta.timestamp) * 1000).toISOString()
          : null,
        txHash: log.transactionHash,
        logIndex: Number(log.index ?? log.logIndex),
        contractAddress: log.address.toLowerCase(),
        topic0: log.topics[0],
        eventType: parsed.eventType,
        poolId: parsed.poolId,
        tokenAddress: parsed.tokenAddress,
        payload: parsed.payload
      });
    }

    let inserted = 0;
    const outboxTopic = config.enableKafka ? config.kafkaCanonicalTopic : null;
    for (let i = 0; i < eventBatch.length; i += config.insertBatchSize) {
      const chunk = eventBatch.slice(i, i + config.insertBatchSize);
      const result = await repository.insertCanonicalEventsBatch(chunk, outboxTopic);
      inserted += result.inserted;
    }
    skipped += eventBatch.length - inserted;

    await blockTracker.saveCheckpoint(toBlock);
    checkpointBlock = toBlock;
    stats.lastRangeFrom = fromBlock;
    stats.lastRangeTo = toBlock;
    stats.lastInserted = inserted;
    stats.lastSkipped = skipped;
    stats.lastLoopAt = new Date().toISOString();

    console.log(
      `[indexer] blocks ${fromBlock}-${toBlock}: logs=${rawLogs.length} inserted=${inserted} skipped=${skipped}`
    );
  }
}

run().catch((error) => {
  console.error("[indexer] fatal:", error);
  process.exit(1);
});
