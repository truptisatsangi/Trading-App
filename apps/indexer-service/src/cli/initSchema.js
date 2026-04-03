/**
 * Applies the full shared schema (indexer + derivation DDL via db/migrate.mjs).
 * Idempotent. Prefer `npm run migrate` from the repo root.
 *
 * Usage: npm run init-schema
 */
import { runMigrations } from "../../../../db/migrate.mjs";
import { config } from "../config/indexerConfig.js";

async function main() {
  await runMigrations(config.dbUrl);
  console.log("[init-schema] database schema is ready (shared migrate).");
}

main().catch((err) => {
  console.error("[init-schema] fatal:", err);
  process.exit(1);
});
