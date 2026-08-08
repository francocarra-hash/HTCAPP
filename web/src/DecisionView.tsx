import { useEffect, useState } from 'react';
import { api, ApiError } from './api';
import { Decision, Pathway, Role } from './types';
import { Badge, Card, ConfidenceBar, DOMAIN_LABEL, ErrorBanner, PATHWAY_STYLE, ROLE_STYLE, Spinner } from './ui';

const OVERRIDE_CATEGORIES = [
  { id: 'MEDICAL', label: 'Razón médica (cirugía, dolor…)' },
  { id: 'MOTIVATIONAL', label: 'Motivacional (preferencia del cliente)' },
  { id: 'SPORT_CONTEXT', label: 'Contexto deportivo (competencia próxima)' },
  { id: 'LIFESTYLE_CONSTRAINT', label: 'Restricción de estilo de vida' },
  { id: 'COACH_JUDGMENT', label: 'Criterio del coach (conozco al cliente)' },
  { id: 'OTHER', label: 'Otra' },
];

const capName = (id: string | null) => id ? id.replace('CAP_', '').replaceAll('_', ' ') : '—';

export default function DecisionView({ decisionId, onBack, onReport }: {
  decisionId: string;
  onBack: () => void;
  onReport: (id: string) => void;
}) {
  const [decision, setDecision] = useState<Decision | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [showAudit, setShowAudit] = useState(false);
  const [overriding, setOverriding] = useState(false);
  const [category, setCategory] = useState('MEDICAL');
  const [reason, setReason] = useState('');
  const [clinical, setClinical] = useState(80);
  const [saving, setSaving] = useState(false);

  const load = () => api.decision(decisionId).then((r) => setDecision(r.decision)).catch((e: ApiError) => setError({ code: e.code, message: e.message }));
  useEffect(() => { load(); }, [decisionId]);

  const confirm = async (yes: boolean) => {
    setSaving(true);
    try {
      await api.confirm(decisionId, yes
        ? { confirmed: true, clinical_confidence: clinical }
        : { confirmed: false, override_reason: reason, override_reason_category: category, clinical_confidence: clinical });
      setOverriding(false);
      await load();
    } catch (e) {
      const err = e as ApiError;
      setError({ code: err.code, message: err.message });
    } finally {
      setSaving(false);
    }
  };

  if (error) return <div className="space-y-4"><button onClick={onBack} className="text-sm text-slate-500">← Volver</button><ErrorBanner code={error.code} message={error.message} /></div>;
  if (!decision) return <Spinner />;

  const p1 = decision.primary_system_bottleneck;
  const blocked = p1.status === 'BLOCKED';
  const confirmed = decision.coach_confirmation.confirmed;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <button onClick={onBack} className="text-sm font-medium text-slate-500 hover:text-slate-900">← Volver</button>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{decision.client_name}</h1>
        </div>
        <div className="flex items-center gap-2">
          {decision.pathway && (
            <span className={`rounded-full px-4 py-1.5 text-sm font-bold text-white ${PATHWAY_STYLE[decision.pathway as Pathway]}`}>
              {decision.pathway}
            </span>
          )}
          <button onClick={() => onReport(decisionId)} className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-sm font-semibold text-slate-700 hover:border-slate-400">
            Reporte cliente
          </button>
        </div>
      </div>

      {blocked && (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 p-5">
          <p className="text-lg font-bold text-red-700">⚠ Derivación médica requerida</p>
          <p className="mt-1 text-sm text-red-600">El proceso de decisión se detuvo por seguridad. No se clasificó ninguna capacidad.</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Reasoning Card" className="lg:col-span-2">
          <div className="space-y-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Bottleneck principal (P1)</p>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <p className="text-xl font-bold">{capName(p1.capacity_id)}</p>
                {p1.classification && <Badge classification={p1.classification} />}
                {p1.domain_id && <span className="text-sm text-slate-500">{DOMAIN_LABEL[p1.domain_id]}</span>}
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${p1.status === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  {p1.status}
                </span>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Razonamiento (IDs canónicos → texto)</p>
              <ul className="space-y-2">
                {decision.reasoning_text.map((t, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-700">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            {decision.audit_trail.candidate_scores.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Scoring multi-dominio (OS 10.3)</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs text-slate-400">
                        <th className="py-1.5 pr-4">Capacidad</th><th className="py-1.5 pr-4">Clasificación</th>
                        <th className="py-1.5 pr-4">Puntos</th><th className="py-1.5 pr-4">Impact</th><th className="py-1.5">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {decision.audit_trail.candidate_scores.map((s) => (
                        <tr key={s.capacity_id} className="border-b border-slate-100">
                          <td className="py-2 pr-4 font-medium">{capName(s.capacity_id)}</td>
                          <td className="py-2 pr-4"><Badge classification={s.classification} /></td>
                          <td className="py-2 pr-4">{s.classification_points}</td>
                          <td className="py-2 pr-4">×{s.impact_factor}</td>
                          <td className="py-2 font-bold">{s.score}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </Card>

        <div className="space-y-6">
          <Card title="Confianza">
            <div className="space-y-4">
              <ConfidenceBar label="System confidence" value={decision.system_confidence} />
              {decision.coach_confirmation.clinical_confidence != null && (
                <ConfidenceBar label="Clinical confidence (coach)" value={decision.coach_confirmation.clinical_confidence} />
              )}
              <div className="border-t border-slate-100 pt-4">
                {confirmed === null && !blocked ? (
                  overriding ? (
                    <div className="space-y-3">
                      <p className="text-sm font-semibold">¿Por qué hacés override?</p>
                      <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
                        {OVERRIDE_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                      </select>
                      <textarea
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        rows={3}
                        placeholder="Razón (obligatoria — queda registrada para aprendizaje del sistema)"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <button disabled={!reason.trim() || saving} onClick={() => confirm(false)} className="flex-1 rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">
                          Registrar override
                        </button>
                        <button onClick={() => setOverriding(false)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <label className="mb-1 block text-xs text-slate-500">Tu confianza clínica: <b>{clinical}%</b></label>
                        <input type="range" min={0} max={100} value={clinical} onChange={(e) => setClinical(Number(e.target.value))} className="w-full accent-slate-900" />
                      </div>
                      <div className="flex gap-2">
                        <button disabled={saving} onClick={() => confirm(true)} className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                          ✓ Confirmar
                        </button>
                        <button onClick={() => setOverriding(true)} className="flex-1 rounded-lg border border-amber-400 px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50">
                          Override
                        </button>
                      </div>
                    </div>
                  )
                ) : confirmed === true ? (
                  <p className="text-sm font-semibold text-emerald-700">✓ Confirmada por el coach</p>
                ) : confirmed === false ? (
                  <div className="text-sm">
                    <p className="font-semibold text-amber-700">✗ Override del coach ({decision.coach_confirmation.override_reason_category})</p>
                    <p className="mt-1 text-slate-600">{decision.coach_confirmation.override_reason}</p>
                  </div>
                ) : null}
              </div>
            </div>
          </Card>

          <Card title="Reevaluación">
            <p className="text-sm text-slate-700">
              {decision.reassessment.weeks != null
                ? <><b>{decision.reassessment.weeks} semanas</b> · criterio de salida: {decision.reassessment.exit_criteria}</>
                : 'Sin ventana canónica — la define el coach.'}
            </p>
            <p className="mt-2 text-xs text-slate-400">Estrategia: <b className="text-slate-600">{decision.strategy}</b></p>
          </Card>
        </div>
      </div>

      {decision.capacity_states.length > 0 && (
        <Card title="Perfil de capacidades">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {decision.capacity_states.map((s) => {
              const role = decision.priorities.find((p) => p.capacity_id === s.capacity_id)?.role;
              return (
                <div key={s.capacity_id} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold">{capName(s.capacity_id)}</p>
                    {role && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${ROLE_STYLE[role as Role]}`}>{role}</span>}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">{DOMAIN_LABEL[s.domain_id]} · nivel {s.hierarchy_level}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge classification={s.classification} />
                    {s.confidence !== 'HIGH' && <span className="text-[11px] text-amber-600">confianza {s.confidence.toLowerCase()}</span>}
                    {s.critical_component_flag && (
                      <span
                        className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700"
                        title={`Componente crítico: ${(s.critical_components ?? []).join(', ')}`}
                      >
                        ⚠ componente crítico
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {decision.suggested_relationships.length > 0 && (
        <Card title="Relaciones cross-domain sugeridas (a confirmar por el coach)">
          <ul className="space-y-1 text-sm text-slate-700">
            {decision.suggested_relationships.map((r, i) => (
              <li key={i}>
                <b>{capName(r.source_capacity_id)}</b> → <span className="text-slate-500">{r.type.replaceAll('_', ' ').toLowerCase()}</span> → <b>{capName(r.target_capacity_id)}</b>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card
        title="Traza de auditoría"
        right={
          <button onClick={() => setShowAudit(!showAudit)} className="text-xs font-semibold text-slate-500 hover:text-slate-900">
            {showAudit ? 'Ocultar' : 'Ver'}
          </button>
        }
      >
        {showAudit ? (
          <div className="space-y-4 text-sm">
            <p className="text-xs text-slate-400">
              Canonical v{decision.audit_trail.canonical_version} · {new Date(decision.audit_trail.timestamp).toLocaleString()} · safety: {decision.audit_trail.safety.outcome}
            </p>

            {decision.audit_trail.version_snapshot && (
              <div>
                <p className="mb-1 font-semibold">Versiones congeladas (Principio 6)</p>
                <div className="grid gap-1 sm:grid-cols-2">
                  {([
                    ['OS', decision.audit_trail.version_snapshot.os_version],
                    ['Canonical', decision.audit_trail.version_snapshot.canonical_version],
                    ['Standards', decision.audit_trail.version_snapshot.standards_version],
                    ['Decision Rules', decision.audit_trail.version_snapshot.decision_rules_version],
                    ['Report', decision.audit_trail.version_snapshot.report_version],
                  ] as const).map(([k, v]) => (
                    <p key={k} className="text-slate-600"><span className="text-slate-400">{k}: </span><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{v}</code></p>
                  ))}
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  Este resultado no se recalcula: queda congelado con estas versiones.
                </p>
              </div>
            )}

            {(decision.audit_trail.safety.triggered_gates?.length ?? 0) > 0 && (
              <div>
                <p className="mb-1 font-semibold text-red-700">Gates de seguridad disparados</p>
                <div className="flex flex-wrap gap-1.5">
                  {decision.audit_trail.safety.triggered_gates!.map((g) => (
                    <code key={g} className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">{g}</code>
                  ))}
                </div>
              </div>
            )}

            {(decision.audit_trail.safety.flags?.length ?? 0) > 0 && (
              <div>
                <p className="mb-1 font-semibold text-amber-700">Flags para revisión del coach</p>
                <ul className="list-inside list-disc text-amber-700">
                  {decision.audit_trail.safety.flags!.map((f) => (
                    <li key={f.id}><b>{f.id}</b> ({f.severity.toLowerCase()}) — {f.detail}</li>
                  ))}
                </ul>
              </div>
            )}
            {decision.audit_trail.standards_used.length > 0 && (
              <div>
                <p className="mb-1 font-semibold">Estándares aplicados</p>
                <ul className="space-y-1 text-slate-600">
                  {decision.audit_trail.standards_used.map((s, i) => (
                    <li key={i}>
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{s.standard_id}</code> v{s.version} · evidencia: {s.evidence_refs.join(', ')}
                      {s.verification_status === 'DRAFT' && <span className="ml-2 rounded bg-amber-100 px-1.5 text-xs font-semibold text-amber-700">DRAFT</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <p className="mb-1 font-semibold">Reglas aplicadas</p>
              <div className="flex flex-wrap gap-1.5">
                {decision.audit_trail.applied_rules.map((r, i) => (
                  <code key={i} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{r}</code>
                ))}
              </div>
            </div>
            {decision.audit_trail.warnings.length > 0 && (
              <div>
                <p className="mb-1 font-semibold text-amber-700">Advertencias</p>
                <ul className="list-inside list-disc text-amber-700">
                  {decision.audit_trail.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-400">Cada decisión es trazable: estándares, versiones, reglas y evidencia.</p>
        )}
      </Card>
    </div>
  );
}
