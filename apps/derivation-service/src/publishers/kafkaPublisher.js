import { Kafka } from "kafkajs";

export class DerivedKafkaPublisher {
  constructor(config) {
    this.config = config;
    this.producer = null;
  }

  async init() {
    if (!this.config.enableKafkaDerivedPublish) {
      return;
    }
    const kafka = new Kafka({
      clientId: `${this.config.kafkaClientId}-derived`,
      brokers: this.config.kafkaBrokers
    });
    this.producer = kafka.producer();
    await this.producer.connect();
  }

  async publish(change) {
    if (!this.producer) {
      return;
    }
    await this.producer.send({
      topic: this.config.kafkaDerivedTopic,
      messages: [
        {
          key: change.key,
          value: JSON.stringify(change)
        }
      ]
    });
  }

  async close() {
    if (this.producer) {
      await this.producer.disconnect();
    }
  }
}
