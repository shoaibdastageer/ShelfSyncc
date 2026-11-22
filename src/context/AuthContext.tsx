import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiFetch, getStoredToken, setStoredToken } from '@/src/lib/api';
import type { User } from '@/src/types/shop';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (payload: {
    fullName: string;
    email: string;
    phone?: string;
    password: string;
    whatsappOptIn?: boolean;
  }) => Promise<{ user: User; verificationToken?: string | null }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const res = await apiFetch<{ user: User | null }>('/api/auth/session');
      setUser(res.user);
      if (!res.user && getStoredToken()) {
        setStoredToken(null);
      }
    } catch {
      setUser(null);
      if (getStoredToken()) setStoredToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    const res = await apiFetch<{ user: User; token: string }>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    setStoredToken(res.token);
    setUser(res.user);
    return res.user;
  };

  const register = async (payload: {
    fullName: string;
    email: string;
    phone?: string;
    password: string;
    whatsappOptIn?: boolean;
  }) => {
    const res = await apiFetch<{ user: User; token: string; verificationToken?: string | null }>(
      '/api/auth/register',
      {
        method: 'POST',
        body: payload,
      }
    );
    setStoredToken(res.token);
    setUser(res.user);
    return { user: res.user, verificationToken: res.verificationToken };
  };

  const logout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setStoredToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
