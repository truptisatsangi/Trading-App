import {
  POOL_STATE_UPDATED_TOPIC
} from "../parsers/priceUpdateParser.js";
import { POOL_SWAP_TOPIC } from "../parsers/swapParser.js";
import { TRANSFER_TOPIC } from "../parsers/transferParser.js";

export class LogFetcher {
  constructor(provider, config) {
    this.provider = provider;
    this.config = config;
  }

  async fetchLogs(fromBlock, toBlock) {
    const [swapAndPriceLogs, transferLogs] = await Promise.all([
      this.provider.getLogs({
        fromBlock,
        toBlock,
        address: this.config.positionManagerAddresses,
        topics: [[POOL_SWAP_TOPIC, POOL_STATE_UPDATED_TOPIC]]
      }),
      this.fetchTransferLogs(fromBlock, toBlock)
    ]);

    const allLogs = [...swapAndPriceLogs, ...transferLogs];
    allLogs.sort((a, b) => {
      if (a.blockNumber === b.blockNumber) {
        return Number(a.index) - Number(b.index);
      }
      return Number(a.blockNumber) - Number(b.blockNumber);
    });
    return allLogs;
  }

  async fetchTransferLogs(fromBlock, toBlock) {
    if (!this.config.tokenAddresses.length) {
      return [];
    }

    return this.provider.getLogs({
      fromBlock,
      toBlock,
      address: this.config.tokenAddresses,
      topics: [[TRANSFER_TOPIC]]
    });
  }
}
