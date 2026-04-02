import { Client } from "pg";
import {
  CREATE_DERIVATION_APPLIED_EVENTS_TABLE_SQL,
  CREATE_DERIVATION_CHECKPOINTS_TABLE_SQL,
  CREATE_DERIVED_TRADES_INDEX_SQL,
  CREATE_DERIVED_TRADES_TABLE_SQL,
  CREATE_ETH_USD_RATES_TABLE_SQL,
  CREATE_TOKEN_CANDLES_1M_INDEX_SQL,
  CREATE_TOKEN_CANDLES_1M_TABLE_SQL,
  CREATE_TOKEN_FEE_DISTRIBUTIONS_TABLE_SQL,
  CREATE_TOKEN_HOLDER_COUNTS_TABLE_SQL,
  CREATE_TOKEN_HOLDERS_CURRENT_TABLE_SQL,
  CREATE_TOKEN_OWNERSHIP_CURRENT_TABLE_SQL,
  CREATE_TOKEN_PRICES_DERIVED_CURRENT_TABLE_SQL,
  CREATE_TOKEN_POOLS_TABLE_SQL,
  CREATE_TOKEN_PRICES_CURRENT_TABLE_SQL,
  CREATE_TOKENS_TABLE_SQL
} from "../models/readModels.js";

export class ReadModelRepo {
  constructor(dbUrl) {
    this.client = new Client({ connectionString: dbUrl });
  }

  async init() {
    await this.client.connect();
    await this.client.query(CREATE_DERIVATION_CHECKPOINTS_TABLE_SQL);
    await this.client.query(CREATE_DERIVATION_APPLIED_EVENTS_TABLE_SQL);
    await this.client.query(CREATE_DERIVED_TRADES_TABLE_SQL);
    await this.client.query(CREATE_DERIVED_TRADES_INDEX_SQL);
    await this.client.query(CREATE_TOKEN_PRICES_CURRENT_TABLE_SQL);
    await this.client.query(CREATE_TOKEN_PRICES_DERIVED_CURRENT_TABLE_SQL);
    await this.client.query(CREATE_TOKEN_CANDLES_1M_TABLE_SQL);
    await this.client.query(CREATE_TOKEN_CANDLES_1M_INDEX_SQL);
    await this.client.query(CREATE_TOKEN_HOLDERS_CURRENT_TABLE_SQL);
    await this.client.query(CREATE_TOKEN_HOLDER_COUNTS_TABLE_SQL);
    await this.client.query(CREATE_TOKENS_TABLE_SQL);
    await this.client.query(CREATE_TOKEN_POOLS_TABLE_SQL);
    await this.client.query(CREATE_TOKEN_OWNERSHIP_CURRENT_TABLE_SQL);
    await this.client.query(CREATE_ETH_USD_RATES_TABLE_SQL);
    await this.client.query(CREATE_TOKEN_FEE_DISTRIBUTIONS_TABLE_SQL);
    await this.ensureColumnExists("derived_trades", "token_address", "TEXT");
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

  async withTransaction(work) {
    await this.client.query("BEGIN");
    try {
      const result = await work(this.client);
      await this.client.query("COMMIT");
      return result;
    } catch (error) {
      await this.client.query("ROLLBACK");
      throw error;
    }
  }

  getDedupeKey(event) {
    if (event.id) {
      return `id:${event.id}`;
    }
    return `tx:${event.chain_id}:${event.tx_hash}:${event.log_index}`;
  }

  async applyEventWithIdempotency(processorName, checkpointName, chainId, event, handler) {
    return this.withTransaction(async (tx) => {
      const dedupeKey = this.getDedupeKey(event);
      const insertRes = await tx.query(
        `
        INSERT INTO derivation_applied_events(processor_name, chain_id, dedupe_key, canonical_event_id)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (processor_name, chain_id, dedupe_key)
        DO NOTHING
        `,
        [processorName, chainId, dedupeKey, event.id ?? null]
      );

      const applied = insertRes.rowCount === 1;
      if (applied) {
        await handler(tx);
      }

      if (event.id) {
        await tx.query(
          `
          INSERT INTO derivation_checkpoints(name, chain_id, last_event_id, updated_at)
          VALUES ($1, $2, $3, NOW())
          ON CONFLICT (name, chain_id)
          DO UPDATE SET last_event_id = GREATEST(derivation_checkpoints.last_event_id, EXCLUDED.last_event_id), updated_at = NOW()
          `,
          [checkpointName, chainId, Number(event.id)]
        );
      }

      return applied;
    });
  }

  async insertDerivedTrade(tx, event) {
    const payload = event.payload || {};
    await tx.query(
      `
      INSERT INTO derived_trades (
        canonical_event_id, chain_id, block_number, tx_hash, log_index, pool_id, token_address, contract_address,
        fl_amount0, fl_amount1, fl_fee0, fl_fee1,
        isp_amount0, isp_amount1, isp_fee0, isp_fee1,
        uni_amount0, uni_amount1, uni_fee0, uni_fee1
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,
        $9,$10,$11,$12,
        $13,$14,$15,$16,
        $17,$18,$19,$20
      )
      ON CONFLICT (canonical_event_id) DO NOTHING
      `,
      [
        event.id ?? null,
        event.chain_id,
        event.block_number,
        event.tx_hash,
        event.log_index,
        event.pool_id,
        event.token_address ?? null,
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

  pickPriceLeg(payload) {
    const legs = [
      {
        amount0: BigInt(String(payload.uniAmount0 ?? "0")),
        amount1: BigInt(String(payload.uniAmount1 ?? "0"))
      },
      {
        amount0: BigInt(String(payload.flAmount0 ?? "0")),
        amount1: BigInt(String(payload.flAmount1 ?? "0"))
      },
      {
        amount0: BigInt(String(payload.ispAmount0 ?? "0")),
        amount1: BigInt(String(payload.ispAmount1 ?? "0"))
      }
    ];
    return legs.find((leg) => leg.amount0 !== 0n && leg.amount1 !== 0n) ?? null;
  }

  bigIntRatioToDecimalString(numerator, denominator, precision = 18) {
    const scale = 10n ** BigInt(precision);
    const scaled = (numerator * scale) / denominator;
    const intPart = scaled / scale;
    const fracPart = scaled % scale;
    return `${intPart.toString()}.${fracPart.toString().padStart(precision, "0")}`;
  }

  floorToMinute(isoOrDate) {
    const d = new Date(isoOrDate ?? Date.now());
    d.setSeconds(0, 0);
    return d.toISOString();
  }

  async deriveTradePriceAndCandle(tx, event) {
    if (!event.pool_id) {
      return null;
    }

    const poolRes = await tx.query(
      `
      SELECT token_address, currency_flipped
      FROM token_pools
      WHERE chain_id = $1 AND pool_id = $2
      `,
      [event.chain_id, event.pool_id]
    );
    const pool = poolRes.rows[0];
    if (!pool?.token_address) {
      return null;
    }

    const payload = event.payload || {};
    const leg = this.pickPriceLeg(payload);
    if (!leg) {
      return null;
    }

    const abs0 = leg.amount0 < 0n ? -leg.amount0 : leg.amount0;
    const abs1 = leg.amount1 < 0n ? -leg.amount1 : leg.amount1;
    const tokenRaw = pool.currency_flipped ? abs1 : abs0;
    const ethRaw = pool.currency_flipped ? abs0 : abs1;
    if (tokenRaw === 0n || ethRaw === 0n) {
      return null;
    }

    const priceEth = this.bigIntRatioToDecimalString(ethRaw, tokenRaw);

    const bucketStart = this.floorToMinute(event.block_timestamp ?? new Date().toISOString());
    await tx.query(
      `
      INSERT INTO token_prices_derived_current(
        chain_id, token_address, pool_id, price_eth,
        source_block_number, source_tx_hash, source_log_index, updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
      ON CONFLICT (chain_id, token_address)
      DO UPDATE SET
        pool_id = EXCLUDED.pool_id,
        price_eth = EXCLUDED.price_eth,
        source_block_number = EXCLUDED.source_block_number,
        source_tx_hash = EXCLUDED.source_tx_hash,
        source_log_index = EXCLUDED.source_log_index,
        updated_at = NOW()
      `,
      [
        event.chain_id,
        pool.token_address,
        event.pool_id,
        priceEth,
        event.block_number,
        event.tx_hash,
        event.log_index
      ]
    );

    await tx.query(
      `
      INSERT INTO token_candles_1m(
        chain_id, token_address, bucket_start,
        open_price_eth, high_price_eth, low_price_eth, close_price_eth,
        volume_token_raw, volume_eth_raw, trade_count, updated_at
      )
      VALUES ($1,$2,$3,$4,$4,$4,$4,$5::numeric,$6::numeric,1,NOW())
      ON CONFLICT (chain_id, token_address, bucket_start)
      DO UPDATE SET
        high_price_eth = GREATEST(token_candles_1m.high_price_eth, EXCLUDED.close_price_eth),
        low_price_eth = LEAST(token_candles_1m.low_price_eth, EXCLUDED.close_price_eth),
        close_price_eth = EXCLUDED.close_price_eth,
        volume_token_raw = token_candles_1m.volume_token_raw + EXCLUDED.volume_token_raw,
        volume_eth_raw = token_candles_1m.volume_eth_raw + EXCLUDED.volume_eth_raw,
        trade_count = token_candles_1m.trade_count + 1,
        updated_at = NOW()
      `,
      [
        event.chain_id,
        pool.token_address,
        bucketStart,
        priceEth,
        tokenRaw.toString(),
        ethRaw.toString()
      ]
    );

    return {
      tokenAddress: pool.token_address,
      poolId: event.pool_id,
      priceEth,
      bucketStart
    };
  }

  async ensureColumnExists(tableName, columnName, columnType) {
    const result = await this.client.query(
      `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
      LIMIT 1
      `,
      [tableName, columnName]
    );
    if (result.rowCount > 0) {
      return;
    }
    await this.client.query(
      `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`
    );
  }

  async listTokens(chainId, limit = 50, offset = 0) {
    const result = await this.client.query(
      `
      SELECT
        t.chain_id,
        t.token_address,
        t.creator_address,
        t.created_at,
        pdc.price_eth,
        pdc.updated_at AS price_updated_at
      FROM tokens t
      LEFT JOIN token_prices_derived_current pdc
        ON pdc.chain_id = t.chain_id
       AND pdc.token_address = t.token_address
      WHERE t.chain_id = $1
      ORDER BY COALESCE(pdc.price_eth, 0) DESC, t.created_at DESC
      LIMIT $2 OFFSET $3
      `,
      [chainId, limit, offset]
    );
    return result.rows;
  }

  async getTokenDetails(chainId, tokenAddress, candleLimit = 120, tradeLimit = 50) {
    const tokenRes = await this.client.query(
      `
      SELECT
        t.chain_id,
        t.token_address,
        t.creator_address,
        t.created_at,
        pdc.pool_id,
        pdc.price_eth,
        pdc.updated_at AS price_updated_at
      FROM tokens t
      LEFT JOIN token_prices_derived_current pdc
        ON pdc.chain_id = t.chain_id
       AND pdc.token_address = t.token_address
      WHERE t.chain_id = $1 AND t.token_address = $2
      LIMIT 1
      `,
      [chainId, tokenAddress.toLowerCase()]
    );
    const token = tokenRes.rows[0] ?? null;
    if (!token) {
      return null;
    }

    const [candlesRes, tradesRes] = await Promise.all([
      this.client.query(
        `
        SELECT
          bucket_start,
          open_price_eth,
          high_price_eth,
          low_price_eth,
          close_price_eth,
          volume_token_raw,
          volume_eth_raw,
          trade_count
        FROM token_candles_1m
        WHERE chain_id = $1
          AND token_address = $2
        ORDER BY bucket_start DESC
        LIMIT $3
        `,
        [chainId, tokenAddress.toLowerCase(), candleLimit]
      ),
      this.client.query(
        `
        SELECT
          canonical_event_id,
          block_number,
          tx_hash,
          log_index,
          pool_id,
          token_address,
          uni_amount0,
          uni_amount1,
          fl_amount0,
          fl_amount1,
          isp_amount0,
          isp_amount1,
          indexed_at
        FROM derived_trades
        WHERE chain_id = $1
          AND token_address = $2
        ORDER BY block_number DESC, log_index DESC
        LIMIT $3
        `,
        [chainId, tokenAddress.toLowerCase(), tradeLimit]
      )
    ]);

    return {
      token,
      candles1m: candlesRes.rows,
      trades: tradesRes.rows
    };
  }

  async upsertTokenPriceCurrent(tx, event) {
    const payload = event.payload || {};
    await tx.query(
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

  async applyTransfer(tx, event) {
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
        tx,
        event.chain_id,
        tokenAddress,
        from,
        -value,
        event.id
      );
    }

    if (to && to !== zero) {
      await this.adjustHolderBalance(
        tx,
        event.chain_id,
        tokenAddress,
        to,
        value,
        event.id
      );
    }

    await this.refreshHolderCount(tx, event.chain_id, tokenAddress, event.id);
  }

  async adjustHolderBalance(tx, chainId, tokenAddress, walletAddress, delta, eventId) {
    const deltaString = delta.toString();
    await tx.query(
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

  async refreshHolderCount(tx, chainId, tokenAddress, eventId) {
    const countResult = await tx.query(
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
    await tx.query(
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

  async upsertTokenFromPoolCreated(tx, event) {
    const payload = event.payload || {};
    const params = payload.params || {};
    const tokenAddress = (payload.memecoin ?? event.token_address ?? "").toLowerCase();
    if (!tokenAddress || !payload.poolId) {
      return;
    }

    const creatorAddress = params.creator?.toLowerCase?.() ?? null;
    await tx.query(
      `
      INSERT INTO tokens(
        chain_id, token_address, creator_address, memecoin_treasury, token_id,
        created_block_number, created_tx_hash, created_log_index, created_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
      ON CONFLICT (chain_id, token_address)
      DO UPDATE SET
        creator_address = COALESCE(EXCLUDED.creator_address, tokens.creator_address),
        memecoin_treasury = COALESCE(EXCLUDED.memecoin_treasury, tokens.memecoin_treasury),
        token_id = COALESCE(EXCLUDED.token_id, tokens.token_id)
      `,
      [
        event.chain_id,
        tokenAddress,
        creatorAddress,
        payload.memecoinTreasury?.toLowerCase?.() ?? null,
        payload.tokenId != null ? String(payload.tokenId) : null,
        event.block_number,
        event.tx_hash,
        event.log_index
      ]
    );

    await tx.query(
      `
      INSERT INTO token_pools(
        chain_id, pool_id, token_address, position_manager_address, currency_flipped,
        created_block_number, created_tx_hash, created_log_index, created_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
      ON CONFLICT (chain_id, pool_id)
      DO UPDATE SET
        token_address = EXCLUDED.token_address,
        position_manager_address = EXCLUDED.position_manager_address,
        currency_flipped = EXCLUDED.currency_flipped
      `,
      [
        event.chain_id,
        payload.poolId,
        tokenAddress,
        event.contract_address,
        Boolean(payload.currencyFlipped),
        event.block_number,
        event.tx_hash,
        event.log_index
      ]
    );
  }

  async resolveTokenAddressByPoolId(tx, chainId, poolId) {
    if (!poolId) {
      return null;
    }
    const result = await tx.query(
      `
      SELECT token_address
      FROM token_pools
      WHERE chain_id = $1 AND pool_id = $2
      `,
      [chainId, poolId]
    );
    return result.rows[0]?.token_address ?? null;
  }

  async upsertNftOwnership(tx, event) {
    const payload = event.payload || {};
    const tokenId = payload.tokenId;
    if (tokenId == null) {
      return;
    }

    await tx.query(
      `
      INSERT INTO token_ownership_current(
        chain_id, token_id, nft_contract_address, owner_address,
        source_tx_hash, source_log_index, updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,NOW())
      ON CONFLICT (chain_id, nft_contract_address, token_id)
      DO UPDATE SET
        owner_address = EXCLUDED.owner_address,
        source_tx_hash = EXCLUDED.source_tx_hash,
        source_log_index = EXCLUDED.source_log_index,
        updated_at = NOW()
      `,
      [
        event.chain_id,
        String(tokenId),
        event.contract_address,
        payload.to ?? "0x0000000000000000000000000000000000000000",
        event.tx_hash,
        event.log_index
      ]
    );
  }

  async upsertEthUsdRate(tx, event) {
    const payload = event.payload || {};
    const roundId = payload.roundId != null ? String(payload.roundId) : null;
    if (!roundId) {
      return;
    }

    await tx.query(
      `
      INSERT INTO eth_usd_rates(
        chain_id, round_id, current_answer, updated_at_onchain, source_tx_hash, source_log_index, indexed_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,NOW())
      ON CONFLICT (chain_id, round_id)
      DO UPDATE SET
        current_answer = EXCLUDED.current_answer,
        updated_at_onchain = EXCLUDED.updated_at_onchain,
        source_tx_hash = EXCLUDED.source_tx_hash,
        source_log_index = EXCLUDED.source_log_index,
        indexed_at = NOW()
      `,
      [
        event.chain_id,
        roundId,
        String(payload.current ?? "0"),
        payload.updatedAt != null ? Number(payload.updatedAt) : null,
        event.tx_hash,
        event.log_index
      ]
    );
  }

  async upsertPoolFeeDistribution(tx, event) {
    const payload = event.payload || {};
    if (!event.pool_id) {
      return;
    }

    await tx.query(
      `
      INSERT INTO token_fee_distributions(
        chain_id, pool_id, last_canonical_event_id,
        donate_amount, creator_amount, bidwall_amount, governance_amount, protocol_amount, updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
      ON CONFLICT (chain_id, pool_id)
      DO UPDATE SET
        last_canonical_event_id = EXCLUDED.last_canonical_event_id,
        donate_amount = EXCLUDED.donate_amount,
        creator_amount = EXCLUDED.creator_amount,
        bidwall_amount = EXCLUDED.bidwall_amount,
        governance_amount = EXCLUDED.governance_amount,
        protocol_amount = EXCLUDED.protocol_amount,
        updated_at = NOW()
      `,
      [
        event.chain_id,
        event.pool_id,
        event.id ?? 0,
        String(payload.donateAmount ?? "0"),
        String(payload.creatorAmount ?? "0"),
        String(payload.bidWallAmount ?? "0"),
        String(payload.governanceAmount ?? "0"),
        String(payload.protocolAmount ?? "0")
      ]
    );
  }
}
