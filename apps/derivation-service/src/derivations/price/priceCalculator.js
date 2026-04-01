export async function handlePriceUpdateEvent(repo, event) {
  await repo.upsertTokenPriceCurrent(event);
}
