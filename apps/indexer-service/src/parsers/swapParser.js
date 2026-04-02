import { Interface } from "ethers";
import {
  anyPositionManagerEventsAbi,
  positionManagerEventsAbi
} from "../config/abiArtifacts.js";
import { toSerializable } from "../utils/serialize.js";

const iface = new Interface([
  ...positionManagerEventsAbi,
  ...anyPositionManagerEventsAbi
]);
const swapEvent = iface.getEvent("PoolSwap");
if (!swapEvent) {
  throw new Error("PoolSwap event not found in flaunch contract ABIs");
}

export const POOL_SWAP_TOPIC = swapEvent.topicHash;

export function parseSwapLog(log) {
  const decoded = iface.decodeEventLog(
    swapEvent,
    log.data,
    log.topics
  );

  return {
    eventType: "swap",
    poolId: decoded.poolId,
    payload: toSerializable({
      poolId: decoded.poolId,
      flAmount0: decoded.flAmount0,
      flAmount1: decoded.flAmount1,
      flFee0: decoded.flFee0,
      flFee1: decoded.flFee1,
      ispAmount0: decoded.ispAmount0,
      ispAmount1: decoded.ispAmount1,
      ispFee0: decoded.ispFee0,
      ispFee1: decoded.ispFee1,
      uniAmount0: decoded.uniAmount0,
      uniAmount1: decoded.uniAmount1,
      uniFee0: decoded.uniFee0,
      uniFee1: decoded.uniFee1
    })
  };
}
