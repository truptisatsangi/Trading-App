export function uniqueEventKey(log) {
  return `${log.transactionHash}:${Number(log.index ?? log.logIndex)}`;
}
