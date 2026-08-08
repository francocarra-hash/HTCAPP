import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from './api';
import { CanonicalTest } from './types';
import { Card, DOMAIN_LABEL, ErrorBanner, Spinner } from './ui';

const REGIONS = ['SPINE', 'HIP', 'SHOULDER', 'ANKLE'] as const;
const REGION_LABEL: Record<string, string> = { SPINE: 'Columna', HIP: 'Cadera', SHOULDER: 'Hombro', ANKLE: 'Tobillo' };
const INTERPRETATIONS = ['CLEAR', 'LIMITED', 'ASYMMETRICAL', 'PAINFUL', 'NEEDS_DEEPER', 'CRITICAL_BLOCKING'];

interface TestEntry { value: string; coach_classification?: string; confidence: 'HIGH' | 'MODERATE' | 'LOW' }

const CLASSIF_OPTIONS = [
  { value: 'FOUNDATION', label: 'Foundation' },
  { value: 'FUNCTIONAL', label: 'Functional' },
  { value: 'EMERGING', label: 'Emerging' },
  { value: 'CRITICAL', label: 'Critical' },
];

export default function AssessmentForm({ onDone, onCancel }: {
  onDone: (decisionId: string) => void;
  onCancel: () => void;
}) {
  const [tests, setTests] = useState<CanonicalTest[] | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Cliente
  const [name, setName] = useState('');
  const [age, setAge] = useState('32');
  const [sex, setSex] = useState<'MALE' | 'FEMALE'>('MALE');
  const [activity, setActivity] = useState('');
  const [goal, setGoal] = useState('');

  // Clínico
  const [redFlag, setRedFlag] = useState(false);
  const [redFlagDesc, setRedFlagDesc] = useState('');
  const [pain, setPain] = useState(false);
  const [painDesc, setPainDesc] = useState('');
  const [painIntensity, setPainIntensity] = useState('5');
  const [painLimits, setPainLimits] = useState(false);
  const [generalHealth, setGeneralHealth] = useState('');
  const [toleranceCompromised, setToleranceCompromised] = useState(false);
  const [markersState, setMarkersState] = useState('');
  // Gates canónicos del AUTHORITATIVE §9.1-9.2
  const [parq, setParq] = useState(false);
  const [sbp, setSbp] = useState('');
  const [dbp, setDbp] = useState('');
  const [painLevel, setPainLevel] = useState('');

  // Resultados
  const [entries, setEntries] = useState<Record<string, TestEntry>>({});
  const [screen, setScreen] = useState<Record<string, string>>({});
  const [screenEnabled, setScreenEnabled] = useState(false);

  useEffect(() => {
    api.tests().then((r) => setTests(r.tests)).catch((e: ApiError) => setError({ code: e.code, message: e.message }));
  }, []);

  const grouped = useMemo(() => {
    const g = new Map<string, CanonicalTest[]>();
    for (const t of tests ?? []) {
      const domain = t.capacities[0]?.domain_id ?? 'OTROS';
      g.set(domain, [...(g.get(domain) ?? []), t]);
    }
    return g;
  }, [tests]);

  const setEntry = (id: string, patch: Partial<TestEntry>) =>
    setEntries((prev) => ({ ...prev, [id]: { value: '', confidence: 'HIGH', ...prev[id], ...patch } }));

  const submit = async () => {
    setError(null);
    const test_results: unknown[] = [];
    for (const [test_id, e] of Object.entries(entries)) {
      if (e.coach_classification) {
        test_results.push({ test_id, coach_classification: e.coach_classification, valid: true, confidence: e.confidence });
      } else if (e.value.trim() !== '') {
        test_results.push({ test_id, value: Number(e.value), valid: true, confidence: e.confidence });
      }
    }
    if (screenEnabled && Object.keys(screen).length === REGIONS.length) {
      test_results.push({
        test_id: 'TEST_MOBILITY_REGIONAL_SCREEN',
        region_interpretations: screen,
        valid: true,
        confidence: 'HIGH',
      });
    }
    const events: unknown[] = [];
    if (redFlag) events.push({ type: 'RED_FLAG', description: redFlagDesc || 'Red flag reportada por el coach' });
    if (pain) events.push({ type: 'PAIN', description: painDesc || 'Dolor reportado', intensity: Number(painIntensity), significantly_limits: painLimits });

    setSubmitting(true);
    try {
      const res = await api.assess({
        client: {
          name,
          age: Number(age),
          sex,
          activity_level: activity || undefined,
          primary_goal: goal || undefined,
        },
        clinical: {
          events,
          general_health_classification: generalHealth || undefined,
          training_tolerance_compromised: generalHealth ? toleranceCompromised : undefined,
          health_markers_state: markersState || undefined,
          parq_positive: parq || undefined,
          systolic_bp: sbp.trim() ? Number(sbp) : undefined,
          diastolic_bp: dbp.trim() ? Number(dbp) : undefined,
          current_pain_level: painLevel.trim() ? Number(painLevel) : undefined,
        },
        test_results,
        language: 'es',
        audience: 'COACH',
      });
      onDone(res.decision.decision_id);
    } catch (e) {
      const err = e as ApiError;
      setError({ code: err.code ?? 'ERROR', message: err.message });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSubmitting(false);
    }
  };

  if (!tests && !error) return <Spinner />;

  const filledCount = Object.values(entries).filter((e) => e.value.trim() !== '' || e.coach_classification).length + (screenEnabled ? 1 : 0);
  const safetyOnly = redFlag || parq || Number(sbp) >= 180 || Number(dbp) >= 110;
  const canSubmit = name.trim() !== '' && Number(age) > 0 && (filledCount > 0 || safetyOnly) && !submitting;

  const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900';
  const labelCls = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Nueva evaluación</h1>
        <button onClick={onCancel} className="text-sm font-medium text-slate-500 hover:text-slate-900">← Volver</button>
      </div>

      {error && <ErrorBanner code={error.code} message={error.message} />}

      <Card title="Cliente">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <label className={labelCls}>Nombre</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre y apellido" />
          </div>
          <div>
            <label className={labelCls}>Edad</label>
            <input className={inputCls} type="number" value={age} onChange={(e) => setAge(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Sexo</label>
            <select className={inputCls} value={sex} onChange={(e) => setSex(e.target.value as 'MALE' | 'FEMALE')}>
              <option value="MALE">Masculino</option>
              <option value="FEMALE">Femenino</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Objetivo primario</label>
            <select className={inputCls} value={goal} onChange={(e) => setGoal(e.target.value)}>
              <option value="">— sin definir —</option>
              <option value="GENERAL_HEALTH">Salud general</option>
              <option value="PERFORMANCE">Rendimiento</option>
              <option value="LONG_TERM_MAINTENANCE">Mantenimiento</option>
            </select>
          </div>
        </div>
      </Card>

      <Card title="Screening clínico (Safety primero)">
        <div className="space-y-4">
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-red-600" checked={redFlag} onChange={(e) => setRedFlag(e.target.checked)} />
            <span>
              <span className="text-sm font-semibold text-red-700">Red flag médica</span>
              <span className="block text-xs text-slate-500">Detiene el proceso: el sistema deriva a evaluación médica.</span>
            </span>
          </label>
          {redFlag && (
            <input className={inputCls} value={redFlagDesc} onChange={(e) => setRedFlagDesc(e.target.value)} placeholder="Descripción de la red flag" />
          )}

          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-red-600" checked={parq} onChange={(e) => setParq(e.target.checked)} />
            <span>
              <span className="text-sm font-semibold text-red-700">PAR-Q+ con alguna respuesta afirmativa</span>
              <span className="block text-xs text-slate-500">Requiere autorización médica antes de evaluar (Authoritative §9.1).</span>
            </span>
          </label>

          <div className="grid gap-3 rounded-lg bg-slate-50 p-4 sm:grid-cols-3">
            <div>
              <label className={labelCls}>Presión sistólica (mmHg)</label>
              <input className={inputCls} type="number" value={sbp} onChange={(e) => setSbp(e.target.value)} placeholder="ej. 120" />
            </div>
            <div>
              <label className={labelCls}>Presión diastólica (mmHg)</label>
              <input className={inputCls} type="number" value={dbp} onChange={(e) => setDbp(e.target.value)} placeholder="ej. 78" />
            </div>
            <div>
              <label className={labelCls}>Dolor actual (0-10)</label>
              <input className={inputCls} type="number" min={0} max={10} value={painLevel} onChange={(e) => setPainLevel(e.target.value)} placeholder="0" />
            </div>
            <p className="text-xs text-slate-500 sm:col-span-3">
              Gates canónicos: PAS ≥180 o PAD ≥110 detienen la evaluación; dolor ≥6 levanta flag de revisión.
            </p>
          </div>

          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-amber-600" checked={pain} onChange={(e) => setPain(e.target.checked)} />
            <span>
              <span className="text-sm font-semibold text-slate-800">Dolor durante las pruebas</span>
            </span>
          </label>
          {pain && (
            <div className="grid gap-3 rounded-lg bg-slate-50 p-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className={labelCls}>Descripción</label>
                <input className={inputCls} value={painDesc} onChange={(e) => setPainDesc(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Intensidad (0-10)</label>
                <input className={inputCls} type="number" min={0} max={10} value={painIntensity} onChange={(e) => setPainIntensity(e.target.value)} />
              </div>
              <label className="flex items-center gap-2 text-sm sm:col-span-3">
                <input type="checkbox" className="h-4 w-4 accent-amber-600" checked={painLimits} onChange={(e) => setPainLimits(e.target.checked)} />
                Limita significativamente la evaluación o la tolerancia (declaración del coach — el sistema no lo infiere)
              </label>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className={labelCls}>Salud general (intake/labs)</label>
              <select className={inputCls} value={generalHealth} onChange={(e) => setGeneralHealth(e.target.value)}>
                <option value="">— sin datos —</option>
                <option value="FOUNDATION">Foundation</option>
                <option value="FUNCTIONAL">Functional</option>
                <option value="EMERGING">Emerging</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
            {generalHealth && (
              <label className="flex items-end gap-2 pb-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-rose-600" checked={toleranceCompromised} onChange={(e) => setToleranceCompromised(e.target.checked)} />
                Tolerancia al entrenamiento comprometida
              </label>
            )}
            <div>
              <label className={labelCls}>Health markers (gate)</label>
              <select className={inputCls} value={markersState} onChange={(e) => setMarkersState(e.target.value)}>
                <option value="">— sin panel —</option>
                <option value="OK">OK</option>
                <option value="EMERGING_MULTIPLE">2+ áreas Emerging</option>
                <option value="CRITICAL">Critical (STOP)</option>
              </select>
            </div>
          </div>
        </div>
      </Card>

      {[...grouped.entries()].map(([domainId, domainTests]) => (
        <Card key={domainId} title={`Pruebas — ${DOMAIN_LABEL[domainId] ?? domainId}`}>
          <div className="space-y-3">
            {domainTests.map((t) => {
              if (t.input.kind === 'regions') {
                return (
                  <div key={t.id} className="rounded-lg border border-slate-200 p-4">
                    <label className="flex items-center gap-3">
                      <input type="checkbox" className="h-4 w-4 accent-slate-900" checked={screenEnabled} onChange={(e) => setScreenEnabled(e.target.checked)} />
                      <span className="text-sm font-semibold">{t.name}</span>
                    </label>
                    {screenEnabled && (
                      <div className="mt-3 grid gap-3 sm:grid-cols-4">
                        {REGIONS.map((reg) => (
                          <div key={reg}>
                            <label className={labelCls}>{REGION_LABEL[reg]}</label>
                            <select className={inputCls} value={screen[reg] ?? 'CLEAR'} onChange={(e) => setScreen((p) => ({ ...p, [reg]: e.target.value }))}>
                              {INTERPRETATIONS.map((i) => <option key={i} value={i}>{i}</option>)}
                            </select>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }
              const entry = entries[t.id];
              return (
                <div key={t.id} className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 ${t.has_standard ? 'border-slate-200' : 'border-dashed border-slate-300 bg-slate-50 opacity-70'}`}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{t.name}</p>
                    <p className="text-xs text-slate-400">
                      {t.capacities.map((c) => c.name).join(', ')}
                      {t.asymmetry_rule ? ' · cargar el peor lado' : ''}
                    </p>
                  </div>
                  {t.has_standard ? (
                    <>
                      {t.input.kind === 'coach_classified' ? (
                        <select
                          className={`${inputCls} w-44`}
                          value={entry?.coach_classification ?? ''}
                          onChange={(e) => setEntry(t.id, { coach_classification: e.target.value || undefined })}
                          title={t.input.criteria ?? 'Clasificación observacional del coach según criterios canónicos'}
                        >
                          <option value="">— clasificar —</option>
                          {CLASSIF_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      ) : t.input.kind === 'ordinal_map' ? (
                        <select
                          className={`${inputCls} w-52`}
                          value={entry?.value ?? ''}
                          onChange={(e) => setEntry(t.id, { value: e.target.value })}
                        >
                          <option value="">— seleccionar —</option>
                          {(t.input.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.es}</option>)}
                        </select>
                      ) : (
                        <div className="w-28">
                          <input
                            className={inputCls}
                            type="number"
                            placeholder={t.unit}
                            value={entry?.value ?? ''}
                            onChange={(e) => setEntry(t.id, { value: e.target.value })}
                          />
                        </div>
                      )}
                      <select
                        className="rounded-lg border border-slate-300 px-2 py-2 text-xs"
                        value={entry?.confidence ?? 'HIGH'}
                        onChange={(e) => setEntry(t.id, { confidence: e.target.value as TestEntry['confidence'] })}
                        title="Confianza de la medición"
                      >
                        <option value="HIGH">Confianza alta</option>
                        <option value="MODERATE">Moderada</option>
                        <option value="LOW">Baja</option>
                      </select>
                    </>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                      Falta estándar HTC
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      ))}

      <div className="sticky bottom-4 flex items-center justify-between rounded-xl border border-slate-200 bg-white/95 px-5 py-4 shadow-lg backdrop-blur">
        <p className="text-sm text-slate-500">
          {filledCount} prueba{filledCount === 1 ? '' : 's'} cargada{filledCount === 1 ? '' : 's'}
          {redFlag ? ' · red flag activa' : ''}
          {parq ? ' · PAR-Q+ positivo' : ''}
          {(Number(sbp) >= 180 || Number(dbp) >= 110) ? ' · gate de presión' : ''}
        </p>
        <button
          onClick={submit}
          disabled={!canSubmit}
          className="rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? 'Evaluando…' : 'Evaluar'}
        </button>
      </div>
    </div>
  );
}
