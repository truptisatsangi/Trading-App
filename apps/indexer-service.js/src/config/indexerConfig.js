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

export const config = {
  rpcUrl: process.env.RPC_URL || "https://mainnet.base.org",
  chainId: readInt(process.env.CHAIN_ID, 8453),
  dbUrl: process.env.DB_URL || "postgres://postgres:postgres@localhost:5432/trading_platform",
  startBlock: readInt(process.env.START_BLOCK, 0),
  blockBatchSize: readInt(process.env.BLOCK_BATCH_SIZE, 500),
  confirmations: readInt(process.env.CONFIRMATIONS, 3),
  pollIntervalMs: readInt(process.env.POLL_INTERVAL_MS, 4000),
  checkpointName: process.env.CHECKPOINT_NAME || "base-indexer",
  positionManagerAddresses: configuredPmAddresses.length
    ? configuredPmAddresses
    : DEFAULT_POSITION_MANAGER_ADDRESSES.map((a) => a.toLowerCase()),
  tokenAddresses: configuredTokenAddresses.length
    ? configuredTokenAddresses
    : []
};
