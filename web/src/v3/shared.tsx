import { ReactNode } from 'react';
import { Classification, DomainKey, Role } from './types';

export const CLS: Record<Classification, { label: string; badge: string; dot: string }> = {
  CRITICAL:   { label: 'Critical',   badge: 'bg-red-100 text-red-700 ring-red-200',             dot: 'bg-red-500' },
  EMERGING:   { label: 'Emerging',   badge: 'bg-amber-100 text-amber-700 ring-amber-200',       dot: 'bg-amber-500' },
  FUNCTIONAL: { label: 'Functional', badge: 'bg-emerald-100 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
  FOUNDATION: { label: 'Foundation', badge: 'bg-green-100 text-green-800 ring-green-300',       dot: 'bg-green-600' },
};

export const ROLE_STYLE: Record<Role, string> = {
  P1: 'bg-slate-900 text-white', P1_PRIMARY: 'bg-slate-900 text-white',
  P1_SECONDARY: 'bg-slate-700 text-white', P2: 'bg-slate-600 text-white',
  SUPPORT: 'bg-sky-100 text-sky-700', MAINTAIN: 'bg-emerald-100 text-emerald-700',
  MONITOR: 'bg-indigo-100 text-indigo-700', DEFER: 'bg-slate-100 text-slate-500',
};

export const DOMAIN_ES: Record<DomainKey, string> = {
  STRENGTH: 'Fuerza', MOBILITY: 'Movilidad', AEROBIC: 'Aeróbico', MOVEMENT: 'Movimiento',
};

export const INPUT = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900';
export const LABEL = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500';

export function Badge({ c }: { c: Classification }) {
  const s = CLS[c];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${s.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />{s.label}
    </span>
  );
}

export function Card({ title, right, children }: { title?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {title && (
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
          {right}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function ErrorBanner({ code, message }: { code: string; message: string }) {
  const missing = code === 'MISSING_CANONICAL';
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${missing ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-red-300 bg-red-50 text-red-700'}`}>
      <p className="font-semibold">{missing ? 'Dato canónico faltante — el sistema no inventa' : 'Error'}</p>
      <p className="mt-1">{message}</p>
    </div>
  );
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem('htc_token');
  const res = await fetch(`/api/v3${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.message ?? `HTTP ${res.status}`), { code: body.error ?? 'ERROR' });
  return body as T;
}
