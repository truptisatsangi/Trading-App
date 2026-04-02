import { Client } from "pg";
import {
  CREATE_CANONICAL_EVENTS_BLOCK_HASH_INDEX_SQL,
  CREATE_CANONICAL_EVENTS_INDEX_SQL,
  CREATE_CANONICAL_OUTBOX_INDEX_SQL,
  CREATE_CANONICAL_OUTBOX_TABLE_SQL,
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
    await this.client.query(CREATE_CANONICAL_EVENTS_BLOCK_HASH_INDEX_SQL);
    await this.client.query(CREATE_CHECKPOINTS_TABLE_SQL);
    await this.client.query(CREATE_CANONICAL_OUTBOX_TABLE_SQL);
    await this.client.query(CREATE_CANONICAL_OUTBOX_INDEX_SQL);
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
    return this.insertCanonicalEventWithOutbox(event, null);
  }

  async insertCanonicalEventWithOutbox(event, outboxTopic) {
    await this.client.query("BEGIN");
    try {
      const result = await this.client.query(
      `
      INSERT INTO canonical_events(
        chain_id,
        block_number,
        block_hash,
        parent_hash,
        block_timestamp,
        tx_hash,
        log_index,
        contract_address,
        event_type,
        topic0,
        pool_id,
        token_address,
        payload
      )
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT (chain_id, tx_hash, log_index)
      DO NOTHING
      RETURNING id
      `,
      [
        event.chainId,
        event.blockNumber,
        event.blockHash,
        event.parentHash ?? null,
        event.blockTimestamp ?? null,
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

      if (!result.rowCount) {
        await this.client.query("COMMIT");
        return false;
      }

      if (outboxTopic) {
        const canonicalEventId = Number(result.rows[0].id);
        const eventKey = `${event.chainId}:${event.txHash}:${event.logIndex}`;
        await this.client.query(
          `
          INSERT INTO canonical_event_outbox(
            canonical_event_id,
            chain_id,
            topic,
            event_key,
            payload
          )
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (topic, event_key)
          DO NOTHING
          `,
          [canonicalEventId, event.chainId, outboxTopic, eventKey, event]
        );
      }

      await this.client.query("COMMIT");
      return true;
    } catch (error) {
      await this.client.query("ROLLBACK");
      throw error;
    }
  }

  async getUnpublishedOutboxRows(topic, limit) {
    const result = await this.client.query(
      `
      SELECT outbox_id, topic, event_key, payload
      FROM canonical_event_outbox
      WHERE topic = $1
        AND published_at IS NULL
      ORDER BY outbox_id ASC
      LIMIT $2
      `,
      [topic, limit]
    );
    return result.rows;
  }

  async markOutboxRowPublished(outboxId) {
    await this.client.query(
      `
      UPDATE canonical_event_outbox
      SET published_at = NOW()
      WHERE outbox_id = $1
      `,
      [outboxId]
    );
  }

  async getStoredBlockHash(chainId, blockNumber) {
    const res = await this.client.query(
      `
      SELECT block_hash
      FROM canonical_events
      WHERE chain_id = $1 AND block_number = $2
      ORDER BY log_index ASC
      LIMIT 1
      `,
      [chainId, blockNumber]
    );
    return res.rows[0]?.block_hash ?? null;
  }

  async rollbackFromBlock(chainId, fromBlockInclusive, checkpointName) {
    await this.client.query("BEGIN");
    try {
      await this.client.query(
        `
        DELETE FROM canonical_events
        WHERE chain_id = $1 AND block_number >= $2
        `,
        [chainId, fromBlockInclusive]
      );

      // outbox has ON DELETE CASCADE via canonical_event_id FK, so it gets cleaned automatically.
      await this.upsertCheckpoint(checkpointName, chainId, fromBlockInclusive - 1);

      await this.client.query("COMMIT");
    } catch (e) {
      await this.client.query("ROLLBACK");
      throw e;
    }
  }
}
