/**
 * Minimal single-coach auth for the pilot (Phase 2 replaces this).
 * Enabled only when HTC_AUTH_PASSWORD is set; otherwise the API is open
 * (local development / tests).
 *
 * Token: HMAC-SHA256-signed payload with expiry — no external deps.
 * Password check: scrypt against HTC_AUTH_PASSWORD (plain env var for the
 * single-coach pilot; the comparison is timing-safe).
 */
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { NextFunction, Request, Response } from 'express';

const TOKEN_TTL_MS = 1000 * 60 * 60 * 12; // 12h session

function secret(): string {
  // Derived from the password so a restart doesn't need extra config;
  // HTC_AUTH_SECRET overrides for multi-instance deploys.
  return process.env.HTC_AUTH_SECRET ?? `htc:${process.env.HTC_AUTH_PASSWORD ?? ''}`;
}

export function authEnabled(): boolean {
  return Boolean(process.env.HTC_AUTH_PASSWORD);
}

export function verifyPassword(password: string): boolean {
  const expected = process.env.HTC_AUTH_PASSWORD ?? '';
  if (!expected) return false;
  const salt = 'htc-pilot-salt';
  const a = scryptSync(password, salt, 32);
  const b = scryptSync(expected, salt, 32);
  return timingSafeEqual(a, b);
}

export function issueToken(): string {
  const payload = JSON.stringify({ sub: 'coach', exp: Date.now() + TOKEN_TTL_MS, jti: randomBytes(8).toString('hex') });
  const body = Buffer.from(payload).toString('base64url');
  const sig = createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken(token: string): boolean {
  const [body, sig] = token.split('.');
  if (!body || !sig) return false;
  const expected = createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as { exp?: number };
    return typeof payload.exp === 'number' && payload.exp > Date.now();
  } catch {
    return false;
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!authEnabled()) return next();
  if (req.path === '/login' || req.path === '/canonical/version') return next();
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token && verifyToken(token)) return next();
  res.status(401).json({ error: 'UNAUTHORIZED', message: 'Login required.' });
}
