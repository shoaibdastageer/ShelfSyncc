import { repo } from '../db/repository';
import {
  autocompleteOpenSearch,
  deleteProductFromOpenSearch,
  indexProductInOpenSearch,
  isOpenSearchConfigured,
  queryOpenSearch,
} from '../opensearch/opensearchService';
import type { Product, SearchFilters, SearchResult } from '../types/domain';
import { filterAndRankProducts } from '../utils/fuzzySearch';

export const searchService = {
  async searchProducts(filters: SearchFilters): Promise<SearchResult> {
    const allProducts = await repo.listProducts(false);
    const baseline = filterAndRankProducts(allProducts, filters);

    if (isOpenSearchConfigured()) {
      const osRes = await queryOpenSearch(filters);
      if (osRes) {
        const authoritative = await repo.getProductsByIds(osRes.ids);
        // Re-check active/stock from authoritative PostgreSQL
        const filteredAuth = authoritative.filter((p) => {
          if (!p.isActive) return false;
          if (filters.inStockOnly && p.availableQuantity <= 0) return false;
          return true;
        });
        return {
          products: filteredAuth,
          total: osRes.total,
          engine: 'opensearch',
          parsedIntent: osRes.parsedIntent,
          facets: baseline.facets,
        };
      }
    }

    return {
      products: baseline.products,
      total: baseline.total,
      engine: repo.mode() === 'postgresql' ? 'postgresql' : 'memory-fallback',
      parsedIntent: baseline.parsedIntent,
      facets: baseline.facets,
    };
  },

  async autocomplete(prefix: string): Promise<{
    suggestions: Array<{ id: string; name: string; slug: string; priceInr: number }>;
    engine: 'opensearch' | 'fallback';
  }> {
    if (isOpenSearchConfigured()) {
      const osHits = await autocompleteOpenSearch(prefix);
      if (osHits) {
        return { suggestions: osHits, engine: 'opensearch' };
      }
    }
    const all = await repo.listProducts(false);
    const matches = filterAndRankProducts(all, { q: prefix, limit: 6 }).products.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      priceInr: p.priceInr,
    }));
    return { suggestions: matches, engine: 'fallback' };
  },

  async syncProductToIndex(product: Product): Promise<boolean> {
    if (!isOpenSearchConfigured()) return false;
    return indexProductInOpenSearch(product);
  },

  async removeProductFromIndex(productId: string): Promise<boolean> {
    if (!isOpenSearchConfigured()) return false;
    return deleteProductFromOpenSearch(productId);
  },
};
