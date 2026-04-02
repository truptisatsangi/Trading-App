import { createClient } from "redis";

export class DerivedRedisPublisher {
  constructor(config) {
    this.config = config;
    this.client = null;
  }

  async init() {
    if (!this.config.enableRedisPublish) {
      return;
    }
    this.client = createClient({
      url: this.config.redisUrl
    });
    await this.client.connect();
  }

  async publish(change) {
    if (!this.client) {
      return;
    }
    await this.client.publish(this.config.redisDerivedChannel, JSON.stringify(change));
  }

  async close() {
    if (this.client) {
      await this.client.quit();
    }
  }
}
