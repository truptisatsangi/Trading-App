import { Client } from "pg";
import {
  CREATE_DERIVATION_CHECKPOINTS_TABLE_SQL,
  CREATE_DERIVED_TRADES_INDEX_SQL,
  CREATE_DERIVED_TRADES_TABLE_SQL,
  CREATE_TOKEN_HOLDER_COUNTS_TABLE_SQL,
  CREATE_TOKEN_HOLDERS_CURRENT_TABLE_SQL,
  CREATE_TOKEN_PRICES_CURRENT_TABLE_SQL
} from "../models/readModels.js";

export class ReadModelRepo {
  constructor(dbUrl) {
    this.client = new Client({ connectionString: dbUrl });
  }

  async init() {
    await this.client.connect();
    await this.client.query(CREATE_DERIVATION_CHECKPOINTS_TABLE_SQL);
    await this.client.query(CREATE_DERIVED_TRADES_TABLE_SQL);
    await this.client.query(CREATE_DERIVED_TRADES_INDEX_SQL);
    await this.client.query(CREATE_TOKEN_PRICES_CURRENT_TABLE_SQL);
    await this.client.query(CREATE_TOKEN_HOLDERS_CURRENT_TABLE_SQL);
    await this.client.query(CREATE_TOKEN_HOLDER_COUNTS_TABLE_SQL);
  }

  async close() {
    await this.client.end();
  }

  async getCheckpoint(name, chainId) {
    const result = await this.client.query(
      `
      SELECT last_event_id
      FROM derivation_checkpoints
      WHERE name = $1 AND chain_id = $2
      `,
      [name, chainId]
    );
    return result.rows[0]?.last_event_id ?? null;
  }

  async upsertCheckpoint(name, chainId, lastEventId) {
    await this.client.query(
      `
      INSERT INTO derivation_checkpoints(name, chain_id, last_event_id, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (name, chain_id)
      DO UPDATE SET last_event_id = EXCLUDED.last_event_id, updated_at = NOW()
      `,
      [name, chainId, lastEventId]
    );
  }

  async getCanonicalEventsAfterId(chainId, lastEventId, limit) {
    const result = await this.client.query(
      `
      SELECT id, chain_id, block_number, tx_hash, log_index, contract_address, event_type, pool_id, token_address, payload
      FROM canonical_events
      WHERE chain_id = $1
        AND id > $2
      ORDER BY id ASC
      LIMIT $3
      `,
      [chainId, lastEventId, limit]
    );
    return result.rows;
  }

  async insertDerivedTrade(event) {
    const payload = event.payload || {};
    await this.client.query(
      `
      INSERT INTO derived_trades (
        canonical_event_id, chain_id, block_number, tx_hash, log_index, pool_id, contract_address,
        fl_amount0, fl_amount1, fl_fee0, fl_fee1,
        isp_amount0, isp_amount1, isp_fee0, isp_fee1,
        uni_amount0, uni_amount1, uni_fee0, uni_fee1
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,
        $8,$9,$10,$11,
        $12,$13,$14,$15,
        $16,$17,$18,$19
      )
      ON CONFLICT (canonical_event_id) DO NOTHING
      `,
      [
        event.id,
        event.chain_id,
        event.block_number,
        event.tx_hash,
        event.log_index,
        event.pool_id,
        event.contract_address,
        payload.flAmount0 ?? "0",
        payload.flAmount1 ?? "0",
        payload.flFee0 ?? "0",
        payload.flFee1 ?? "0",
        payload.ispAmount0 ?? "0",
        payload.ispAmount1 ?? "0",
        payload.ispFee0 ?? "0",
        payload.ispFee1 ?? "0",
        payload.uniAmount0 ?? "0",
        payload.uniAmount1 ?? "0",
        payload.uniFee0 ?? "0",
        payload.uniFee1 ?? "0"
      ]
    );
  }

  async upsertTokenPriceCurrent(event) {
    const payload = event.payload || {};
    await this.client.query(
      `
      INSERT INTO token_prices_current (
        chain_id, pool_id, contract_address, sqrt_price_x96, tick, protocol_fee, swap_fee, liquidity,
        source_block_number, source_tx_hash, source_log_index, updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
      ON CONFLICT (chain_id, pool_id)
      DO UPDATE SET
        contract_address = EXCLUDED.contract_address,
        sqrt_price_x96 = EXCLUDED.sqrt_price_x96,
        tick = EXCLUDED.tick,
        protocol_fee = EXCLUDED.protocol_fee,
        swap_fee = EXCLUDED.swap_fee,
        liquidity = EXCLUDED.liquidity,
        source_block_number = EXCLUDED.source_block_number,
        source_tx_hash = EXCLUDED.source_tx_hash,
        source_log_index = EXCLUDED.source_log_index,
        updated_at = NOW()
      `,
      [
        event.chain_id,
        event.pool_id,
        event.contract_address,
        String(payload.sqrtPriceX96 ?? "0"),
        Number(payload.tick ?? 0),
        Number(payload.protocolFee ?? 0),
        Number(payload.swapFee ?? 0),
        String(payload.liquidity ?? "0"),
        event.block_number,
        event.tx_hash,
        event.log_index
      ]
    );
  }

  async applyTransfer(event) {
    const payload = event.payload || {};
    const tokenAddress = event.token_address;
    if (!tokenAddress) {
      return;
    }

    const from = String(payload.from ?? "").toLowerCase();
    const to = String(payload.to ?? "").toLowerCase();
    const value = BigInt(String(payload.value ?? "0"));
    const zero = "0x0000000000000000000000000000000000000000";

    if (from && from !== zero) {
      await this.adjustHolderBalance(
        event.chain_id,
        tokenAddress,
        from,
        -value,
        event.id
      );
    }

    if (to && to !== zero) {
      await this.adjustHolderBalance(
        event.chain_id,
        tokenAddress,
        to,
        value,
        event.id
      );
    }

    await this.refreshHolderCount(event.chain_id, tokenAddress, event.id);
  }

  async adjustHolderBalance(chainId, tokenAddress, walletAddress, delta, eventId) {
    const deltaString = delta.toString();
    await this.client.query(
      `
      INSERT INTO token_holders_current (
        chain_id, token_address, wallet_address, balance_numeric, updated_event_id, updated_at
      )
      VALUES ($1, $2, $3, $4::numeric, $5, NOW())
      ON CONFLICT (chain_id, token_address, wallet_address)
      DO UPDATE SET
        balance_numeric = token_holders_current.balance_numeric + EXCLUDED.balance_numeric,
        updated_event_id = EXCLUDED.updated_event_id,
        updated_at = NOW()
      `,
      [chainId, tokenAddress, walletAddress, deltaString, eventId]
    );
  }

  async refreshHolderCount(chainId, tokenAddress, eventId) {
    const countResult = await this.client.query(
      `
      SELECT COUNT(*)::bigint AS holder_count
      FROM token_holders_current
      WHERE chain_id = $1
        AND token_address = $2
        AND balance_numeric > 0
      `,
      [chainId, tokenAddress]
    );

    const holderCount = Number(countResult.rows[0]?.holder_count ?? 0);
    await this.client.query(
      `
      INSERT INTO token_holder_counts (
        chain_id, token_address, holder_count, updated_event_id, updated_at
      )
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (chain_id, token_address)
      DO UPDATE SET
        holder_count = EXCLUDED.holder_count,
        updated_event_id = EXCLUDED.updated_event_id,
        updated_at = NOW()
      `,
      [chainId, tokenAddress, holderCount, eventId]
    );
  }
}
