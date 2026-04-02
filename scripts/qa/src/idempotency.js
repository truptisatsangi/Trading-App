import { withClient, buildDbUrlLike } from "./db.js";
import crypto from "node:crypto";
import { EventRepository } from "../../../apps/indexer-service/src/repositories/eventRepo.js";
import { ReadModelRepo } from "../../../apps/derivation-service/src/repositories/readModelRepo.js";
import { runDerivationOnce } from "./derivationRunner.js";
import { computeTableChecksums } from "./checksums.js";
import { loadEnv } from "./loadEnv.js";

loadEnv();

const DB_URL = process.env.DB_URL;
const CHAIN_ID = Number(process.env.CHAIN_ID ?? "8453");

if (!DB_URL) throw new Error("DB_URL is required");

function suffix() {
  return crypto.randomBytes(4).toString("hex");
}

async function main() {
  const adminUrl = buildDbUrlLike(DB_URL, "postgres");
  const dbName = `qa_idempotency_${suffix()}`;
  const tempUrl = buildDbUrlLike(DB_URL, dbName);

  await withClient(adminUrl, async (admin) => {
    await admin.query(`CREATE DATABASE "${dbName}"`);
    try {
      // Initialize schemas via repos
      const er = new EventRepository(tempUrl);
      await er.init();
      const rr = new ReadModelRepo(tempUrl);
      await rr.init();
      await rr.close();

      // Canonical idempotency: insert same event twice -> 1 row
      const event = {
        chainId: CHAIN_ID,
        blockNumber: 123,
        blockHash: "0xabc",
        parentHash: "0xdef",
        blockTimestamp: new Date().toISOString(),
        txHash: "0x" + "11".repeat(32),
        logIndex: 7,
        contractAddress: "0x" + "22".repeat(20),
        topic0: "0x" + "33".repeat(32),
        eventType: "swap",
        poolId: "0x" + "44".repeat(32),
        tokenAddress: null,
        payload: { flAmount0: "1", flAmount1: "2" }
      };
      await er.insertCanonicalEventWithOutbox(event, null);
      await er.insertCanonicalEventWithOutbox(event, null);

      const canonicalCount = await er.client.query(
        `SELECT COUNT(*)::bigint AS c FROM canonical_events WHERE chain_id=$1 AND tx_hash=$2 AND log_index=$3`,
        [CHAIN_ID, event.txHash, event.logIndex]
      );
      if (Number(canonicalCount.rows[0].c) !== 1) {
        throw new Error("Canonical idempotency failed: expected 1 row");
      }
      await er.close();

      // Derivation idempotency: run derivation twice -> stable checksums (ignoring timestamps)
      await runDerivationOnce({ dbUrl: tempUrl, chainId: CHAIN_ID, checkpointName: "qa", processorName: "qa" });
      const first = await withClient(tempUrl, (c) => computeTableChecksums(c));
      await runDerivationOnce({ dbUrl: tempUrl, chainId: CHAIN_ID, checkpointName: "qa2", processorName: "qa" });
      const second = await withClient(tempUrl, (c) => computeTableChecksums(c));

      const diffs = [];
      for (const [t, a] of Object.entries(first)) {
        const b = second[t];
        if (a.checksum !== b.checksum || a.rowCount !== b.rowCount) diffs.push(t);
      }
      if (diffs.length) {
        throw new Error(`Derivation idempotency failed: checksum diffs in ${diffs.join(", ")}`);
      }

      console.log("[qa] Idempotency PASSED (canonical + derivation)");
    } finally {
      await admin.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [dbName]
      );
      await admin.query(`DROP DATABASE IF EXISTS "${dbName}"`);
    }
  });
}

main().catch((e) => {
  console.error("[qa] idempotency fatal:", e);
  process.exit(1);
});

