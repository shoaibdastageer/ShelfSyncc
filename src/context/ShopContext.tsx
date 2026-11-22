import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { apiFetch } from '@/src/lib/api';
import { useAuth } from './AuthContext';
import type { CartItem, CartSummary, Product } from '@/src/types/shop';

const GUEST_CART_KEY = 'shelfsync_guest_cart_v1';
const FREE_DELIVERY_THRESHOLD = 999;
const DELIVERY_FEE = 79;

interface GuestCartLine {
  product: Product;
  quantity: number;
}

function buildCartSummaryFromGuest(lines: GuestCartLine[]): CartSummary {
  const items: CartItem[] = lines.map(({ product, quantity }) => ({
    id: `guest-${product.id}`,
    productId: product.id,
    sku: product.sku,
    name: product.name,
    slug: product.slug,
    brand: product.brand,
    imageUrl: product.images[0]?.imageUrl || '',
    priceInr: product.priceInr,
    mrpInr: product.mrpInr,
    quantity,
    availableQuantity: product.availableQuantity,
    lineTotalInr: Math.round(product.priceInr * quantity * 100) / 100,
  }));

  const subtotalInr = items.reduce((s, i) => s + i.lineTotalInr, 0);
  const mrpTotal = items.reduce((s, i) => s + i.mrpInr * i.quantity, 0);
  const mrpSavingsInr = Math.max(0, Math.round((mrpTotal - subtotalInr) * 100) / 100);
  const deliveryChargeInr =
    subtotalInr === 0 || subtotalInr >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE;

  return {
    items,
    itemCount: items.reduce((s, i) => s + i.quantity, 0),
    subtotalInr,
    mrpSavingsInr,
    deliveryChargeInr,
    totalInr: subtotalInr + deliveryChargeInr,
    freeDeliveryThresholdInr: FREE_DELIVERY_THRESHOLD,
  };
}

function readGuestCart(): GuestCartLine[] {
  try {
    const raw = localStorage.getItem(GUEST_CART_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as GuestCartLine[];
  } catch {
    return [];
  }
}

function writeGuestCart(lines: GuestCartLine[]) {
  try {
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify(lines));
  } catch {
    // ignore storage errors
  }
}

interface ShopContextValue {
  cart: CartSummary;
  cartLoading: boolean;
  wishlistIds: Set<string>;
  wishlistProducts: Product[];
  addToCart: (product: Product, quantity?: number) => Promise<void>;
  updateCartQuantity: (productId: string, quantity: number) => Promise<void>;
  removeFromCart: (productId: string) => Promise<void>;
  refreshCartAndWishlist: () => Promise<void>;
  toggleWishlist: (product: Product) => Promise<void>;
}

const ShopContext = createContext<ShopContextValue | null>(null);

const EMPTY_CART: CartSummary = {
  items: [],
  itemCount: 0,
  subtotalInr: 0,
  mrpSavingsInr: 0,
  deliveryChargeInr: 0,
  totalInr: 0,
  freeDeliveryThresholdInr: FREE_DELIVERY_THRESHOLD,
};

export function ShopProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [cart, setCart] = useState<CartSummary>(EMPTY_CART);
  const [cartLoading, setCartLoading] = useState(true);
  const [wishlistProducts, setWishlistProducts] = useState<Product[]>([]);

  const refreshCartAndWishlist = useCallback(async () => {
    setCartLoading(true);
    if (!user) {
      setCart(buildCartSummaryFromGuest(readGuestCart()));
      setWishlistProducts([]);
      setCartLoading(false);
      return;
    }

    try {
      // Merge guest cart items into account cart if any exist
      const guestLines = readGuestCart();
      if (guestLines.length > 0) {
        for (const line of guestLines) {
          await apiFetch('/api/cart/items', {
            method: 'POST',
            body: { productId: line.product.id, quantity: line.quantity },
          }).catch(() => {});
        }
        writeGuestCart([]);
      }

      const [cartData, wishData] = await Promise.all([
        apiFetch<CartSummary>('/api/cart'),
        apiFetch<{ items: Product[] }>('/api/wishlist'),
      ]);
      setCart(cartData);
      setWishlistProducts(wishData.items || []);
    } catch {
      // ignore transient error
    } finally {
      setCartLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading) {
      refreshCartAndWishlist();
    }
  }, [authLoading, refreshCartAndWishlist]);

  const addToCart = async (product: Product, quantity = 1) => {
    if (product.availableQuantity <= 0) {
      toast.error(`${product.name} is currently out of stock.`);
      return;
    }

    if (!user) {
      const lines = readGuestCart();
      const existing = lines.find((l) => l.product.id === product.id);
      const nextQty = (existing?.quantity || 0) + quantity;
      if (nextQty > product.availableQuantity) {
        toast.error(`Only ${product.availableQuantity} unit(s) available.`);
        return;
      }
      if (existing) {
        existing.quantity = nextQty;
        existing.product = product;
      } else {
        lines.push({ product, quantity });
      }
      writeGuestCart(lines);
      setCart(buildCartSummaryFromGuest(lines));
      toast.success(`Added ${product.name} to cart`);
      return;
    }

    try {
      const updated = await apiFetch<CartSummary>('/api/cart/items', {
        method: 'POST',
        body: { productId: product.id, quantity },
      });
      setCart(updated);
      toast.success(`Added ${product.name} to cart`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to add item to cart');
    }
  };

  const updateCartQuantity = async (productId: string, quantity: number) => {
    if (!user) {
      let lines = readGuestCart();
      const target = lines.find((l) => l.product.id === productId);
      if (!target) return;
      if (quantity <= 0) {
        lines = lines.filter((l) => l.product.id !== productId);
      } else if (quantity > target.product.availableQuantity) {
        toast.error(`Only ${target.product.availableQuantity} unit(s) available.`);
        return;
      } else {
        target.quantity = quantity;
      }
      writeGuestCart(lines);
      setCart(buildCartSummaryFromGuest(lines));
      return;
    }

    try {
      const updated = await apiFetch<CartSummary>(`/api/cart/items/${productId}`, {
        method: 'PATCH',
        body: { quantity },
      });
      setCart(updated);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to update cart');
    }
  };

  const removeFromCart = async (productId: string) => {
    await updateCartQuantity(productId, 0);
    toast.success('Removed item from cart');
  };

  const toggleWishlist = async (product: Product) => {
    if (!user) {
      toast.error('Please sign in to save items to your wishlist.');
      return;
    }
    try {
      const res = await apiFetch<{ saved: boolean; items: Product[] }>('/api/wishlist/toggle', {
        method: 'POST',
        body: { productId: product.id },
      });
      setWishlistProducts(res.items);
      toast.success(res.saved ? `Saved ${product.name} to wishlist` : 'Removed from wishlist');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Wishlist update failed');
    }
  };

  const wishlistIds = new Set(wishlistProducts.map((p) => p.id));

  return (
    <ShopContext.Provider
      value={{
        cart,
        cartLoading,
        wishlistIds,
        wishlistProducts,
        addToCart,
        updateCartQuantity,
        removeFromCart,
        refreshCartAndWishlist,
        toggleWishlist,
      }}
    >
      {children}
    </ShopContext.Provider>
  );
}

export function useShop() {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error('useShop must be used within ShopProvider');
  return ctx;
}
