import { useState } from 'react';
import { AssessmentV3, ClientReport, CoachConfirmation, DomainKey } from './types';
import { api, Badge, Card, CLS, DOMAIN_ES, INPUT, LABEL, ROLE_STYLE } from './shared';

export default function ResultView({
  result, confirmation, overrideCategories, onConfirmed, onBack,
}: {
  result: AssessmentV3;
  confirmation: CoachConfirmation | null;
  overrideCategories: string[];
  onConfirmed: (c: CoachConfirmation) => void;
  onBack: () => void;
}) {
  const r = result;
  const [showAudit, setShowAudit] = useState(false);
  const [overriding, setOverriding] = useState(false);
  const [category, setCategory] = useState(overrideCategories[0] ?? 'MEDICAL');
  const [reason, setReason] = useState('');
  const [confidence, setConfidence] = useState(85);
  const [saving, setSaving] = useState(false);
  const [report, setReport] = useState<ClientReport | null>(null);
  const [lang, setLang] = useState<'es' | 'en'>('es');

  const blocked = r.health_gates.status === 'BLOCKED';

  const confirm = async (yes: boolean) => {
    setSaving(true);
    try {
      const res = await api<{ coach_confirmation: CoachConfirmation }>(
        `/assessments/${r.assessment_id}/confirm`,
        {
          method: 'POST',
          body: JSON.stringify(yes
            ? { confirmed: true, clinical_confidence: confidence }
            : { confirmed: false, override_reason: reason, override_reason_category: category, clinical_confidence: confidence }),
        },
      );
      onConfirmed(res.coach_confirmation);
      setOverriding(false);
    } finally { setSaving(false); }
  };

  const loadReport = async (l: 'es' | 'en') => {
    setLang(l);
    setReport(await api<ClientReport>(`/assessments/${r.assessment_id}/report?lang=${l}`));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button onClick={onBack} className="text-sm font-medium text-slate-500 hover:text-slate-900">← Volver</button>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{r.client.name}</h1>
          <p className="text-sm text-slate-500">{r.client.age} años · {r.client.sex === 'MALE' ? 'M' : 'F'} · {new Date(r.timestamp).toLocaleString()}</p>
        </div>
        <button
          onClick={() => (report ? setReport(null) : loadReport('es'))}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400"
        >
          {report ? 'Ver evaluación' : 'Reporte del cliente'}
        </button>
      </div>

      {report ? (
        <>
          <div className="flex justify-end">
            <div className="flex overflow-hidden rounded-lg border border-slate-300 text-sm font-semibold">
              {(['es', 'en'] as const).map((l) => (
                <button key={l} onClick={() => loadReport(l)}
                  className={`px-4 py-1.5 ${lang === l ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          {report.sections.map((s) => (
            <Card key={s.id} title={s.title}>
              <ul className="space-y-1.5">
                {s.content.map((cnt, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-700">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />{cnt}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </>
      ) : (
        <>
          <div className={`rounded-xl border-2 p-5 ${
            blocked ? 'border-red-300 bg-red-50'
            : r.health_gates.status === 'FLAGGED' ? 'border-amber-300 bg-amber-50'
            : 'border-emerald-200 bg-emerald-50'}`}>
            <p className={`text-lg font-bold ${blocked ? 'text-red-700' : r.health_gates.status === 'FLAGGED' ? 'text-amber-700' : 'text-emerald-700'}`}>
              {blocked ? '⛔ Evaluación bloqueada — derivación médica'
                : r.health_gates.status === 'FLAGGED' ? '⚠ Continúa con alertas'
                : '✓ Health gates superados'}
            </p>
            {r.health_gates.triggered_stop_gates.length > 0 && (
              <ul className="mt-2 list-inside list-disc text-sm text-red-700">
                {r.health_gates.triggered_stop_gates.map((g) => <li key={g.gate_id}>{g.name}</li>)}
              </ul>
            )}
            {r.health_gates.alert_flags.length > 0 && (
              <ul className="mt-2 list-inside list-disc text-sm text-amber-700">
                {r.health_gates.alert_flags.map((f) => <li key={f.flag_id}>{f.name}</li>)}
              </ul>
            )}
          </div>

          {r.domains.length > 0 && (
            <Card title="Perfil por dominio">
              <div className="grid gap-3 sm:grid-cols-2">
                {r.domains.map((d) => (
                  <div key={d.domain} className="rounded-lg border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-900">{DOMAIN_ES[d.domain]}</p>
                        <p className="text-xs text-slate-400">impact factor {d.impact_factor}</p>
                      </div>
                      <Badge c={d.classification} />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                      {d.weighted_score != null && <span className="text-slate-600">score <b>{d.weighted_score.toFixed(2)}</b>/3</span>}
                      {d.classification_basis === 'CRITICAL_COMPONENT_OVERRIDE' && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">override por componente crítico</span>
                      )}
                      {d.classification_basis === 'WORST_CASE_HIERARCHICAL' && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">peor nivel</span>
                      )}
                    </div>
                    {d.tests.length > 0 && (
                      <table className="mt-3 w-full text-xs">
                        <tbody>
                          {d.tests.map((t) => (
                            <tr key={t.test_key} className="border-t border-slate-100">
                              <td className="py-1 pr-2 text-slate-600">
                                {t.name}
                                {t.population_pending_approval && (
                                  <span
                                    className="ml-1.5 cursor-help rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-700"
                                    title={`Banda poblacional pendiente de aprobación clínica.\nDerivada de: ${t.population_source ?? 'literatura científica'}`}
                                  >
                                    prov.
                                  </span>
                                )}
                              </td>
                              <td className="py-1 pr-2 text-right text-slate-500">{t.value} {t.unit}</td>
                              <td className="py-1 pr-2 text-right font-semibold">{t.score_0_3.toFixed(2)}</td>
                              <td className="py-1 text-right">
                                <span className={t.is_critical_component ? 'font-bold text-red-600' : 'text-slate-500'}>
                                  {CLS[t.classification].label}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {r.movement && (
            <Card title="Movimiento — niveles jerárquicos">
              <div className="grid gap-2 sm:grid-cols-4">
                {r.movement.levels.map((l) => (
                  <div key={l.level_id} className={`rounded-lg border p-3 ${r.movement!.limited_by === l.level_id ? 'border-amber-400 bg-amber-50' : 'border-slate-200'}`}>
                    <p className="text-xs font-semibold text-slate-500">L{l.sequence_number}</p>
                    <p className="text-sm font-medium">{l.name}</p>
                    <div className="mt-2"><Badge c={l.classification} /></div>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {l.classification_method === 'RUBRIC_DERIVED' ? 'derivado del rubric' : 'fijado por el coach'}
                    </p>
                    {!l.prerequisite_met && <p className="text-[11px] text-amber-700">prerrequisito no alcanzado</p>}
                  </div>
                ))}
              </div>
              {r.movement.limited_by && (
                <p className="mt-3 text-sm text-slate-600">Dominio limitado por <b>{r.movement.limited_by}</b>.</p>
              )}
            </Card>
          )}

          {r.roadmap && (
            <Card title={`Roadmap de desarrollo — ${r.roadmap.rule_applied}`}>
              <div className="space-y-3">
                {r.roadmap.assignments.map((a) => (
                  <div key={a.domain} className="rounded-lg border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <span className={`rounded-full px-3 py-1 text-xs font-bold ${ROLE_STYLE[a.role]}`}>{a.role}</span>
                        <span className="font-semibold">{DOMAIN_ES[a.domain]}</span>
                      </div>
                      <span className="text-lg font-bold text-slate-900">{a.volume_percent}%</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{a.reason}</p>
                    {a.specific_focus && <p className="mt-1 text-xs text-slate-500">Foco: {a.specific_focus}</p>}
                    {a.success_criteria && <p className="mt-1 text-xs text-slate-500">Criterio de salida: {a.success_criteria}</p>}
                  </div>
                ))}
              </div>

              {r.roadmap.constraints.length > 0 && (
                <div className="mt-4 rounded-lg bg-amber-50 p-4">
                  <p className="text-sm font-semibold text-amber-800">Restricciones de programación</p>
                  <ul className="mt-2 space-y-1 text-sm text-amber-700">
                    {r.roadmap.constraints.map((cst) => <li key={cst.type}>• {cst.description} → {cst.mitigation}</li>)}
                  </ul>
                </div>
              )}

              <div className="mt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Sesión de {r.roadmap.session_architecture.total_minutes} min
                </p>
                <div className="flex h-8 overflow-hidden rounded-lg">
                  {r.roadmap.session_architecture.breakdown.map((b) => (
                    <div key={b.domain} title={`${DOMAIN_ES[b.domain]}: ${b.minutes} min`}
                      className={`flex items-center justify-center text-[11px] font-semibold ${ROLE_STYLE[b.role]}`}
                      style={{ width: `${(b.minutes / r.roadmap!.session_architecture.total_minutes) * 100}%` }}>
                      {b.minutes}′
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {!blocked && (
            <Card title="Decisión del coach">
              {confirmation ? (
                confirmation.confirmed ? (
                  <div>
                    <p className="text-sm font-semibold text-emerald-700">✓ Recomendación confirmada</p>
                    {confirmation.clinical_confidence != null && (
                      <p className="mt-1 text-sm text-slate-600">Confianza clínica: {confirmation.clinical_confidence}%</p>
                    )}
                  </div>
                ) : (
                  <div className="text-sm">
                    <p className="font-semibold text-amber-700">✗ Override del coach ({confirmation.override_reason_category})</p>
                    <p className="mt-1 text-slate-600">{confirmation.override_reason}</p>
                  </div>
                )
              ) : overriding ? (
                <div className="space-y-3">
                  <p className="text-sm text-slate-600">
                    HTC recomienda; vos decidís. Todo override queda registrado para el aprendizaje del sistema.
                  </p>
                  <div>
                    <label className={LABEL}>Categoría</label>
                    <select className={INPUT} value={category} onChange={(e) => setCategory(e.target.value)}>
                      {overrideCategories.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={LABEL}>Razón (obligatoria)</label>
                    <textarea className={INPUT} rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
                      placeholder="Por qué diferís de la recomendación" />
                  </div>
                  <div className="flex gap-2">
                    <button disabled={!reason.trim() || saving} onClick={() => confirm(false)}
                      className="flex-1 rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">
                      Registrar override
                    </button>
                    <button onClick={() => setOverriding(false)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className={LABEL}>Tu confianza clínica: <b>{confidence}%</b></label>
                    <input type="range" min={0} max={100} value={confidence}
                      onChange={(e) => setConfidence(Number(e.target.value))} className="w-full accent-slate-900" />
                  </div>
                  <div className="flex gap-2">
                    <button disabled={saving} onClick={() => confirm(true)}
                      className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                      ✓ Confirmar recomendación
                    </button>
                    <button onClick={() => setOverriding(true)}
                      className="flex-1 rounded-lg border border-amber-400 px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50">
                      Override
                    </button>
                  </div>
                </div>
              )}
            </Card>
          )}

          <Card title="Razonamiento">
            <ul className="space-y-2">
              {r.reasoning.map((x) => (
                <li key={x.id} className="flex gap-2 text-sm text-slate-700">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />{x.text}
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Traza de auditoría" right={
            <button onClick={() => setShowAudit(!showAudit)} className="text-xs font-semibold text-slate-500 hover:text-slate-900">
              {showAudit ? 'Ocultar' : 'Ver'}
            </button>
          }>
            {showAudit ? (
              <div className="space-y-4 text-sm">
                <div>
                  <p className="mb-1 font-semibold">Versiones congeladas</p>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {Object.entries(r.version_snapshot).filter(([k]) => k !== 'frozen_at').map(([k, v]) => (
                      <p key={k} className="text-slate-600">
                        <span className="text-slate-400">{k.replace(/_/g, ' ')}: </span>
                        <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{v}</code>
                      </p>
                    ))}
                  </div>
                </div>
                {r.audit_trail.thresholds_used.length > 0 && (
                  <div>
                    <p className="mb-1 font-semibold">Umbrales aplicados</p>
                    <ul className="space-y-0.5 text-xs text-slate-600">
                      {r.audit_trail.thresholds_used.map((t) => (
                        <li key={t.test_key}>
                          <code className="rounded bg-slate-100 px-1 py-0.5">{t.test_key}</code> · {t.population_id} ·
                          crítico {t.umbral_critical} → foundation {t.umbral_foundation}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div>
                  <p className="mb-1 font-semibold">Reglas aplicadas</p>
                  <div className="flex flex-wrap gap-1.5">
                    {r.audit_trail.applied_rules.map((x, i) => (
                      <code key={i} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{x}</code>
                    ))}
                  </div>
                </div>
                {r.audit_trail.warnings.length > 0 && (
                  <div>
                    <p className="mb-1 font-semibold text-amber-700">Advertencias</p>
                    <ul className="list-inside list-disc text-xs text-amber-700">
                      {r.audit_trail.warnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-400">Versiones congeladas, umbrales aplicados y reglas ejecutadas.</p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
