export async function handleTradeEvent(repo, event) {
  await repo.insertDerivedTrade(event);
}
