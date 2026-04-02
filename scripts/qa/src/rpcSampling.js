import { JsonRpcProvider } from "ethers";
import { withClient } from "./db.js";
import { loadEnv } from "./loadEnv.js";

loadEnv();

const DB_URL = process.env.DB_URL;
const RPC_URL = process.env.RPC_URL;
const CHAIN_ID = Number(process.env.CHAIN_ID ?? "8453");
const SAMPLE_SIZE = Number(process.env.SAMPLE_SIZE ?? "25");

if (!DB_URL) {
  throw new Error("DB_URL is required");
}
if (!RPC_URL) {
  throw new Error("RPC_URL is required for sampling");
}

async function main() {
  const provider = new JsonRpcProvider(RPC_URL, CHAIN_ID);

  const samples = await withClient(DB_URL, async (client) => {
    const res = await client.query(
      `
      SELECT id, chain_id, block_number, tx_hash, log_index, contract_address, topic0
      FROM canonical_events
      WHERE chain_id = $1
      ORDER BY indexed_at DESC
      LIMIT $2
      `,
      [CHAIN_ID, SAMPLE_SIZE]
    );
    return res.rows;
  });

  if (!samples.length) {
    console.log("[qa] Sampling skipped: no canonical_events found");
    return;
  }

  const failures = [];
  for (const row of samples) {
    const receipt = await provider.getTransactionReceipt(row.tx_hash);
    if (!receipt) {
      failures.push({ id: row.id, reason: "missing_receipt", tx: row.tx_hash });
      continue;
    }

    const log = receipt.logs.find((l) => Number(l.index) === Number(row.log_index));
    if (!log) {
      failures.push({ id: row.id, reason: "missing_log_index", tx: row.tx_hash, log_index: row.log_index });
      continue;
    }

    const addrOk = String(log.address).toLowerCase() === String(row.contract_address).toLowerCase();
    const topicOk = String(log.topics?.[0] ?? "").toLowerCase() === String(row.topic0 ?? "").toLowerCase();

    if (!addrOk || !topicOk) {
      failures.push({
        id: row.id,
        reason: "mismatch",
        tx: row.tx_hash,
        log_index: row.log_index,
        expected: { address: row.contract_address, topic0: row.topic0 },
        actual: { address: log.address, topic0: log.topics?.[0] }
      });
    }
  }

  if (failures.length) {
    console.error(`[qa] RPC sampling FAILED: ${failures.length}/${samples.length} mismatches`);
    console.error(JSON.stringify(failures.slice(0, 5), null, 2));
    process.exit(1);
  }

  console.log(`[qa] RPC sampling PASSED: ${samples.length} canonical rows validated`);
}

main().catch((e) => {
  console.error("[qa] sampling fatal:", e);
  process.exit(1);
});

