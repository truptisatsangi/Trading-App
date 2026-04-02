import { Interface } from "ethers";
import {
  anyPositionManagerEventsAbi,
  positionManagerEventsAbi
} from "../config/abiArtifacts.js";
import { toSerializable } from "../utils/serialize.js";

const baseIface = new Interface([
  ...positionManagerEventsAbi,
  ...anyPositionManagerEventsAbi
]);

const poolCreatedEventLegacy = baseIface.getEvent("PoolCreated");
if (!poolCreatedEventLegacy) {
  throw new Error("PoolCreated event not found in flaunch contract ABIs");
}

const paramsInput = poolCreatedEventLegacy.inputs.find((input) => input.name === "_params");
if (!paramsInput || paramsInput.type !== "tuple") {
  throw new Error("PoolCreated._params tuple not found in ABI");
}

const poolCreatedEventWithFee = {
  type: "event",
  name: "PoolCreated",
  anonymous: false,
  inputs: [
    { name: "_poolId", type: "bytes32", indexed: true },
    { name: "_memecoin", type: "address", indexed: false },
    { name: "_memecoinTreasury", type: "address", indexed: false },
    { name: "_tokenId", type: "uint256", indexed: false },
    { name: "_currencyFlipped", type: "bool", indexed: false },
    // New mainnet signature includes this field before _params.
    { name: "_flaunchFee", type: "uint256", indexed: false },
    {
      name: "_params",
      type: "tuple",
      indexed: false,
      components: paramsInput.components
    }
  ]
};

const decoderIface = new Interface([poolCreatedEventLegacy, poolCreatedEventWithFee]);
const poolCreatedEventWithFeeFragment = decoderIface.fragments.find(
  (fragment) => fragment.type === "event" && fragment.name === "PoolCreated" && fragment.inputs.length === 7
);
if (!poolCreatedEventWithFeeFragment) {
  throw new Error("PoolCreated with _flaunchFee signature was not built");
}
const POOL_CREATED_TOPIC_LEGACY = poolCreatedEventLegacy.topicHash;
const POOL_CREATED_TOPIC_WITH_FEE = poolCreatedEventWithFeeFragment.topicHash;

export const POOL_CREATED_TOPICS = [POOL_CREATED_TOPIC_LEGACY, POOL_CREATED_TOPIC_WITH_FEE];
export const POOL_CREATED_TOPIC = POOL_CREATED_TOPIC_LEGACY;

function decodePoolCreated(log) {
  const topic = log.topics?.[0];
  if (topic === POOL_CREATED_TOPIC_WITH_FEE) {
    return decoderIface.decodeEventLog(poolCreatedEventWithFeeFragment, log.data, log.topics);
  }
  if (topic !== POOL_CREATED_TOPIC_LEGACY) {
    return decodePoolCreatedLoose(log);
  }
  return decoderIface.decodeEventLog(poolCreatedEventLegacy, log.data, log.topics);
}

function decodePoolCreatedLoose(log) {
  const topicPoolId = log.topics?.[1] ?? null;
  if (!topicPoolId || !log.data || log.data.length < 2 + 32 * 6 * 2) {
    throw new Error("PoolCreated loose decode failed: unexpected log shape");
  }

  const data = log.data.startsWith("0x") ? log.data.slice(2) : log.data;
  const readWord = (index) => data.slice(index * 64, (index + 1) * 64);
  const wordToAddress = (word) => `0x${word.slice(24)}`.toLowerCase();
  const wordToBigInt = (word) => BigInt(`0x${word}`);

  const memecoin = wordToAddress(readWord(0));
  const memecoinTreasury = wordToAddress(readWord(1));
  const tokenId = wordToBigInt(readWord(2));
  const currencyFlipped = wordToBigInt(readWord(3)) !== 0n;
  // Some deployments include _flaunchFee before _params; read if present.
  const flaunchFee = data.length >= 2 + 32 * 7 * 2 ? wordToBigInt(readWord(4)) : null;

  return {
    _poolId: topicPoolId,
    _memecoin: memecoin,
    _memecoinTreasury: memecoinTreasury,
    _tokenId: tokenId,
    _currencyFlipped: currencyFlipped,
    _flaunchFee: flaunchFee,
    // Keep params nullable for forward-compat when tuple layout drifts.
    _params: null
  };
}

export function parsePoolCreatedLog(log) {
  const decoded = decodePoolCreated(log);

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
      flaunchFee: decoded._flaunchFee ?? null,
      params: decoded._params
    })
  };
}
