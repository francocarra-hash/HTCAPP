import { useCallback, useEffect, useState } from 'react';
import { api, clearToken, getToken, setUnauthorizedHandler } from './api';
import Dashboard from './Dashboard';
import AssessmentForm from './AssessmentForm';
import DecisionView from './DecisionView';
import ReportView from './ReportView';
import Login from './Login';
import V3App from './v3/V3App';

type View =
  | { name: 'dashboard' }
  | { name: 'new' }
  | { name: 'decision'; id: string }
  | { name: 'report'; id: string };

export default function App() {
  const [view, setView] = useState<View>({ name: 'dashboard' });
  const [version, setVersion] = useState('');
  const [authEnabled, setAuthEnabled] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);
  // OS v3.0 es la fuente de verdad vigente; v2 queda accesible como histórico.
  const [engine, setEngine] = useState<'v3' | 'v2'>('v3');
  const [v3Available, setV3Available] = useState<boolean | null>(null);
  const [v3Thresholds, setV3Thresholds] = useState('');

  useEffect(() => {
    // La versión se lee del Canonical, nunca se escribe a mano en la UI.
    fetch('/api/v3/canonical/versions')
      .then(async (r) => {
        setV3Available(r.ok);
        if (r.ok) {
          const body = await r.json();
          setV3Thresholds(body.versions?.thresholds_version ?? '');
        }
      })
      .catch(() => setV3Available(false));
  }, []);

  const bootstrap = useCallback(() => {
    api.version()
      .then((v) => {
        setVersion(v.canonical_version);
        setAuthEnabled(v.auth_enabled);
        setAuthed(!v.auth_enabled || Boolean(getToken()));
      })
      .catch(() => {
        setVersion('—');
        setAuthed(true);
      });
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setAuthed(false));
    bootstrap();
  }, [bootstrap]);

  const logout = () => {
    clearToken();
    setAuthed(false);
    setView({ name: 'dashboard' });
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3 sm:px-6">
          <button onClick={() => setView({ name: 'dashboard' })} className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-sm font-black text-white">H</span>
            <span className="min-w-0 text-left leading-tight">
              <span className="block truncate text-sm font-bold tracking-tight">HTC</span>
              <span className="block truncate text-[11px] text-slate-400">Sistema de decisiones</span>
            </span>
          </button>
          <div className="flex shrink-0 items-center gap-2">
            {v3Available && (
              <div className="flex overflow-hidden rounded-lg border border-slate-300 text-xs font-semibold">
                <button
                  onClick={() => setEngine('v3')}
                  className={`px-2.5 py-1.5 sm:px-3 ${engine === 'v3' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                  OS v3.0
                </button>
                <button
                  onClick={() => setEngine('v2')}
                  className={`px-2.5 py-1.5 sm:px-3 ${engine === 'v2' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                  title="Modelo anterior (histórico)"
                >
                  v2
                </button>
              </div>
            )}
            <span className="hidden rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500 md:inline">
              {engine === 'v3' ? `Thresholds v${v3Thresholds || '—'}` : `Canonical v${version}`}
            </span>
            {authEnabled && authed && (
              <button onClick={logout} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 hover:border-slate-400 hover:text-slate-800">
                Salir
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {authed === null ? null : !authed ? (
          <Login onDone={() => { setAuthed(true); setView({ name: 'dashboard' }); }} />
        ) : engine === 'v3' ? (
          <V3App />
        ) : (
          <>
            {view.name === 'dashboard' && (
              <Dashboard
                onNew={() => setView({ name: 'new' })}
                onOpenDecision={(id) => setView({ name: 'decision', id })}
              />
            )}
            {view.name === 'new' && (
              <AssessmentForm
                onDone={(id) => setView({ name: 'decision', id })}
                onCancel={() => setView({ name: 'dashboard' })}
              />
            )}
            {view.name === 'decision' && (
              <DecisionView
                decisionId={view.id}
                onBack={() => setView({ name: 'dashboard' })}
                onReport={(id) => setView({ name: 'report', id })}
              />
            )}
            {view.name === 'report' && (
              <ReportView decisionId={view.id} onBack={() => setView({ name: 'decision', id: view.id })} />
            )}
          </>
        )}
      </main>
    </div>
  );
}
