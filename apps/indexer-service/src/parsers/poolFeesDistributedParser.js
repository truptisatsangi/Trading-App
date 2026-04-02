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

const eventFragment = iface.getEvent("PoolFeesDistributed");
if (!eventFragment) {
  throw new Error("PoolFeesDistributed event not found in flaunch contract ABIs");
}

export const POOL_FEES_DISTRIBUTED_TOPIC = eventFragment.topicHash;

export function parsePoolFeesDistributedLog(log) {
  const decoded = iface.decodeEventLog(eventFragment, log.data, log.topics);

  return {
    eventType: "pool_fees_distributed",
    poolId: decoded._poolId,
    payload: toSerializable({
      poolId: decoded._poolId,
      donateAmount: decoded._donateAmount,
      creatorAmount: decoded._creatorAmount,
      bidWallAmount: decoded._bidWallAmount,
      governanceAmount: decoded._governanceAmount,
      protocolAmount: decoded._protocolAmount
    })
  };
}
