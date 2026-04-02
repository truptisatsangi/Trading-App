import { Interface, id } from "ethers";
import { toSerializable } from "../utils/serialize.js";

const ANSWER_UPDATED_ABI = [
  "event AnswerUpdated(int256 indexed current, uint256 indexed roundId, uint256 updatedAt)"
];
const iface = new Interface(ANSWER_UPDATED_ABI);
const eventFragment = iface.getEvent("AnswerUpdated");
if (!eventFragment) {
  throw new Error("AnswerUpdated event not found in Chainlink ABI");
}

export const ANSWER_UPDATED_TOPIC =
  eventFragment.topicHash ??
  id("AnswerUpdated(int256,uint256,uint256)");

export function parseAnswerUpdatedLog(log) {
  const decoded = iface.decodeEventLog(eventFragment, log.data, log.topics);

  return {
    eventType: "answer_updated",
    payload: toSerializable({
      current: decoded.current,
      roundId: decoded.roundId,
      updatedAt: decoded.updatedAt
    })
  };
}
