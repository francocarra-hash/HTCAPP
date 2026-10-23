/**
 * Auth del piloto: un coach + alumnos.
 *
 * Coach: habilitado sólo cuando HTC_AUTH_PASSWORD está seteada; si no, la API
 * del coach queda abierta (desarrollo local / tests).
 * Alumnos: usuario + contraseña propios (hash scrypt con sal aleatoria). Sus
 * tokens sólo abren /api/me; nunca las rutas del coach.
 *
 * Token: payload firmado con HMAC-SHA256 y vencimiento — sin dependencias.
 */
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { NextFunction, Request, Response } from 'express';

const TOKEN_TTL_MS = 1000 * 60 * 60 * 12; // coach: 12h
const STUDENT_TTL_MS = 1000 * 60 * 60 * 24 * 30; // alumno: 30 días (lo abre desde el celular)

export interface TokenPayload {
  sub: 'coach' | 'student';
  /** Id del alumno (sólo en tokens de alumno). */
  sid?: string;
  exp: number;
  jti: string;
}

function secret(): string {
  // Derived from the password so a restart doesn't need extra config;
  // HTC_AUTH_SECRET overrides for multi-instance deploys.
  return process.env.HTC_AUTH_SECRET ?? `htc:${process.env.HTC_AUTH_PASSWORD ?? ''}`;
}

export function authEnabled(): boolean {
  return Boolean(process.env.HTC_AUTH_PASSWORD);
}

/** Usuario con el que entra el coach (los alumnos no pueden usarlo). */
export function coachUsername(): string {
  return (process.env.HTC_COACH_USER ?? 'profe').trim().toLowerCase();
}

export function verifyPassword(password: string): boolean {
  const expected = process.env.HTC_AUTH_PASSWORD ?? '';
  if (!expected) return false;
  const salt = 'htc-pilot-salt';
  const a = scryptSync(password, salt, 32);
  const b = scryptSync(expected, salt, 32);
  return timingSafeEqual(a, b);
}

function sign(payload: TokenPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function issueToken(): string {
  return sign({ sub: 'coach', exp: Date.now() + TOKEN_TTL_MS, jti: randomBytes(8).toString('hex') });
}

export function issueStudentToken(studentId: string): string {
  return sign({ sub: 'student', sid: studentId, exp: Date.now() + STUDENT_TTL_MS, jti: randomBytes(8).toString('hex') });
}

/** Payload de un token válido y vigente; null si la firma no cierra o venció. */
export function readToken(token: string): TokenPayload | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString()) as Partial<TokenPayload>;
    if (typeof p.exp !== 'number' || p.exp <= Date.now()) return null;
    // Tokens emitidos antes de los roles: sub 'coach'.
    if (p.sub !== 'coach' && p.sub !== 'student') return null;
    if (p.sub === 'student' && !p.sid) return null;
    return p as TokenPayload;
  } catch {
    return null;
  }
}

/** Token válido de coach (un token de alumno no alcanza). */
export function verifyToken(token: string): boolean {
  return readToken(token)?.sub === 'coach';
}

export function bearer(req: Request): string {
  const header = req.headers.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!authEnabled()) return next();
  if (req.path === '/login' || req.path === '/canonical/version') return next();
  const token = bearer(req);
  if (token && verifyToken(token)) return next();
  res.status(401).json({ error: 'UNAUTHORIZED', message: 'Login required.' });
}

/** Rutas del alumno: siempre exigen token de alumno (aunque la auth del coach esté apagada). */
export function studentMiddleware(req: Request, res: Response, next: NextFunction): void {
  const p = readToken(bearer(req));
  if (p?.sub === 'student' && p.sid) {
    res.locals.studentId = p.sid;
    return next();
  }
  res.status(401).json({ error: 'UNAUTHORIZED', message: 'Login required.' });
}

/** Rutas compartidas (comunidad, fotos): profe o alumno. Deja el rol en res.locals. */
export function anyUserMiddleware(req: Request, res: Response, next: NextFunction): void {
  const p = readToken(bearer(req));
  if (p?.sub === 'student' && p.sid) {
    res.locals.role = 'student';
    res.locals.studentId = p.sid;
    return next();
  }
  if (p?.sub === 'coach' || !authEnabled()) {
    res.locals.role = 'coach';
    return next();
  }
  res.status(401).json({ error: 'UNAUTHORIZED', message: 'Login required.' });
}

// ── contraseñas de alumnos ──────────────────────────────────────────────────

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('base64url');
  const hash = scryptSync(password, salt, 32).toString('base64url');
  return `scrypt$${salt}$${hash}`;
}

export function checkPassword(password: string, stored: string): boolean {
  const [kind, salt, hash] = stored.split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const a = scryptSync(password, salt, 32);
  const b = Buffer.from(hash, 'base64url');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Contraseña inicial legible: nombre + 6 caracteres sin ambigüedades (sin l/1/o/0). */
export function generatePassword(base: string): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(6);
  let tail = '';
  for (const b of bytes) tail += alphabet[b % alphabet.length];
  const prefix = base.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 8) || 'htc';
  return `${prefix}-${tail}`;
}

// ── límite de intentos de login (memoria, por IP+usuario) ───────────────────

const attempts = new Map<string, { n: number; until: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

export function loginBlocked(key: string): boolean {
  const a = attempts.get(key);
  return Boolean(a && a.until > Date.now() && a.n >= MAX_ATTEMPTS);
}

export function recordLoginFailure(key: string): void {
  const a = attempts.get(key);
  if (!a || a.until <= Date.now()) attempts.set(key, { n: 1, until: Date.now() + WINDOW_MS });
  else a.n++;
}

export function clearLoginFailures(key: string): void {
  attempts.delete(key);
}
