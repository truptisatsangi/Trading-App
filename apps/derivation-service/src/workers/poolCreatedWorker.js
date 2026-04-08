import { Contract, JsonRpcProvider } from "ethers";
import { config } from "../config/derivationConfig.js";

const provider = new JsonRpcProvider(config.rpcUrl);
const SUPPLY_ABI = [
  "function totalSupply() view returns (uint256)",
  "function decimals() view returns (uint8)"
];

async function fetchSupply(tokenAddress) {
  const token = new Contract(tokenAddress, SUPPLY_ABI, provider);
  const [totalSupply, decimals] = await Promise.all([token.totalSupply(), token.decimals()]);
  return { totalSupplyRaw: totalSupply.toString(), decimals: Number(decimals) };
}

export async function handlePoolCreatedEvent(repo, tx, event) {
  await repo.upsertTokenFromPoolCreated(tx, event);

  const tokenAddress = event.payload?.memecoin ?? event.token_address;
  if (!tokenAddress) {
    return;
  }

  try {
    const supply = await fetchSupply(tokenAddress);
    await repo.upsertTokenSupply(tx, event.chain_id, tokenAddress, supply, event.id ?? null);
  } catch (error) {
    console.warn(
      `[derivation] pool_created supply fetch failed for ${String(tokenAddress).toLowerCase()}:`,
      error?.message ?? error
    );
  }
}
