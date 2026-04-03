import { Contract, JsonRpcProvider } from "ethers";

const MEMECOIN_ABI = ["function creator() view returns (address)"];

/**
 * Memecoin.creator() — owner of the Flaunch ERC721 for this coin (see Memecoin.sol).
 */
export async function fetchMemecoinCreator(rpcUrl, tokenAddress) {
  if (!rpcUrl || !tokenAddress) {
    return null;
  }
  try {
    const provider = new JsonRpcProvider(rpcUrl);
    const c = new Contract(tokenAddress, MEMECOIN_ABI, provider);
    const addr = await c.creator();
    const s = typeof addr === "string" ? addr : String(addr);
    const lower = s.toLowerCase();
    if (!lower || lower === "0x0000000000000000000000000000000000000000") {
      return null;
    }
    return lower;
  } catch {
    return null;
  }
}
