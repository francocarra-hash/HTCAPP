import { ReactNode } from 'react';
import { Classification, Pathway, Role } from './types';

export const CLASSIFICATION_STYLE: Record<Classification, { label: string; badge: string; dot: string }> = {
  CRITICAL:       { label: 'Critical',    badge: 'bg-red-100 text-red-700 ring-red-200',          dot: 'bg-red-500' },
  EMERGING:       { label: 'Emerging',    badge: 'bg-amber-100 text-amber-700 ring-amber-200',    dot: 'bg-amber-500' },
  FUNCTIONAL:     { label: 'Functional',  badge: 'bg-emerald-100 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
  FOUNDATION:     { label: 'Foundation',  badge: 'bg-green-100 text-green-800 ring-green-300',    dot: 'bg-green-600' },
  NOT_ASSESSED:   { label: 'No evaluado', badge: 'bg-slate-100 text-slate-500 ring-slate-200',    dot: 'bg-slate-400' },
  INVALID_RESULT: { label: 'Inválido',    badge: 'bg-slate-200 text-slate-600 ring-slate-300',    dot: 'bg-slate-500' },
};

export const PATHWAY_STYLE: Record<Pathway, string> = {
  RESTORE: 'bg-rose-600',
  MOVE: 'bg-violet-600',
  BUILD: 'bg-blue-600',
  PERFORM: 'bg-emerald-600',
  SUSTAIN: 'bg-teal-600',
};

export const ROLE_STYLE: Record<Role, string> = {
  P1: 'bg-slate-900 text-white',
  P2: 'bg-slate-700 text-white',
  P3: 'bg-slate-500 text-white',
  SUPPORT: 'bg-sky-100 text-sky-700',
  MAINTAIN: 'bg-emerald-100 text-emerald-700',
  DEFER: 'bg-slate-100 text-slate-500',
  MONITOR: 'bg-indigo-100 text-indigo-700',
  UNCONFIRMED: 'bg-amber-100 text-amber-700',
};

export const DOMAIN_LABEL: Record<string, string> = {
  DOMAIN_GENERAL_HEALTH: 'Salud General',
  DOMAIN_MOVEMENT: 'Movement',
  DOMAIN_STRENGTH: 'Strength',
  DOMAIN_MOBILITY: 'Mobility',
  DOMAIN_AEROBIC: 'Aerobic',
};

export function Badge({ classification }: { classification: Classification }) {
  const s = CLASSIFICATION_STYLE[classification];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${s.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

export function Card({ title, right, children, className = '' }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {(title || right) && (
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
          {right}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function ConfidenceBar({ label, value }: { label: string; value: number }) {
  const color = value >= 80 ? 'bg-emerald-500' : value >= 50 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-slate-500">
        <span>{label}</span>
        <span className="font-semibold text-slate-700">{value}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
    </div>
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
