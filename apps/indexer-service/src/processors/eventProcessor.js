import { parseSwapLog, POOL_SWAP_TOPIC } from "../parsers/swapParser.js";
import {
  parsePriceUpdateLog,
  POOL_STATE_UPDATED_TOPIC
} from "../parsers/priceUpdateParser.js";
import { parseTransferLog, TRANSFER_TOPIC } from "../parsers/transferParser.js";
import {
  parsePoolCreatedLog,
  POOL_CREATED_TOPICS
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
  [POOL_FEES_DISTRIBUTED_TOPIC, parsePoolFeesDistributedLog],
  [NFT_TRANSFER_TOPIC, parseNftTransferLog],
  [ANSWER_UPDATED_TOPIC, parseAnswerUpdatedLog]
]);

for (const topic of POOL_CREATED_TOPICS) {
  TOPIC_TO_PARSER.set(topic, parsePoolCreatedLog);
}

const POSITION_MANAGER_TOPIC_OVERRIDES = [
  "0xe9a023154a0e1bd430ba68aafea07b09c78a0e5406c3696fb3c0dd631fa53b64",
  "0xa245a9a38e8877add82f0a82c13e062ab3df16a26121977ddcca8827d46c690a"
];

function parseUnknownPositionManagerLog(log) {
  try {
    return parsePoolCreatedLog(log);
  } catch {}
  try {
    return parsePoolFeesDistributedLog(log);
  } catch {}
  return null;
}

for (const topic of POSITION_MANAGER_TOPIC_OVERRIDES) {
  TOPIC_TO_PARSER.set(topic, parseUnknownPositionManagerLog);
}

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
