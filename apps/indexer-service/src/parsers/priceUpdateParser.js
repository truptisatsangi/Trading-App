import { Interface } from "ethers";
import {
  anyPositionManagerArtifact,
  positionManagerArtifact
} from "../config/abiArtifacts.js";
import { toSerializable } from "../utils/serialize.js";

const iface = new Interface([
  ...positionManagerArtifact.abi,
  ...anyPositionManagerArtifact.abi
]);
const poolStateUpdatedEvent = iface.getEvent("PoolStateUpdated");
if (!poolStateUpdatedEvent) {
  throw new Error("PoolStateUpdated event not found in flaunch contract ABIs");
}

export const POOL_STATE_UPDATED_TOPIC = poolStateUpdatedEvent.topicHash;

export function parsePriceUpdateLog(log) {
  const decoded = iface.decodeEventLog(
    poolStateUpdatedEvent,
    log.data,
    log.topics
  );

  return {
    eventType: "price_update",
    poolId: decoded._poolId,
    payload: toSerializable({
      poolId: decoded._poolId,
      sqrtPriceX96: decoded._sqrtPriceX96,
      tick: decoded._tick,
      protocolFee: decoded._protocolFee,
      swapFee: decoded._swapFee,
      liquidity: decoded._liquidity
    })
  };
}
