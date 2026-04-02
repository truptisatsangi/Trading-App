export async function handleTradeEvent(repo, tx, event) {
  const tokenAddress =
    event.token_address ?? (await repo.resolveTokenAddressByPoolId(tx, event.chain_id, event.pool_id));
  await repo.insertDerivedTrade(tx, {
    ...event,
    token_address: tokenAddress
  });
  const metrics = await repo.deriveTradePriceAndCandle(tx, {
    ...event,
    token_address: tokenAddress
  });
  return metrics;
}
