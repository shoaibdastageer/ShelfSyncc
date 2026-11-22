import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, MessageSquare, ShieldCheck, Truck } from 'lucide-react';
import { apiFetch } from '@/src/lib/api';
import type { Category, Product } from '@/src/types/shop';
import { ProductCard } from '@/src/components/ProductCard';
import { Button } from '@/src/components/ui/button';

type CollectionTab = 'featured' | 'bestsellers' | 'trending' | 'new' | 'deals';

const TABS: Array<{ id: CollectionTab; label: string }> = [
  { id: 'featured', label: 'Featured' },
  { id: 'bestsellers', label: 'Best Sellers' },
  { id: 'trending', label: 'Trending' },
  { id: 'new', label: 'New Arrivals' },
  { id: 'deals', label: 'Discount Offers' },
];

export function HomePage() {
  const [activeTab, setActiveTab] = useState<CollectionTab>('featured');

  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiFetch<{ categories: Category[] }>('/api/categories'),
  });

  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['products', 'all'],
    queryFn: () => apiFetch<{ products: Product[] }>('/api/products'),
  });

  const categories = categoriesData?.categories || [];
  const allProducts = productsData?.products || [];

  const visibleProducts = allProducts
    .filter((p) => {
      if (activeTab === 'featured') return p.isFeatured;
      if (activeTab === 'bestsellers') return p.isBestseller;
      if (activeTab === 'trending') return p.isTrending;
      if (activeTab === 'new') return p.isNewArrival;
      if (activeTab === 'deals') return p.discountPercent >= 25;
      return true;
    })
    .slice(0, 8);

  return (
    <div className="bg-white">
      {/* 1. Storefront Hero */}
      <section className="border-b border-slate-200 bg-slate-50/70">
        <div className="mx-auto grid max-w-7xl items-stretch gap-8 px-4 py-10 sm:px-6 lg:grid-cols-12 lg:py-14">
          <div className="flex flex-col justify-center lg:col-span-5">
            <p className="text-xs font-semibold tracking-wide text-blue-600">
              Curated Indian Marketplace
            </p>
            <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-[42px] lg:leading-[1.12] [text-wrap:balance]">
              Everyday essentials, synced in real time across India.
            </h1>
            <p className="mt-4 max-w-lg text-base leading-relaxed text-slate-600">
              Shop verified electronics, pure linen apparel, specialty coffee, and home gear with live warehouse stock, UPI &amp; Razorpay checkout, and instant WhatsApp tracking.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link to="/search">
                  Explore Catalogue
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/assistant">
                  <MessageSquare className="h-4 w-4 text-indigo-600" />
                  Ask AI Assistant
                </Link>
              </Button>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-6 border-t border-slate-200 pt-5 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <Truck className="h-4 w-4 text-blue-600" />
                Free delivery over ₹999
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-indigo-600" />
                Verified Razorpay &amp; COD
              </span>
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="h-full overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <img
                src="/src/assets/images/hero_shelfsync_banner_1795304713994.jpg"
                alt="ShelfSync curated lifestyle electronics, coffee kettle, and skincare collection"
                referrerPolicy="no-referrer"
                className="h-full min-h-[280px] w-full object-cover lg:max-h-[430px]"
              />
            </div>
          </div>
        </div>
      </section>

      {/* 2. Shop by Category */}
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-slate-900">Shop by Category</h2>
            <p className="mt-1 text-sm text-slate-600">
              Six core departments dispatched from Bengaluru, Mumbai, Gurugram, and Hyderabad.
            </p>
          </div>
          <Link
            to="/search"
            className="text-sm font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap"
          >
            View all products →
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {categories.map((cat) => (
            <Link
              key={cat.id}
              to={`/category/${cat.slug}`}
              className="group rounded-xl border border-slate-200 bg-white p-3 transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-sm"
            >
              <div className="aspect-[4/3] overflow-hidden rounded-lg bg-slate-100">
                <img
                  src={cat.imageUrl}
                  alt={cat.name}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </div>
              <h3 className="mt-3 font-display text-sm font-semibold text-slate-900 group-hover:text-blue-600">
                {cat.name}
              </h3>
            </Link>
          ))}
        </div>
      </section>

      {/* 3. Curated Collections (Featured, Best Sellers, Trending, New Arrivals, Deals) */}
      <section className="mx-auto max-w-7xl px-4 pb-14 sm:px-6">
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold text-slate-900">Curated Picks</h2>
            <p className="mt-1 text-sm text-slate-600">
              Real-time prices and inventory fetched directly from the ShelfSync catalogue.
            </p>
          </div>

          <div
            role="tablist"
            aria-label="Product collections"
            className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1"
          >
            {TABS.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                type="button"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {productsLoading ? (
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-80 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
            ))}
          </div>
        ) : (
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {visibleProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>

      {/* 4. WhatsApp AI Assistant Discovery Feature */}
      <section className="border-t border-slate-200 bg-slate-900 text-white">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 px-4 py-12 sm:px-6 lg:flex-row lg:items-center">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold tracking-wide text-indigo-300">
              ShelfSync AI Assistant
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold sm:text-3xl [text-wrap:balance]">
              Ask in plain English or Hinglish on WhatsApp. Buy securely on the web.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              Need wireless earphones under ₹1,000 or a gift for your father under ₹2,000? ShelfSync AI Assistant parses your intent with Gemini, queries live stock &amp; pricing, and returns direct product links.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 shrink-0">
            <Button asChild variant="default" size="lg">
              <Link to="/assistant">Try AI Discovery Assistant</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="border-slate-700 bg-slate-800 text-white hover:bg-slate-700 hover:text-white"
            >
              <Link to="/search?q=bluetoth+hedphones+under+1500">Test Typo Search</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
