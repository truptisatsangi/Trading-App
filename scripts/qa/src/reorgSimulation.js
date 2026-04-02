import crypto from "node:crypto";
import { EventRepository } from "../../../apps/indexer-service/src/repositories/eventRepo.js";
import { withClient, buildDbUrlLike } from "./db.js";
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
  const dbName = `qa_reorg_${suffix()}`;
  const tempUrl = buildDbUrlLike(DB_URL, dbName);

  await withClient(adminUrl, async (admin) => {
    await admin.query(`CREATE DATABASE "${dbName}"`);
    try {
      const repo = new EventRepository(tempUrl);
      await repo.init();

      // seed canonical events across blocks 100..105
      for (let b = 100; b <= 105; b++) {
        await repo.insertCanonicalEventWithOutbox(
          {
            chainId: CHAIN_ID,
            blockNumber: b,
            blockHash: `0xhash${b}`,
            parentHash: `0xhash${b - 1}`,
            blockTimestamp: new Date().toISOString(),
            txHash: "0x" + String(b).padStart(64, "0"),
            logIndex: 0,
            contractAddress: "0x" + "22".repeat(20),
            topic0: "0x" + "33".repeat(32),
            eventType: "swap",
            poolId: "0x" + "44".repeat(32),
            tokenAddress: null,
            payload: { n: b }
          },
          "canonical.events.v1"
        );
      }

      // checkpoint at 105
      await repo.upsertCheckpoint("qa-indexer", CHAIN_ID, 105);

      // rollback from 103 inclusive (simulate reorg window rollback)
      await repo.rollbackFromBlock(CHAIN_ID, 103, "qa-indexer");

      const remaining = await repo.client.query(
        `SELECT MIN(block_number)::bigint AS minb, MAX(block_number)::bigint AS maxb, COUNT(*)::bigint AS c
         FROM canonical_events WHERE chain_id=$1`,
        [CHAIN_ID]
      );
      const minb = Number(remaining.rows[0].minb);
      const maxb = Number(remaining.rows[0].maxb);
      const c = Number(remaining.rows[0].c);
      if (!(minb === 100 && maxb === 102 && c === 3)) {
        throw new Error(`Rollback failed: expected blocks 100..102 (3 rows), got min=${minb} max=${maxb} count=${c}`);
      }

      const outbox = await repo.client.query(
        `SELECT COUNT(*)::bigint AS c FROM canonical_event_outbox`,
        []
      );
      // Outbox rows for rolled back canonical rows should be cascaded.
      if (Number(outbox.rows[0].c) !== 3) {
        throw new Error(`Outbox cascade failed: expected 3 rows remaining, got ${outbox.rows[0].c}`);
      }

      const cp = await repo.getCheckpoint("qa-indexer", CHAIN_ID);
      if (Number(cp) !== 102) {
        throw new Error(`Checkpoint rollback failed: expected 102, got ${cp}`);
      }

      await repo.close();
      console.log("[qa] Reorg rollback simulation PASSED");
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
  console.error("[qa] reorg simulation fatal:", e);
  process.exit(1);
});

