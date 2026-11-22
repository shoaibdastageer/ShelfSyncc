import { Router } from 'express';
import { z } from 'zod';
import { repo } from '../db/repository';
import { searchService } from '../services/searchService';
import { requireAuth } from '../middleware/auth';
import { aiAssistantService } from '../services/aiAssistantService';

const router = Router();

router.get('/categories', async (_req, res, next) => {
  try {
    const categories = await repo.listCategories();
    res.json({ categories });
  } catch (err) {
    next(err);
  }
});

router.get('/warehouses', async (_req, res, next) => {
  try {
    const warehouses = await repo.listWarehouses();
    res.json({ warehouses });
  } catch (err) {
    next(err);
  }
});

router.get('/products', async (req, res, next) => {
  try {
    const section = typeof req.query.section === 'string' ? req.query.section : undefined;
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    let products = await repo.listProducts(false);
    if (category) {
      products = products.filter((p) => p.categorySlug === category);
    }
    if (section === 'featured') products = products.filter((p) => p.isFeatured);
    else if (section === 'bestsellers') products = products.filter((p) => p.isBestseller);
    else if (section === 'trending') products = products.filter((p) => p.isTrending);
    else if (section === 'new') products = products.filter((p) => p.isNewArrival);
    else if (section === 'deals') products = products.filter((p) => p.discountPercent >= 25);

    res.json({ products, total: products.length });
  } catch (err) {
    next(err);
  }
});

router.get('/products/:slug', async (req, res, next) => {
  try {
    const product = await repo.getProductBySlug(req.params.slug);
    if (!product || !product.isActive) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }
    const reviews = await repo.listProductReviews(product.id);
    const related = (await repo.listProducts(false))
      .filter((p) => p.categorySlug === product.categorySlug && p.id !== product.id)
      .slice(0, 4);
    res.json({ product, reviews, related });
  } catch (err) {
    next(err);
  }
});

router.post('/products/:id/reviews', requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      rating: z.number().int().min(1).max(5),
      title: z.string().min(2).max(150),
      comment: z.string().min(5).max(2000),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid review.' });
      return;
    }
    const review = await repo.addProductReview({
      productId: String(req.params.id),
      userId: req.auth!.userId,
      ...parsed.data,
    });
    res.status(201).json({ review });
  } catch (err) {
    next(err);
  }
});

router.get('/search', async (req, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const category = typeof req.query.category === 'string' && req.query.category ? req.query.category : undefined;
    const brand = typeof req.query.brand === 'string' && req.query.brand ? req.query.brand : undefined;
    const city = typeof req.query.city === 'string' && req.query.city ? req.query.city : undefined;
    const minPrice = req.query.minPrice ? Number(req.query.minPrice) : undefined;
    const maxPrice = req.query.maxPrice ? Number(req.query.maxPrice) : undefined;
    const minRating = req.query.minRating ? Number(req.query.minRating) : undefined;
    const inStockOnly = req.query.inStockOnly === 'true';
    const sort = typeof req.query.sort === 'string' ? (req.query.sort as never) : 'relevance';
    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 24;

    const result = await searchService.searchProducts({
      q,
      category,
      brand,
      city,
      minPrice: Number.isFinite(minPrice) ? minPrice : undefined,
      maxPrice: Number.isFinite(maxPrice) ? maxPrice : undefined,
      minRating: Number.isFinite(minRating) ? minRating : undefined,
      inStockOnly,
      sort,
      page,
      limit,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/search/autocomplete', async (req, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const result = await searchService.autocomplete(q);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ShelfSync AI Assistant endpoint (Product Discovery only)
router.post('/assistant/discover', async (req, res, next) => {
  try {
    const message = String(req.body?.message || '').trim();
    if (!message) {
      res.status(400).json({ error: 'Please enter a product discovery question.' });
      return;
    }
    const reply = await aiAssistantService.handleDiscoveryQuery(message);
    res.json(reply);
  } catch (err) {
    next(err);
  }
});

export default router;
