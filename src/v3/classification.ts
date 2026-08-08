/**
 * HTC v3 — Classification Engine (C-2 + C-3).
 *
 * Test → Score 0-3 (interpolación) → Clasificación (redondeo conservador)
 *      → Agregación ponderada por dominio → Critical Component Override.
 *
 * Todas las constantes salen del Canonical. El motor sólo ejecuta.
 */
import {
  Classification, DomainKey, DomainResult, MissingCanonicalV3Error,
  PopulationThreshold, TestDefV3, TestScore,
} from './models';
import { classifyScore, CompiledV3 } from './canonical';

export interface ClientPopulationV3 { age: number; sex: 'MALE' | 'FEMALE' }

/**
 * Selecciona la población aplicable. Prefiere la más específica
 * (sexo + edad > sexo > edad > general). Falla fuerte si ninguna aplica.
 */
export function resolvePopulation(test: TestDefV3, client: ClientPopulationV3): PopulationThreshold {
  const matches = test.populations.filter((p) => {
    if (p.sex != null && p.sex !== client.sex) return false;
    if (p.age_min != null && client.age < p.age_min) return false;
    if (p.age_max != null && client.age > p.age_max) return false;
    return true;
  });
  if (matches.length === 0) {
    throw new MissingCanonicalV3Error(
      `El test ${test.key} no tiene umbrales para ${client.sex} de ${client.age} años. ` +
      `Poblaciones disponibles: ${test.populations.map((p) => p.id).join(', ')}. ` +
      `Pedir la banda faltante a HTC antes de clasificar.`,
    );
  }
  const specificity = (p: PopulationThreshold): number =>
    (p.sex != null ? 2 : 0) + (p.age_min != null || p.age_max != null ? 1 : 0);
  return [...matches].sort((a, b) => specificity(b) - specificity(a))[0]!;
}

/**
 * Fórmula canónica de interpolación (C-2):
 *   Score = ((value - umbral_critical) / (umbral_foundation - umbral_critical)) × 3
 * Clamped a [0, 3]. Sirve igual para tests inversos: al usar los valores
 * numéricos de los umbrales (p. ej. critical=90, foundation=60 en RHR) la
 * expresión es algebraicamente idéntica a la variante "inversa" del schema.
 */
export function interpolateScore(
  compiled: CompiledV3,
  value: number,
  pop: PopulationThreshold,
): number {
  const denominator = pop.umbral_foundation - pop.umbral_critical;
  if (denominator === 0) {
    throw new MissingCanonicalV3Error(`Población ${pop.id}: umbral_foundation == umbral_critical.`);
  }
  const raw = ((value - pop.umbral_critical) / denominator) * 3;
  const [min, max] = compiled.raw.scoring.clamp;
  return Math.min(max, Math.max(min, raw));
}

export function scoreTest(
  compiled: CompiledV3,
  testKey: string,
  value: number,
  client: ClientPopulationV3,
): TestScore {
  const test = compiled.testByKey.get(testKey);
  if (!test) {
    throw new MissingCanonicalV3Error(
      `Test "${testKey}" no existe en canonical-v3/tests_and_thresholds.yaml. Nunca se infiere.`,
    );
  }
  const pop = resolvePopulation(test, client);
  const score = interpolateScore(compiled, value, pop);
  const classification = classifyScore(compiled, score);

  return {
    test_key: test.key,
    test_id: test.test_id,
    name: test.name,
    domain: test.domain,
    value,
    unit: test.unit,
    population_id: pop.id,
    umbral_critical: pop.umbral_critical,
    umbral_foundation: pop.umbral_foundation,
    is_inverse: test.is_inverse,
    weight: test.weight ?? 1,
    score_0_3: Number(score.toFixed(4)),
    classification,
    is_critical_component: classification === 'CRITICAL',
    // Trazabilidad: si la banda usada aún no fue firmada por la autoridad
    // clínica, la decisión lo declara en vez de presentarla como canónica.
    ...(pop.approval_status === 'PROPOSED'
      ? { population_pending_approval: true, population_source: pop.source }
      : {}),
  };
}

/**
 * Agregación de un dominio numérico (Strength / Mobility / Aerobic).
 *
 * 1. Promedio ponderado de los scores 0-3 con los pesos canónicos.
 * 2. Clasificación del promedio con la misma regla (redondeo conservador).
 * 3. Critical Component Rule (C-3): si CUALQUIER componente es CRITICAL,
 *    el dominio pasa a CRITICAL por override, ignorando el promedio.
 *
 * Los pesos se renormalizan sobre los tests efectivamente presentes: el MVP
 * admite subconjuntos (p. ej. Aerobic con RHR sola) y el documento define el
 * promedio ponderado como suma(peso×score)/suma(pesos).
 */
export function aggregateNumericDomain(
  compiled: CompiledV3,
  domainKey: DomainKey,
  scores: TestScore[],
): DomainResult {
  const domain = compiled.domainByKey.get(domainKey);
  if (!domain) throw new MissingCanonicalV3Error(`Dominio desconocido ${domainKey}`);
  if (scores.length === 0) {
    throw new MissingCanonicalV3Error(`El dominio ${domainKey} no tiene resultados para agregar.`);
  }

  const weightTotal = scores.reduce((acc, s) => acc + s.weight, 0);
  if (weightTotal === 0) throw new MissingCanonicalV3Error(`Dominio ${domainKey}: suma de pesos = 0.`);
  const weighted = scores.reduce((acc, s) => acc + s.score_0_3 * s.weight, 0) / weightTotal;

  const criticals = scores.filter((s) => s.is_critical_component);
  const averageClass = classifyScore(compiled, weighted);

  let classification: Classification = averageClass;
  let basis: DomainResult['classification_basis'] = 'WEIGHTED_AVERAGE';
  const reasonIds: string[] = [];

  if (domain.critical_component_rule && criticals.length > 0) {
    classification = 'CRITICAL';
    basis = 'CRITICAL_COMPONENT_OVERRIDE';
    reasonIds.push('REASON_V3_CRITICAL_COMPONENT');
  }

  return {
    domain: domainKey,
    name: domain.name,
    impact_factor: domain.impact_factor,
    weighted_score: Number(weighted.toFixed(4)),
    classification,
    critical_component_flag: criticals.length > 0,
    critical_components: criticals.map((c) => c.test_key),
    classification_basis: basis,
    tests: scores,
    reason_ids: reasonIds,
  };
}

/** Agrupa los resultados numéricos por dominio y agrega cada uno. */
export function classifyNumericDomains(
  compiled: CompiledV3,
  client: ClientPopulationV3,
  results: Array<{ test_key: string; value: number }>,
): { domains: DomainResult[]; scores: TestScore[] } {
  const scores = results.map((r) => scoreTest(compiled, r.test_key, r.value, client));

  const byDomain = new Map<DomainKey, TestScore[]>();
  for (const s of scores) {
    byDomain.set(s.domain, [...(byDomain.get(s.domain) ?? []), s]);
  }

  const domains = [...byDomain.entries()]
    .map(([key, list]) => aggregateNumericDomain(compiled, key, list))
    .sort((a, b) => {
      const oa = compiled.domainByKey.get(a.domain)?.order ?? 99;
      const ob = compiled.domainByKey.get(b.domain)?.order ?? 99;
      return oa - ob;
    });

  return { domains, scores };
}
