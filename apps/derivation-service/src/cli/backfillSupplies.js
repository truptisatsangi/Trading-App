/**
 * One-time supply backfill for existing tokens.
 *
 * Usage:
 *   npm run backfill-supplies
 *
 * Env:
 *   DB_URL   (defaults to derivation config)
 *   RPC_URL  (defaults to derivation config)
 *   CHAIN_ID (defaults to derivation config)
 */
import { Contract, JsonRpcProvider } from "ethers";
import { config } from "../config/derivationConfig.js";
import { ReadModelRepo } from "../repositories/readModelRepo.js";

const SUPPLY_ABI = [
  "function totalSupply() view returns (uint256)",
  "function decimals() view returns (uint8)"
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetries(action, label, attempts = 4) {
  let lastError = null;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (i < attempts) {
        const waitMs = 500 * 2 ** (i - 1);
        console.warn(`[backfill-supplies] retry ${i}/${attempts - 1} for ${label} in ${waitMs}ms`);
        await sleep(waitMs);
      }
    }
  }
  throw lastError;
}

async function fetchTokenRows(client, chainId) {
  const result = await client.query(
    `
    SELECT token_address
    FROM tokens
    WHERE chain_id = $1
    ORDER BY created_block_number ASC
    `,
    [chainId]
  );
  return result.rows;
}

async function main() {
  const repo = new ReadModelRepo(config.dbUrl);
  const provider = new JsonRpcProvider(config.rpcUrl);
  await repo.init();

  try {
    const tokens = await fetchTokenRows(repo.client, config.chainId);
    console.log(`[backfill-supplies] tokens to process: ${tokens.length}`);

    let ok = 0;
    let failed = 0;

    for (const row of tokens) {
      const tokenAddress = String(row.token_address).toLowerCase();
      try {
        const token = new Contract(tokenAddress, SUPPLY_ABI, provider);
        const code = await withRetries(
          () => provider.getCode(tokenAddress),
          `${tokenAddress} getCode`
        );
        if (!code || code === "0x") {
          throw new Error("no bytecode at address");
        }

        // Call sequentially (instead of Promise.all) to reduce occasional RPC flakiness.
        const decimals = await withRetries(
          () => token.decimals(),
          `${tokenAddress} decimals`
        );
        const totalSupply = await withRetries(
          () => token.totalSupply(),
          `${tokenAddress} totalSupply`
        );

        await repo.upsertTokenSupply(
          repo.client,
          config.chainId,
          tokenAddress,
          { totalSupplyRaw: totalSupply.toString(), decimals: Number(decimals) },
          null
        );
        ok += 1;
      } catch (error) {
        failed += 1;
        console.warn(
          `[backfill-supplies] failed ${tokenAddress}:`,
          error?.shortMessage ?? error?.message ?? error
        );
      }
    }

    console.log(`[backfill-supplies] done. ok=${ok} failed=${failed}`);
  } finally {
    await repo.close();
  }
}

main().catch((err) => {
  console.error("[backfill-supplies] fatal:", err);
  process.exit(1);
});
