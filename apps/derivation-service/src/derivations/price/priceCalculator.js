export async function handlePriceUpdateEvent(repo, tx, event) {
  await repo.upsertTokenPriceCurrent(tx, event);
  return repo.upsertDerivedPriceFromPoolSqrt(tx, event);
}
