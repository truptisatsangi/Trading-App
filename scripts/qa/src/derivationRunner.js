import { ReadModelRepo } from "../../../apps/derivation-service/src/repositories/readModelRepo.js";
import { handlePriceUpdateEvent } from "../../../apps/derivation-service/src/derivations/price/priceCalculator.js";
import { handleTradeEvent } from "../../../apps/derivation-service/src/workers/tradeWorker.js";
import { handleTransferEvent } from "../../../apps/derivation-service/src/workers/transferWorker.js";
import { handlePoolCreatedEvent } from "../../../apps/derivation-service/src/workers/poolCreatedWorker.js";

export async function runDerivationOnce({
  dbUrl,
  chainId,
  checkpointName = "qa-derivation",
  processorName = "qa-harness",
  batchSize = 500
}) {
  const repo = new ReadModelRepo(dbUrl);
  await repo.init();

  let checkpointId = Number((await repo.getCheckpoint(checkpointName, chainId)) ?? 0);

  while (true) {
    const events = await repo.getCanonicalEventsAfterId(chainId, checkpointId, batchSize);
    if (!events.length) {
      break;
    }

    for (const event of events) {
      await applyEvent(repo, {
        processorName,
        checkpointName,
        chainId,
        event
      });
      checkpointId = Number(event.id);
    }
  }

  await repo.close();
}

async function applyEvent(repo, { processorName, checkpointName, chainId, event }) {
  await repo.applyEventWithIdempotency(processorName, checkpointName, chainId, event, async (tx) => {
    switch (event.event_type) {
      case "pool_created":
        await handlePoolCreatedEvent(repo, tx, event);
        break;
      case "swap":
        await handleTradeEvent(repo, tx, event);
        break;
      case "price_update":
        await handlePriceUpdateEvent(repo, tx, event);
        break;
      case "transfer":
        await handleTransferEvent(repo, tx, event);
        break;
      case "nft_transfer":
        await repo.upsertNftOwnership(tx, event);
        break;
      case "answer_updated":
        await repo.upsertEthUsdRate(tx, event);
        break;
      case "pool_fees_distributed":
        await repo.upsertPoolFeeDistribution(tx, event);
        break;
      default:
        break;
    }
  });
}

