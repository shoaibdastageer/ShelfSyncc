import { Router } from 'express';
import { env } from '../config/env';
import { repo } from '../db/repository';
import { razorpayService } from '../services/razorpayService';
import { aiAssistantService } from '../services/aiAssistantService';
import { whatsappService } from '../services/whatsappService';
import { publishAndProcess } from '../services/eventOrchestrator';
import { KAFKA_TOPICS } from '../kafka/kafkaService';
import { verifyWhatsAppWebhookSignature } from '../utils/crypto';

const router = Router();

/**
 * Razorpay Signed Webhook Handler
 * Handles duplicate webhook deliveries idempotently via processed_events
 */
router.post('/webhooks/razorpay', async (req, res, next) => {
  try {
    const signature = req.headers['x-razorpay-signature'] as string | undefined;
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body || {}));

    if (!env.razorpayWebhookSecret) {
      res.status(503).json({ error: 'RAZORPAY_WEBHOOK_SECRET is not configured.' });
      return;
    }

    const valid = razorpayService.verifyWebhookSignature(rawBody, signature);
    if (!valid) {
      res.status(401).json({ error: 'Invalid Razorpay webhook signature.' });
      return;
    }

    const eventType = String(req.body?.event || '');
    const paymentEntity = req.body?.payload?.payment?.entity;
    const rzpOrderId = String(paymentEntity?.order_id || '');
    const rzpPaymentId = String(paymentEntity?.id || '');
    const eventId = `rzp:${eventType}:${rzpPaymentId || rzpOrderId}`;

    const claimed = await repo.claimEventProcessing(eventId, 'razorpay-webhook', 'webhook-handler');
    if (!claimed) {
      res.json({ ok: true, duplicate: true });
      return;
    }

    if (rzpOrderId) {
      const orderId = await repo.findOrderIdByRazorpayOrderId(rzpOrderId);
      if (orderId) {
        if (eventType === 'payment.captured') {
          const confirmed = await repo.confirmRazorpayPayment({
            orderId,
            razorpayOrderId: rzpOrderId,
            razorpayPaymentId: rzpPaymentId,
            razorpaySignature: signature || 'webhook_verified',
            method: String(paymentEntity?.method || 'online'),
            rawPayload: req.body,
          });
          if (confirmed) {
            await publishAndProcess(KAFKA_TOPICS.PAYMENT_UPDATED, confirmed.orderNumber, 'payment.captured', {
              orderId: confirmed.id,
              orderNumber: confirmed.orderNumber,
              status: 'paid',
              providerPaymentId: rzpPaymentId,
            });
          }
        } else if (eventType === 'payment.failed') {
          await repo.markRazorpayPaymentFailed(
            orderId,
            String(paymentEntity?.error_description || 'Razorpay webhook payment.failed')
          );
        } else if (eventType === 'refund.processed') {
          await repo.updateOrderStatusAdmin(orderId, 'refunded', 'Razorpay Gateway', 'Refund processed by Razorpay.');
          await publishAndProcess(KAFKA_TOPICS.ORDER_STATUS_UPDATED, orderId, 'order.refunded', {
            orderId,
            status: 'refunded',
          });
        }
      }
    }

    res.json({ ok: true, processedEvent: eventType });
  } catch (err) {
    next(err);
  }
});

/**
 * Meta WhatsApp Cloud API Webhook Verification (GET)
 */
router.get('/webhooks/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === env.whatsappVerifyToken) {
    res.status(200).send(String(challenge || ''));
    return;
  }
  res.status(403).json({ error: 'WhatsApp webhook verification failed.' });
});

/**
 * Meta WhatsApp Cloud API Inbound Message Webhook (POST)
 * Processes incoming text queries via ShelfSync AI Assistant (Gemini + OpenSearch + PostgreSQL)
 */
router.post('/webhooks/whatsapp', async (req, res, next) => {
  try {
    if (env.whatsappAppSecret) {
      const sig = req.headers['x-hub-signature-256'] as string | undefined;
      const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body || {}));
      if (!verifyWhatsAppWebhookSignature(rawBody, sig, env.whatsappAppSecret)) {
        res.status(401).json({ error: 'Invalid WhatsApp X-Hub-Signature-256.' });
        return;
      }
    }

    const entries = (req.body?.entry as Array<Record<string, unknown>>) || [];
    const results: Array<{ from: string; messageId: string; status: string }> = [];

    for (const entry of entries) {
      const changes = (entry.changes as Array<{ value?: Record<string, unknown> }>) || [];
      for (const change of changes) {
        const messages =
          (change.value?.messages as Array<{ id: string; from: string; type: string; text?: { body: string } }>) ||
          [];

        for (const msg of messages) {
          if (msg.type !== 'text' || !msg.text?.body) continue;

          const claimed = await repo.claimEventProcessing(`wa-msg:${msg.id}`, 'whatsapp-webhook', 'ai-assistant');
          if (!claimed) continue;

          const aiReply = await aiAssistantService.handleDiscoveryQuery(msg.text.body);
          const log = await whatsappService.sendTextMessage({
            toPhone: msg.from,
            text: aiReply.replyText,
            templateName: 'shelfsync_ai_assistant_reply',
            dedupeKey: `wa:reply:${msg.id}`,
          });

          results.push({
            from: msg.from,
            messageId: msg.id,
            status: log?.status || 'logged',
          });
        }
      }
    }

    res.status(200).json({ ok: true, processed: results.length, results });
  } catch (err) {
    next(err);
  }
});

export default router;
