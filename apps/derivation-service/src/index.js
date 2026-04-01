import { config } from "./config/derivationConfig.js";
import { handlePriceUpdateEvent } from "./derivations/price/priceCalculator.js";
import { ReadModelRepo } from "./repositories/readModelRepo.js";
import { handleTradeEvent } from "./workers/tradeWorker.js";
import { handleTransferEvent } from "./workers/transferWorker.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processEvent(repo, event) {
  switch (event.event_type) {
    case "swap":
      await handleTradeEvent(repo, event);
      break;
    case "price_update":
      await handlePriceUpdateEvent(repo, event);
      break;
    case "transfer":
      await handleTransferEvent(repo, event);
      break;
    default:
      break;
  }
}

async function run() {
  const repo = new ReadModelRepo(config.dbUrl);
  await repo.init();

  let checkpointId = Number(
    (await repo.getCheckpoint(config.checkpointName, config.chainId)) ?? 0
  );

  console.log(`[derivation] starting from canonical event id ${checkpointId}`);

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
      await processEvent(repo, event);
      checkpointId = Number(event.id);
      processed += 1;
    }

    await repo.upsertCheckpoint(config.checkpointName, config.chainId, checkpointId);
    console.log(
      `[derivation] processed=${processed} checkpoint_event_id=${checkpointId}`
    );
  }
}

run().catch((error) => {
  console.error("[derivation] fatal:", error);
  process.exit(1);
});
