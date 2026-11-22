import crypto from 'node:crypto';
import { repo } from '../db/repository';
import {
  KAFKA_TOPICS,
  initKafkaProducer,
  isKafkaConfigured,
  publishKafkaEvent,
  startKafkaConsumer,
  type ShelfSyncEvent,
} from '../kafka/kafkaService';
import { searchService } from './searchService';
import { whatsappService } from './whatsappService';
import type { Order } from '../types/domain';

async function processEventLocally(topic: string, event: ShelfSyncEvent): Promise<void> {
  const claimed = await repo.claimEventProcessing(event.eventId, topic, 'shelfsync-workers');
  if (!claimed) {
    // Idempotency guarantee: already processed
    return;
  }

  const payload = event.payload as Record<string, unknown>;

  switch (topic) {
    case KAFKA_TOPICS.ORDER_PLACED: {
      const items = (payload.items as Array<{ productId: string; quantity: number }>) || [];
      for (const item of items) {
        const prod = await repo.getProductById(item.productId);
        if (prod) {
          await searchService.syncProductToIndex(prod);
          await publishAndProcess(KAFKA_TOPICS.INVENTORY_UPDATED, prod.id, 'inventory.reserved_or_deducted', {
            productId: prod.id,
            sku: prod.sku,
            availableQuantity: prod.availableQuantity,
          });
        }
      }
      if (payload.paymentMethod === 'cod' && payload.orderId) {
        const order = await repo.getOrderById(String(payload.orderId));
        if (order) {
          await publishAndProcess(KAFKA_TOPICS.NOTIFICATION_REQUESTED, order.orderNumber, 'notification.order_confirmed', {
            orderId: order.id,
            eventType: 'payment_confirmed',
          });
        }
      }
      break;
    }

    case KAFKA_TOPICS.INVENTORY_UPDATED: {
      const productId = String(payload.productId || '');
      if (productId) {
        const prod = await repo.getProductById(productId);
        if (prod) {
          await searchService.syncProductToIndex(prod);
        }
      }
      break;
    }

    case KAFKA_TOPICS.PAYMENT_UPDATED: {
      const orderId = String(payload.orderId || '');
      const status = String(payload.status || '');
      if (orderId && status === 'paid') {
        const order = await repo.getOrderById(orderId);
        if (order) {
          for (const item of order.items) {
            const prod = await repo.getProductById(item.productId);
            if (prod) {
              await searchService.syncProductToIndex(prod);
            }
          }
          await publishAndProcess(KAFKA_TOPICS.NOTIFICATION_REQUESTED, order.orderNumber, 'notification.payment_confirmed', {
            orderId: order.id,
            eventType: 'payment_confirmed',
          });
        }
      }
      break;
    }

    case KAFKA_TOPICS.ORDER_STATUS_UPDATED: {
      const orderId = String(payload.orderId || '');
      if (orderId) {
        await publishAndProcess(KAFKA_TOPICS.NOTIFICATION_REQUESTED, orderId, 'notification.status_updated', {
          orderId,
          eventType: 'status_updated',
        });
      }
      break;
    }

    case KAFKA_TOPICS.NOTIFICATION_REQUESTED: {
      const orderId = String(payload.orderId || '');
      const eventType = payload.eventType === 'payment_confirmed' ? 'payment_confirmed' : 'status_updated';
      if (orderId) {
        const order: Order | null = await repo.getOrderById(orderId);
        if (order) {
          await whatsappService.sendOrderNotification(order, eventType);
        }
      }
      break;
    }

    default:
      break;
  }
}

export async function publishAndProcess<T extends Record<string, unknown>>(
  topic: (typeof KAFKA_TOPICS)[keyof typeof KAFKA_TOPICS],
  key: string,
  eventType: string,
  payload: T,
  outboxId?: string
): Promise<{ kafkaDelivered: boolean }> {
  const event: ShelfSyncEvent<T> = {
    eventId: `${eventType}:${key}:${crypto.randomUUID()}`,
    eventType,
    occurredAt: new Date().toISOString(),
    source: 'shelfsync-api',
    payload,
  };

  if (isKafkaConfigured()) {
    const pubRes = await publishKafkaEvent(topic, key, event);
    if (pubRes.delivered) {
      if (outboxId) await repo.markOutboxPublished(outboxId);
      return { kafkaDelivered: true };
    }
    if (outboxId) {
      await repo.markOutboxFailed(outboxId, pubRes.error || 'Kafka publish error');
    }
  }

  // When Kafka is unconfigured (e.g. initial local preview), execute the exact same idempotent workflow in-process
  await processEventLocally(topic, event);
  return { kafkaDelivered: false };
}

export async function initEventWorkers(): Promise<void> {
  if (!isKafkaConfigured()) {
    return;
  }
  const ok = await initKafkaProducer();
  if (ok) {
    await startKafkaConsumer(async (topic, event) => {
      await processEventLocally(topic, event);
    });
  }
}
