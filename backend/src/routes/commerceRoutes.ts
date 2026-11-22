import { Router } from 'express';
import { z } from 'zod';
import { repo } from '../db/repository';
import { requireAuth } from '../middleware/auth';
import { calculateCheckoutTotals } from '../utils/pricing';
import { razorpayService } from '../services/razorpayService';
import { publishAndProcess } from '../services/eventOrchestrator';
import { KAFKA_TOPICS } from '../kafka/kafkaService';

const router = Router();

// CART
router.get('/cart', requireAuth, async (req, res, next) => {
  try {
    const cart = await repo.getUserCart(req.auth!.userId);
    res.json(cart);
  } catch (err) {
    next(err);
  }
});

router.post('/cart/items', requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      productId: z.string().min(1),
      quantity: z.number().int().min(1).max(20).default(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid cart item payload.' });
      return;
    }
    const cart = await repo.addToCart(req.auth!.userId, parsed.data.productId, parsed.data.quantity);
    res.json(cart);
  } catch (err) {
    if (err instanceof Error && err.message.includes('Only ')) {
      res.status(409).json({ error: err.message });
      return;
    }
    next(err);
  }
});

router.patch('/cart/items/:productId', requireAuth, async (req, res, next) => {
  try {
    const quantity = Number(req.body?.quantity);
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 50) {
      res.status(400).json({ error: 'Quantity must be an integer between 0 and 50.' });
      return;
    }
    const cart = await repo.setCartItem(req.auth!.userId, String(req.params.productId), quantity);
    res.json(cart);
  } catch (err) {
    if (err instanceof Error && err.message.includes('Only ')) {
      res.status(409).json({ error: err.message });
      return;
    }
    next(err);
  }
});

router.delete('/cart/items/:productId', requireAuth, async (req, res, next) => {
  try {
    const cart = await repo.setCartItem(req.auth!.userId, String(req.params.productId), 0);
    res.json(cart);
  } catch (err) {
    next(err);
  }
});

// WISHLIST
router.get('/wishlist', requireAuth, async (req, res, next) => {
  try {
    const items = await repo.getUserWishlist(req.auth!.userId);
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

router.post('/wishlist/toggle', requireAuth, async (req, res, next) => {
  try {
    const productId = String(req.body?.productId || '').trim();
    if (!productId) {
      res.status(400).json({ error: 'productId is required.' });
      return;
    }
    const result = await repo.toggleWishlist(req.auth!.userId, productId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// CHECKOUT QUOTE
router.post('/checkout/calculate', requireAuth, async (req, res, next) => {
  try {
    const promoCode = typeof req.body?.promoCode === 'string' ? req.body.promoCode : undefined;
    const cart = await repo.getUserCart(req.auth!.userId);
    const totals = calculateCheckoutTotals(
      cart.items.map((i) => ({
        productId: i.productId,
        unitPriceInr: i.priceInr,
        mrpInr: i.mrpInr,
        quantity: i.quantity,
      })),
      promoCode
    );
    res.json({ totals });
  } catch (err) {
    next(err);
  }
});

// PLACE ORDER (Atomic DB transaction + Razorpay Order Creation or COD)
const placeOrderSchema = z.object({
  paymentMethod: z.enum(['razorpay', 'cod']),
  promoCode: z.string().max(40).optional(),
  shippingName: z.string().min(2).max(120),
  shippingEmail: z.string().email(),
  shippingPhone: z.string().min(10).max(20),
  shippingAddress: z.string().min(5).max(400),
  shippingCity: z.string().min(2).max(100),
  shippingState: z.string().min(2).max(100),
  shippingPinCode: z.string().regex(/^\d{6}$/, 'Enter a valid 6-digit PIN code'),
  // Optional direct items override for API tests; defaults to user's persistent cart
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().min(1).max(20),
      })
    )
    .optional(),
});

router.post('/checkout/orders', requireAuth, async (req, res, next) => {
  try {
    const parsed = placeOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid checkout information.' });
      return;
    }

    const inputItems =
      parsed.data.items && parsed.data.items.length > 0
        ? parsed.data.items
        : (await repo.getUserCart(req.auth!.userId)).items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
          }));

    if (inputItems.length === 0) {
      res.status(400).json({ error: 'Your cart is empty.' });
      return;
    }

    // Check Razorpay config before reserving stock if user selected online payment
    if (parsed.data.paymentMethod === 'razorpay' && !razorpayService.getConfigSummary().configured) {
      res.status(503).json({
        error:
          'Razorpay credentials (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET) are not configured. Use Cash on Delivery or configure Razorpay sandbox keys.',
      });
      return;
    }

    const { order, outboxEvent } = await repo.placeOrderAtomic({
      userId: req.auth!.userId,
      items: inputItems,
      paymentMethod: parsed.data.paymentMethod,
      promoCode: parsed.data.promoCode,
      shippingName: parsed.data.shippingName,
      shippingEmail: parsed.data.shippingEmail,
      shippingPhone: parsed.data.shippingPhone,
      shippingAddress: parsed.data.shippingAddress,
      shippingCity: parsed.data.shippingCity,
      shippingState: parsed.data.shippingState,
      shippingPinCode: parsed.data.shippingPinCode,
    });

    // Publish order-placed event to Kafka + process idempotently
    await publishAndProcess(
      KAFKA_TOPICS.ORDER_PLACED,
      outboxEvent.eventKey,
      'order.placed',
      outboxEvent.payload,
      outboxEvent.id
    );

    if (parsed.data.paymentMethod === 'razorpay') {
      try {
        const rzpOrder = await razorpayService.createGatewayOrder({
          amountInr: order.totalInr,
          receiptOrderNumber: order.orderNumber,
          notes: {
            shelfsync_order_id: order.id,
            order_number: order.orderNumber,
          },
        });
        await repo.attachRazorpayOrderId(order.id, rzpOrder.providerOrderId);
        res.status(201).json({
          order,
          razorpay: rzpOrder,
        });
        return;
      } catch (rzpErr) {
        // Release reserved stock if Razorpay gateway order creation fails
        await repo.markRazorpayPaymentFailed(
          order.id,
          rzpErr instanceof Error ? rzpErr.message : 'Razorpay order creation failed'
        );
        res.status(502).json({
          error: rzpErr instanceof Error ? rzpErr.message : 'Unable to initiate Razorpay payment.',
        });
        return;
      }
    }

    res.status(201).json({ order });
  } catch (err) {
    if (err instanceof Error && err.message.includes('Insufficient stock')) {
      res.status(409).json({ error: err.message });
      return;
    }
    next(err);
  }
});

// PAYMENTS
router.get('/payments/config', (_req, res) => {
  res.json(razorpayService.getConfigSummary());
});

router.post('/payments/razorpay/verify', requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      orderId: z.string().min(1),
      razorpayOrderId: z.string().min(1),
      razorpayPaymentId: z.string().min(1),
      razorpaySignature: z.string().min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Missing Razorpay verification fields.' });
      return;
    }

    const existingOrder = await repo.getOrderById(parsed.data.orderId);
    if (!existingOrder || existingOrder.userId !== req.auth!.userId) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }

    const isValid = razorpayService.verifyCheckoutSignature(parsed.data);
    if (!isValid) {
      res.status(400).json({ error: 'Invalid Razorpay payment signature. Payment not confirmed.' });
      return;
    }

    const confirmed = await repo.confirmRazorpayPayment({
      orderId: existingOrder.id,
      razorpayOrderId: parsed.data.razorpayOrderId,
      razorpayPaymentId: parsed.data.razorpayPaymentId,
      razorpaySignature: parsed.data.razorpaySignature,
    });

    if (confirmed) {
      await publishAndProcess(KAFKA_TOPICS.PAYMENT_UPDATED, confirmed.orderNumber, 'payment.captured', {
        orderId: confirmed.id,
        orderNumber: confirmed.orderNumber,
        status: 'paid',
        providerPaymentId: parsed.data.razorpayPaymentId,
      });
    }

    res.json({ verified: true, order: confirmed });
  } catch (err) {
    next(err);
  }
});

router.post('/payments/razorpay/failed', requireAuth, async (req, res, next) => {
  try {
    const orderId = String(req.body?.orderId || '');
    const reason = String(req.body?.reason || 'Payment cancelled or failed by customer');
    const existing = await repo.getOrderById(orderId);
    if (!existing || existing.userId !== req.auth!.userId) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }
    const updated = await repo.markRazorpayPaymentFailed(orderId, reason);
    res.json({ order: updated });
  } catch (err) {
    next(err);
  }
});

// ORDERS & TRACKING
router.get('/orders', requireAuth, async (req, res, next) => {
  try {
    const orders = await repo.listUserOrders(req.auth!.userId);
    res.json({ orders });
  } catch (err) {
    next(err);
  }
});

router.get('/orders/:orderNumber', requireAuth, async (req, res, next) => {
  try {
    const order = await repo.getOrderByNumber(String(req.params.orderNumber));
    if (!order) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }
    if (order.userId !== req.auth!.userId && req.auth!.role !== 'admin') {
      res.status(403).json({ error: 'You do not have permission to view this order.' });
      return;
    }
    res.json({ order });
  } catch (err) {
    next(err);
  }
});

// Public secure tracking token endpoint (redacts customer email/phone/street address)
router.get('/track/:trackingToken', async (req, res, next) => {
  try {
    const order = await repo.getOrderByTrackingToken(String(req.params.trackingToken));
    if (!order) {
      res.status(404).json({ error: 'Invalid or unknown tracking link.' });
      return;
    }
    res.json({
      tracking: {
        orderNumber: order.orderNumber,
        status: order.status,
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        totalInr: order.totalInr,
        destinationCity: `${order.shippingCity}, ${order.shippingState}`,
        shipment: order.shipment,
        trackingEvents: order.trackingEvents || [],
        items: order.items.map((i) => ({
          productName: i.productName,
          quantity: i.quantity,
          lineTotalInr: i.lineTotalInr,
        })),
        createdAt: order.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
