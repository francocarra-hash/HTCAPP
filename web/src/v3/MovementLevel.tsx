import { useState } from 'react';
import { Classification, CatalogueLevel } from './types';

const CLS_LABEL: Record<Classification, string> = {
  FOUNDATION: 'Foundation', FUNCTIONAL: 'Functional', EMERGING: 'Emerging', CRITICAL: 'Critical',
};
const CLS_BTN: Record<Classification, string> = {
  FOUNDATION: 'border-green-500 bg-green-50 text-green-800',
  FUNCTIONAL: 'border-emerald-500 bg-emerald-50 text-emerald-800',
  EMERGING: 'border-amber-500 bg-amber-50 text-amber-800',
  CRITICAL: 'border-red-500 bg-red-50 text-red-800',
};
const ORDER: Classification[] = ['FOUNDATION', 'FUNCTIONAL', 'EMERGING', 'CRITICAL'];

export interface LevelState {
  /** Clasificación por variable de observación. */
  variables: Record<string, Classification>;
  notes: Record<string, string>;
  /** Si el coach fija el nivel a mano, prevalece sobre las variables. */
  override?: Classification | '';
  ceiling?: string;
  challenge?: string;
}

const input = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900';
const prettyVar = (v: string) => v.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());

export default function MovementLevel({
  level, rubric, state, onChange, challengeOrder,
}: {
  level: CatalogueLevel;
  rubric: Record<string, Record<string, string>> | undefined;
  state: LevelState;
  /**
   * Recibe un updater, no un valor: dos clasificaciones marcadas en el mismo
   * frame deben acumularse, no pisarse.
   */
  onChange: (update: (prev: LevelState) => LevelState) => void;
  challengeOrder: string[];
}) {
  const [openVar, setOpenVar] = useState<string | null>(null);
  const filled = Object.keys(state.variables).length;
  const total = level.observation_variables.length;
  const complete = filled === total;

  const setVar = (v: string, c: Classification) =>
    onChange((prev) => ({ ...prev, variables: { ...prev.variables, [v]: c } }));
  const setNote = (v: string, t: string) =>
    onChange((prev) => ({ ...prev, notes: { ...prev.notes, [v]: t } }));

  return (
    <div className="rounded-lg border border-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800">
            L{level.sequence_number} — {level.name}
          </p>
          <p className="text-xs text-slate-500">{level.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${complete ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
            {filled}/{total} variables
          </span>
        </div>
      </div>

      <div className="space-y-2 p-4">
        {level.observation_variables.map((v) => {
          const chosen = state.variables[v];
          const isOpen = openVar === v;
          return (
            <div key={v} className="rounded-lg border border-slate-100 p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={() => setOpenVar(isOpen ? null : v)}
                  className="text-left text-sm font-medium text-slate-700 hover:text-slate-900"
                  title="Ver criterio canónico"
                >
                  {prettyVar(v)} <span className="text-xs text-slate-400">{isOpen ? '▾' : '▸'} criterio</span>
                </button>
                <div className="grid grid-cols-4 gap-1 sm:flex">
                  {ORDER.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setVar(v, c)}
                      className={`rounded-md border px-2 py-1.5 text-[11px] font-semibold transition sm:py-1 ${
                        chosen === c ? CLS_BTN[c] : 'border-slate-200 bg-white text-slate-500 hover:border-slate-400'
                      }`}
                    >
                      {CLS_LABEL[c]}
                    </button>
                  ))}
                </div>
              </div>

              {isOpen && rubric?.[v] && (() => {
                const criteria = rubric[v]!;
                return (
                  <div className="mt-3 space-y-2 rounded-md bg-slate-50 p-3">
                    {criteria.question && (
                      <p className="text-xs font-semibold text-slate-600">{criteria.question}</p>
                    )}
                    {ORDER.map((c) => criteria[c] && (
                      <div key={c} className="text-xs">
                        <span className={`font-bold ${
                          c === 'FOUNDATION' ? 'text-green-700' : c === 'FUNCTIONAL' ? 'text-emerald-700'
                          : c === 'EMERGING' ? 'text-amber-700' : 'text-red-700'}`}>
                          {CLS_LABEL[c]}:
                        </span>{' '}
                        <span className="text-slate-600">{criteria[c]}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {chosen && (
                <input
                  className={`${input} mt-2 text-xs`}
                  placeholder="Nota de observación (opcional, se guarda para los umbrales numéricos de v2.0)"
                  value={state.notes[v] ?? ''}
                  onChange={(e) => setNote(v, e.target.value)}
                />
              )}
            </div>
          );
        })}

        <div className="grid gap-3 pt-2 sm:grid-cols-2">
          {level.needs_coordination_ceiling && (
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Coordination ceiling (1-5)
              </label>
              <input
                className={input} type="number" min={1} max={5} placeholder="nivel máximo sostenido"
                value={state.ceiling ?? ''}
                onChange={(e) => { const v = e.target.value; onChange((prev) => ({ ...prev, ceiling: v })); }}
              />
            </div>
          )}
          {level.needs_problem_solving_ceiling && (
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Problem solving ceiling
              </label>
              <select
                className={input}
                value={state.challenge ?? ''}
                onChange={(e) => { const v = e.target.value; onChange((prev) => ({ ...prev, challenge: v })); }}
              >
                <option value="">— challenge alcanzado —</option>
                {challengeOrder.map((ch) => (
                  <option key={ch} value={ch}>{ch.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Clasificación del nivel
            </label>
            <select
              className={input}
              value={state.override ?? ''}
              onChange={(e) => { const v = e.target.value as Classification | ''; onChange((prev) => ({ ...prev, override: v })); }}
            >
              <option value="">
                {complete ? 'Derivar del rubric (recomendado)' : 'Completá las variables o fijala a mano'}
              </option>
              {ORDER.map((c) => <option key={c} value={c}>{CLS_LABEL[c]} (fijada por el coach)</option>)}
            </select>
          </div>
        </div>

        {!complete && !state.override && filled > 0 && (
          <p className="text-xs text-amber-700">
            Faltan {total - filled} variables. Completalas o fijá la clasificación a mano: el sistema no infiere.
          </p>
        )}
      </div>
    </div>
  );
}
