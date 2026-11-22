import { Client } from '@opensearch-project/opensearch';
import { env } from '../config/env';
import type { Product, SearchFilters } from '../types/domain';
import { parseNaturalSearchQuery } from '../utils/pricing';

let client: Client | null = null;
let lastOpenSearchError: string | null = null;

export function isOpenSearchConfigured(): boolean {
  return Boolean(env.opensearchUrl);
}

export function getOpenSearchClient(): Client | null {
  if (!env.opensearchUrl) return null;
  if (!client) {
    client = new Client({
      node: env.opensearchUrl,
      auth:
        env.opensearchUsername && env.opensearchPassword
          ? {
              username: env.opensearchUsername,
              password: env.opensearchPassword,
            }
          : undefined,
      ssl: {
        rejectUnauthorized: false,
      },
    });
  }
  return client;
}

export async function pingOpenSearch(): Promise<{
  status: 'connected' | 'unconfigured' | 'error';
  message: string;
}> {
  if (!isOpenSearchConfigured()) {
    return {
      status: 'unconfigured',
      message: 'OPENSEARCH_URL not configured. Search queries fall back to database matching until Aiven OpenSearch is supplied.',
    };
  }
  try {
    const os = getOpenSearchClient()!;
    await os.cluster.health();
    lastOpenSearchError = null;
    return {
      status: 'connected',
      message: `Connected to Aiven OpenSearch index "${env.opensearchIndex}".`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'OpenSearch health check failed';
    lastOpenSearchError = msg;
    return {
      status: 'error',
      message: msg,
    };
  }
}

export async function ensureOpenSearchIndex(): Promise<boolean> {
  const os = getOpenSearchClient();
  if (!os) return false;

  const indexName = env.opensearchIndex;
  const exists = await os.indices.exists({ index: indexName });
  if (exists.body) {
    return true;
  }

  await os.indices.create({
    index: indexName,
    body: {
      settings: {
        number_of_shards: 1,
        number_of_replicas: 0,
        analysis: {
          filter: {
            autocomplete_filter: {
              type: 'edge_ngram',
              min_gram: 2,
              max_gram: 20,
            },
          },
          analyzer: {
            autocomplete_analyzer: {
              type: 'custom',
              tokenizer: 'standard',
              filter: ['lowercase', 'autocomplete_filter'],
            },
          },
        },
      },
      mappings: {
        properties: {
          id: { type: 'keyword' },
          sku: { type: 'keyword' },
          name: {
            type: 'text',
            analyzer: 'standard',
            fields: {
              autocomplete: {
                type: 'text',
                analyzer: 'autocomplete_analyzer',
                search_analyzer: 'standard',
              },
              keyword: { type: 'keyword' },
            },
          },
          slug: { type: 'keyword' },
          brand: {
            type: 'text',
            fields: { keyword: { type: 'keyword' } },
          },
          categoryName: {
            type: 'text',
            fields: { keyword: { type: 'keyword' } },
          },
          categorySlug: { type: 'keyword' },
          shortDescription: { type: 'text' },
          description: { type: 'text' },
          priceInr: { type: 'double' },
          mrpInr: { type: 'double' },
          discountPercent: { type: 'integer' },
          ratingAvg: { type: 'double' },
          reviewCount: { type: 'integer' },
          availableQuantity: { type: 'integer' },
          inStock: { type: 'boolean' },
          warehouseCity: { type: 'keyword' },
          isActive: { type: 'boolean' },
          createdAt: { type: 'date' },
        },
      },
    },
  });

  return true;
}

export function productToOpenSearchDoc(product: Product) {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    slug: product.slug,
    brand: product.brand,
    categoryName: product.categoryName,
    categorySlug: product.categorySlug,
    shortDescription: product.shortDescription,
    description: product.description,
    priceInr: product.priceInr,
    mrpInr: product.mrpInr,
    discountPercent: product.discountPercent,
    ratingAvg: product.ratingAvg,
    reviewCount: product.reviewCount,
    availableQuantity: product.availableQuantity,
    inStock: product.availableQuantity > 0,
    warehouseCity: product.warehouseCity,
    isActive: product.isActive,
    createdAt: product.createdAt,
  };
}

export async function indexProductInOpenSearch(product: Product): Promise<boolean> {
  const os = getOpenSearchClient();
  if (!os) return false;
  try {
    await ensureOpenSearchIndex();
    await os.index({
      index: env.opensearchIndex,
      id: product.id,
      body: productToOpenSearchDoc(product),
      refresh: true,
    });
    return true;
  } catch (err) {
    lastOpenSearchError = err instanceof Error ? err.message : 'OpenSearch index error';
    return false;
  }
}

export async function bulkIndexProductsOpenSearch(products: Product[]): Promise<number> {
  const os = getOpenSearchClient();
  if (!os || products.length === 0) return 0;
  await ensureOpenSearchIndex();

  const body: Record<string, unknown>[] = [];
  for (const product of products) {
    body.push({ index: { _index: env.opensearchIndex, _id: product.id } });
    body.push(productToOpenSearchDoc(product));
  }

  const res = await os.bulk({ body, refresh: true });
  if (res.body.errors) {
    console.warn('[Aiven OpenSearch] Bulk index reported partial item errors.');
  }
  return products.length;
}

export async function deleteProductFromOpenSearch(productId: string): Promise<boolean> {
  const os = getOpenSearchClient();
  if (!os) return false;
  try {
    await os.delete({
      index: env.opensearchIndex,
      id: productId,
      refresh: true,
    });
    return true;
  } catch {
    return false;
  }
}

export async function queryOpenSearch(filters: SearchFilters): Promise<{
  ids: string[];
  total: number;
  parsedIntent: { cleanedQuery: string; minPrice?: number; maxPrice?: number };
} | null> {
  const os = getOpenSearchClient();
  if (!os) return null;

  try {
    const parsed = parseNaturalSearchQuery(filters.q || '');
    const effectiveMin = filters.minPrice ?? parsed.minPrice;
    const effectiveMax = filters.maxPrice ?? parsed.maxPrice;

    const must: Record<string, unknown>[] = [];
    const filterClauses: Record<string, unknown>[] = [{ term: { isActive: true } }];

    if (parsed.cleanedQuery) {
      must.push({
        multi_match: {
          query: parsed.cleanedQuery,
          fields: ['name^4', 'brand^2', 'categoryName^2', 'shortDescription^1.5', 'description'],
          fuzziness: 'AUTO',
          prefix_length: 1,
          operator: 'or',
        },
      });
    }

    if (filters.category) {
      filterClauses.push({ term: { categorySlug: filters.category } });
    }
    if (filters.brand) {
      filterClauses.push({ term: { 'brand.keyword': filters.brand } });
    }
    if (filters.city) {
      filterClauses.push({ term: { warehouseCity: filters.city } });
    }
    if (filters.inStockOnly) {
      filterClauses.push({ term: { inStock: true } });
    }
    if (filters.minRating !== undefined) {
      filterClauses.push({ range: { ratingAvg: { gte: filters.minRating } } });
    }
    if (effectiveMin !== undefined || effectiveMax !== undefined) {
      const priceRange: Record<string, number> = {};
      if (effectiveMin !== undefined) priceRange.gte = effectiveMin;
      if (effectiveMax !== undefined) priceRange.lte = effectiveMax;
      filterClauses.push({ range: { priceInr: priceRange } });
    }

    let sort: Record<string, unknown>[] = [{ _score: 'desc' }, { ratingAvg: 'desc' }];
    if (filters.sort === 'price_asc') sort = [{ priceInr: 'asc' }];
    else if (filters.sort === 'price_desc') sort = [{ priceInr: 'desc' }];
    else if (filters.sort === 'rating_desc') sort = [{ ratingAvg: 'desc' }];
    else if (filters.sort === 'newest') sort = [{ createdAt: 'desc' }];

    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(50, Math.max(1, filters.limit || 24));
    const from = (page - 1) * limit;

    const response = await os.search({
      index: env.opensearchIndex,
      body: {
        from,
        size: limit,
        query: {
          bool: {
            must: must.length > 0 ? must : [{ match_all: {} }],
            filter: filterClauses,
          },
        },
        sort,
      },
    });

    const hits = (response.body.hits?.hits || []) as Array<{ _id?: string; _source?: { id?: string } }>;
    const totalVal =
      typeof response.body.hits?.total === 'number'
        ? response.body.hits.total
        : response.body.hits?.total?.value || hits.length;

    return {
      ids: hits.map((h) => String(h._id || h._source?.id || '')).filter(Boolean),
      total: totalVal,
      parsedIntent: parsed,
    };
  } catch (err) {
    lastOpenSearchError = err instanceof Error ? err.message : 'OpenSearch query error';
    console.warn('[Aiven OpenSearch] Query fallback triggered:', lastOpenSearchError);
    return null;
  }
}

export async function autocompleteOpenSearch(prefix: string): Promise<Array<{ id: string; name: string; slug: string; priceInr: number }> | null> {
  const os = getOpenSearchClient();
  if (!os || !prefix.trim()) return null;

  try {
    const response = await os.search({
      index: env.opensearchIndex,
      body: {
        size: 6,
        query: {
          bool: {
            must: [
              {
                multi_match: {
                  query: prefix.trim(),
                  fields: ['name.autocomplete^3', 'name^2', 'brand'],
                  fuzziness: 'AUTO',
                },
              },
            ],
            filter: [{ term: { isActive: true } }],
          },
        },
        _source: ['id', 'name', 'slug', 'priceInr'],
      },
    });

    const hits = (response.body.hits?.hits || []) as Array<{
      _source?: { id: string; name: string; slug: string; priceInr: number };
    }>;
    return hits
      .map((h) => h._source)
      .filter((s): s is { id: string; name: string; slug: string; priceInr: number } => Boolean(s));
  } catch {
    return null;
  }
}
