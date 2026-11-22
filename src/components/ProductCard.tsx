import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Package, ShoppingBag, Star } from 'lucide-react';
import type { Product } from '@/src/types/shop';
import { cn, formatInr } from '@/src/lib/utils';
import { useShop } from '@/src/context/ShopContext';
import { Button } from './ui/button';

export function ProductCard({ product }: { product: Product }) {
  const { addToCart, toggleWishlist, wishlistIds } = useShop();
  const [imgError, setImgError] = useState(false);
  const [adding, setAdding] = useState(false);
  const isWishlisted = wishlistIds.has(product.id);
  const primaryImg = product.images[0]?.imageUrl;

  const handleAdd = async () => {
    setAdding(true);
    await addToCart(product, 1);
    setAdding(false);
  };

  return (
    <article className="group flex flex-col rounded-xl border border-slate-200 bg-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-t-xl bg-slate-50">
        <Link
          to={`/product/${product.slug}`}
          className="block h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          {primaryImg && !imgError ? (
            <img
              src={primaryImg}
              alt={product.name}
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-100 p-4 text-center text-slate-500">
              <Package className="h-8 w-8 text-slate-400" />
              <span className="text-xs font-medium text-slate-600 line-clamp-2">{product.name}</span>
            </div>
          )}
        </Link>
        <button
          type="button"
          onClick={() => toggleWishlist(product)}
          aria-label={isWishlisted ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
          className={cn(
            'absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-slate-200/90 bg-white/95 text-slate-600 shadow-xs transition-colors hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 cursor-pointer',
            isWishlisted && 'text-indigo-600 border-indigo-200 bg-indigo-50'
          )}
        >
          <Heart className={cn('h-4 w-4', isWishlisted && 'fill-indigo-600')} />
        </button>
      </div>

      <div className="flex flex-1 flex-col justify-between p-4">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="font-medium text-slate-700">{product.brand}</span>
            <span aria-hidden="true">·</span>
            <span className="truncate">{product.categoryName}</span>
          </div>

          <Link
            to={`/product/${product.slug}`}
            className="mt-1.5 block font-display text-base font-semibold leading-snug text-slate-900 line-clamp-2 hover:text-blue-600"
          >
            {product.name}
          </Link>

          <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-600 tabular-nums">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            <span className="font-semibold text-slate-800">{product.ratingAvg.toFixed(1)}</span>
            <span aria-hidden="true">·</span>
            <span>{product.reviewCount} reviews</span>
            {product.availableQuantity > 0 && product.availableQuantity <= product.lowStockThreshold && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-medium text-amber-700">Only {product.availableQuantity} left</span>
              </>
            )}
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100">
          <div className="flex items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-2 tabular-nums">
              <span className="font-mono text-base font-semibold text-slate-900">
                {formatInr(product.priceInr)}
              </span>
              {product.mrpInr > product.priceInr && (
                <span className="text-xs text-slate-400 line-through">
                  {formatInr(product.mrpInr)}
                </span>
              )}
              {product.discountPercent > 0 && (
                <span className="text-xs font-semibold text-indigo-600">
                  {product.discountPercent}% off
                </span>
              )}
            </div>
          </div>

          <Button
            type="button"
            onClick={handleAdd}
            disabled={adding || product.availableQuantity <= 0}
            variant={product.availableQuantity <= 0 ? 'outline' : 'default'}
            className="mt-3 w-full"
            size="sm"
          >
            <ShoppingBag className="h-4 w-4" />
            {product.availableQuantity <= 0
              ? 'Out of Stock'
              : adding
                ? 'Adding...'
                : 'Add to Cart'}
          </Button>
        </div>
      </div>
    </article>
  );
}
