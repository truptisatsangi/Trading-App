import { parseSwapLog, POOL_SWAP_TOPIC } from "../parsers/swapParser.js";
import {
  parsePriceUpdateLog,
  POOL_STATE_UPDATED_TOPIC
} from "../parsers/priceUpdateParser.js";
import { parseTransferLog, TRANSFER_TOPIC } from "../parsers/transferParser.js";
import {
  parsePoolCreatedLog,
  POOL_CREATED_TOPIC
} from "../parsers/poolCreatedParser.js";
import {
  parsePoolFeesDistributedLog,
  POOL_FEES_DISTRIBUTED_TOPIC
} from "../parsers/poolFeesDistributedParser.js";
import { parseNftTransferLog, NFT_TRANSFER_TOPIC } from "../parsers/nftTransferParser.js";
import {
  parseAnswerUpdatedLog,
  ANSWER_UPDATED_TOPIC
} from "../parsers/answerUpdatedParser.js";

const TOPIC_TO_PARSER = new Map([
  [POOL_SWAP_TOPIC, parseSwapLog],
  [POOL_STATE_UPDATED_TOPIC, parsePriceUpdateLog],
  [TRANSFER_TOPIC, parseTransferLog],
  [POOL_CREATED_TOPIC, parsePoolCreatedLog],
  [POOL_FEES_DISTRIBUTED_TOPIC, parsePoolFeesDistributedLog],
  [NFT_TRANSFER_TOPIC, parseNftTransferLog],
  [ANSWER_UPDATED_TOPIC, parseAnswerUpdatedLog]
]);

export function processLog(log) {
  const topic0 = log.topics?.[0];
  const parser = TOPIC_TO_PARSER.get(topic0);

  if (!parser) {
    return null;
  }

  try {
    return parser(log);
  } catch (error) {
    return {
      eventType: "decode_error",
      payload: {
        error: error.message
      }
    };
  }
}
