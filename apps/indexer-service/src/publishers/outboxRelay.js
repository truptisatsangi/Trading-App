function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class OutboxRelay {
  constructor(config, repository, kafkaPublisher) {
    this.config = config;
    this.repository = repository;
    this.kafkaPublisher = kafkaPublisher;
    this.running = false;
  }

  async start() {
    this.running = true;
    while (this.running) {
      try {
        const rows = await this.repository.getUnpublishedOutboxRows(
          this.config.kafkaCanonicalTopic,
          this.config.kafkaOutboxBatchSize
        );

        if (!rows.length) {
          await sleep(this.config.kafkaOutboxPollMs);
          continue;
        }

        for (const row of rows) {
          await this.kafkaPublisher.publish(row.topic, row.event_key, row.payload);
          await this.repository.markOutboxRowPublished(row.outbox_id);
        }
      } catch (error) {
        console.error(`[indexer] outbox relay error: ${error.message}`);
        await sleep(this.config.kafkaOutboxPollMs);
      }
    }
  }

  stop() {
    this.running = false;
  }
}
