import { parseSwapLog, POOL_SWAP_TOPIC } from "../parsers/swapParser.js";
import {
  parsePriceUpdateLog,
  POOL_STATE_UPDATED_TOPIC
} from "../parsers/priceUpdateParser.js";
import { parseTransferLog, TRANSFER_TOPIC } from "../parsers/transferParser.js";

const TOPIC_TO_PARSER = new Map([
  [POOL_SWAP_TOPIC, parseSwapLog],
  [POOL_STATE_UPDATED_TOPIC, parsePriceUpdateLog],
  [TRANSFER_TOPIC, parseTransferLog]
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
