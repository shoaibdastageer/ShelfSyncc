import type { Product, SearchFilters } from '../types/domain';
import { parseNaturalSearchQuery } from './pricing';

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

const SYNONYMS: Record<string, string[]> = {
  earphones: ['earbuds', 'headphones', 'tws', 'audio'],
  earbuds: ['earphones', 'headphones', 'tws'],
  headphones: ['earphones', 'earbuds', 'anc', 'audio'],
  phone: ['smartwatch', 'earbuds', 'electronics'],
  laptop: ['ultrabook', 'notebook', 'vivobook'],
  shoes: ['sneakers', 'running', 'trainers'],
  gift: ['grooming', 'watch', 'coffee', 'kettle', 'headphones'],
  father: ['grooming', 'watch', 'coffee', 'shirt', 'linen'],
  students: ['ultrabook', 'laptop', 'headphones', 'earbuds'],
};

function scoreTokenMatch(queryToken: string, candidateText: string): number {
  const words = candidateText.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (words.some((w) => w === queryToken)) return 10;
  if (words.some((w) => w.startsWith(queryToken))) return 8;
  if (candidateText.toLowerCase().includes(queryToken)) return 6;

  // Typo tolerance (Levenshtein distance <= 2 for words >= 4 chars)
  const maxDist = queryToken.length >= 6 ? 2 : 1;
  for (const w of words) {
    if (Math.abs(w.length - queryToken.length) <= maxDist) {
      if (levenshtein(queryToken, w) <= maxDist) {
        return 5;
      }
    }
  }

  // Synonym expansion
  const syns = SYNONYMS[queryToken] || [];
  for (const syn of syns) {
    if (words.some((w) => w.includes(syn))) return 4;
  }

  return 0;
}

export function filterAndRankProducts(
  allProducts: Product[],
  filters: SearchFilters
): {
  products: Product[];
  total: number;
  parsedIntent: { cleanedQuery: string; minPrice?: number; maxPrice?: number };
  facets: {
    categories: Array<{ name: string; slug: string; count: number }>;
    brands: Array<{ name: string; count: number }>;
    cities: Array<{ name: string; count: number }>;
  };
} {
  const parsed = parseNaturalSearchQuery(filters.q || '');
  const effectiveMin = filters.minPrice ?? parsed.minPrice;
  const effectiveMax = filters.maxPrice ?? parsed.maxPrice;

  const active = allProducts.filter((p) => p.isActive);

  // Build facets from active catalog
  const catMap = new Map<string, { name: string; slug: string; count: number }>();
  const brandMap = new Map<string, number>();
  const cityMap = new Map<string, number>();

  for (const p of active) {
    const existingCat = catMap.get(p.categorySlug);
    if (existingCat) existingCat.count++;
    else catMap.set(p.categorySlug, { name: p.categoryName, slug: p.categorySlug, count: 1 });

    brandMap.set(p.brand, (brandMap.get(p.brand) || 0) + 1);
    cityMap.set(p.warehouseCity, (cityMap.get(p.warehouseCity) || 0) + 1);
  }

  const tokens = parsed.cleanedQuery
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !['for', 'with', 'good', 'show', 'me', 'need', 'find', 'suggest', 'best'].includes(t));

  let scored = active
    .map((product) => {
      let score = 0;
      if (tokens.length === 0) {
        score = 1;
      } else {
        const titleField = `${product.name} ${product.brand}`;
        const bodyField = `${product.categoryName} ${product.shortDescription} ${product.description}`;
        let matchedCount = 0;
        for (const tok of tokens) {
          const titleScore = scoreTokenMatch(tok, titleField) * 2;
          const bodyScore = scoreTokenMatch(tok, bodyField);
          const best = Math.max(titleScore, bodyScore);
          if (best > 0) {
            matchedCount++;
            score += best;
          }
        }
        if (matchedCount === 0) score = 0;
      }
      return { product, score };
    })
    .filter((item) => item.score > 0);

  // Apply structured filters
  scored = scored.filter(({ product }) => {
    if (filters.category && product.categorySlug !== filters.category) return false;
    if (filters.brand && product.brand.toLowerCase() !== filters.brand.toLowerCase()) return false;
    if (filters.city && product.warehouseCity.toLowerCase() !== filters.city.toLowerCase()) return false;
    if (filters.inStockOnly && product.availableQuantity <= 0) return false;
    if (filters.minRating !== undefined && product.ratingAvg < filters.minRating) return false;
    if (effectiveMin !== undefined && product.priceInr < effectiveMin) return false;
    if (effectiveMax !== undefined && product.priceInr > effectiveMax) return false;
    return true;
  });

  // Sort
  scored.sort((a, b) => {
    switch (filters.sort) {
      case 'price_asc':
        return a.product.priceInr - b.product.priceInr;
      case 'price_desc':
        return b.product.priceInr - a.product.priceInr;
      case 'rating_desc':
        return b.product.ratingAvg - a.product.ratingAvg;
      case 'newest':
        return new Date(b.product.createdAt).getTime() - new Date(a.product.createdAt).getTime();
      default:
        return b.score - a.score || b.product.ratingAvg - a.product.ratingAvg;
    }
  });

  const total = scored.length;
  const page = Math.max(1, filters.page || 1);
  const limit = Math.min(50, Math.max(1, filters.limit || 24));
  const start = (page - 1) * limit;
  const products = scored.slice(start, start + limit).map((s) => s.product);

  return {
    products,
    total,
    parsedIntent: parsed,
    facets: {
      categories: Array.from(catMap.values()),
      brands: Array.from(brandMap.entries()).map(([name, count]) => ({ name, count })),
      cities: Array.from(cityMap.entries()).map(([name, count]) => ({ name, count })),
    },
  };
}
