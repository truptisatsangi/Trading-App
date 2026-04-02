import dotenv from "dotenv";

dotenv.config();

const DEFAULT_POSITION_MANAGER_ADDRESSES = [
  "0x51Bba15255406Cfe7099a42183302640ba7dAFDC",
  "0xf785bb58059fab6fb19bdda2cb9078d9e546efdc",
  "0xb903b0ab7bcee8f5e4d8c9b10a71aac7135d6fdc",
  "0x23321f11a6d44fd1ab790044fdfde5758c902fdc",
  "0x2ad43d0618b1d8a0cc75cf716cf0bf64070725dc",
  "0x8dc3b85e1dc1c846ebf3971179a751896842e5dc"
];
const DEFAULT_FLAUNCH_NFT_ADDRESSES = [
  "0x6A53F8b799bE11a2A3264eF0bfF183dCB12d9571",
  "0xb4512bf57d50fbcb64a3adf8b17a79b2a204c18c",
  "0x0cf6bdf0a85a9d6763361037985b76c8893553af",
  "0x516af52d0c629b5e378da4dc64ecb0744ce10109",
  "0xf175a370eb26ea26c42caaecd10ee723ed844c50",
  "0xc5b2e8f197407263f4b62a35c71bfc394ecf95d5"
];
const DEFAULT_CHAINLINK_AGGREGATOR_ADDRESSES = [
  "0x57d2d46Fc7ff2A7142d479F2f59e1E3F95447077"
];

function parseAddresses(value) {
  return (value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .map((addr) => addr.toLowerCase());
}

function readInt(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const configuredPmAddresses = parseAddresses(process.env.POSITION_MANAGER_ADDRESSES);
const configuredTokenAddresses = parseAddresses(process.env.TOKEN_ADDRESSES);
const configuredNftAddresses = parseAddresses(process.env.FLAUNCH_NFT_ADDRESSES);
const configuredAggregatorAddresses = parseAddresses(
  process.env.CHAINLINK_AGGREGATOR_ADDRESSES
);
const configuredRpcUrls = (process.env.RPC_URLS || "")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);
const configuredKafkaBrokers = (process.env.KAFKA_BROKERS || "")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);

function readBool(value, fallback) {
  if (value == null) {
    return fallback;
  }
  return String(value).toLowerCase() === "true";
}

export const config = {
  rpcUrl: process.env.RPC_URL || "https://mainnet.base.org",
  rpcUrls: configuredRpcUrls.length ? configuredRpcUrls : [],
  chainId: readInt(process.env.CHAIN_ID, 8453),
  dbUrl: process.env.DB_URL || "postgres://postgres:postgres@localhost:5432/trading_platform",
  startBlock: readInt(process.env.START_BLOCK, 0),
  blockBatchSize: readInt(process.env.BLOCK_BATCH_SIZE, 500),
  logRangeLimit: readInt(process.env.LOG_RANGE_LIMIT, 10),
  reorgReplayWindow: readInt(process.env.REORG_REPLAY_WINDOW, 30),
  confirmations: readInt(process.env.CONFIRMATIONS, 3),
  pollIntervalMs: readInt(process.env.POLL_INTERVAL_MS, 4000),
  checkpointName: process.env.CHECKPOINT_NAME || "base-indexer",
  enableKafka: readBool(process.env.ENABLE_KAFKA, configuredKafkaBrokers.length > 0),
  kafkaClientId: process.env.KAFKA_CLIENT_ID || "indexer-service",
  kafkaBrokers: configuredKafkaBrokers,
  kafkaCanonicalTopic: process.env.KAFKA_CANONICAL_TOPIC || "canonical.events.v1",
  kafkaOutboxPollMs: readInt(process.env.KAFKA_OUTBOX_POLL_MS, 1000),
  kafkaOutboxBatchSize: readInt(process.env.KAFKA_OUTBOX_BATCH_SIZE, 200),
  healthPort: readInt(process.env.HEALTH_PORT, 0),
  positionManagerAddresses: configuredPmAddresses.length
    ? configuredPmAddresses
    : DEFAULT_POSITION_MANAGER_ADDRESSES.map((a) => a.toLowerCase()),
  flaunchNftAddresses: configuredNftAddresses.length
    ? configuredNftAddresses
    : DEFAULT_FLAUNCH_NFT_ADDRESSES.map((a) => a.toLowerCase()),
  chainlinkAggregatorAddresses: configuredAggregatorAddresses.length
    ? configuredAggregatorAddresses
    : DEFAULT_CHAINLINK_AGGREGATOR_ADDRESSES.map((a) => a.toLowerCase()),
  tokenAddresses: configuredTokenAddresses.length
    ? configuredTokenAddresses
    : []
};
