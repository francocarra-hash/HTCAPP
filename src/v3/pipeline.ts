/**
 * HTC v3 — Pipeline.
 *
 *   Health Gates → Classification → Movement → Roadmap → Reasoning
 *
 * Secuencia obligatoria del CLINICAL_SPECIFICATION "assessmentFlow":
 * si un STOP gate se dispara, NO se clasifica ningún dominio.
 */
import { randomUUID } from 'crypto';
import { AssessmentV3Input, AssessmentV3InputSchema, AssessmentV3Result, DomainResult } from './models';
import { CompiledV3, freezeVersionsV3, resolveReasonV3 } from './canonical';
import { classifyNumericDomains } from './classification';
import { evaluateMovement, movementAsDomain } from './movement';
import { runHealthGates } from './health-gates';
import { buildRoadmap } from './roadmap';

export function runAssessmentV3(compiled: CompiledV3, rawInput: unknown): AssessmentV3Result {
  const input: AssessmentV3Input = AssessmentV3InputSchema.parse(rawInput);
  const versionSnapshot = freezeVersionsV3(compiled);
  const warnings: string[] = [...compiled.warnings];
  const appliedRules: string[] = [];

  // ── 1. Health Gates (siempre primero) ────────────────────────────────────
  const health = runHealthGates(compiled, input.health_gates);
  appliedRules.push(...health.triggered_stop_gates.map((g) => `STOP_GATE:${g.gate_id}`));
  appliedRules.push(...health.alert_flags.map((f) => `ALERT_FLAG:${f.flag_id}`));

  const render = (ids: string[]): Array<{ id: string; text: string }> =>
    [...new Set(ids)].map((id) => ({ id, text: resolveReasonV3(compiled, id, input.audience, input.language) }));

  // STOP → no se clasifica nada (CLINICAL_SPEC assessmentFlow).
  if (health.status === 'BLOCKED') {
    return {
      assessment_id: randomUUID(),
      client: input.client,
      timestamp: new Date().toISOString(),
      version_snapshot: versionSnapshot,
      health_gates: health,
      domains: [],
      movement: null,
      roadmap: null,
      reasoning: render(health.reason_ids),
      audit_trail: { thresholds_used: [], applied_rules: appliedRules, warnings },
    };
  }

  // ── 2. Clasificación de dominios numéricos ───────────────────────────────
  const { domains: numericDomains, scores } = input.test_results.length > 0
    ? classifyNumericDomains(compiled, { age: input.client.age, sex: input.client.sex }, input.test_results)
    : { domains: [] as DomainResult[], scores: [] };

  for (const d of numericDomains) {
    appliedRules.push(`AGGREGATION:${d.domain}:${d.classification_basis}`);
  }

  // ── 3. Movement (cualitativo) ────────────────────────────────────────────
  const movement = evaluateMovement(compiled, input.movement_levels);
  const allDomains: DomainResult[] = [...numericDomains];
  if (movement) {
    allDomains.push(movementAsDomain(compiled, movement));
    appliedRules.push('AGGREGATION:MOVEMENT:WORST_CASE_HIERARCHICAL');
  }
  allDomains.sort((a, b) => {
    const oa = compiled.domainByKey.get(a.domain)?.order ?? 99;
    const ob = compiled.domainByKey.get(b.domain)?.order ?? 99;
    return oa - ob;
  });

  // Bandas poblacionales sin firma clínica usadas en ESTA evaluación: se
  // declaran en su auditoría, no sólo en el arranque del servidor.
  const pendingBands = allDomains.flatMap((d) =>
    d.tests.filter((t) => t.population_pending_approval).map((t) => `${t.name} (${t.population_id})`),
  );
  if (pendingBands.length > 0) {
    warnings.push(
      `Esta evaluación usó ${pendingBands.length} banda(s) poblacional(es) pendiente(s) de aprobación clínica: ` +
      `${pendingBands.join(', ')}. Derivadas de literatura científica; requieren firma de HTC.`,
    );
  }

  // ── 4. Roadmap ───────────────────────────────────────────────────────────
  const roadmap = allDomains.length > 0
    ? buildRoadmap(compiled, allDomains, movement, input.session_minutes)
    : null;
  if (roadmap) {
    appliedRules.push(`ROADMAP:${roadmap.rule_applied}`);
    warnings.push(...roadmap.validation_warnings);
  }

  // ── 5. Reasoning ─────────────────────────────────────────────────────────
  const reasonIds = [
    ...health.reason_ids,
    ...allDomains.flatMap((d) => d.reason_ids),
    ...(movement?.reason_ids ?? []),
    ...(roadmap?.reason_ids ?? []),
  ];

  return {
    assessment_id: randomUUID(),
    client: input.client,
    timestamp: new Date().toISOString(),
    version_snapshot: versionSnapshot,
    health_gates: health,
    domains: allDomains,
    movement,
    roadmap,
    reasoning: render(reasonIds),
    audit_trail: {
      thresholds_used: scores.map((s) => ({
        test_key: s.test_key,
        population_id: s.population_id,
        umbral_critical: s.umbral_critical,
        umbral_foundation: s.umbral_foundation,
      })),
      applied_rules: appliedRules,
      warnings,
    },
  };
}
