import { Kafka, type Consumer, type Producer, logLevel } from 'kafkajs';
import { env } from '../config/env';

export const KAFKA_TOPICS = {
  ORDER_PLACED: 'order-placed',
  INVENTORY_UPDATED: 'inventory-updated',
  PAYMENT_UPDATED: 'payment-updated',
  ORDER_STATUS_UPDATED: 'order-status-updated',
  NOTIFICATION_REQUESTED: 'notification-requested',
  DLQ: 'shelfsync-dlq',
} as const;

export type KafkaTopic = (typeof KAFKA_TOPICS)[keyof typeof KAFKA_TOPICS];

export interface ShelfSyncEvent<T = Record<string, unknown>> {
  eventId: string;
  eventType: string;
  occurredAt: string;
  source: 'shelfsync-api';
  payload: T;
}

let kafkaInstance: Kafka | null = null;
let producer: Producer | null = null;
let consumer: Consumer | null = null;
let connected = false;
let lastKafkaError: string | null = null;

export function isKafkaConfigured(): boolean {
  return env.kafkaBrokers.length > 0;
}

export function getKafkaClient(): Kafka | null {
  if (!isKafkaConfigured()) {
    return null;
  }
  if (!kafkaInstance) {
    const sslConfig = env.kafkaCaCert
      ? {
          rejectUnauthorized: true,
          ca: [env.kafkaCaCert],
        }
      : { rejectUnauthorized: false };

    const saslConfig =
      env.kafkaUsername && env.kafkaPassword
        ? {
            mechanism: 'scram-sha-256' as const,
            username: env.kafkaUsername,
            password: env.kafkaPassword,
          }
        : undefined;

    kafkaInstance = new Kafka({
      clientId: env.kafkaClientId,
      brokers: env.kafkaBrokers,
      ssl: sslConfig,
      sasl: saslConfig,
      logLevel: logLevel.WARN,
      retry: {
        initialRetryTime: 300,
        retries: 5,
      },
    });
  }
  return kafkaInstance;
}

export async function ensureKafkaTopics(): Promise<void> {
  const kafka = getKafkaClient();
  if (!kafka) return;
  const admin = kafka.admin();
  try {
    await admin.connect();
    const existing = await admin.listTopics();
    const required = Object.values(KAFKA_TOPICS);
    const missing = required.filter((t) => !existing.includes(t));
    if (missing.length > 0) {
      await admin.createTopics({
        topics: missing.map((topic) => ({
          topic,
          numPartitions: 1,
          replicationFactor: 1,
        })),
        waitForLeaders: true,
      });
    }
  } catch (err) {
    // Managed Aiven Kafka may auto-create topics or require Aiven console topic creation
    console.warn('[Aiven Kafka] Topic check notice:', err instanceof Error ? err.message : err);
  } finally {
    await admin.disconnect().catch(() => {});
  }
}

export async function initKafkaProducer(): Promise<boolean> {
  const kafka = getKafkaClient();
  if (!kafka) return false;
  try {
    if (!producer) {
      producer = kafka.producer({ allowAutoTopicCreation: true });
    }
    await producer.connect();
    connected = true;
    lastKafkaError = null;
    await ensureKafkaTopics();
    return true;
  } catch (err) {
    lastKafkaError = err instanceof Error ? err.message : 'Kafka producer connection failed';
    connected = false;
    return false;
  }
}

export async function publishKafkaEvent<T>(
  topic: KafkaTopic,
  key: string,
  event: ShelfSyncEvent<T>
): Promise<{ delivered: boolean; brokerAck: boolean; error?: string }> {
  if (!isKafkaConfigured()) {
    return {
      delivered: false,
      brokerAck: false,
      error: 'KAFKA_BROKERS not configured',
    };
  }

  try {
    if (!producer || !connected) {
      const ok = await initKafkaProducer();
      if (!ok || !producer) {
        return {
          delivered: false,
          brokerAck: false,
          error: lastKafkaError || 'Kafka producer unavailable',
        };
      }
    }
    await producer.send({
      topic,
      messages: [
        {
          key,
          value: JSON.stringify(event),
          headers: {
            'event-id': event.eventId,
            'event-type': event.eventType,
          },
        },
      ],
    });
    return { delivered: true, brokerAck: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Kafka send failed';
    lastKafkaError = msg;
    return { delivered: false, brokerAck: false, error: msg };
  }
}

export type EventProcessor = (topic: string, event: ShelfSyncEvent) => Promise<void>;

export async function startKafkaConsumer(processor: EventProcessor): Promise<boolean> {
  const kafka = getKafkaClient();
  if (!kafka) return false;

  try {
    consumer = kafka.consumer({ groupId: env.kafkaGroupId });
    await consumer.connect();

    const topicsToConsume: KafkaTopic[] = [
      KAFKA_TOPICS.ORDER_PLACED,
      KAFKA_TOPICS.INVENTORY_UPDATED,
      KAFKA_TOPICS.PAYMENT_UPDATED,
      KAFKA_TOPICS.ORDER_STATUS_UPDATED,
      KAFKA_TOPICS.NOTIFICATION_REQUESTED,
    ];

    for (const topic of topicsToConsume) {
      await consumer.subscribe({ topic, fromBeginning: false });
    }

    await consumer.run({
      eachMessage: async ({ topic, message }) => {
        if (!message.value) return;
        const raw = message.value.toString('utf8');
        let parsed: ShelfSyncEvent;
        try {
          parsed = JSON.parse(raw) as ShelfSyncEvent;
        } catch {
          console.error('[Aiven Kafka] Invalid JSON payload on topic', topic);
          return;
        }

        let attempt = 0;
        const maxAttempts = 3;
        while (attempt < maxAttempts) {
          try {
            await processor(topic, parsed);
            return;
          } catch (err) {
            attempt++;
            if (attempt >= maxAttempts) {
              console.error(`[Aiven Kafka] Sending event ${parsed.eventId} to DLQ after 3 attempts:`, err);
              await publishKafkaEvent(KAFKA_TOPICS.DLQ, parsed.eventId, {
                eventId: `dlq-${parsed.eventId}`,
                eventType: 'dead_letter',
                occurredAt: new Date().toISOString(),
                source: 'shelfsync-api',
                payload: {
                  originalTopic: topic,
                  originalEvent: parsed,
                  error: err instanceof Error ? err.message : 'Consumer processing failed',
                },
              });
            } else {
              await new Promise((r) => setTimeout(r, 250 * attempt));
            }
          }
        }
      },
    });

    return true;
  } catch (err) {
    lastKafkaError = err instanceof Error ? err.message : 'Kafka consumer startup failed';
    return false;
  }
}

export async function getKafkaStatus(): Promise<{
  status: 'connected' | 'unconfigured' | 'error';
  message: string;
}> {
  if (!isKafkaConfigured()) {
    return {
      status: 'unconfigured',
      message: 'KAFKA_BROKERS not configured. Outbox events stay queued until Aiven Kafka credentials are supplied.',
    };
  }
  if (connected) {
    return {
      status: 'connected',
      message: `Connected to Aiven Kafka (${env.kafkaBrokers.join(', ')}).`,
    };
  }
  const ok = await initKafkaProducer();
  if (ok) {
    return {
      status: 'connected',
      message: `Connected to Aiven Kafka (${env.kafkaBrokers.join(', ')}).`,
    };
  }
  return {
    status: 'error',
    message: lastKafkaError || 'Unable to connect to Aiven Kafka.',
  };
}
