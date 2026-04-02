export async function handleTransferEvent(repo, tx, event) {
  await repo.applyTransfer(tx, event);
}
