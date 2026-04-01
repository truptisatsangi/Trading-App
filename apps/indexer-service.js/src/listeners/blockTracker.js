export class BlockTracker {
  constructor(config, repository, provider) {
    this.config = config;
    this.repository = repository;
    this.provider = provider;
  }

  async getStartBlock() {
    const checkpoint = await this.repository.getCheckpoint(
      this.config.checkpointName,
      this.config.chainId
    );
    if (!checkpoint) {
      return this.config.startBlock;
    }
    return Number(checkpoint);
  }

  async getFinalizedHead() {
    const latest = await this.provider.getBlockNumber();
    return Math.max(0, latest - this.config.confirmations);
  }

  async saveCheckpoint(blockNumber) {
    await this.repository.upsertCheckpoint(
      this.config.checkpointName,
      this.config.chainId,
      blockNumber
    );
  }
}
