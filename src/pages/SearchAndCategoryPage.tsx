import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { SlidersHorizontal } from 'lucide-react';
import { apiFetch } from '@/src/lib/api';
import { formatInr } from '@/src/lib/utils';
import type { Category, SearchResponse } from '@/src/types/shop';
import { ProductCard } from '@/src/components/ProductCard';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';

export function SearchAndCategoryPage() {
  const { slug } = useParams<{ slug?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const [q, setQ] = useState(searchParams.get('q') || '');
  const [brand, setBrand] = useState(searchParams.get('brand') || '');
  const [city, setCity] = useState(searchParams.get('city') || '');
  const [minPrice, setMinPrice] = useState(searchParams.get('minPrice') || '');
  const [maxPrice, setMaxPrice] = useState(searchParams.get('maxPrice') || '');
  const [minRating, setMinRating] = useState(searchParams.get('minRating') || '');
  const [inStockOnly, setInStockOnly] = useState(searchParams.get('inStockOnly') === 'true');
  const [sort, setSort] = useState(searchParams.get('sort') || 'relevance');

  const activeCategory = slug || searchParams.get('category') || '';

  useEffect(() => {
    setQ(searchParams.get('q') || '');
    setSort(searchParams.get('sort') || 'relevance');
  }, [searchParams]);

  const { data: catData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiFetch<{ categories: Category[] }>('/api/categories'),
  });

  const queryString = new URLSearchParams({
    ...(q ? { q } : {}),
    ...(activeCategory ? { category: activeCategory } : {}),
    ...(brand ? { brand } : {}),
    ...(city ? { city } : {}),
    ...(minPrice ? { minPrice } : {}),
    ...(maxPrice ? { maxPrice } : {}),
    ...(minRating ? { minRating } : {}),
    ...(inStockOnly ? { inStockOnly: 'true' } : {}),
    sort,
  }).toString();

  const { data, isLoading } = useQuery({
    queryKey: ['search', queryString],
    queryFn: () => apiFetch<SearchResponse>(`/api/search?${queryString}`),
  });

  const currentCategory = catData?.categories.find((c) => c.slug === activeCategory);

  const clearAllFilters = () => {
    setBrand('');
    setCity('');
    setMinPrice('');
    setMaxPrice('');
    setMinRating('');
    setInStockOnly(false);
    setSort('relevance');
    if (!slug) {
      setQ('');
      setSearchParams({});
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">
            {currentCategory ? 'Category Catalogue' : 'Intelligent Catalogue Search'}
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-slate-900 sm:text-3xl">
            {currentCategory
              ? currentCategory.name
              : q
                ? `Results for "${q}"`
                : 'All ShelfSync Products'}
          </h1>
          {currentCategory?.description && (
            <p className="mt-1.5 max-w-2xl text-sm text-slate-600">{currentCategory.description}</p>
          )}
          {data?.parsedIntent?.maxPrice && (
            <p className="mt-2 text-xs font-medium text-blue-600">
              Budget filter detected from query: under {formatInr(data.parsedIntent.maxPrice)}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-slate-500 tabular-nums">
            {data
              ? `${data.total} ${data.total === 1 ? 'product' : 'products'}${data.engine === 'opensearch' ? ' · OpenSearch' : ''}`
              : 'Loading...'}
          </span>
          <label htmlFor="sort-select" className="sr-only">
            Sort products
          </label>
          <select
            id="sort-select"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
          >
            <option value="relevance">Relevance</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="rating_desc">Top Rated</option>
            <option value="newest">Newest Arrivals</option>
          </select>
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-12">
        {/* Facet Filters Sidebar */}
        <aside className="lg:col-span-3 space-y-6">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-5 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-slate-900">
                <SlidersHorizontal className="h-4 w-4 text-blue-600" />
                Filters
              </h2>
              <button
                type="button"
                onClick={clearAllFilters}
                className="text-xs font-medium text-blue-600 hover:underline cursor-pointer"
              >
                Reset
              </button>
            </div>

            {!slug && data?.facets.categories && (
              <div>
                <label htmlFor="filter-category" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Category
                </label>
                <select
                  id="filter-category"
                  value={activeCategory}
                  onChange={(e) => {
                    const next = new URLSearchParams(searchParams);
                    if (e.target.value) next.set('category', e.target.value);
                    else next.delete('category');
                    setSearchParams(next);
                  }}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm"
                >
                  <option value="">All Categories</option>
                  {data.facets.categories.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name} ({c.count})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label htmlFor="filter-brand" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Brand
              </label>
              <select
                id="filter-brand"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm"
              >
                <option value="">All Brands</option>
                {data?.facets.brands.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name} ({b.count})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="block text-xs font-semibold text-slate-700 mb-1.5">Price Range (₹)</span>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  placeholder="Min ₹"
                  aria-label="Minimum price in INR"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  className="h-9"
                />
                <Input
                  type="number"
                  placeholder="Max ₹"
                  aria-label="Maximum price in INR"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>

            <div>
              <label htmlFor="filter-rating" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Minimum Rating
              </label>
              <select
                id="filter-rating"
                value={minRating}
                onChange={(e) => setMinRating(e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm"
              >
                <option value="">Any Rating</option>
                <option value="4.5">4.5★ &amp; above</option>
                <option value="4">4.0★ &amp; above</option>
              </select>
            </div>

            <div>
              <label htmlFor="filter-city" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Warehouse City
              </label>
              <select
                id="filter-city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm"
              >
                <option value="">All Hubs</option>
                {data?.facets.cities.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name} ({c.count})
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={inStockOnly}
                onChange={(e) => setInStockOnly(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
              />
              In-stock items only
            </label>
          </div>
        </aside>

        {/* Results Grid */}
        <div className="lg:col-span-9">
          {isLoading ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div key={idx} className="h-80 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
              ))}
            </div>
          ) : data && data.products.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {data.products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-12 text-center">
              <h3 className="font-display text-lg font-semibold text-slate-900">
                No matching products found
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                Try relaxing your price filter or search for another brand or category.
              </p>
              <Button onClick={clearAllFilters} className="mt-5">
                Clear All Filters
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
