export async function handleTransferEvent(repo, event) {
  await repo.applyTransfer(event);
}
