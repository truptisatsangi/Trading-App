import { Kafka } from "kafkajs";

export class KafkaPublisher {
  constructor(config) {
    this.config = config;
    this.producer = null;
  }

  async init() {
    if (!this.config.kafkaBrokers.length) {
      throw new Error("Kafka is enabled but KAFKA_BROKERS is empty");
    }

    const kafka = new Kafka({
      clientId: this.config.kafkaClientId,
      brokers: this.config.kafkaBrokers
    });

    this.producer = kafka.producer();
    await this.producer.connect();
  }

  async publish(topic, key, payload) {
    if (!this.producer) {
      throw new Error("Kafka producer not initialized");
    }

    await this.producer.send({
      topic,
      messages: [
        {
          key,
          value: JSON.stringify(payload)
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
