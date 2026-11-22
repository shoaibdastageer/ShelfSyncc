import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  CreditCard,
  Minus,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  Truck,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/src/lib/api';
import { formatInr } from '@/src/lib/utils';
import { useAuth } from '@/src/context/AuthContext';
import { useShop } from '@/src/context/ShopContext';
import type { Address, Order } from '@/src/types/shop';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, cb: (resp: Record<string, unknown>) => void) => void;
    };
  }
}

export function CartPage() {
  const { cart, cartLoading, updateCartQuantity, removeFromCart } = useShop();
  const { user } = useAuth();
  const navigate = useNavigate();

  if (cartLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-slate-100" />
        <div className="mt-8 grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-8 h-64 animate-pulse rounded-xl bg-slate-100" />
          <div className="lg:col-span-4 h-64 animate-pulse rounded-xl bg-slate-100" />
        </div>
      </div>
    );
  }

  if (cart.items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <ShoppingBag className="mx-auto h-12 w-12 text-slate-300" />
        <h1 className="mt-4 font-display text-2xl font-bold text-slate-900">Your cart is empty</h1>
        <p className="mt-2 text-sm text-slate-600">
          Add electronics, apparel, coffee, or home essentials to get started.
        </p>
        <Button asChild className="mt-6">
          <Link to="/search">Browse Products</Link>
        </Button>
      </div>
    );
  }

  const remainingForFree = Math.max(0, cart.freeDeliveryThresholdInr - cart.subtotalInr);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-2xl font-bold text-slate-900">
        Shopping Cart ({cart.itemCount} {cart.itemCount === 1 ? 'item' : 'items'})
      </h1>

      <div className="mt-8 grid gap-8 lg:grid-cols-12 items-start">
        <div className="lg:col-span-8 space-y-4">
          {cart.items.map((item) => (
            <div
              key={item.productId}
              className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center"
            >
              <Link to={`/product/${item.slug}`} className="h-24 w-28 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
              </Link>

              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-500">
                  {item.brand} · SKU {item.sku}
                </p>
                <Link
                  to={`/product/${item.slug}`}
                  className="mt-0.5 block font-display text-base font-semibold text-slate-900 hover:text-blue-600 truncate"
                >
                  {item.name}
                </Link>
                <div className="mt-1 flex items-baseline gap-2 tabular-nums">
                  <span className="font-mono text-sm font-semibold text-slate-900">
                    {formatInr(item.priceInr)}
                  </span>
                  {item.mrpInr > item.priceInr && (
                    <span className="text-xs text-slate-400 line-through">
                      {formatInr(item.mrpInr)}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 sm:justify-end">
                <div className="flex items-center rounded-lg border border-slate-200">
                  <button
                    type="button"
                    aria-label={`Decrease quantity of ${item.name}`}
                    onClick={() => updateCartQuantity(item.productId, item.quantity - 1)}
                    className="flex h-9 w-9 items-center justify-center text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-8 text-center font-mono text-sm font-semibold tabular-nums">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    aria-label={`Increase quantity of ${item.name}`}
                    disabled={item.quantity >= item.availableQuantity}
                    onClick={() => updateCartQuantity(item.productId, item.quantity + 1)}
                    className="flex h-9 w-9 items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="text-right tabular-nums min-w-[85px]">
                  <p className="font-mono text-sm font-semibold text-slate-900">
                    {formatInr(item.lineTotalInr)}
                  </p>
                </div>

                <button
                  type="button"
                  aria-label={`Remove ${item.name}`}
                  onClick={() => removeFromCart(item.productId)}
                  className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <aside className="lg:col-span-4 rounded-xl border border-slate-200 bg-slate-50 p-6 space-y-4">
          <h2 className="font-display text-lg font-semibold text-slate-900">Order Summary</h2>

          {remainingForFree > 0 ? (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
              Add <span className="font-mono font-semibold">{formatInr(remainingForFree)}</span> more for free delivery.
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
              <Truck className="h-4 w-4 shrink-0" />
              <span>Your order qualifies for free delivery!</span>
            </div>
          )}

          <dl className="space-y-2.5 text-sm tabular-nums">
            <div className="flex justify-between">
              <dt className="text-slate-600">Subtotal</dt>
              <dd className="font-mono font-medium text-slate-900">{formatInr(cart.subtotalInr)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-600">MRP Savings</dt>
              <dd className="font-mono font-medium text-emerald-700">
                -{formatInr(cart.mrpSavingsInr)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-600">Delivery Charge</dt>
              <dd className="font-mono font-medium text-slate-900">
                {cart.deliveryChargeInr === 0 ? 'Free' : formatInr(cart.deliveryChargeInr)}
              </dd>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-3 text-base font-bold text-slate-900">
              <dt>Total Payable</dt>
              <dd className="font-mono">{formatInr(cart.totalInr)}</dd>
            </div>
          </dl>

          <Button
            type="button"
            size="lg"
            className="w-full"
            onClick={() => navigate(user ? '/checkout' : '/login?redirect=/checkout')}
          >
            {user ? 'Proceed to Checkout' : 'Sign In to Checkout'}
          </Button>
        </aside>
      </div>
    </div>
  );
}

export function CheckoutPage() {
  const { user, loading: authLoading } = useAuth();
  const { cart, cartLoading, refreshCartAndWishlist } = useShop();
  const navigate = useNavigate();

  const [shippingName, setShippingName] = useState(user?.fullName || '');
  const [shippingEmail, setShippingEmail] = useState(user?.email || '');
  const [shippingPhone, setShippingPhone] = useState(user?.phone || '');
  const [shippingAddress, setShippingAddress] = useState('');
  const [shippingCity, setShippingCity] = useState('');
  const [shippingState, setShippingState] = useState('');
  const [shippingPinCode, setShippingPinCode] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [appliedQuote, setAppliedQuote] = useState<{
    subtotalInr: number;
    promoDiscountInr: number;
    deliveryChargeInr: number;
    totalInr: number;
    appliedPromoCode: string | null;
  } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'razorpay' | 'cod'>('cod');
  const [submitting, setSubmitting] = useState(false);

  const { data: addrData } = useQuery({
    queryKey: ['addresses'],
    queryFn: () => apiFetch<{ addresses: Address[] }>('/api/account/addresses'),
    enabled: Boolean(user),
  });

  const { data: rzpConfig } = useQuery({
    queryKey: ['razorpay-config'],
    queryFn: () =>
      apiFetch<{ configured: boolean; mode: 'unconfigured' | 'sandbox' | 'live'; keyId: string | null }>(
        '/api/payments/config'
      ),
  });

  useEffect(() => {
    if (rzpConfig?.configured) {
      setPaymentMethod('razorpay');
    }
  }, [rzpConfig]);

  useEffect(() => {
    if (user) {
      if (!shippingName) setShippingName(user.fullName);
      if (!shippingEmail) setShippingEmail(user.email);
      if (!shippingPhone && user.phone) setShippingPhone(user.phone);
    }
  }, [user, shippingName, shippingEmail, shippingPhone]);

  useEffect(() => {
    const def = addrData?.addresses?.find((a) => a.isDefault) || addrData?.addresses?.[0];
    if (def) {
      setShippingName((prev) => prev || def.fullName);
      setShippingPhone((prev) => prev || def.phone);
      setShippingAddress((prev) => prev || (def.line2 ? `${def.line1}, ${def.line2}` : def.line1));
      setShippingCity((prev) => prev || def.city);
      setShippingState((prev) => prev || def.state);
      setShippingPinCode((prev) => prev || def.pinCode);
    }
  }, [addrData]);

  const applyPromo = async () => {
    try {
      const res = await apiFetch<{
        totals: {
          subtotalInr: number;
          promoDiscountInr: number;
          deliveryChargeInr: number;
          totalInr: number;
          appliedPromoCode: string | null;
        };
      }>('/api/checkout/calculate', {
        method: 'POST',
        body: { promoCode },
      });
      setAppliedQuote(res.totals);
      if (res.totals.appliedPromoCode) {
        toast.success(`Applied promo ${res.totals.appliedPromoCode}`);
      } else {
        toast.error('Promo code invalid or minimum order not met (Try SHELF10 or WELCOME200)');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to apply promo');
    }
  };

  if (authLoading || cartLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="h-8 w-52 animate-pulse rounded-lg bg-slate-100" />
        <div className="mt-8 grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-7 h-80 animate-pulse rounded-xl bg-slate-100" />
          <div className="lg:col-span-5 h-80 animate-pulse rounded-xl bg-slate-100" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-bold text-slate-900">Sign in to Checkout</h1>
        <Button asChild className="mt-5">
          <Link to="/login?redirect=/checkout">Sign In</Link>
        </Button>
      </div>
    );
  }

  if (cart.items.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-bold text-slate-900">No items to checkout</h1>
        <Button asChild className="mt-5">
          <Link to="/search">Continue Shopping</Link>
        </Button>
      </div>
    );
  }

  const displaySubtotal = appliedQuote?.subtotalInr ?? cart.subtotalInr;
  const displayDiscount = appliedQuote?.promoDiscountInr ?? 0;
  const displayDelivery = appliedQuote?.deliveryChargeInr ?? cart.deliveryChargeInr;
  const displayTotal = appliedQuote?.totalInr ?? cart.totalInr;

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiFetch<{
        order: Order;
        razorpay?: {
          providerOrderId: string;
          amountPaise: number;
          currency: string;
          keyId: string;
          mode: 'sandbox' | 'live';
        };
      }>('/api/checkout/orders', {
        method: 'POST',
        body: {
          paymentMethod,
          promoCode: appliedQuote?.appliedPromoCode || undefined,
          shippingName,
          shippingEmail,
          shippingPhone,
          shippingAddress,
          shippingCity,
          shippingState,
          shippingPinCode,
        },
      });

      if (paymentMethod === 'cod') {
        navigate(`/payment-result?status=success&orderNumber=${res.order.orderNumber}`);
        void refreshCartAndWishlist();
        return;
      }

      // Open real Razorpay Checkout Modal
      if (!res.razorpay || !window.Razorpay) {
        toast.error('Razorpay checkout script unavailable. Please refresh or select Cash on Delivery.');
        setSubmitting(false);
        return;
      }

      const rzp = new window.Razorpay({
        key: res.razorpay.keyId,
        amount: res.razorpay.amountPaise,
        currency: res.razorpay.currency,
        name: 'ShelfSync',
        description: `Order #${res.order.orderNumber}`,
        order_id: res.razorpay.providerOrderId,
        prefill: {
          name: shippingName,
          email: shippingEmail,
          contact: shippingPhone,
        },
        theme: { color: '#2563EB' },
        handler: async (paymentResponse: Record<string, string>) => {
          try {
            const verifyRes = await apiFetch<{ verified: boolean; order: Order }>(
              '/api/payments/razorpay/verify',
              {
                method: 'POST',
                body: {
                  orderId: res.order.id,
                  razorpayOrderId: paymentResponse.razorpay_order_id,
                  razorpayPaymentId: paymentResponse.razorpay_payment_id,
                  razorpaySignature: paymentResponse.razorpay_signature,
                },
              }
            );
            navigate(
              `/payment-result?status=success&orderNumber=${verifyRes.order.orderNumber}`
            );
            void refreshCartAndWishlist();
          } catch (verifyErr) {
            toast.error(verifyErr instanceof Error ? verifyErr.message : 'Signature verification failed');
            navigate(`/payment-result?status=failed&orderNumber=${res.order.orderNumber}`);
          }
        },
        modal: {
          ondismiss: async () => {
            await apiFetch('/api/payments/razorpay/failed', {
              method: 'POST',
              body: { orderId: res.order.id, reason: 'Cancelled by user in Razorpay modal' },
            }).catch(() => {});
            setSubmitting(false);
            navigate(`/payment-result?status=cancelled&orderNumber=${res.order.orderNumber}`);
          },
        },
      });

      rzp.on('payment.failed', async (failResp: Record<string, unknown>) => {
        await apiFetch('/api/payments/razorpay/failed', {
          method: 'POST',
          body: {
            orderId: res.order.id,
            reason: JSON.stringify(failResp.error || 'Payment failed'),
          },
        }).catch(() => {});
        setSubmitting(false);
        navigate(`/payment-result?status=failed&orderNumber=${res.order.orderNumber}`);
      });

      rzp.open();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Checkout failed');
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-2xl font-bold text-slate-900">Secure Checkout</h1>

      <form onSubmit={handlePlaceOrder} className="mt-8 grid gap-8 lg:grid-cols-12 items-start">
        <div className="lg:col-span-7 space-y-6">
          {/* Saved Address Quick Selector */}
          {(addrData?.addresses || []).length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-700 mb-2">Use a Saved Address</p>
              <div className="flex flex-wrap gap-2">
                {addrData!.addresses.map((addr) => (
                  <button
                    key={addr.id}
                    type="button"
                    onClick={() => {
                      setShippingName(addr.fullName);
                      setShippingPhone(addr.phone);
                      setShippingAddress(addr.line2 ? `${addr.line1}, ${addr.line2}` : addr.line1);
                      setShippingCity(addr.city);
                      setShippingState(addr.state);
                      setShippingPinCode(addr.pinCode);
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:border-blue-500 cursor-pointer"
                  >
                    {addr.label}: {addr.city} ({addr.pinCode})
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Shipping Form */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
            <h2 className="font-display text-lg font-semibold text-slate-900">Delivery Details</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="chk-name" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Full Name
                </label>
                <Input
                  id="chk-name"
                  required
                  value={shippingName}
                  onChange={(e) => setShippingName(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="chk-email" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Email Address
                </label>
                <Input
                  id="chk-email"
                  type="email"
                  required
                  value={shippingEmail}
                  onChange={(e) => setShippingEmail(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label htmlFor="chk-phone" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Phone Number (WhatsApp Order Updates)
              </label>
              <Input
                id="chk-phone"
                required
                value={shippingPhone}
                onChange={(e) => setShippingPhone(e.target.value)}
                placeholder="+919876543210"
              />
            </div>

            <div>
              <label htmlFor="chk-addr" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Street Address, House / Flat No.
              </label>
              <Input
                id="chk-addr"
                required
                value={shippingAddress}
                onChange={(e) => setShippingAddress(e.target.value)}
                placeholder="42 Indiranagar 100 Feet Road"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="chk-city" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  City
                </label>
                <Input
                  id="chk-city"
                  required
                  value={shippingCity}
                  onChange={(e) => setShippingCity(e.target.value)}
                  placeholder="Bengaluru"
                />
              </div>
              <div>
                <label htmlFor="chk-state" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  State
                </label>
                <Input
                  id="chk-state"
                  required
                  value={shippingState}
                  onChange={(e) => setShippingState(e.target.value)}
                  placeholder="Karnataka"
                />
              </div>
              <div>
                <label htmlFor="chk-pin" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  PIN Code
                </label>
                <Input
                  id="chk-pin"
                  required
                  pattern="\d{6}"
                  value={shippingPinCode}
                  onChange={(e) => setShippingPinCode(e.target.value)}
                  placeholder="560038"
                />
              </div>
            </div>
          </div>

          {/* Payment Method */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
            <h2 className="font-display text-lg font-semibold text-slate-900">Payment Method</h2>

            <label
              className={`flex items-start gap-3 rounded-xl border p-4 ${
                !rzpConfig?.configured
                  ? 'border-slate-200 bg-slate-50/70 opacity-75 cursor-not-allowed'
                  : paymentMethod === 'razorpay'
                    ? 'border-blue-600 bg-blue-50/40 cursor-pointer'
                    : 'border-slate-200 cursor-pointer'
              }`}
            >
              <input
                type="radio"
                name="paymentMethod"
                value="razorpay"
                disabled={!rzpConfig?.configured}
                checked={paymentMethod === 'razorpay'}
                onChange={() => setPaymentMethod('razorpay')}
                className="mt-1 h-4 w-4 text-blue-600 disabled:opacity-50"
              />
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <CreditCard className="h-4 w-4 text-blue-600" />
                    Razorpay Online Payment (UPI, Cards, NetBanking, Wallets)
                  </span>
                  <span className="text-xs font-medium text-slate-500">
                    {rzpConfig?.configured
                      ? rzpConfig.mode === 'sandbox'
                        ? 'Sandbox Ready'
                        : 'Live Mode'
                      : 'Optional · Disabled'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  {rzpConfig?.configured
                    ? 'Opens Razorpay secure checkout and verifies HMAC-SHA256 signature on our backend.'
                    : 'Not configured. Cash on Delivery (COD) below is active and ready for checkout.'}
                </p>
              </div>
            </label>

            <label
              className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer ${
                paymentMethod === 'cod' ? 'border-blue-600 bg-blue-50/40' : 'border-slate-200'
              }`}
            >
              <input
                type="radio"
                name="paymentMethod"
                value="cod"
                checked={paymentMethod === 'cod'}
                onChange={() => setPaymentMethod('cod')}
                className="mt-1 h-4 w-4 text-blue-600"
              />
              <div>
                <span className="text-sm font-semibold text-slate-900">Cash on Delivery (COD)</span>
                <p className="mt-1 text-xs text-slate-600">
                  Pay via cash or UPI QR at doorstep upon delivery. Reserves inventory atomically right away.
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Summary */}
        <aside className="lg:col-span-5 rounded-xl border border-slate-200 bg-slate-50 p-6 space-y-5">
          <h2 className="font-display text-lg font-semibold text-slate-900">Order Review</h2>

          <div className="divide-y divide-slate-200">
            {cart.items.map((item) => (
              <div key={item.productId} className="flex justify-between gap-3 py-2.5 text-sm">
                <span className="text-slate-700 truncate">
                  {item.name} × {item.quantity}
                </span>
                <span className="font-mono font-medium text-slate-900 tabular-nums shrink-0">
                  {formatInr(item.lineTotalInr)}
                </span>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="Promo code (e.g. SHELF10)"
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value)}
            />
            <Button type="button" variant="outline" onClick={applyPromo}>
              Apply
            </Button>
          </div>

          <dl className="space-y-2 border-t border-slate-200 pt-4 text-sm tabular-nums">
            <div className="flex justify-between">
              <dt className="text-slate-600">Subtotal</dt>
              <dd className="font-mono text-slate-900">{formatInr(displaySubtotal)}</dd>
            </div>
            {displayDiscount > 0 && (
              <div className="flex justify-between text-emerald-700">
                <dt>Promo ({appliedQuote?.appliedPromoCode})</dt>
                <dd className="font-mono">-{formatInr(displayDiscount)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-slate-600">Delivery</dt>
              <dd className="font-mono text-slate-900">
                {displayDelivery === 0 ? 'Free' : formatInr(displayDelivery)}
              </dd>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-3 text-base font-bold text-slate-900">
              <dt>Final Payable</dt>
              <dd className="font-mono">{formatInr(displayTotal)}</dd>
            </div>
          </dl>

          <Button type="submit" size="lg" disabled={submitting} className="w-full">
            {submitting
              ? 'Processing...'
              : paymentMethod === 'razorpay'
                ? `Pay ${formatInr(displayTotal)} via Razorpay`
                : `Confirm COD Order (${formatInr(displayTotal)})`}
          </Button>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="h-4 w-4 text-blue-600 shrink-0" />
            <span>Prices &amp; stock are re-verified on the server inside an atomic database transaction.</span>
          </div>
        </aside>
      </form>
    </div>
  );
}

export function PaymentResultPage() {
  const [searchParams] = useSearchParams();
  const status = searchParams.get('status') || 'success';
  const orderNumber = searchParams.get('orderNumber') || '';
  const isSuccess = status === 'success';

  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xs">
        {isSuccess ? (
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
        ) : (
          <XCircle className="mx-auto h-12 w-12 text-red-600" />
        )}

        <h1 className="mt-4 font-display text-2xl font-bold text-slate-900">
          {isSuccess
            ? 'Order Confirmed'
            : status === 'cancelled'
              ? 'Payment Cancelled'
              : 'Payment Failed'}
        </h1>

        <p className="mt-2 text-sm text-slate-600">
          {isSuccess
            ? `Your ShelfSync order ${orderNumber ? `#${orderNumber}` : ''} has been confirmed and queued for dispatch.`
            : `Your payment was not completed${orderNumber ? ` for #${orderNumber}` : ''}. Any reserved stock has been released back to inventory.`}
        </p>

        <div className="mt-7 flex flex-wrap justify-center gap-3">
          {orderNumber && (
            <Button asChild>
              <Link to={`/orders/${orderNumber}`}>Track Order #{orderNumber}</Link>
            </Button>
          )}
          <Button asChild variant="outline">
            <Link to="/orders">View My Orders</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
