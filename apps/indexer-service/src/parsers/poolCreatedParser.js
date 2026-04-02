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

const poolCreatedEvent = iface.getEvent("PoolCreated");
if (!poolCreatedEvent) {
  throw new Error("PoolCreated event not found in flaunch contract ABIs");
}

export const POOL_CREATED_TOPIC = poolCreatedEvent.topicHash;

export function parsePoolCreatedLog(log) {
  const decoded = iface.decodeEventLog(poolCreatedEvent, log.data, log.topics);

  return {
    eventType: "pool_created",
    poolId: decoded._poolId,
    tokenAddress: decoded._memecoin?.toLowerCase?.() ?? null,
    payload: toSerializable({
      poolId: decoded._poolId,
      memecoin: decoded._memecoin,
      memecoinTreasury: decoded._memecoinTreasury,
      tokenId: decoded._tokenId,
      currencyFlipped: decoded._currencyFlipped,
      params: decoded._params
    })
  };
}
