import { env } from '../config/env';
import { repo } from '../db/repository';
import type { NotificationLog, Order } from '../types/domain';
import { formatInr } from '../utils/pricing';

export function isWhatsAppConfigured(): boolean {
  return Boolean(env.whatsappAccessToken && env.whatsappPhoneNumberId);
}

function normalizeWhatsAppPhone(phone: string): string {
  const digits = phone.replace(/[^\d]/g, '');
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

export function buildOrderConfirmedMessage(order: Order): string {
  const trackingUrl = `${env.frontendUrl.replace(/\/$/, '')}/track/${order.trackingToken}`;
  return [
    `Hello ${order.shippingName}! Your payment of ${formatInr(order.totalInr)} was successful.`,
    '',
    `Your ShelfSync order #${order.orderNumber} has been confirmed.`,
    '',
    `Track your order: ${trackingUrl}`,
  ].join('\n');
}

export function buildOrderStatusMessage(order: Order): string {
  const trackingUrl = `${env.frontendUrl.replace(/\/$/, '')}/track/${order.trackingToken}`;
  const statusLabels: Record<string, string> = {
    confirmed: 'Order Confirmed',
    packed: 'Order Packed & Ready for Dispatch',
    shipped: 'Order Shipped',
    out_for_delivery: 'Out for Delivery Today',
    delivered: 'Delivered',
    delayed: 'Delivery Delayed — Updated ETA Available',
    cancelled: 'Order Cancelled',
    refunded: 'Refund Processed',
  };
  const label = statusLabels[order.status] || order.status;
  return [
    `ShelfSync Order Update (#${order.orderNumber}): ${label}.`,
    order.shipment?.awbNumber ? `AWB: ${order.shipment.awbNumber} (${order.shipment.carrier})` : '',
    `Track securely: ${trackingUrl}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export const whatsappService = {
  isConfigured(): boolean {
    return isWhatsAppConfigured();
  },

  async sendTextMessage(params: {
    toPhone: string;
    text: string;
    userId?: string | null;
    orderId?: string | null;
    templateName?: string;
    dedupeKey: string;
  }): Promise<NotificationLog | null> {
    const cleanPhone = normalizeWhatsAppPhone(params.toPhone);
    const templateName = params.templateName || 'text_message';

    if (!isWhatsAppConfigured()) {
      // Clearly labelled test_mode: never claims real WhatsApp delivery!
      return repo.recordNotificationLog({
        userId: params.userId ?? null,
        orderId: params.orderId ?? null,
        channel: 'whatsapp',
        recipientPhone: cleanPhone,
        templateName,
        messageBody: params.text,
        status: 'test_mode',
        providerMessageId: null,
        dedupeKey: params.dedupeKey,
        errorMessage: 'WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID not configured (logged in test_mode).',
        sentAt: null,
      });
    }

    const endpoint = `https://graph.facebook.com/v21.0/${env.whatsappPhoneNumberId}/messages`;
    let attempt = 0;
    let lastErr = '';

    while (attempt < 2) {
      attempt++;
      try {
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.whatsappAccessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: cleanPhone,
            type: 'text',
            text: { preview_url: true, body: params.text },
          }),
        });

        const data = (await resp.json()) as {
          messages?: Array<{ id: string }>;
          error?: { message?: string };
        };

        if (resp.ok && data.messages?.[0]?.id) {
          return repo.recordNotificationLog({
            userId: params.userId ?? null,
            orderId: params.orderId ?? null,
            channel: 'whatsapp',
            recipientPhone: cleanPhone,
            templateName,
            messageBody: params.text,
            status: 'sent',
            providerMessageId: data.messages[0].id,
            dedupeKey: params.dedupeKey,
            errorMessage: null,
            sentAt: new Date().toISOString(),
          });
        }

        lastErr = data.error?.message || `HTTP ${resp.status}`;
      } catch (err) {
        lastErr = err instanceof Error ? err.message : 'Network error calling WhatsApp Cloud API';
      }
      await new Promise((r) => setTimeout(r, 300));
    }

    return repo.recordNotificationLog({
      userId: params.userId ?? null,
      orderId: params.orderId ?? null,
      channel: 'whatsapp',
      recipientPhone: cleanPhone,
      templateName,
      messageBody: params.text,
      status: 'failed',
      providerMessageId: null,
      dedupeKey: params.dedupeKey,
      errorMessage: lastErr,
      sentAt: null,
    });
  },

  async sendOrderNotification(order: Order, eventType: 'payment_confirmed' | 'status_updated'): Promise<NotificationLog | null> {
    const user = await repo.findUserById(order.userId);
    if (user && !user.whatsappOptIn) {
      return null;
    }
    const phone = order.shippingPhone || user?.phone;
    if (!phone) return null;

    const dedupeKey =
      eventType === 'payment_confirmed'
        ? `wa:order:${order.id}:payment_confirmed`
        : `wa:order:${order.id}:status:${order.status}`;

    const text =
      eventType === 'payment_confirmed'
        ? buildOrderConfirmedMessage(order)
        : buildOrderStatusMessage(order);

    const templateName =
      eventType === 'payment_confirmed'
        ? env.whatsappTemplateOrderConfirmed
        : env.whatsappTemplateOrderStatus;

    return this.sendTextMessage({
      toPhone: phone,
      text,
      userId: order.userId,
      orderId: order.id,
      templateName,
      dedupeKey,
    });
  },
};
