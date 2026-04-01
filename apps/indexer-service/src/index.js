import { JsonRpcProvider } from "ethers";
import { config } from "./config/indexerConfig.js";
import { BlockTracker } from "./listeners/blockTracker.js";
import { LogFetcher } from "./listeners/logFetcher.js";
import { processLog } from "./processors/eventProcessor.js";
import { EventRepository } from "./repositories/eventRepo.js";

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

async function run() {
  const provider = new JsonRpcProvider(config.rpcUrl, config.chainId);
  const repository = new EventRepository(config.dbUrl);
  await repository.init();

  const blockTracker = new BlockTracker(config, repository, provider);
  const logFetcher = new LogFetcher(provider, config);

  let checkpointBlock = await blockTracker.getStartBlock();

  console.log(`[indexer] starting from block ${checkpointBlock}`);

  while (true) {
    const head = await withTransientRetry("getFinalizedHead", () =>
      blockTracker.getFinalizedHead()
    );
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

    let inserted = 0;
    let skipped = 0;

    for (const log of rawLogs) {
      const parsed = processLog(log);
      if (!parsed || parsed.eventType === "decode_error") {
        skipped += 1;
        continue;
      }

      const didInsert = await repository.insertCanonicalEvent({
        chainId: config.chainId,
        blockNumber: Number(log.blockNumber),
        blockHash: log.blockHash,
        txHash: log.transactionHash,
        logIndex: Number(log.index ?? log.logIndex),
        contractAddress: log.address.toLowerCase(),
        topic0: log.topics[0],
        eventType: parsed.eventType,
        poolId: parsed.poolId,
        tokenAddress: parsed.tokenAddress,
        payload: parsed.payload
      });

      if (didInsert) {
        inserted += 1;
      } else {
        skipped += 1;
      }
    }

    await blockTracker.saveCheckpoint(toBlock);
    checkpointBlock = toBlock;

    console.log(
      `[indexer] blocks ${fromBlock}-${toBlock}: logs=${rawLogs.length} inserted=${inserted} skipped=${skipped}`
    );
  }
}

run().catch((error) => {
  console.error("[indexer] fatal:", error);
  process.exit(1);
});
