import { useEffect, useState } from 'react';
import { api, ApiError } from './api';
import { ClientReport } from './types';
import { Card, ErrorBanner, Spinner } from './ui';

export default function ReportView({ decisionId, onBack }: { decisionId: string; onBack: () => void }) {
  const [lang, setLang] = useState<'es' | 'en'>('es');
  const [report, setReport] = useState<ClientReport | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);

  useEffect(() => {
    setReport(null);
    api.report(decisionId, lang).then(setReport).catch((e: ApiError) => setError({ code: e.code, message: e.message }));
  }, [decisionId, lang]);

  if (error) return <div className="space-y-4"><button onClick={onBack} className="text-sm text-slate-500">← Volver</button><ErrorBanner code={error.code} message={error.message} /></div>;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-sm font-medium text-slate-500 hover:text-slate-900">← Volver a la decisión</button>
        <div className="flex overflow-hidden rounded-lg border border-slate-300 text-sm font-semibold">
          {(['es', 'en'] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`px-4 py-1.5 ${lang === l ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {!report ? <Spinner /> : (
        <div className="space-y-4">
          {report.sections.filter((s) => s.content.length > 0).map((s) => (
            <Card key={s.id} title={s.title}>
              {s.id === 'PRIMARY_PRIORITY' ? (
                <p className="text-2xl font-bold tracking-tight">{s.content[0]}</p>
              ) : (
                <ul className="space-y-1.5">
                  {s.content.map((c, i) => (
                    <li key={i} className="flex gap-2 text-sm text-slate-700">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                      {c}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
          <p className="pb-6 text-center text-xs text-slate-400">
            HTC — {lang === 'es' ? 'Reporte generado desde el Canonical; lenguaje simplificado para el cliente' : 'Report generated from the Canonical; simplified client language'}
          </p>
        </div>
      )}
    </div>
  );
}
