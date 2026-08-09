import { useEffect, useMemo, useState } from 'react';
import {
  AssessmentSummary, AssessmentV3, Catalogue, CoachConfirmation, DomainKey, Rubrics,
} from './types';
import { api, Badge, Card, DOMAIN_ES, ErrorBanner, INPUT, LABEL, ROLE_STYLE } from './shared';
import MovementLevel, { LevelState } from './MovementLevel';
import ResultView from './ResultView';

type View =
  | { name: 'dashboard' }
  | { name: 'new' }
  | { name: 'result'; assessment: AssessmentV3; confirmation: CoachConfirmation | null };

export default function V3App() {
  const [view, setView] = useState<View>({ name: 'dashboard' });
  const [cat, setCat] = useState<Catalogue | null>(null);
  const [rubrics, setRubrics] = useState<Rubrics>({});
  const [list, setList] = useState<AssessmentSummary[] | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Cliente
  const [name, setName] = useState('');
  const [age, setAge] = useState('35');
  const [sex, setSex] = useState<'MALE' | 'FEMALE'>('MALE');

  // Health gates
  const [parq, setParq] = useState(false);
  const [sbp, setSbp] = useState('');
  const [dbp, setDbp] = useState('');
  const [chestPain, setChestPain] = useState(false);
  const [pain, setPain] = useState('');
  const [redFlags, setRedFlags] = useState<string[]>([]);
  /** Antigüedad en semanas por red flag condicional (agudo STOP / crónico ALERT). */
  const [flagWeeks, setFlagWeeks] = useState<Record<string, string>>({});

  // Tests / Movement
  const [values, setValues] = useState<Record<string, string>>({});
  const [levels, setLevels] = useState<Record<string, LevelState>>({});

  const loadList = () => api<{ assessments: AssessmentSummary[] }>('/assessments')
    .then((r) => setList(r.assessments)).catch(() => setList([]));

  useEffect(() => {
    Promise.all([
      api<Catalogue>('/canonical/catalogue'),
      api<{ rubrics: Rubrics }>('/canonical/rubrics'),
    ]).then(([c, r]) => { setCat(c); setRubrics(r.rubrics); })
      .catch((e) => setError({ code: e.code ?? 'ERROR', message: e.message }));
    loadList();
  }, []);

  const byDomain = useMemo(() => {
    const m = new Map<DomainKey, Catalogue['tests']>();
    for (const t of cat?.tests ?? []) m.set(t.domain, [...(m.get(t.domain) ?? []), t]);
    return m;
  }, [cat]);

  const covered = (t: Catalogue['tests'][number]): boolean => {
    const a = Number(age);
    return t.populations.some((p) =>
      (p.sex == null || p.sex === sex) &&
      (p.age_min == null || a >= p.age_min) &&
      (p.age_max == null || a <= p.age_max));
  };

  const reset = () => {
    setName(''); setAge('35'); setSex('MALE');
    setParq(false); setSbp(''); setDbp(''); setChestPain(false); setPain(''); setRedFlags([]);
    setFlagWeeks({}); setValues({}); setLevels({}); setError(null);
  };

  const submit = async () => {
    setError(null); setBusy(true);
    try {
      const test_results = Object.entries(values)
        .filter(([, v]) => v.trim() !== '')
        .map(([test_key, v]) => ({ test_key, value: Number(v) }));

      const movement_levels = Object.entries(levels)
        .filter(([, s]) => s.override || Object.keys(s.variables).length > 0)
        .map(([level_id, s]) => ({
          level_id,
          observation_variables: Object.fromEntries(
            Object.entries(s.variables).map(([k, v]) => [k, {
              coach_observation: v, ...(s.notes[k]?.trim() ? { notes: s.notes[k] } : {}),
            }]),
          ),
          ...(s.override ? { coach_classification: s.override } : {}),
          ...(s.ceiling ? { coordination_ceiling: Number(s.ceiling) } : {}),
          ...(s.challenge ? { problem_solving_ceiling: s.challenge } : {}),
        }));

      const res = await api<{ assessment: AssessmentV3 }>('/assess', {
        method: 'POST',
        body: JSON.stringify({
          client: { name, age: Number(age), sex },
          health_gates: {
            parq_positive: parq || undefined,
            systolic_bp: sbp.trim() ? Number(sbp) : undefined,
            diastolic_bp: dbp.trim() ? Number(dbp) : undefined,
            chest_pain: chestPain || undefined,
            current_pain_level: pain.trim() ? Number(pain) : undefined,
            red_flags: redFlags,
            red_flag_weeks_since: Object.fromEntries(
              Object.entries(flagWeeks)
                .filter(([id, w]) => redFlags.includes(id) && w.trim() !== '')
                .map(([id, w]) => [id, Number(w)]),
            ),
          },
          test_results, movement_levels, language: 'es', audience: 'COACH',
        }),
      });
      setView({ name: 'result', assessment: res.assessment, confirmation: null });
      loadList();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      const err = e as Error & { code?: string };
      setError({ code: err.code ?? 'ERROR', message: err.message });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally { setBusy(false); }
  };

  const open = async (id: string) => {
    try {
      const res = await api<{ assessment: AssessmentV3; coach_confirmation: CoachConfirmation | null }>(`/assessments/${id}`);
      setView({ name: 'result', assessment: res.assessment, confirmation: res.coach_confirmation });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      const err = e as Error & { code?: string };
      setError({ code: err.code ?? 'ERROR', message: err.message });
    }
  };

  if (!cat && !error) return <div className="py-20 text-center text-slate-400">Cargando catálogo v3…</div>;

  // ── Resultado ─────────────────────────────────────────────────────────────
  if (view.name === 'result') {
    return (
      <ResultView
        result={view.assessment}
        confirmation={view.confirmation}
        overrideCategories={cat?.override_categories ?? []}
        onConfirmed={(c) => { setView({ ...view, confirmation: c }); loadList(); }}
        onBack={() => { setView({ name: 'dashboard' }); loadList(); }}
      />
    );
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────
  if (view.name === 'dashboard') {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Evaluaciones</h1>
            <p className="mt-1 text-sm text-slate-500">HTC OS v3.0 · Health Gates → Clasificación → Movement → Roadmap</p>
          </div>
          <button onClick={() => { reset(); setView({ name: 'new' }); }}
            className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 sm:w-auto">
            + Nueva evaluación
          </button>
        </div>

        {error && <ErrorBanner code={error.code} message={error.message} />}

        {!list ? (
          <div className="py-16 text-center text-slate-400">Cargando…</div>
        ) : list.length === 0 ? (
          <Card>
            <div className="py-10 text-center">
              <p className="text-lg font-semibold text-slate-700">Todavía no hay evaluaciones</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
                Cargá la primera para que el motor identifique el punto limitante y arme el roadmap de desarrollo.
              </p>
              <button onClick={() => { reset(); setView({ name: 'new' }); }}
                className="mt-6 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700">
                Empezar
              </button>
            </div>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {list.map((a) => (
              <button key={a.assessment_id} onClick={() => open(a.assessment_id)}
                className="rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-slate-300 hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{a.client_name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {a.client_age} años · {a.client_sex === 'MALE' ? 'M' : 'F'} · {new Date(a.timestamp).toLocaleDateString()}
                    </p>
                  </div>
                  {a.health_status === 'BLOCKED' ? (
                    <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700">BLOQUEADA</span>
                  ) : a.p1_domain ? (
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${ROLE_STYLE.P1}`}>
                      P1 {DOMAIN_ES[a.p1_domain]}
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">sin P1</span>
                  )}
                </div>
                <p className="mt-3 text-xs text-slate-400">
                  {a.rule_applied ?? '—'} ·{' '}
                  {a.coach_confirmed === true ? '✓ confirmada'
                    : a.coach_confirmed === false ? '✗ override del coach'
                    : 'pendiente de confirmación'}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Nueva evaluación ──────────────────────────────────────────────────────
  const testsLoaded = Object.values(values).filter((v) => v.trim()).length;
  const levelsLoaded = Object.values(levels).filter((s) => s.override || Object.keys(s.variables).length > 0).length;
  const safetyOnly = parq || chestPain || Number(sbp) >= 180 || Number(dbp) >= 110;
  const canSubmit = name.trim() !== '' && Number(age) > 0 && (testsLoaded > 0 || levelsLoaded > 0 || safetyOnly) && !busy;

  return (
    <div className="space-y-6 pb-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Nueva evaluación</h1>
        <button onClick={() => setView({ name: 'dashboard' })} className="shrink-0 text-sm font-medium text-slate-500 hover:text-slate-900">
          ← Volver
        </button>
      </div>

      {error && <ErrorBanner code={error.code} message={error.message} />}

      <Card title="Cliente">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <label className={LABEL}>Nombre</label>
            <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre y apellido" />
          </div>
          <div>
            <label className={LABEL}>Edad</label>
            <input className={INPUT} type="number" value={age} onChange={(e) => setAge(e.target.value)} />
          </div>
          <div>
            <label className={LABEL}>Sexo</label>
            <select className={INPUT} value={sex} onChange={(e) => setSex(e.target.value as 'MALE' | 'FEMALE')}>
              <option value="MALE">Masculino</option>
              <option value="FEMALE">Femenino</option>
            </select>
          </div>
        </div>
      </Card>

      <Card title="Health Gates (capa transversal — C-1)">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={LABEL}>Presión sistólica</label>
              <input className={INPUT} type="number" value={sbp} onChange={(e) => setSbp(e.target.value)} placeholder="120" />
            </div>
            <div>
              <label className={LABEL}>Presión diastólica</label>
              <input className={INPUT} type="number" value={dbp} onChange={(e) => setDbp(e.target.value)} placeholder="78" />
            </div>
            <div>
              <label className={LABEL}>Dolor actual (0-10)</label>
              <input className={INPUT} type="number" min={0} max={10} value={pain} onChange={(e) => setPain(e.target.value)} placeholder="0" />
            </div>
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-red-600" checked={parq} onChange={(e) => setParq(e.target.checked)} />
              <span className="font-semibold text-red-700">PAR-Q+ positivo</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-red-600" checked={chestPain} onChange={(e) => setChestPain(e.target.checked)} />
              <span className="font-semibold text-red-700">Dolor torácico</span>
            </label>
          </div>
          <p className="text-xs text-slate-500">
            Detienen la evaluación: PAR-Q+, PAS ≥180, PAD ≥110, dolor torácico. Dolor ≥6 marca sin detener.
          </p>
          <div>
            <label className={LABEL}>Red flags clínicas</label>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {(cat?.red_flags ?? []).map((rf) => {
                const checked = redFlags.includes(rf.id);
                const weeks = flagWeeks[rf.id] ?? '';
                // Condicional: dentro de la ventana es aguda (detiene); fuera, crónica (marca).
                const isAcute = rf.window_weeks != null && (weeks.trim() === '' || Number(weeks) < rf.window_weeks);
                return (
                  <div key={rf.id} className={`rounded-md p-2 ${checked ? 'bg-slate-50' : ''}`}>
                    <label className="flex items-start gap-2 text-xs">
                      <input type="checkbox"
                        className={`mt-0.5 h-3.5 w-3.5 ${rf.severity === 'STOP' ? 'accent-red-600' : 'accent-amber-600'}`}
                        checked={checked}
                        onChange={(e) => setRedFlags((p) => e.target.checked ? [...p, rf.id] : p.filter((x) => x !== rf.id))} />
                      <span className={rf.severity === 'STOP' ? 'text-red-700' : 'text-slate-600'}>
                        {rf.label.es}
                        {rf.severity === 'STOP' && (rf.window_weeks == null ? ' ⛔' : '')}
                      </span>
                    </label>
                    {checked && rf.window_weeks != null && (
                      <div className="mt-1.5 flex items-center gap-2 pl-5">
                        <input
                          className="w-20 rounded border border-slate-300 px-2 py-1 text-xs"
                          type="number" min={0} placeholder="semanas"
                          value={weeks}
                          onChange={(e) => { const v = e.target.value; setFlagWeeks((p) => ({ ...p, [rf.id]: v })); }}
                        />
                        <span className={`text-[11px] font-semibold ${isAcute ? 'text-red-700' : 'text-amber-700'}`}>
                          {isAcute
                            ? `⛔ agudo (< ${rf.window_weeks} sem) — detiene`
                            : `⚠ crónico (≥ ${rf.window_weeks} sem) — sólo marca`}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Las condicionales piden hace cuántas semanas ocurrió: dentro de la ventana detienen la
              evaluación; fuera, sólo la marcan. Sin dato se asume agudo (criterio conservador).
            </p>
          </div>
        </div>
      </Card>

      {(['STRENGTH', 'MOBILITY', 'AEROBIC'] as DomainKey[]).map((dk) => (
        <Card key={dk} title={`${DOMAIN_ES[dk]} — escala 0-3 interpolada`}>
          <div className="space-y-2">
            {(byDomain.get(dk) ?? []).map((t) => {
              const ok = covered(t);
              return (
                <div key={t.key} className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 ${ok ? 'border-slate-200' : 'border-dashed border-amber-300 bg-amber-50'}`}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {t.name}
                      {t.weight != null && <span className="ml-2 text-xs text-slate-400">peso {t.weight}</span>}
                      {t.is_inverse && <span className="ml-2 text-xs text-slate-400">(menor es mejor)</span>}
                    </p>
                    {!ok && <p className="text-xs text-amber-700">Sin banda canónica para {sex === 'MALE' ? 'hombre' : 'mujer'} de {age} años</p>}
                  </div>
                  <div className="w-32">
                    <input className={INPUT} type="number" placeholder={t.unit} disabled={!ok}
                      value={values[t.key] ?? ''}
                      onChange={(e) => setValues((p) => ({ ...p, [t.key]: e.target.value }))} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ))}

      <Card title="Movimiento — 4 niveles jerárquicos (C-4)">
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Clasificá cada variable con el criterio canónico (tocá "criterio" para verlo). El nivel se deriva del rubric;
            también podés fijarlo a mano. El dominio toma siempre el <b>peor</b> nivel.
          </p>
          {(cat?.movement_levels ?? []).map((l) => (
            <MovementLevel
              key={l.level_id}
              level={l}
              rubric={rubrics[l.level_id]}
              challengeOrder={cat?.challenge_order ?? []}
              state={levels[l.level_id] ?? { variables: {}, notes: {} }}
              onChange={(update) => setLevels((p) => ({
                ...p, [l.level_id]: update(p[l.level_id] ?? { variables: {}, notes: {} }),
              }))}
            />
          ))}
        </div>
      </Card>

      <div className="sticky bottom-3 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur sm:bottom-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4">
        <p className="text-sm text-slate-500">
          {testsLoaded} pruebas · {levelsLoaded} niveles de movimiento
          {safetyOnly && ' · gate de seguridad activo'}
        </p>
        <button onClick={submit} disabled={!canSubmit}
          className="w-full rounded-lg bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-40 sm:w-auto sm:py-2.5">
          {busy ? 'Evaluando…' : 'Evaluar'}
        </button>
      </div>
    </div>
  );
}
