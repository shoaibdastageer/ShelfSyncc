import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { repo } from '../db/repository';
import type { UserRole } from '../types/domain';

export interface AuthPayload {
  userId: string;
  role: UserRole;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
      rawBody?: Buffer;
    }
  }
}

export const SESSION_COOKIE_NAME = 'shelfsync_session';

export function signSessionToken(payload: AuthPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: '7d' });
}

export function verifySessionToken(token: string): AuthPayload | null {
  try {
    return jwt.verify(token, env.jwtSecret) as AuthPayload;
  } catch {
    return null;
  }
}

function extractToken(req: Request): string | null {
  const cookieToken = req.cookies?.[SESSION_COOKIE_NAME];
  if (typeof cookieToken === 'string' && cookieToken.length > 0) {
    return cookieToken;
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return null;
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (token) {
    const decoded = verifySessionToken(token);
    if (decoded) {
      req.auth = decoded;
    }
  }
  next();
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  const decoded = verifySessionToken(token);
  if (!decoded) {
    res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' });
    return;
  }
  const user = await repo.findUserById(decoded.userId);
  if (!user) {
    res.status(401).json({ error: 'Account not found.' });
    return;
  }
  req.auth = { userId: user.id, role: user.role, email: user.email };
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.auth) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  const user = await repo.findUserById(req.auth.userId);
  if (!user || user.role !== 'admin') {
    res.status(403).json({ error: 'Admin privileges required for this resource.' });
    return;
  }
  next();
}
