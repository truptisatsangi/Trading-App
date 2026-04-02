export async function handlePoolCreatedEvent(repo, tx, event) {
  await repo.upsertTokenFromPoolCreated(tx, event);
}
