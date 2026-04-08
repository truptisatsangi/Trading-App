import { Pool } from "pg";

export class EventRepository {
  constructor(dbUrl) {
    this.pool = new Pool({ connectionString: dbUrl });
  }

  /** Schema is applied by `npm run migrate` at repo root (see db/migrate.mjs). */
  async init() {
    const client = await this.pool.connect();
    client.release();
  }

  async close() {
    await this.pool.end();
  }

  async getCheckpoint(name, chainId) {
    const result = await this.pool.query(
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
    await this.pool.query(
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
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `
        INSERT INTO canonical_events(
          chain_id, block_number, block_hash, parent_hash, block_timestamp,
          tx_hash, log_index, contract_address, event_type, topic0,
          pool_id, token_address, payload
        )
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT (chain_id, tx_hash, log_index)
        DO NOTHING
        RETURNING id
        `,
        [
          event.chainId, event.blockNumber, event.blockHash,
          event.parentHash ?? null, event.blockTimestamp ?? null,
          event.txHash, event.logIndex, event.contractAddress,
          event.eventType, event.topic0, event.poolId ?? null,
          event.tokenAddress ?? null, event.payload
        ]
      );

      if (!result.rowCount) {
        await client.query("COMMIT");
        return false;
      }

      if (outboxTopic) {
        const canonicalEventId = Number(result.rows[0].id);
        const eventKey = `${event.chainId}:${event.txHash}:${event.logIndex}`;
        await client.query(
          `
          INSERT INTO canonical_event_outbox(
            canonical_event_id, chain_id, topic, event_key, payload
          )
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (topic, event_key)
          DO NOTHING
          `,
          [canonicalEventId, event.chainId, outboxTopic, eventKey, event]
        );
      }

      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Batch insert an array of canonical events in a single transaction.
   * Returns { inserted, skipped } counts.
   */
  async insertCanonicalEventsBatch(events, outboxTopic) {
    if (!events.length) {
      return { inserted: 0, skipped: 0 };
    }

    const chainIds       = events.map((e) => e.chainId);
    const blockNumbers   = events.map((e) => e.blockNumber);
    const blockHashes    = events.map((e) => e.blockHash);
    const parentHashes   = events.map((e) => e.parentHash ?? null);
    const blockTimestamps = events.map((e) => e.blockTimestamp ?? null);
    const txHashes       = events.map((e) => e.txHash);
    const logIndexes     = events.map((e) => e.logIndex);
    const contractAddrs  = events.map((e) => e.contractAddress);
    const eventTypes     = events.map((e) => e.eventType);
    const topic0s        = events.map((e) => e.topic0);
    const poolIds        = events.map((e) => e.poolId ?? null);
    const tokenAddresses = events.map((e) => e.tokenAddress ?? null);
    const payloads       = events.map((e) => JSON.stringify(e.payload));

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const insertResult = await client.query(
        `
        INSERT INTO canonical_events(
          chain_id, block_number, block_hash, parent_hash, block_timestamp,
          tx_hash, log_index, contract_address, event_type, topic0,
          pool_id, token_address, payload
        )
        SELECT
          unnest($1::int[]),
          unnest($2::bigint[]),
          unnest($3::text[]),
          unnest($4::text[]),
          unnest($5::timestamptz[]),
          unnest($6::text[]),
          unnest($7::int[]),
          unnest($8::text[]),
          unnest($9::text[]),
          unnest($10::text[]),
          unnest($11::text[]),
          unnest($12::text[]),
          unnest($13::jsonb[])
        ON CONFLICT (chain_id, tx_hash, log_index)
        DO NOTHING
        RETURNING id, chain_id, tx_hash, log_index
        `,
        [
          chainIds, blockNumbers, blockHashes, parentHashes, blockTimestamps,
          txHashes, logIndexes, contractAddrs, eventTypes, topic0s,
          poolIds, tokenAddresses, payloads
        ]
      );

      const inserted = insertResult.rowCount ?? 0;
      const skipped = events.length - inserted;

      if (outboxTopic && inserted > 0) {
        // Map returned rows back to original events for outbox payload
        const returnedKeys = new Map(
          insertResult.rows.map((row) => [
            `${row.chain_id}:${row.tx_hash}:${row.log_index}`,
            Number(row.id)
          ])
        );

        const outboxIds      = [];
        const outboxChainIds = [];
        const outboxTopics   = [];
        const outboxKeys     = [];
        const outboxPayloads = [];

        for (const event of events) {
          const key = `${event.chainId}:${event.txHash}:${event.logIndex}`;
          const canonicalEventId = returnedKeys.get(key);
          if (canonicalEventId != null) {
            outboxIds.push(canonicalEventId);
            outboxChainIds.push(event.chainId);
            outboxTopics.push(outboxTopic);
            outboxKeys.push(key);
            outboxPayloads.push(JSON.stringify(event));
          }
        }

        if (outboxIds.length > 0) {
          await client.query(
            `
            INSERT INTO canonical_event_outbox(
              canonical_event_id, chain_id, topic, event_key, payload
            )
            SELECT
              unnest($1::bigint[]),
              unnest($2::int[]),
              unnest($3::text[]),
              unnest($4::text[]),
              unnest($5::jsonb[])
            ON CONFLICT (topic, event_key)
            DO NOTHING
            `,
            [outboxIds, outboxChainIds, outboxTopics, outboxKeys, outboxPayloads]
          );
        }
      }

      await client.query("COMMIT");
      return { inserted, skipped };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getUnpublishedOutboxRows(topic, limit) {
    const result = await this.pool.query(
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
    await this.pool.query(
      `
      UPDATE canonical_event_outbox
      SET published_at = NOW()
      WHERE outbox_id = $1
      `,
      [outboxId]
    );
  }

  async getStoredBlockHash(chainId, blockNumber) {
    const res = await this.pool.query(
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
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `
        DELETE FROM canonical_events
        WHERE chain_id = $1 AND block_number >= $2
        `,
        [chainId, fromBlockInclusive]
      );
      // outbox has ON DELETE CASCADE via canonical_event_id FK, so it gets cleaned automatically.
      await client.query(
        `
        INSERT INTO indexer_checkpoints(name, chain_id, last_processed_block, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (name, chain_id)
        DO UPDATE SET last_processed_block = EXCLUDED.last_processed_block, updated_at = NOW()
        `,
        [checkpointName, chainId, fromBlockInclusive - 1]
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
}
