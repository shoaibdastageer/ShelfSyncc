import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/src/context/AuthContext';
import { apiFetch } from '@/src/lib/api';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect') || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const user = await login(email, password);
      toast.success(`Welcome back, ${user.fullName}`);
      navigate(user.role === 'admin' && redirect === '/' ? '/admin' : redirect);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-xs">
        <h1 className="font-display text-2xl font-bold text-slate-900">Sign in to ShelfSync</h1>
        <p className="mt-1.5 text-sm text-slate-600">
          Access your orders, saved addresses, and persistent cart.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="login-email" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Email Address
            </label>
            <Input
              id="login-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="aarav@shelfsync.in"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="login-password" className="block text-xs font-semibold text-slate-700">
                Password
              </label>
              <Link to="/forgot-password" className="text-xs font-medium text-blue-600 hover:underline">
                Forgot password?
              </Link>
            </div>
            <Input
              id="login-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <Button type="submit" disabled={submitting} className="w-full" size="lg">
            {submitting ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>

        <div className="mt-6 border-t border-slate-200 pt-5">
          <p className="text-xs font-semibold text-slate-500 mb-2.5">Quick Demo Accounts</p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setEmail('aarav@shelfsync.in');
                setPassword('Customer@123');
              }}
            >
              Demo Customer
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setEmail('admin@shelfsync.in');
                setPassword('Admin@1234');
              }}
            >
              Demo Admin
            </Button>
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-slate-600">
          New to ShelfSync?{' '}
          <Link to="/register" className="font-semibold text-blue-600 hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [whatsappOptIn, setWhatsappOptIn] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await register({ fullName, email, phone, password, whatsappOptIn });
      toast.success('Account created! Please check verification status in your profile.');
      if (res.verificationToken) {
        await apiFetch('/api/auth/verify-email', {
          method: 'POST',
          body: { token: res.verificationToken },
        }).catch(() => {});
      }
      navigate('/account');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-xs">
        <h1 className="font-display text-2xl font-bold text-slate-900">Create ShelfSync Account</h1>
        <p className="mt-1.5 text-sm text-slate-600">
          Save addresses, track orders, and receive WhatsApp shipping alerts.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="reg-name" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Full Name
            </label>
            <Input
              id="reg-name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ananya Verma"
            />
          </div>

          <div>
            <label htmlFor="reg-email" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Email Address
            </label>
            <Input
              id="reg-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ananya@example.in"
            />
          </div>

          <div>
            <label htmlFor="reg-phone" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Phone Number (for WhatsApp order updates)
            </label>
            <Input
              id="reg-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+919876543210"
            />
          </div>

          <div>
            <label htmlFor="reg-password" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Password (minimum 6 characters)
            </label>
            <Input
              id="reg-password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Create a strong password"
            />
          </div>

          <label className="flex items-start gap-2.5 text-xs text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={whatsappOptIn}
              onChange={(e) => setWhatsappOptIn(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600"
            />
            <span>Receive order confirmations and delivery alerts on WhatsApp</span>
          </label>

          <Button type="submit" disabled={submitting} className="w-full" size="lg">
            {submitting ? 'Creating account...' : 'Create Account'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-blue-600 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [devResetToken, setDevResetToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [step, setStep] = useState<'request' | 'reset' | 'done'>('request');

  const requestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ ok: boolean; message: string; devResetToken?: string }>(
        '/api/auth/forgot-password',
        { method: 'POST', body: { email } }
      );
      toast.success(res.message);
      if (res.devResetToken) {
        setDevResetToken(res.devResetToken);
        setTokenInput(res.devResetToken);
      }
      setStep('reset');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Request failed');
    }
  };

  const confirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        body: { token: tokenInput, password: newPassword },
      });
      toast.success('Password updated successfully');
      setStep('done');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reset failed');
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-xs">
        <h1 className="font-display text-2xl font-bold text-slate-900">Reset Password</h1>

        {step === 'request' && (
          <form onSubmit={requestReset} className="mt-5 space-y-4">
            <p className="text-sm text-slate-600">
              Enter your registered ShelfSync email to generate a secure password reset token.
            </p>
            <div>
              <label htmlFor="fp-email" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Email Address
              </label>
              <Input
                id="fp-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full">
              Send Reset Token
            </Button>
          </form>
        )}

        {step === 'reset' && (
          <form onSubmit={confirmReset} className="mt-5 space-y-4">
            {devResetToken && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
                Development reset token generated: <span className="font-mono">{devResetToken}</span>
              </div>
            )}
            <div>
              <label htmlFor="rp-token" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Reset Token
              </label>
              <Input
                id="rp-token"
                required
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="rp-pass" className="block text-xs font-semibold text-slate-700 mb-1.5">
                New Password
              </label>
              <Input
                id="rp-pass"
                type="password"
                minLength={6}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full">
              Update Password
            </Button>
          </form>
        )}

        {step === 'done' && (
          <div className="mt-5 space-y-4">
            <p className="text-sm text-emerald-700 font-medium">
              Your password has been reset. You can now sign in with your new credentials.
            </p>
            <Button asChild className="w-full">
              <Link to="/login">Go to Sign In</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
