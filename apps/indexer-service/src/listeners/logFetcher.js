import {
  POOL_STATE_UPDATED_TOPIC
} from "../parsers/priceUpdateParser.js";
import { POOL_SWAP_TOPIC } from "../parsers/swapParser.js";
import { TRANSFER_TOPIC } from "../parsers/transferParser.js";
import { POOL_CREATED_TOPICS } from "../parsers/poolCreatedParser.js";
import { POOL_FEES_DISTRIBUTED_TOPIC } from "../parsers/poolFeesDistributedParser.js";
import { NFT_TRANSFER_TOPIC } from "../parsers/nftTransferParser.js";
import { ANSWER_UPDATED_TOPIC } from "../parsers/answerUpdatedParser.js";

// Observed onchain PositionManager topics that vary by deployment/ABI version.
const POSITION_MANAGER_TOPIC_OVERRIDES = [
  "0xe9a023154a0e1bd430ba68aafea07b09c78a0e5406c3696fb3c0dd631fa53b64",
  "0xa245a9a38e8877add82f0a82c13e062ab3df16a26121977ddcca8827d46c690a"
];

export class LogFetcher {
  constructor(provider, config) {
    this.provider = provider;
    this.config = config;
  }

  async fetchLogs(fromBlock, toBlock) {
    const ranges = this.chunkRanges(fromBlock, toBlock, this.config.logRangeLimit);
    const allLogs = [];

    for (const range of ranges) {
      const [pmLogs, transferLogs, nftTransferLogs, oracleLogs] = await Promise.all([
        this.provider.getLogs({
          fromBlock: range.from,
          toBlock: range.to,
          address: this.config.positionManagerAddresses,
          topics: [
            [
              POOL_SWAP_TOPIC,
              POOL_STATE_UPDATED_TOPIC,
              ...POOL_CREATED_TOPICS,
              POOL_FEES_DISTRIBUTED_TOPIC,
              ...POSITION_MANAGER_TOPIC_OVERRIDES
            ]
          ]
        }),
        this.fetchTransferLogs(range.from, range.to),
        this.fetchNftTransferLogs(range.from, range.to),
        this.fetchOracleLogs(range.from, range.to)
      ]);

      allLogs.push(...pmLogs, ...transferLogs, ...nftTransferLogs, ...oracleLogs);
    }

    allLogs.sort((a, b) => {
      if (a.blockNumber === b.blockNumber) {
        return Number(a.index) - Number(b.index);
      }
      return Number(a.blockNumber) - Number(b.blockNumber);
    });
    return allLogs;
  }

  chunkRanges(fromBlock, toBlock, maxRange) {
    const out = [];
    let start = Number(fromBlock);
    const end = Number(toBlock);
    const step = Math.max(1, Number(maxRange));

    while (start <= end) {
      const stop = Math.min(end, start + step - 1);
      out.push({ from: start, to: stop });
      start = stop + 1;
    }

    return out;
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

  async fetchNftTransferLogs(fromBlock, toBlock) {
    if (!this.config.flaunchNftAddresses.length) {
      return [];
    }

    return this.provider.getLogs({
      fromBlock,
      toBlock,
      address: this.config.flaunchNftAddresses,
      topics: [[NFT_TRANSFER_TOPIC]]
    });
  }

  async fetchOracleLogs(fromBlock, toBlock) {
    if (!this.config.chainlinkAggregatorAddresses.length) {
      return [];
    }

    return this.provider.getLogs({
      fromBlock,
      toBlock,
      address: this.config.chainlinkAggregatorAddresses,
      topics: [[ANSWER_UPDATED_TOPIC]]
    });
  }
}
