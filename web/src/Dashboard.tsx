import { useEffect, useState } from 'react';
import { api } from './api';
import { ClientSummary, Pathway } from './types';
import { Card, PATHWAY_STYLE, Spinner } from './ui';

export default function Dashboard({ onNew, onOpenDecision }: {
  onNew: () => void;
  onOpenDecision: (decisionId: string) => void;
}) {
  const [clients, setClients] = useState<ClientSummary[] | null>(null);

  useEffect(() => {
    api.clients().then((r) => setClients(r.clients)).catch(() => setClients([]));
  }, []);

  if (!clients) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tus clientes</h1>
          <p className="mt-1 text-sm text-slate-500">
            Evaluación → Decisión → Confirmación del coach → Reporte
          </p>
        </div>
        <button
          onClick={onNew}
          className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700"
        >
          + Nueva evaluación
        </button>
      </div>

      {clients.length === 0 ? (
        <Card>
          <div className="py-10 text-center">
            <p className="text-lg font-semibold text-slate-700">Todavía no hay evaluaciones</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
              Cargá la primera evaluación para que el Decision Engine identifique el bottleneck
              principal y proponga el pathway HTC.
            </p>
            <button
              onClick={onNew}
              className="mt-6 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
            >
              Empezar
            </button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {clients.map((c) => (
            <button
              key={c.id}
              onClick={() => c.last_assessment && onOpenDecision(c.last_assessment.decision_id)}
              className="group rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-slate-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-slate-900">{c.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {c.age} años · {c.sex === 'MALE' ? 'M' : 'F'}
                    {c.activity_level ? ` · ${c.activity_level}` : ''}
                  </p>
                </div>
                {c.last_assessment?.pathway && (
                  <span className={`rounded-full px-3 py-1 text-xs font-bold text-white ${PATHWAY_STYLE[c.last_assessment.pathway as Pathway]}`}>
                    {c.last_assessment.pathway}
                  </span>
                )}
              </div>
              <div className="mt-4 space-y-1 text-sm">
                <p className="text-slate-600">
                  <span className="text-slate-400">P1: </span>
                  {c.last_assessment?.p1?.replace('CAP_', '').replaceAll('_', ' ') ?? '—'}
                </p>
                <p className="text-xs text-slate-400">
                  {c.assessments_count} evaluación{c.assessments_count === 1 ? '' : 'es'} ·{' '}
                  {c.last_assessment?.coach_confirmed === true
                    ? '✓ confirmada por coach'
                    : c.last_assessment?.coach_confirmed === false
                      ? '✗ override del coach'
                      : 'pendiente de confirmación'}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
