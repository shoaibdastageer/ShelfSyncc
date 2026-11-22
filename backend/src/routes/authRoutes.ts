import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { repo, toSafeUser } from '../db/repository';
import {
  SESSION_COOKIE_NAME,
  optionalAuth,
  requireAuth,
  signSessionToken,
} from '../middleware/auth';
import { generateRandomToken } from '../utils/crypto';
import { env } from '../config/env';

const router = Router();

const registerSchema = z.object({
  fullName: z.string().min(2).max(120),
  email: z.string().email(),
  phone: z.string().min(10).max(20).optional(),
  password: z.string().min(6).max(128),
  whatsappOptIn: z.boolean().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function setAuthCookie(res: import('express').Response, token: string) {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.nodeEnv === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

router.post('/auth/register', async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid registration data.' });
      return;
    }

    const existing = await repo.findUserByEmail(parsed.data.email);
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    const user = await repo.createUser({
      fullName: parsed.data.fullName.trim(),
      email: parsed.data.email.trim().toLowerCase(),
      phone: parsed.data.phone?.trim(),
      passwordHash,
      whatsappOptIn: parsed.data.whatsappOptIn ?? true,
    });

    const token = signSessionToken({ userId: user.id, role: user.role, email: user.email });
    setAuthCookie(res, token);

    res.status(201).json({
      user: toSafeUser(user),
      token,
      verificationToken: user.verificationToken,
      message: 'Account created successfully.',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/auth/login', async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Valid email and password are required.' });
      return;
    }

    const user = await repo.findUserByEmail(parsed.data.email);
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const token = signSessionToken({ userId: user.id, role: user.role, email: user.email });
    setAuthCookie(res, token);

    res.json({
      user: toSafeUser(user),
      token,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/auth/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

router.get('/auth/session', optionalAuth, async (req, res, next) => {
  try {
    if (!req.auth) {
      res.json({ user: null });
      return;
    }
    const user = await repo.findUserById(req.auth.userId);
    res.json({ user: user ? toSafeUser(user) : null });
  } catch (err) {
    next(err);
  }
});

router.get('/auth/me', requireAuth, async (req, res, next) => {
  try {
    const user = await repo.findUserById(req.auth!.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    res.json({ user: toSafeUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post('/auth/verify-email', async (req, res, next) => {
  try {
    const token = String(req.body?.token || '').trim();
    if (!token) {
      res.status(400).json({ error: 'Verification token is required.' });
      return;
    }
    const ok = await repo.verifyUserEmail(token);
    if (!ok) {
      res.status(400).json({ error: 'Invalid or already used verification token.' });
      return;
    }
    res.json({ verified: true, message: 'Email verified successfully.' });
  } catch (err) {
    next(err);
  }
});

router.post('/auth/forgot-password', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) {
      res.status(400).json({ error: 'Email is required.' });
      return;
    }
    const token = generateRandomToken(20);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const found = await repo.setResetToken(email, token, expiresAt);

    // Return generic confirmation; in development mode include resetToken for testing flow
    res.json({
      ok: true,
      message: 'If an account matches that email, a password reset link has been generated.',
      ...(found && env.nodeEnv !== 'production' ? { devResetToken: token } : {}),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/auth/reset-password', async (req, res, next) => {
  try {
    const token = String(req.body?.token || '').trim();
    const newPassword = String(req.body?.password || '');
    if (!token || newPassword.length < 6) {
      res.status(400).json({ error: 'Valid reset token and password (min 6 chars) are required.' });
      return;
    }
    const hash = await bcrypt.hash(newPassword, 10);
    const ok = await repo.resetPasswordWithToken(token, hash);
    if (!ok) {
      res.status(400).json({ error: 'Reset token is invalid or has expired.' });
      return;
    }
    res.json({ ok: true, message: 'Password has been reset. You can now sign in.' });
  } catch (err) {
    next(err);
  }
});

// Customer Profile & Saved Addresses
router.get('/account/profile', requireAuth, async (req, res, next) => {
  try {
    const user = await repo.findUserById(req.auth!.userId);
    const addresses = await repo.listUserAddresses(req.auth!.userId);
    res.json({ user: user ? toSafeUser(user) : null, addresses });
  } catch (err) {
    next(err);
  }
});

router.patch('/account/profile', requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      fullName: z.string().min(2).max(120).optional(),
      phone: z.string().min(8).max(20).nullable().optional(),
      whatsappOptIn: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid profile update payload.' });
      return;
    }
    const updated = await repo.updateUserProfile(req.auth!.userId, parsed.data);
    res.json({ user: updated ? toSafeUser(updated) : null });
  } catch (err) {
    next(err);
  }
});

router.get('/account/addresses', requireAuth, async (req, res, next) => {
  try {
    const addresses = await repo.listUserAddresses(req.auth!.userId);
    res.json({ addresses });
  } catch (err) {
    next(err);
  }
});

router.post('/account/addresses', requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      label: z.string().min(1).max(50).default('Home'),
      fullName: z.string().min(2).max(120),
      phone: z.string().min(10).max(20),
      line1: z.string().min(4).max(255),
      line2: z.string().max(255).nullable().optional(),
      city: z.string().min(2).max(100),
      state: z.string().min(2).max(100),
      pinCode: z.string().regex(/^\d{6}$/, 'Enter a valid 6-digit Indian PIN code'),
      isDefault: z.boolean().default(false),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid address.' });
      return;
    }
    const address = await repo.createAddress(req.auth!.userId, {
      ...parsed.data,
      line2: parsed.data.line2 ?? null,
    });
    res.status(201).json({ address });
  } catch (err) {
    next(err);
  }
});

router.post('/account/addresses/:id/default', requireAuth, async (req, res, next) => {
  try {
    await repo.setDefaultAddress(req.auth!.userId, String(req.params.id));
    const addresses = await repo.listUserAddresses(req.auth!.userId);
    res.json({ addresses });
  } catch (err) {
    next(err);
  }
});

router.delete('/account/addresses/:id', requireAuth, async (req, res, next) => {
  try {
    await repo.deleteAddress(req.auth!.userId, String(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
