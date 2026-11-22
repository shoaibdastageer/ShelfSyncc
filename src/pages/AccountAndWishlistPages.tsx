import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut, MapPin, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/src/lib/api';
import { useAuth } from '@/src/context/AuthContext';
import { useShop } from '@/src/context/ShopContext';
import type { Address, User } from '@/src/types/shop';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { ProductCard } from '@/src/components/ProductCard';

export function AccountPage() {
  const { user, logout, refreshUser, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsappOptIn, setWhatsappOptIn] = useState(true);

  const [addrLabel, setAddrLabel] = useState('Home');
  const [addrName, setAddrName] = useState('');
  const [addrPhone, setAddrPhone] = useState('');
  const [line1, setLine1] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [isDefault, setIsDefault] = useState(true);

  const { data } = useQuery({
    queryKey: ['account-profile'],
    queryFn: () => apiFetch<{ user: User; addresses: Address[] }>('/api/account/profile'),
    enabled: Boolean(user),
  });

  useEffect(() => {
    if (data?.user) {
      setFullName(data.user.fullName);
      setPhone(data.user.phone || '');
      setWhatsappOptIn(data.user.whatsappOptIn);
      setAddrName(data.user.fullName);
      setAddrPhone(data.user.phone || '');
    }
  }, [data]);

  const profileMutation = useMutation({
    mutationFn: () =>
      apiFetch('/api/account/profile', {
        method: 'PATCH',
        body: { fullName, phone: phone || null, whatsappOptIn },
      }),
    onSuccess: async () => {
      await refreshUser();
      queryClient.invalidateQueries({ queryKey: ['account-profile'] });
      toast.success('Profile saved');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const addAddressMutation = useMutation({
    mutationFn: () =>
      apiFetch('/api/account/addresses', {
        method: 'POST',
        body: {
          label: addrLabel,
          fullName: addrName,
          phone: addrPhone,
          line1,
          city,
          state: stateName,
          pinCode,
          isDefault,
        },
      }),
    onSuccess: () => {
      toast.success('Address saved');
      setLine1('');
      setCity('');
      setStateName('');
      setPinCode('');
      queryClient.invalidateQueries({ queryKey: ['account-profile'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const setDefaultMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/account/addresses/${id}/default`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Default address updated');
      queryClient.invalidateQueries({ queryKey: ['account-profile'] });
    },
  });

  const deleteAddressMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/account/addresses/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Address deleted');
      queryClient.invalidateQueries({ queryKey: ['account-profile'] });
    },
  });

  if (loading) {
    return <div className="mx-auto max-w-5xl px-4 py-14 text-sm text-slate-600">Loading account...</div>;
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-bold text-slate-900">Sign in to view your account</h1>
        <Button asChild className="mt-5">
          <Link to="/login?redirect=/account">Sign In</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">My Account</h1>
          <p className="mt-1 text-sm text-slate-600">
            {user.email} · Role: <span className="font-medium capitalize">{user.role}</span> ·{' '}
            {user.emailVerified ? 'Email verified' : 'Pending email verification'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button asChild variant="outline">
            <Link to="/orders">My Orders</Link>
          </Button>
          {user.role === 'admin' && (
            <Button asChild variant="navy">
              <Link to="/admin">Admin Dashboard</Link>
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={async () => {
              await logout();
              navigate('/');
            }}
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-12">
        {/* Profile Form */}
        <div className="lg:col-span-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              profileMutation.mutate();
            }}
            className="rounded-xl border border-slate-200 bg-white p-6 space-y-4"
          >
            <h2 className="font-display text-lg font-semibold text-slate-900">Profile &amp; Preferences</h2>
            <div>
              <label htmlFor="prof-name" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Full Name
              </label>
              <Input id="prof-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="prof-phone" className="block text-xs font-semibold text-slate-700 mb-1.5">
                WhatsApp / Mobile Number
              </label>
              <Input
                id="prof-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+919876543210"
              />
            </div>
            <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={whatsappOptIn}
                onChange={(e) => setWhatsappOptIn(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600"
              />
              Opt in to WhatsApp payment &amp; delivery updates
            </label>
            <Button type="submit" disabled={profileMutation.isPending}>
              {profileMutation.isPending ? 'Saving...' : 'Save Profile'}
            </Button>
          </form>
        </div>

        {/* Saved Addresses */}
        <div className="lg:col-span-7 space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="font-display text-lg font-semibold text-slate-900">Saved Addresses</h2>
            <div className="mt-4 space-y-3">
              {(data?.addresses || []).length === 0 ? (
                <p className="text-sm text-slate-500">No saved addresses yet.</p>
              ) : (
                (data?.addresses || []).map((addr) => (
                  <div
                    key={addr.id}
                    className="flex flex-col justify-between gap-3 rounded-lg border border-slate-200 p-4 sm:flex-row sm:items-center"
                  >
                    <div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <MapPin className="h-3.5 w-3.5 text-blue-600" />
                        <span className="font-semibold text-slate-900">{addr.label}</span>
                        {addr.isDefault && (
                          <span className="font-semibold text-blue-600">· Default</span>
                        )}
                      </div>
                      <p className="mt-1 text-sm font-medium text-slate-900">
                        {addr.fullName} · {addr.phone}
                      </p>
                      <p className="text-sm text-slate-600">
                        {addr.line1}, {addr.city}, {addr.state} — {addr.pinCode}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!addr.isDefault && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setDefaultMutation.mutate(addr.id)}
                        >
                          Set Default
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={`Delete ${addr.label} address`}
                        onClick={() => deleteAddressMutation.mutate(addr.id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              addAddressMutation.mutate();
            }}
            className="rounded-xl border border-slate-200 bg-slate-50 p-6 space-y-4"
          >
            <h3 className="flex items-center gap-2 font-display text-base font-semibold text-slate-900">
              <Plus className="h-4 w-4 text-blue-600" />
              Add New Delivery Address
            </h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                placeholder="Label (Home/Office)"
                value={addrLabel}
                onChange={(e) => setAddrLabel(e.target.value)}
                required
              />
              <Input
                placeholder="Recipient Name"
                value={addrName}
                onChange={(e) => setAddrName(e.target.value)}
                required
              />
              <Input
                placeholder="Phone (+91...)"
                value={addrPhone}
                onChange={(e) => setAddrPhone(e.target.value)}
                required
              />
            </div>
            <Input
              placeholder="Street address, flat/building"
              value={line1}
              onChange={(e) => setLine1(e.target.value)}
              required
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <Input placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} required />
              <Input placeholder="State" value={stateName} onChange={(e) => setStateName(e.target.value)} required />
              <Input
                placeholder="6-digit PIN"
                value={pinCode}
                onChange={(e) => setPinCode(e.target.value)}
                pattern="\d{6}"
                required
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Make this my default shipping address
            </label>
            <Button type="submit" disabled={addAddressMutation.isPending}>
              {addAddressMutation.isPending ? 'Saving...' : 'Save Address'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

export function WishlistPage() {
  const { user } = useAuth();
  const { wishlistProducts } = useShop();

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-bold text-slate-900">Your Wishlist</h1>
        <p className="mt-2 text-sm text-slate-600">Sign in to view and manage your saved products.</p>
        <Button asChild className="mt-6">
          <Link to="/login?redirect=/wishlist">Sign In</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-2xl font-bold text-slate-900">
        Saved Wishlist ({wishlistProducts.length})
      </h1>
      {wishlistProducts.length === 0 ? (
        <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-12 text-center">
          <p className="text-sm text-slate-600">You have not saved any products yet.</p>
          <Button asChild className="mt-4">
            <Link to="/search">Explore Products</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {wishlistProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
