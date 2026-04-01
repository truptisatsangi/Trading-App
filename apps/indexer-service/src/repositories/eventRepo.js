import { Client } from "pg";
import {
  CREATE_CANONICAL_EVENTS_INDEX_SQL,
  CREATE_CANONICAL_EVENTS_TABLE_SQL,
  CREATE_CHECKPOINTS_TABLE_SQL
} from "../models/canonicalEvents.js";

export class EventRepository {
  constructor(dbUrl) {
    this.client = new Client({ connectionString: dbUrl });
  }

  async init() {
    await this.client.connect();
    await this.client.query(CREATE_CANONICAL_EVENTS_TABLE_SQL);
    await this.client.query(CREATE_CANONICAL_EVENTS_INDEX_SQL);
    await this.client.query(CREATE_CHECKPOINTS_TABLE_SQL);
  }

  async close() {
    await this.client.end();
  }

  async getCheckpoint(name, chainId) {
    const result = await this.client.query(
      `
      SELECT last_processed_block
      FROM indexer_checkpoints
      WHERE name = $1 AND chain_id = $2
      `,
      [name, chainId]
    );
    if (!result.rows.length) {
      return null;
    }
    return result.rows[0].last_processed_block;
  }

  async upsertCheckpoint(name, chainId, blockNumber) {
    await this.client.query(
      `
      INSERT INTO indexer_checkpoints(name, chain_id, last_processed_block, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (name, chain_id)
      DO UPDATE SET last_processed_block = EXCLUDED.last_processed_block, updated_at = NOW()
      `,
      [name, chainId, blockNumber]
    );
  }

  async insertCanonicalEvent(event) {
    const result = await this.client.query(
      `
      INSERT INTO canonical_events(
        chain_id,
        block_number,
        block_hash,
        tx_hash,
        log_index,
        contract_address,
        event_type,
        topic0,
        pool_id,
        token_address,
        payload
      )
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (chain_id, tx_hash, log_index)
      DO NOTHING
      `,
      [
        event.chainId,
        event.blockNumber,
        event.blockHash,
        event.txHash,
        event.logIndex,
        event.contractAddress,
        event.eventType,
        event.topic0,
        event.poolId ?? null,
        event.tokenAddress ?? null,
        event.payload
      ]
    );
    return result.rowCount === 1;
  }
}
