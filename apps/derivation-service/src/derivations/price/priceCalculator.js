export async function handlePriceUpdateEvent(repo, tx, event) {
  await repo.upsertTokenPriceCurrent(tx, event);
}
