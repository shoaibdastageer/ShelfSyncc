import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Heart,
  Menu,
  Search,
  ShoppingCart,
  User as UserIcon,
  X,
} from 'lucide-react';
import { useAuth } from '@/src/context/AuthContext';
import { useShop } from '@/src/context/ShopContext';
import { apiFetch } from '@/src/lib/api';
import { formatInr } from '@/src/lib/utils';

interface Suggestion {
  id: string;
  name: string;
  slug: string;
  priceInr: number;
}

export function Navbar() {
  const { user } = useAuth();
  const { cart, wishlistIds } = useShop();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch<{ suggestions: Suggestion[] }>(
          `/api/search/autocomplete?q=${encodeURIComponent(trimmed)}`
        );
        setSuggestions(res.suggestions || []);
      } catch {
        setSuggestions([]);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowSuggestions(false);
    navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:gap-8">
        {/* Zone 1: Single-element Brand Wordmark */}
        <Link
          to="/"
          className="font-display text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-md"
        >
          Shelf<span className="text-blue-600">Sync</span>
        </Link>

        {/* Zone 2: Concise single-line navigation links + Search */}
        <nav
          aria-label="Primary navigation"
          className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-600 shrink-0"
        >
          <Link to="/category/electronics" className="hover:text-slate-900 whitespace-nowrap shrink-0">
            Categories
          </Link>
          <Link to="/search?sort=rating_desc" className="hover:text-slate-900 whitespace-nowrap shrink-0">
            Best Sellers
          </Link>
          <Link to="/orders" className="hover:text-slate-900 whitespace-nowrap shrink-0">
            Orders
          </Link>
          <Link to="/assistant" className="text-indigo-600 hover:text-indigo-700 whitespace-nowrap shrink-0">
            AI Assistant
          </Link>
          {user?.role === 'admin' && (
            <Link to="/admin" className="text-blue-600 hover:text-blue-700 whitespace-nowrap shrink-0">
              Admin
            </Link>
          )}
        </nav>

        <div ref={searchWrapRef} className="relative hidden md:block flex-1 max-w-md">
          <form onSubmit={handleSearchSubmit} className="relative flex items-center">
            <label htmlFor="global-search" className="sr-only">
              Search ShelfSync products
            </label>
            <Search className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400" />
            <input
              id="global-search"
              type="search"
              value={query}
              onFocus={() => setShowSuggestions(true)}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowSuggestions(true);
              }}
              placeholder='Try "bluetoth hedphones under 1500"'
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-20 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
            />
            <button
              type="submit"
              className="absolute right-1.5 rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 cursor-pointer"
            >
              Search
            </button>
          </form>

          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-11 z-50 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
              {suggestions.map((s) => (
                <Link
                  key={s.id}
                  to={`/product/${s.slug}`}
                  onClick={() => setShowSuggestions(false)}
                  className="flex items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-slate-50"
                >
                  <span className="truncate font-medium text-slate-900 pr-3">{s.name}</span>
                  <span className="font-mono text-xs font-semibold text-blue-600 tabular-nums shrink-0">
                    {formatInr(s.priceInr)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Zone 3: Account, Wishlist, Cart */}
        <div className="flex items-center gap-2 shrink-0">
          <Link
            to="/wishlist"
            aria-label={`Wishlist (${wishlistIds.size} items)`}
            className="relative flex h-10 w-10 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <Heart className="h-5 w-5" />
            {wishlistIds.size > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-600 px-1 font-mono text-[10px] font-semibold text-white tabular-nums">
                {wishlistIds.size}
              </span>
            )}
          </Link>

          <Link
            to="/cart"
            aria-label={`Shopping Cart (${cart.itemCount} items)`}
            className="relative flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 whitespace-nowrap shrink-0"
          >
            <ShoppingCart className="h-4 w-4 text-blue-600" />
            <span>Cart</span>
            <span
              data-testid="cart-count"
              className="rounded-md bg-slate-900 px-1.5 py-0.5 font-mono text-xs font-semibold text-white tabular-nums"
            >
              {cart.itemCount}
            </span>
          </Link>

          {user ? (
            <Link
              to="/account"
              className="hidden sm:inline-flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-3.5 text-sm font-medium text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <UserIcon className="h-4 w-4" />
              <span className="max-w-[110px] truncate">{user.fullName.split(' ')[0]}</span>
            </Link>
          ) : (
            <Link
              to="/login"
              className="hidden sm:inline-flex h-10 items-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 whitespace-nowrap shrink-0"
            >
              Sign In
            </Link>
          )}

          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 lg:hidden cursor-pointer"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="border-t border-slate-200 bg-white px-4 py-4 lg:hidden space-y-3">
          <form
            onSubmit={(e) => {
              handleSearchSubmit(e);
              setMobileMenuOpen(false);
            }}
            className="flex gap-2"
          >
            <label htmlFor="mobile-search" className="sr-only">
              Search products
            </label>
            <input
              id="mobile-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products or budget..."
              className="h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm"
            />
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 text-sm font-medium text-white"
            >
              Go
            </button>
          </form>

          <div className="grid grid-cols-2 gap-2 text-sm font-medium">
            <Link to="/category/electronics" onClick={() => setMobileMenuOpen(false)} className="rounded-lg bg-slate-50 px-3 py-2.5 text-slate-800">
              Categories
            </Link>
            <Link to="/assistant" onClick={() => setMobileMenuOpen(false)} className="rounded-lg bg-indigo-50 px-3 py-2.5 text-indigo-700">
              AI Assistant
            </Link>
            <Link to="/orders" onClick={() => setMobileMenuOpen(false)} className="rounded-lg bg-slate-50 px-3 py-2.5 text-slate-800">
              My Orders
            </Link>
            <Link to={user ? '/account' : '/login'} onClick={() => setMobileMenuOpen(false)} className="rounded-lg bg-slate-50 px-3 py-2.5 text-slate-800">
              {user ? 'My Account' : 'Sign In'}
            </Link>
            {user?.role === 'admin' && (
              <Link to="/admin" onClick={() => setMobileMenuOpen(false)} className="col-span-2 rounded-lg bg-blue-50 px-3 py-2.5 text-blue-700">
                Admin Dashboard
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
