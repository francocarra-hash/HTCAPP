import { AssessResponse, CanonicalTest, ClientReport, ClientSummary, Decision } from './types';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

const TOKEN_KEY = 'htc_token';
export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string): void => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = (): void => localStorage.removeItem(TOKEN_KEY);

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: () => void): void => { onUnauthorized = fn; };

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/login') {
    clearToken();
    onUnauthorized?.();
  }
  if (!res.ok) {
    throw new ApiError(res.status, body.error ?? 'ERROR', body.message ?? `HTTP ${res.status}`);
  }
  return body as T;
}

export const api = {
  login: (password: string) => req<{ token: string | null; auth_enabled: boolean }>('/login', { method: 'POST', body: JSON.stringify({ password }) }),
  tests: () => req<{ tests: CanonicalTest[] }>('/canonical/tests'),
  version: () => req<{ canonical_version: string; auth_enabled: boolean }>('/canonical/version'),
  clients: () => req<{ clients: ClientSummary[] }>('/clients'),
  assess: (payload: unknown) => req<AssessResponse>('/assess', { method: 'POST', body: JSON.stringify(payload) }),
  decision: (id: string) => req<{ decision: Decision }>(`/decisions/${id}`),
  confirm: (id: string, payload: unknown) =>
    req<{ decision_id: string; coach_confirmation: Decision['coach_confirmation'] }>(
      `/decisions/${id}/confirm`,
      { method: 'POST', body: JSON.stringify(payload) },
    ),
  report: (id: string, lang: 'es' | 'en') => req<ClientReport>(`/decisions/${id}/report?lang=${lang}`),
};
