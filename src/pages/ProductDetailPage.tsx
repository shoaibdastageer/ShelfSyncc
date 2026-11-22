import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Heart, MapPin, Minus, Plus, ShieldCheck, ShoppingBag, Star, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/src/lib/api';
import { formatDateTime, formatInr } from '@/src/lib/utils';
import { useAuth } from '@/src/context/AuthContext';
import { useShop } from '@/src/context/ShopContext';
import type { Product, ProductReview } from '@/src/types/shop';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { ProductCard } from '@/src/components/ProductCard';

export function ProductDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const { addToCart, toggleWishlist, wishlistIds } = useShop();
  const queryClient = useQueryClient();

  const [qty, setQty] = useState(1);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewComment, setReviewComment] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['product', slug],
    queryFn: () =>
      apiFetch<{ product: Product; reviews: ProductReview[]; related: Product[] }>(
        `/api/products/${slug}`
      ),
    enabled: Boolean(slug),
  });

  const reviewMutation = useMutation({
    mutationFn: (payload: { rating: number; title: string; comment: string }) =>
      apiFetch(`/api/products/${data!.product.id}/reviews`, {
        method: 'POST',
        body: payload,
      }),
    onSuccess: () => {
      toast.success('Review published');
      setReviewTitle('');
      setReviewComment('');
      queryClient.invalidateQueries({ queryKey: ['product', slug] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-6 h-96 animate-pulse rounded-2xl bg-slate-100" />
          <div className="lg:col-span-6 h-96 animate-pulse rounded-2xl bg-slate-100" />
        </div>
      </div>
    );
  }

  if (error || !data?.product) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-bold text-slate-900">Product not found</h1>
        <p className="mt-2 text-sm text-slate-600">This item may have been removed or deactivated.</p>
        <Button asChild className="mt-6">
          <Link to="/">Back to Storefront</Link>
        </Button>
      </div>
    );
  }

  const { product, reviews, related } = data;
  const isWishlisted = wishlistIds.has(product.id);

  const handleReviewSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error('Please sign in to submit a review.');
      return;
    }
    reviewMutation.mutate({
      rating: reviewRating,
      title: reviewTitle,
      comment: reviewComment,
    });
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-2 text-xs text-slate-500">
        <Link to="/" className="hover:text-blue-600">Home</Link>
        <span>/</span>
        <Link to={`/category/${product.categorySlug}`} className="hover:text-blue-600">
          {product.categoryName}
        </Link>
        <span>/</span>
        <span className="truncate font-medium text-slate-900">{product.name}</span>
      </nav>

      {/* Main Split */}
      <div className="grid gap-10 lg:grid-cols-12 items-start">
        {/* Sticky Gallery */}
        <div className="lg:col-span-6 lg:sticky lg:top-24">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
            <img
              src={product.images[0]?.imageUrl}
              alt={product.name}
              referrerPolicy="no-referrer"
              className="aspect-[4/3] w-full object-cover"
            />
          </div>
        </div>

        {/* Purchase Module */}
        <div className="lg:col-span-6 space-y-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <span className="text-blue-600 font-semibold">{product.brand}</span>
              <span>·</span>
              <span className="font-mono">SKU {product.sku}</span>
            </div>
            <h1 className="mt-2 font-display text-2xl font-bold text-slate-900 sm:text-3xl [text-wrap:balance]">
              {product.name}
            </h1>
            <div className="mt-3 flex items-center gap-2 text-sm text-slate-600 tabular-nums">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              <span className="font-semibold text-slate-900">{product.ratingAvg.toFixed(1)}</span>
              <span>·</span>
              <span>{product.reviewCount} verified reviews</span>
            </div>
          </div>

          {/* Pricing Block */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-5">
            <div className="flex items-baseline gap-3 tabular-nums">
              <span className="font-mono text-3xl font-bold text-slate-900">
                {formatInr(product.priceInr)}
              </span>
              {product.mrpInr > product.priceInr && (
                <>
                  <span className="text-base text-slate-400 line-through">
                    {formatInr(product.mrpInr)}
                  </span>
                  <span className="text-sm font-semibold text-indigo-600">
                    Save {product.discountPercent}% ({formatInr(product.mrpInr - product.priceInr)})
                  </span>
                </>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">Inclusive of all GST taxes</p>

            <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-slate-200 pt-4 text-xs text-slate-700">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-blue-600" />
                Ships from {product.warehouseCity}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Truck className="h-4 w-4 text-blue-600" />
                {product.priceInr >= 999 ? 'Eligible for Free Delivery' : 'Free delivery over ₹999'}
              </span>
            </div>
          </div>

          <p className="text-sm leading-relaxed text-slate-700">{product.description}</p>

          {/* Stock + Quantity + Actions */}
          <div className="space-y-4">
            <div className="text-sm font-medium">
              {product.availableQuantity > 0 ? (
                <span className={product.availableQuantity <= product.lowStockThreshold ? 'text-amber-700' : 'text-emerald-700'}>
                  In Stock — {product.availableQuantity} unit(s) ready for dispatch
                </span>
              ) : (
                <span className="text-red-600">Currently Out of Stock</span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center rounded-lg border border-slate-200 bg-white">
                <button
                  type="button"
                  aria-label="Decrease quantity"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  className="flex h-11 w-10 items-center justify-center text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-10 text-center font-mono text-sm font-semibold tabular-nums">
                  {qty}
                </span>
                <button
                  type="button"
                  aria-label="Increase quantity"
                  onClick={() => setQty((q) => Math.min(Math.max(1, product.availableQuantity), q + 1))}
                  className="flex h-11 w-10 items-center justify-center text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              <Button
                type="button"
                size="lg"
                disabled={product.availableQuantity <= 0}
                onClick={() => addToCart(product, qty)}
                className="flex-1 min-w-[180px]"
              >
                <ShoppingBag className="h-4 w-4" />
                {product.availableQuantity <= 0 ? 'Out of Stock' : 'Add to Cart'}
              </Button>

              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => toggleWishlist(product)}
                aria-label={isWishlisted ? 'Remove from wishlist' : 'Save to wishlist'}
              >
                <Heart className={`h-4 w-4 ${isWishlisted ? 'fill-indigo-600 text-indigo-600' : ''}`} />
                {isWishlisted ? 'Saved' : 'Wishlist'}
              </Button>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500">
              <ShieldCheck className="h-4 w-4 text-slate-400" />
              <span>7-day replacement guarantee · Razorpay UPI, Cards &amp; COD supported</span>
            </div>
          </div>

          {/* Specifications Table */}
          {Object.keys(product.specs).length > 0 && (
            <div className="pt-4">
              <h2 className="font-display text-base font-semibold text-slate-900">Specifications</h2>
              <dl className="mt-3 divide-y divide-slate-200 rounded-xl border border-slate-200">
                {Object.entries(product.specs).map(([k, v]) => (
                  <div key={k} className="grid grid-cols-3 gap-4 px-4 py-2.5 text-sm">
                    <dt className="font-medium text-slate-500">{k}</dt>
                    <dd className="col-span-2 text-slate-900">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      </div>

      {/* Reviews */}
      <section className="mt-14 border-t border-slate-200 pt-10">
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-7 space-y-4">
            <h2 className="font-display text-xl font-bold text-slate-900">Customer Reviews</h2>
            {reviews.length === 0 ? (
              <p className="text-sm text-slate-600">No reviews yet. Be the first to review this product.</p>
            ) : (
              <div className="space-y-4">
                {reviews.map((rev) => (
                  <div key={rev.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="font-semibold text-slate-900">{rev.userName}</span>
                      <span>{formatDateTime(rev.createdAt)}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-1 text-amber-500">
                      {Array.from({ length: rev.rating }).map((_, i) => (
                        <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      ))}
                      <span className="ml-2 text-sm font-semibold text-slate-900">{rev.title}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{rev.comment}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-5">
            <form onSubmit={handleReviewSubmit} className="rounded-xl border border-slate-200 bg-slate-50 p-5 space-y-4">
              <h3 className="font-display text-base font-semibold text-slate-900">Write a Review</h3>
              <div>
                <label htmlFor="rev-rating" className="block text-xs font-medium text-slate-700 mb-1">
                  Rating
                </label>
                <select
                  id="rev-rating"
                  value={reviewRating}
                  onChange={(e) => setReviewRating(Number(e.target.value))}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                >
                  <option value={5}>5 Stars — Excellent</option>
                  <option value={4}>4 Stars — Very Good</option>
                  <option value={3}>3 Stars — Average</option>
                  <option value={2}>2 Stars — Below Expectations</option>
                  <option value={1}>1 Star — Poor</option>
                </select>
              </div>
              <div>
                <label htmlFor="rev-title" className="block text-xs font-medium text-slate-700 mb-1">
                  Review Title
                </label>
                <Input
                  id="rev-title"
                  required
                  value={reviewTitle}
                  onChange={(e) => setReviewTitle(e.target.value)}
                  placeholder="Summarize your experience"
                />
              </div>
              <div>
                <label htmlFor="rev-comment" className="block text-xs font-medium text-slate-700 mb-1">
                  Comments
                </label>
                <textarea
                  id="rev-comment"
                  required
                  rows={3}
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder="Share build quality, delivery, or performance notes"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
              <Button type="submit" disabled={reviewMutation.isPending} className="w-full">
                {reviewMutation.isPending ? 'Submitting...' : 'Submit Review'}
              </Button>
            </form>
          </div>
        </div>
      </section>

      {/* Related */}
      {related.length > 0 && (
        <section className="mt-14 border-t border-slate-200 pt-10">
          <h2 className="font-display text-xl font-bold text-slate-900">Similar in {product.categoryName}</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
