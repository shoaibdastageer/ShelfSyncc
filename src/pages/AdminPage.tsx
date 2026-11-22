import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Bell,
  Boxes,
  LayoutDashboard,
  Package,
  RefreshCw,
  ShoppingBag,
  Tag,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/src/lib/api';
import { formatDateTime, formatInr } from '@/src/lib/utils';
import { useAuth } from '@/src/context/AuthContext';
import type { Category, NotificationLog, Order, Product, Warehouse } from '@/src/types/shop';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';

type AdminTab = 'overview' | 'products' | 'orders' | 'categories' | 'notifications';

const ORDER_STATUSES = [
  'pending_payment',
  'confirmed',
  'packed',
  'shipped',
  'out_for_delivery',
  'delivered',
  'delayed',
  'cancelled',
  'refunded',
];

export function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<AdminTab>('overview');

  // New Product form
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [priceInr, setPriceInr] = useState('');
  const [mrpInr, setMrpInr] = useState('');
  const [stockQuantity, setStockQuantity] = useState('15');
  const [shortDescription, setShortDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('/src/assets/images/prod_anc_headphones_1795304714348.jpg');

  // New Category form
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');

  // Stock draft edits
  const [stockDrafts, setStockDrafts] = useState<Record<string, string>>({});

  const isAdmin = user?.role === 'admin';

  const { data: healthData } = useQuery({
    queryKey: ['system-health'],
    queryFn: () =>
      apiFetch<{
        databaseMode: string;
        integrations: Record<string, { status: string; message?: string }>;
      }>('/api/health'),
    enabled: isAdmin,
  });

  const { data: overviewData } = useQuery({
    queryKey: ['admin-overview'],
    queryFn: () =>
      apiFetch<{
        stats: {
          totalRevenueInr: number;
          totalOrders: number;
          pendingOrders: number;
          totalCustomers: number;
          totalProducts: number;
        };
        lowStockProducts: Product[];
        bestSellers: Product[];
        recentOrders: Order[];
        recentNotifications: NotificationLog[];
      }>('/api/admin/overview'),
    enabled: isAdmin,
  });

  const { data: productsData } = useQuery({
    queryKey: ['admin-products'],
    queryFn: () => apiFetch<{ products: Product[] }>('/api/admin/products'),
    enabled: isAdmin,
  });

  const { data: ordersData } = useQuery({
    queryKey: ['admin-orders'],
    queryFn: () => apiFetch<{ orders: Order[] }>('/api/admin/orders'),
    enabled: isAdmin,
  });

  const { data: catsData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiFetch<{ categories: Category[] }>('/api/categories'),
    enabled: isAdmin,
  });

  const { data: whData } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => apiFetch<{ warehouses: Warehouse[] }>('/api/warehouses'),
    enabled: isAdmin,
  });

  const { data: notifData } = useQuery({
    queryKey: ['admin-notifications'],
    queryFn: () => apiFetch<{ logs: NotificationLog[] }>('/api/admin/notifications'),
    enabled: isAdmin,
  });

  const createProductMut = useMutation({
    mutationFn: () =>
      apiFetch('/api/admin/products', {
        method: 'POST',
        body: {
          sku,
          name,
          brand,
          categoryId: categoryId || catsData?.categories[0]?.id,
          shortDescription,
          description: shortDescription,
          priceInr: Number(priceInr),
          mrpInr: Number(mrpInr || priceInr),
          stockQuantity: Number(stockQuantity),
          warehouseId: whData?.warehouses[0]?.id,
          imageUrl,
        },
      }),
    onSuccess: () => {
      toast.success('Product created & synced');
      setSku('');
      setName('');
      setBrand('');
      setPriceInr('');
      setMrpInr('');
      setShortDescription('');
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateStockMut = useMutation({
    mutationFn: ({ id, qty }: { id: string; qty: number }) =>
      apiFetch(`/api/admin/inventory/${id}`, {
        method: 'PATCH',
        body: { stockQuantity: qty },
      }),
    onSuccess: () => {
      toast.success('Stock updated & inventory event published');
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deactivateProdMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/products/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Product deactivated');
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
    },
  });

  const updateOrderStatusMut = useMutation({
    mutationFn: ({ orderId, status }: { orderId: string; status: string }) =>
      apiFetch(`/api/admin/orders/${orderId}/status`, {
        method: 'PATCH',
        body: { status },
      }),
    onSuccess: () => {
      toast.success('Order status updated & WhatsApp notification event triggered');
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const createCategoryMut = useMutation({
    mutationFn: () =>
      apiFetch('/api/admin/categories', {
        method: 'POST',
        body: { name: catName, description: catDesc },
      }),
    onSuccess: () => {
      toast.success('Category added');
      setCatName('');
      setCatDesc('');
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const reindexMut = useMutation({
    mutationFn: () => apiFetch<{ indexedCount: number }>('/api/admin/opensearch/reindex', { method: 'POST' }),
    onSuccess: (d) => toast.success(`Indexed ${d.indexedCount} products in Aiven OpenSearch`),
    onError: (err: Error) => toast.error(err.message),
  });

  if (authLoading) {
    return <div className="mx-auto max-w-6xl px-4 py-12 text-sm text-slate-600">Loading admin console...</div>;
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-bold text-slate-900">Admin Access Required</h1>
        <p className="mt-2 text-sm text-slate-600">
          Sign in with an administrator account (e.g. admin@shelfsync.in) to manage ShelfSync operations.
        </p>
        <Button asChild className="mt-5">
          <Link to="/login?redirect=/admin">Admin Sign In</Link>
        </Button>
      </div>
    );
  }

  const stats = overviewData?.stats;

  const navItems: Array<{ id: AdminTab; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="h-4 w-4" /> },
    { id: 'products', label: 'Products & Inventory', icon: <Boxes className="h-4 w-4" /> },
    { id: 'orders', label: 'Orders & Fulfillment', icon: <ShoppingBag className="h-4 w-4" /> },
    { id: 'categories', label: 'Categories', icon: <Tag className="h-4 w-4" /> },
    { id: 'notifications', label: 'WhatsApp Logs', icon: <Bell className="h-4 w-4" /> },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="text-xs font-semibold text-blue-600">Store Operations</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">ShelfSync Admin Console</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (healthData?.integrations?.opensearch?.status !== 'connected') {
                toast.info('OpenSearch is optional and not configured; built-in PostgreSQL fuzzy search is active.');
                return;
              }
              reindexMut.mutate();
            }}
            disabled={reindexMut.isPending}
          >
            <RefreshCw className="h-4 w-4" />
            {healthData?.integrations?.opensearch?.status === 'connected'
              ? 'Sync OpenSearch'
              : 'Built-in Search Active'}
          </Button>
        </div>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-12 items-start">
        {/* Sidebar */}
        <aside className="lg:col-span-3">
          <nav aria-label="Admin sections" className="space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-2">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                  tab === item.id
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-700 hover:bg-white/70 hover:text-slate-900'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <div className="lg:col-span-9 space-y-6">
          {tab === 'overview' && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs text-slate-500">Total Revenue</p>
                  <p className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums">
                    {formatInr(stats?.totalRevenueInr || 0)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs text-slate-500">Total Orders</p>
                  <p className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums">
                    {stats?.totalOrders || 0}
                  </p>
                  <p className="mt-1 text-xs text-amber-700 tabular-nums">
                    {stats?.pendingOrders || 0} pending fulfillment
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs text-slate-500">Customers</p>
                  <p className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums">
                    {stats?.totalCustomers || 0}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs text-slate-500">Active Products</p>
                  <p className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums">
                    {stats?.totalProducts || 0}
                  </p>
                </div>
              </div>

              {/* Low Stock Alerts */}
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <h2 className="flex items-center gap-2 font-display text-base font-semibold text-slate-900">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  Low-Stock Products
                </h2>
                {(overviewData?.lowStockProducts || []).length === 0 ? (
                  <p className="mt-2 text-sm text-slate-600">All products are above low-stock thresholds.</p>
                ) : (
                  <div className="mt-3 divide-y divide-slate-200">
                    {overviewData!.lowStockProducts.map((p) => (
                      <div key={p.id} className="flex items-center justify-between py-2.5 text-sm">
                        <span className="font-medium text-slate-900">
                          {p.name} <span className="font-mono text-xs text-slate-500">({p.sku})</span>
                        </span>
                        <span className="font-mono font-semibold text-amber-700 tabular-nums">
                          {p.availableQuantity} left (threshold {p.lowStockThreshold})
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Live Backend Integration Verification */}
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Live Service Connections
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Active storage mode: <span className="font-mono font-medium">{healthData?.databaseMode || 'checking'}</span>
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {healthData &&
                    Object.entries(healthData.integrations).map(([service, info]) => {
                      const isReady = info.status === 'connected' || info.status === 'configured';
                      return (
                        <div key={service} className="rounded-lg border border-slate-200 p-3 text-xs">
                          <div className="flex items-center justify-between font-semibold">
                            <span className="capitalize text-slate-700">{service}</span>
                            <span className={isReady ? 'text-emerald-700' : 'text-amber-700'}>
                              {info.status}
                            </span>
                          </div>
                          {info.message && <p className="mt-1 text-slate-500 line-clamp-2">{info.message}</p>}
                        </div>
                      );
                    })}
                </div>
              </div>
            </>
          )}

          {tab === 'products' && (
            <div className="space-y-6">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createProductMut.mutate();
                }}
                className="rounded-xl border border-slate-200 bg-slate-50 p-5 space-y-4"
              >
                <h2 className="font-display text-base font-semibold text-slate-900">Add New Product</h2>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Input placeholder="SKU (e.g. SS-EL-901)" value={sku} onChange={(e) => setSku(e.target.value)} required />
                  <Input placeholder="Product Name" value={name} onChange={(e) => setName(e.target.value)} required />
                  <Input placeholder="Brand" value={brand} onChange={(e) => setBrand(e.target.value)} required />
                </div>
                <div className="grid gap-3 sm:grid-cols-4">
                  <select
                    aria-label="Product category"
                    value={categoryId || catsData?.categories[0]?.id || ''}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  >
                    {(catsData?.categories || []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    placeholder="Price ₹"
                    value={priceInr}
                    onChange={(e) => setPriceInr(e.target.value)}
                    required
                  />
                  <Input
                    type="number"
                    placeholder="MRP ₹"
                    value={mrpInr}
                    onChange={(e) => setMrpInr(e.target.value)}
                    required
                  />
                  <Input
                    type="number"
                    placeholder="Stock Qty"
                    value={stockQuantity}
                    onChange={(e) => setStockQuantity(e.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    placeholder="Short Description"
                    value={shortDescription}
                    onChange={(e) => setShortDescription(e.target.value)}
                    required
                  />
                  <Input
                    placeholder="Image URL"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" disabled={createProductMut.isPending}>
                  {createProductMut.isPending ? 'Saving...' : 'Create Product'}
                </Button>
              </form>

              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                    <tr>
                      <th className="px-4 py-3">Product</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3 text-right">Price</th>
                      <th className="px-4 py-3 text-right">Stock</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {(productsData?.products || []).map((p) => (
                      <tr key={p.id} className={!p.isActive ? 'opacity-50' : ''}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{p.name}</div>
                          <div className="font-mono text-xs text-slate-500">{p.sku}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{p.categoryName}</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">
                          {formatInr(p.priceInr)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <input
                              type="number"
                              aria-label={`Stock for ${p.name}`}
                              value={stockDrafts[p.id] ?? String(p.stockQuantity)}
                              onChange={(e) =>
                                setStockDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))
                              }
                              className="h-8 w-16 rounded border border-slate-200 px-2 text-right font-mono text-xs tabular-nums"
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                updateStockMut.mutate({
                                  id: p.id,
                                  qty: Number(stockDrafts[p.id] ?? p.stockQuantity),
                                })
                              }
                            >
                              Save
                            </Button>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {p.isActive && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="text-red-600 hover:bg-red-50"
                              onClick={() => deactivateProdMut.mutate(p.id)}
                            >
                              Deactivate
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'orders' && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Order #</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Payment</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {(ordersData?.orders || []).map((o) => (
                    <tr key={o.id}>
                      <td className="px-4 py-3 font-mono font-semibold text-blue-600">
                        <Link to={`/orders/${o.orderNumber}`}>#{o.orderNumber}</Link>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{o.shippingName}</div>
                        <div className="text-xs text-slate-500">{o.shippingCity}</div>
                      </td>
                      <td className="px-4 py-3 text-xs uppercase text-slate-600">
                        {o.paymentMethod} · {o.paymentStatus}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums">
                        {formatInr(o.totalInr)}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          aria-label={`Order status for ${o.orderNumber}`}
                          value={o.status}
                          onChange={(e) =>
                            updateOrderStatusMut.mutate({ orderId: o.id, status: e.target.value })
                          }
                          className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium capitalize"
                        >
                          {ORDER_STATUSES.map((st) => (
                            <option key={st} value={st}>
                              {st.replace(/_/g, ' ')}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'categories' && (
            <div className="space-y-6">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createCategoryMut.mutate();
                }}
                className="rounded-xl border border-slate-200 bg-slate-50 p-5 space-y-3"
              >
                <h2 className="font-display text-base font-semibold text-slate-900">Create Category</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    placeholder="Category Name"
                    value={catName}
                    onChange={(e) => setCatName(e.target.value)}
                    required
                  />
                  <Input
                    placeholder="Short Description"
                    value={catDesc}
                    onChange={(e) => setCatDesc(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" disabled={createCategoryMut.isPending}>
                  Add Category
                </Button>
              </form>

              <div className="grid gap-4 sm:grid-cols-2">
                {(catsData?.categories || []).map((c) => (
                  <div key={c.id} className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4">
                    <Package className="h-6 w-6 text-blue-600 shrink-0" />
                    <div>
                      <p className="font-semibold text-slate-900">{c.name}</p>
                      <p className="text-xs text-slate-500">/{c.slug}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'notifications' && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Recipient</th>
                    <th className="px-4 py-3">Template</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Message</th>
                    <th className="px-4 py-3">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {(notifData?.logs || []).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                        No notification events triggered yet. Place an order or update an order status to generate a notification log.
                      </td>
                    </tr>
                  ) : (
                    notifData!.logs.map((log) => (
                      <tr key={log.id}>
                        <td className="px-4 py-3 font-mono text-xs">{log.recipientPhone}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">{log.templateName}</td>
                        <td className="px-4 py-3 text-xs font-semibold">{log.status}</td>
                        <td className="px-4 py-3 text-xs text-slate-700 max-w-xs truncate">
                          {log.messageBody}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">
                          {formatDateTime(log.createdAt)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
