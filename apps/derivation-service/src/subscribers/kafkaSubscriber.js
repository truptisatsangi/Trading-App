import { Kafka } from "kafkajs";

export class KafkaSubscriber {
  constructor(config, onEvent) {
    this.config = config;
    this.onEvent = onEvent;
    this.consumer = null;
  }

  async start() {
    if (!this.config.kafkaBrokers.length) {
      throw new Error("USE_KAFKA_PRIMARY=true but KAFKA_BROKERS is empty");
    }

    const kafka = new Kafka({
      clientId: this.config.kafkaClientId,
      brokers: this.config.kafkaBrokers
    });

    this.consumer = kafka.consumer({
      groupId: this.config.kafkaGroupId
    });
    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: this.config.kafkaCanonicalTopic,
      fromBeginning: false
    });

    await this.consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) {
          return;
        }
        const payload = JSON.parse(message.value.toString("utf8"));
        await this.onEvent(payload);
      }
    });
  }

  async stop() {
    if (this.consumer) {
      await this.consumer.disconnect();
    }
  }
}
