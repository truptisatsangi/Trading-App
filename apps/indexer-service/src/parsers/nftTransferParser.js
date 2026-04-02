import { Interface } from "ethers";
import {
  anyPositionManagerEventsAbi,
  flaunchEventsAbi,
  positionManagerEventsAbi
} from "../config/abiArtifacts.js";
import { toSerializable } from "../utils/serialize.js";

const iface = new Interface([
  ...positionManagerEventsAbi,
  ...anyPositionManagerEventsAbi,
  ...flaunchEventsAbi
]);
const transferEvent = iface.getEvent("Transfer");
if (!transferEvent) {
  throw new Error("Transfer event not found in NFT ABIs");
}

export const NFT_TRANSFER_TOPIC = transferEvent.topicHash;

export function parseNftTransferLog(log) {
  const decoded = iface.decodeEventLog(transferEvent, log.data, log.topics);

  return {
    eventType: "nft_transfer",
    payload: toSerializable({
      from: decoded.from?.toLowerCase?.(),
      to: decoded.to?.toLowerCase?.(),
      tokenId: decoded.id ?? decoded.tokenId
    })
  };
}
