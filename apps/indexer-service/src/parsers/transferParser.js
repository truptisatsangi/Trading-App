import { Interface } from "ethers";
import { memecoinEventsAbi } from "../config/abiArtifacts.js";
import { toSerializable } from "../utils/serialize.js";

const iface = new Interface(memecoinEventsAbi);
const transferEvent = iface.getEvent("Transfer");
if (!transferEvent) {
  throw new Error("Transfer event not found in Memecoin ABI");
}
export const TRANSFER_TOPIC = transferEvent.topicHash;

export function parseTransferLog(log) {
  const decoded = iface.decodeEventLog(transferEvent, log.data, log.topics);

  return {
    eventType: "transfer",
    tokenAddress: log.address.toLowerCase(),
    payload: toSerializable({
      from: decoded.from.toLowerCase(),
      to: decoded.to.toLowerCase(),
      value: decoded.value
    })
  };
}
