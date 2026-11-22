import { Router } from 'express';
import { z } from 'zod';
import { repo } from '../db/repository';
import { requireAdmin, requireAuth } from '../middleware/auth';
import { searchService } from '../services/searchService';
import { publishAndProcess } from '../services/eventOrchestrator';
import { KAFKA_TOPICS } from '../kafka/kafkaService';
import { bulkIndexProductsOpenSearch, isOpenSearchConfigured } from '../opensearch/opensearchService';
import type { OrderStatus } from '../types/domain';

const router = Router();

router.use('/admin', requireAuth, requireAdmin);

router.get('/admin/overview', async (_req, res, next) => {
  try {
    const stats = await repo.getAdminStats();
    const products = await repo.listProducts(true);
    const orders = await repo.listAllOrders();
    const notifications = await repo.listNotificationLogs();

    const lowStockProducts = products.filter((p) => p.isActive && p.availableQuantity <= p.lowStockThreshold);
    const bestSellers = [...products]
      .filter((p) => p.isActive)
      .sort((a, b) => b.reviewCount - a.reviewCount)
      .slice(0, 5);

    res.json({
      stats,
      lowStockProducts,
      bestSellers,
      recentOrders: orders.slice(0, 10),
      recentNotifications: notifications.slice(0, 10),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/admin/products', async (_req, res, next) => {
  try {
    const products = await repo.listProducts(true);
    res.json({ products });
  } catch (err) {
    next(err);
  }
});

router.post('/admin/products', async (req, res, next) => {
  try {
    const schema = z.object({
      sku: z.string().min(3).max(64),
      name: z.string().min(3).max(255),
      slug: z.string().min(3).max(255).optional(),
      brand: z.string().min(2).max(120),
      categoryId: z.string().min(1),
      shortDescription: z.string().min(5).max(500),
      description: z.string().min(10).max(4000),
      priceInr: z.number().positive(),
      mrpInr: z.number().positive(),
      stockQuantity: z.number().int().min(0),
      lowStockThreshold: z.number().int().min(0).default(5),
      warehouseId: z.string().optional(),
      imageUrl: z.string().min(1).default('/src/assets/images/prod_anc_headphones_1795304714348.jpg'),
      isFeatured: z.boolean().optional(),
      isTrending: z.boolean().optional(),
      isNewArrival: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid product payload.' });
      return;
    }

    const slug =
      parsed.data.slug ||
      parsed.data.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') +
        '-' +
        Math.floor(100 + Math.random() * 900);

    const product = await repo.createProduct({
      ...parsed.data,
      slug,
      mrpInr: Math.max(parsed.data.mrpInr, parsed.data.priceInr),
    });

    await searchService.syncProductToIndex(product);
    await publishAndProcess(KAFKA_TOPICS.INVENTORY_UPDATED, product.id, 'product.created', {
      productId: product.id,
      sku: product.sku,
      availableQuantity: product.availableQuantity,
    });

    res.status(201).json({ product });
  } catch (err) {
    next(err);
  }
});

router.patch('/admin/products/:id', async (req, res, next) => {
  try {
    const schema = z.object({
      name: z.string().min(2).max(255).optional(),
      brand: z.string().min(2).max(120).optional(),
      shortDescription: z.string().min(5).max(500).optional(),
      description: z.string().min(5).max(4000).optional(),
      priceInr: z.number().positive().optional(),
      mrpInr: z.number().positive().optional(),
      isActive: z.boolean().optional(),
      isFeatured: z.boolean().optional(),
      isTrending: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid product update fields.' });
      return;
    }
    const updated = await repo.updateProduct(String(req.params.id), parsed.data);
    if (!updated) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }
    if (updated.isActive) {
      await searchService.syncProductToIndex(updated);
    } else {
      await searchService.removeProductFromIndex(updated.id);
    }
    res.json({ product: updated });
  } catch (err) {
    next(err);
  }
});

router.delete('/admin/products/:id', async (req, res, next) => {
  try {
    const id = String(req.params.id);
    await repo.deleteProduct(id);
    await searchService.removeProductFromIndex(id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.patch('/admin/inventory/:productId', async (req, res, next) => {
  try {
    const stockQuantity = Number(req.body?.stockQuantity);
    if (!Number.isInteger(stockQuantity) || stockQuantity < 0) {
      res.status(400).json({ error: 'stockQuantity must be a non-negative integer.' });
      return;
    }
    const updated = await repo.updateProductStock(String(req.params.productId), stockQuantity);
    if (!updated) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }
    await publishAndProcess(KAFKA_TOPICS.INVENTORY_UPDATED, updated.id, 'inventory.updated', {
      productId: updated.id,
      sku: updated.sku,
      availableQuantity: updated.availableQuantity,
    });
    res.json({ product: updated });
  } catch (err) {
    next(err);
  }
});

router.post('/admin/categories', async (req, res, next) => {
  try {
    const schema = z.object({
      name: z.string().min(2).max(100),
      slug: z.string().min(2).max(100).optional(),
      description: z.string().min(3).max(500),
      imageUrl: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid category payload.' });
      return;
    }
    const slug =
      parsed.data.slug ||
      parsed.data.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    const category = await repo.createCategory({ ...parsed.data, slug });
    res.status(201).json({ category });
  } catch (err) {
    next(err);
  }
});

router.get('/admin/orders', async (_req, res, next) => {
  try {
    const orders = await repo.listAllOrders();
    res.json({ orders });
  } catch (err) {
    next(err);
  }
});

router.patch('/admin/orders/:orderId/status', async (req, res, next) => {
  try {
    const schema = z.object({
      status: z.enum([
        'pending_payment',
        'confirmed',
        'packed',
        'shipped',
        'out_for_delivery',
        'delivered',
        'delayed',
        'cancelled',
        'refunded',
      ]),
      location: z.string().max(120).optional(),
      description: z.string().max(300).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid order status payload.' });
      return;
    }
    const updated = await repo.updateOrderStatusAdmin(
      String(req.params.orderId),
      parsed.data.status as OrderStatus,
      parsed.data.location,
      parsed.data.description
    );
    if (!updated) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }

    await publishAndProcess(KAFKA_TOPICS.ORDER_STATUS_UPDATED, updated.orderNumber, 'order.status_updated', {
      orderId: updated.id,
      orderNumber: updated.orderNumber,
      status: updated.status,
    });

    res.json({ order: updated });
  } catch (err) {
    next(err);
  }
});

router.get('/admin/notifications', async (_req, res, next) => {
  try {
    const logs = await repo.listNotificationLogs();
    res.json({ logs });
  } catch (err) {
    next(err);
  }
});

router.post('/admin/opensearch/reindex', async (_req, res, next) => {
  try {
    if (!isOpenSearchConfigured()) {
      res.status(503).json({ error: 'OPENSEARCH_URL is not configured.' });
      return;
    }
    const products = await repo.listProducts(false);
    const count = await bulkIndexProductsOpenSearch(products);
    res.json({ ok: true, indexedCount: count });
  } catch (err) {
    next(err);
  }
});

export default router;
