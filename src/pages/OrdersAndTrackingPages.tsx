import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock, Package, Truck } from 'lucide-react';
import { apiFetch } from '@/src/lib/api';
import { formatDateTime, formatInr } from '@/src/lib/utils';
import { useAuth } from '@/src/context/AuthContext';
import type { Order } from '@/src/types/shop';
import { Button } from '@/src/components/ui/button';

export function OrdersPage() {
  const { user, loading: authLoading } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['my-orders'],
    queryFn: () => apiFetch<{ orders: Order[] }>('/api/orders'),
    enabled: Boolean(user),
  });

  if (authLoading) {
    return <div className="mx-auto max-w-5xl px-4 py-12 text-sm text-slate-600">Loading...</div>;
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-bold text-slate-900">My Orders</h1>
        <p className="mt-2 text-sm text-slate-600">Sign in to view your ShelfSync order history.</p>
        <Button asChild className="mt-5">
          <Link to="/login?redirect=/orders">Sign In</Link>
        </Button>
      </div>
    );
  }

  const orders = data?.orders || [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-2xl font-bold text-slate-900">My Orders</h1>
      <p className="mt-1 text-sm text-slate-600">Track shipments, view invoices, and check payment status.</p>

      {isLoading ? (
        <div className="mt-6 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-12 text-center">
          <p className="text-sm text-slate-600">You have not placed any orders yet.</p>
          <Button asChild className="mt-4">
            <Link to="/search">Start Shopping</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {orders.map((order) => (
            <div
              key={order.id}
              className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-mono font-semibold text-slate-900">#{order.orderNumber}</span>
                  <span>·</span>
                  <span>{formatDateTime(order.createdAt)}</span>
                  <span>·</span>
                  <span className="capitalize font-medium text-blue-600">
                    {order.status.replace(/_/g, ' ')}
                  </span>
                  <span>·</span>
                  <span className="uppercase font-medium">{order.paymentMethod}</span>
                </div>
                <p className="mt-2 text-sm font-medium text-slate-900">
                  {order.items.map((i) => `${i.productName} × ${i.quantity}`).join(', ')}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Delivering to {order.shippingCity}, {order.shippingState} — {order.shippingPinCode}
                </p>
              </div>

              <div className="flex items-center justify-between gap-4 sm:justify-end shrink-0">
                <span className="font-mono text-base font-bold text-slate-900 tabular-nums">
                  {formatInr(order.totalInr)}
                </span>
                <Button asChild variant="outline" size="sm">
                  <Link to={`/orders/${order.orderNumber}`}>Track Order</Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function OrderTrackingPage() {
  const { orderNumber, trackingToken } = useParams<{
    orderNumber?: string;
    trackingToken?: string;
  }>();

  const endpoint = trackingToken
    ? `/api/track/${trackingToken}`
    : `/api/orders/${orderNumber}`;

  const { data, isLoading, error } = useQuery({
    queryKey: ['track', endpoint],
    queryFn: () =>
      apiFetch<{
        order?: Order;
        tracking?: {
          orderNumber: string;
          status: string;
          paymentStatus: string;
          paymentMethod: string;
          totalInr: number;
          destinationCity: string;
          shipment?: Order['shipment'];
          trackingEvents: NonNullable<Order['trackingEvents']>;
          items: Array<{ productName: string; quantity: number; lineTotalInr: number }>;
          createdAt: string;
        };
      }>(endpoint),
  });

  if (isLoading) {
    return <div className="mx-auto max-w-4xl px-4 py-12 text-sm text-slate-600">Loading order details...</div>;
  }

  const record = data?.order || data?.tracking;
  if (error || !record) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-bold text-slate-900">Tracking Record Not Found</h1>
        <p className="mt-2 text-sm text-slate-600">
          {error instanceof Error ? error.message : 'Unable to locate this order.'}
        </p>
        <Button asChild className="mt-5">
          <Link to="/orders">Back to Orders</Link>
        </Button>
      </div>
    );
  }

  const events = record.trackingEvents || [];
  const fullOrder = data?.order;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <p className="text-xs font-semibold text-blue-600">Order Tracking</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">
            Order #{record.orderNumber}
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Placed on {formatDateTime(record.createdAt)} · Status:{' '}
            <span className="font-semibold capitalize text-slate-900">
              {record.status.replace(/_/g, ' ')}
            </span>
          </p>
        </div>

        <div className="text-right tabular-nums">
          <p className="text-xs text-slate-500">Total Amount</p>
          <p className="font-mono text-xl font-bold text-slate-900">{formatInr(record.totalInr)}</p>
        </div>
      </div>

      {/* Shipment Summary */}
      {record.shipment && (
        <div className="mt-6 grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-5 sm:grid-cols-3 text-sm">
          <div>
            <p className="text-xs text-slate-500">Carrier</p>
            <p className="mt-0.5 font-semibold text-slate-900 flex items-center gap-1.5">
              <Truck className="h-4 w-4 text-blue-600" />
              {record.shipment.carrier}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">AWB Tracking Number</p>
            <p className="mt-0.5 font-mono font-semibold text-slate-900">{record.shipment.awbNumber}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Estimated Delivery</p>
            <p className="mt-0.5 font-mono font-semibold text-slate-900">
              {record.shipment.estimatedDelivery || 'In Transit'}
            </p>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-display text-lg font-semibold text-slate-900">Shipment Timeline</h2>
        {events.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600 flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-400" />
            Awaiting payment or initial hub scan.
          </p>
        ) : (
          <ol className="mt-5 space-y-5">
            {events.map((ev) => (
              <li key={ev.id} className="flex gap-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
                <div className="flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold capitalize text-slate-900">
                      {ev.status.replace(/_/g, ' ')} — {ev.location}
                    </p>
                    <span className="font-mono text-xs text-slate-500">
                      {formatDateTime(ev.eventTime)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-slate-600">{ev.description}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Items */}
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-display text-lg font-semibold text-slate-900">Items in Order</h2>
        <div className="mt-4 divide-y divide-slate-200">
          {record.items.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between gap-4 py-3 text-sm">
              <div className="flex items-center gap-3 min-w-0">
                <Package className="h-4 w-4 text-slate-400 shrink-0" />
                <span className="font-medium text-slate-900 truncate">
                  {item.productName} × {item.quantity}
                </span>
              </div>
              <span className="font-mono font-semibold text-slate-900 tabular-nums shrink-0">
                {formatInr(item.lineTotalInr)}
              </span>
            </div>
          ))}
        </div>

        {fullOrder && (
          <div className="mt-4 border-t border-slate-200 pt-4 text-xs text-slate-600">
            <p className="font-semibold text-slate-800">Shipping Address</p>
            <p className="mt-1">
              {fullOrder.shippingName} · {fullOrder.shippingPhone}
            </p>
            <p>
              {fullOrder.shippingAddress}, {fullOrder.shippingCity}, {fullOrder.shippingState} —{' '}
              {fullOrder.shippingPinCode}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
