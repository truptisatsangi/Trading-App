import crypto from "node:crypto";
import { withClient, buildDbUrlLike } from "./db.js";
import { runDerivationOnce } from "./derivationRunner.js";
import { computeTableChecksums } from "./checksums.js";
import { loadEnv } from "./loadEnv.js";

loadEnv();

const SOURCE_DB_URL = process.env.DB_URL;
const CHAIN_ID = Number(process.env.CHAIN_ID ?? "8453");
const FROM_ID = Number(process.env.REPLAY_FROM_ID ?? "1");
const TO_ID = Number(process.env.REPLAY_TO_ID ?? "2000");

if (!SOURCE_DB_URL) {
  throw new Error("DB_URL is required");
}
if (!Number.isFinite(FROM_ID) || !Number.isFinite(TO_ID) || FROM_ID > TO_ID) {
  throw new Error("Invalid REPLAY_FROM_ID/REPLAY_TO_ID");
}

function randomSuffix() {
  return crypto.randomBytes(4).toString("hex");
}

async function createTempDatabase(adminClient, dbName) {
  await adminClient.query(`CREATE DATABASE "${dbName}"`);
}

async function dropTempDatabase(adminClient, dbName) {
  // terminate connections so drop works
  await adminClient.query(
    `
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE datname = $1 AND pid <> pg_backend_pid()
    `,
    [dbName]
  );
  await adminClient.query(`DROP DATABASE IF EXISTS "${dbName}"`);
}

async function ensureCanonicalSchema(targetClient) {
  await targetClient.query(`
    CREATE TABLE IF NOT EXISTS canonical_events (
      id BIGINT PRIMARY KEY,
      chain_id INTEGER NOT NULL,
      block_number BIGINT NOT NULL,
      tx_hash TEXT NOT NULL,
      log_index INTEGER NOT NULL,
      contract_address TEXT NOT NULL,
      event_type TEXT NOT NULL,
      pool_id TEXT,
      token_address TEXT,
      payload JSONB NOT NULL
    );
  `);
  await targetClient.query(`
    CREATE INDEX IF NOT EXISTS canonical_events_chain_id_id_idx
      ON canonical_events(chain_id, id);
  `);
}

async function copyCanonicalSlice(sourceClient, targetClient) {
  const res = await sourceClient.query(
    `
    SELECT id, chain_id, block_number, tx_hash, log_index, contract_address, event_type, pool_id, token_address, payload
    FROM canonical_events
    WHERE chain_id = $1 AND id >= $2 AND id <= $3
    ORDER BY id ASC
    `,
    [CHAIN_ID, FROM_ID, TO_ID]
  );

  if (!res.rows.length) {
    throw new Error(
      `No canonical events found in source DB for chain_id=${CHAIN_ID} id=[${FROM_ID},${TO_ID}]`
    );
  }

  const values = [];
  const params = [];
  let i = 1;
  for (const row of res.rows) {
    params.push(
      row.id,
      row.chain_id,
      row.block_number,
      row.tx_hash,
      row.log_index,
      row.contract_address,
      row.event_type,
      row.pool_id,
      row.token_address,
      row.payload
    );
    values.push(
      `($${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++})`
    );
  }

  await targetClient.query(
    `
    INSERT INTO canonical_events(
      id, chain_id, block_number, tx_hash, log_index, contract_address, event_type, pool_id, token_address, payload
    )
    VALUES ${values.join(",")}
    ON CONFLICT (id) DO NOTHING
    `,
    params
  );
}

async function runOneTempReplay(adminClient, dbName) {
  const dbUrl = buildDbUrlLike(SOURCE_DB_URL, dbName);
  await createTempDatabase(adminClient, dbName);

  try {
    await withClient(dbUrl, async (targetClient) => {
      await ensureCanonicalSchema(targetClient);
    });

    await withClient(SOURCE_DB_URL, async (sourceClient) => {
      await withClient(dbUrl, async (targetClient) => {
        await copyCanonicalSlice(sourceClient, targetClient);
      });
    });

    await runDerivationOnce({
      dbUrl,
      chainId: CHAIN_ID,
      checkpointName: "qa",
      processorName: "qa",
      batchSize: 500
    });

    const checksums = await withClient(dbUrl, (c) => computeTableChecksums(c));
    return { dbUrl, checksums };
  } finally {
    await dropTempDatabase(adminClient, dbName);
  }
}

async function main() {
  // Connect to postgres admin DB for CREATE/DROP DATABASE
  const adminDbUrl = buildDbUrlLike(SOURCE_DB_URL, "postgres");

  const runId = randomSuffix();
  const db1 = `qa_replay_${runId}_1`;
  const db2 = `qa_replay_${runId}_2`;

  const result = await withClient(adminDbUrl, async (adminClient) => {
    const r1 = await runOneTempReplay(adminClient, db1);
    const r2 = await runOneTempReplay(adminClient, db2);
    return { r1, r2 };
  });

  const diffs = [];
  for (const [table, c1] of Object.entries(result.r1.checksums)) {
    const c2 = result.r2.checksums[table];
    if (c1.checksum !== c2.checksum || c1.rowCount !== c2.rowCount) {
      diffs.push({ table, run1: c1, run2: c2 });
    }
  }

  if (diffs.length) {
    console.error("[qa] Determinism replay FAILED. Diffs:");
    for (const d of diffs) {
      console.error(
        `- ${d.table}: run1=${d.run1.rowCount}/${d.run1.checksum} run2=${d.run2.rowCount}/${d.run2.checksum}`
      );
    }
    process.exit(1);
  }

  console.log(
    `[qa] Determinism replay PASSED for chain_id=${CHAIN_ID} canonical id=[${FROM_ID},${TO_ID}]`
  );
}

main().catch((e) => {
  console.error("[qa] determinism fatal:", e);
  process.exit(1);
});

