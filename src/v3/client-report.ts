/**
 * HTC v3 — Client Report.
 * Traduce el resultado técnico a lenguaje simple para el cliente.
 * Todos los títulos y textos salen del Canonical (language_mapping v3).
 */
import { AssessmentV3Result, DomainKey } from './models';
import { CompiledV3, resolveLabelV3, resolveReasonV3 } from './canonical';

export interface ClientReportV3 {
  client: { name: string; age: number };
  generated_at: string;
  sections: Array<{ id: string; title: string; content: string[] }>;
}

export function buildClientReportV3(
  compiled: CompiledV3,
  a: AssessmentV3Result,
  language: 'es' | 'en',
): ClientReportV3 {
  const sections = compiled.raw.language.report_sections ?? [];
  const title = (id: string): string => {
    const s = sections.find((x) => x.id === id);
    if (!s) throw new Error(`MISSING CANONICAL (v3): sección de reporte ${id}`);
    return s[language];
  };
  const domainLabel = (k: DomainKey): string => resolveLabelV3(compiled, 'domains', k, language);
  const classLabel = (c: string): string => resolveLabelV3(compiled, 'classifications', c, language);
  const t = (es: string, en: string): string => (language === 'es' ? es : en);

  // ── Salud ────────────────────────────────────────────────────────────────
  const health: string[] = [];
  if (a.health_gates.status === 'BLOCKED') {
    health.push(t('Tu evaluación se detuvo por seguridad y necesitás ver a un médico antes de continuar.',
                  'Your assessment was stopped for safety and you need to see a physician before continuing.'));
    for (const g of a.health_gates.triggered_stop_gates) health.push(`· ${g.name}`);
  } else if (a.health_gates.status === 'FLAGGED') {
    health.push(t('Tu evaluación siguió adelante, con algunos puntos que tu coach va a tener en cuenta:',
                  'Your assessment proceeded, with a few points your coach will take into account:'));
    for (const f of a.health_gates.alert_flags) health.push(`· ${f.name}`);
  } else {
    health.push(t('Tu chequeo de salud y seguridad está en orden.', 'Your health and safety screening is clear.'));
  }

  // ── Perfil por dominio ───────────────────────────────────────────────────
  const profile = a.domains.map((d) => `${domainLabel(d.domain)}: ${classLabel(d.classification)}`);

  // ── Punto limitante ──────────────────────────────────────────────────────
  const bottleneck: string[] = [];
  const p1 = a.roadmap?.assignments.find((x) => x.role === 'P1' || x.role === 'P1_PRIMARY');
  if (p1) {
    bottleneck.push(domainLabel(p1.domain));
    const dom = a.domains.find((d) => d.domain === p1.domain);
    if (dom?.critical_components.length) {
      bottleneck.push(t(`Lo que más pesa hoy: ${dom.critical_components.join(', ')}.`,
                        `What weighs most today: ${dom.critical_components.join(', ')}.`));
    }
    if (a.movement?.limited_by && p1.domain === 'MOVEMENT') {
      bottleneck.push(t(`Tu movimiento está limitado por el nivel ${a.movement.limited_by}.`,
                        `Your movement is limited by level ${a.movement.limited_by}.`));
    }
  } else if (a.roadmap) {
    const p2 = a.roadmap.assignments.find((x) => x.role === 'P2');
    if (p2) {
      bottleneck.push(t(`No hay puntos críticos. El foco de desarrollo es ${domainLabel(p2.domain)}.`,
                        `There are no critical points. The development focus is ${domainLabel(p2.domain)}.`));
    }
  }

  // ── Plan ─────────────────────────────────────────────────────────────────
  const plan = (a.roadmap?.assignments ?? [])
    .filter((x) => x.role !== 'MAINTAIN' && x.role !== 'MONITOR' && x.role !== 'DEFER')
    .map((x) => {
      const role = resolveLabelV3(compiled, 'roles', x.role, language);
      const focus = x.specific_focus ? ` — ${x.specific_focus}` : '';
      return `${role}: ${domainLabel(x.domain)} (${x.volume_percent}%)${focus}`;
    });

  const maintained = (a.roadmap?.assignments ?? [])
    .filter((x) => x.role === 'MAINTAIN' || x.role === 'MONITOR')
    .map((x) => domainLabel(x.domain));

  // ── Restricciones (en lenguaje de cliente) ───────────────────────────────
  const constraints = (a.roadmap?.constraints ?? []).map((cst) =>
    resolveReasonV3(compiled, cst.reason_id, 'CLIENT', language));

  // ── Sesión ───────────────────────────────────────────────────────────────
  const session: string[] = [];
  if (a.roadmap) {
    session.push(t(`Tu sesión de ${a.roadmap.session_architecture.total_minutes} minutos se reparte así:`,
                   `Your ${a.roadmap.session_architecture.total_minutes}-minute session breaks down as:`));
    for (const b of a.roadmap.session_architecture.breakdown) {
      session.push(`· ${domainLabel(b.domain)}: ${b.minutes} min`);
    }
  }

  // ── Reevaluación ─────────────────────────────────────────────────────────
  const reassessment: string[] = [];
  const withDuration = (a.roadmap?.assignments ?? []).find((x) => x.duration_weeks);
  if (withDuration?.duration_weeks) {
    const [min, max] = withDuration.duration_weeks;
    reassessment.push(t(`Volvemos a evaluar en ${min}-${max} semanas, o antes si alcanzás los criterios.`,
                        `We reassess in ${min}-${max} weeks, or earlier if you meet the criteria.`));
  } else {
    reassessment.push(t('Reevaluación formal cada 6-8 semanas.', 'Formal reassessment every 6-8 weeks.'));
  }
  const criteria = (a.roadmap?.assignments ?? []).filter((x) => x.success_criteria)
    .map((x) => `${domainLabel(x.domain)}: ${x.success_criteria}`);
  reassessment.push(...criteria);

  const all = [
    { id: 'HEALTH_STATUS', title: title('HEALTH_STATUS'), content: health },
    { id: 'DOMAIN_PROFILE', title: title('DOMAIN_PROFILE'), content: profile },
    { id: 'BOTTLENECK', title: title('BOTTLENECK'), content: bottleneck },
    { id: 'ROADMAP', title: title('ROADMAP'), content: plan },
    { id: 'CONSTRAINTS', title: title('CONSTRAINTS'), content: constraints },
    { id: 'SESSION', title: title('SESSION'), content: session },
    { id: 'REASSESSMENT', title: title('REASSESSMENT'), content: reassessment },
  ];

  // Se agregan las capacidades que se mantienen dentro del roadmap.
  if (maintained.length > 0) {
    all[3]!.content.push(t(`Se mantienen: ${maintained.join(', ')}.`,
                           `Maintained: ${maintained.join(', ')}.`));
  }

  return {
    client: { name: a.client.name, age: a.client.age },
    generated_at: new Date().toISOString(),
    sections: all.filter((s) => s.content.length > 0),
  };
}
