/**
 * HTC v3 — Movement Engine (C-4).
 *
 * 4 niveles jerárquicos evaluados CUALITATIVAMENTE por el coach (MVP).
 * El dominio se clasifica por el PEOR nivel (worst-case jerárquico).
 *
 * La clasificación de cada nivel puede venir:
 *   · declarada por el coach (COACH_DECLARED) — camino principal del MVP, o
 *   · derivada de las variables de observación con la regla canónica del rubric
 *     (RUBRIC_DERIVED), como asistencia.
 * En ningún caso el motor inventa criterios: las reglas viven en el Canonical.
 */
import {
  Classification, CLASSIFICATION_CODE, MissingCanonicalV3Error, MovementLevelInput,
  MovementLevelResult, MovementResult,
} from './models';
import { CompiledV3 } from './canonical';

const ORDER: Classification[] = ['FOUNDATION', 'FUNCTIONAL', 'EMERGING', 'CRITICAL'];

/** Peor de dos clasificaciones (código mayor = peor). */
export function worseOf(a: Classification, b: Classification): Classification {
  return CLASSIFICATION_CODE[a] >= CLASSIFICATION_CODE[b] ? a : b;
}

interface VariableTally {
  foundation: number;
  functional: number;
  emerging: number;
  critical: number;
  total: number;
  functionalOrAbove: number;
  emergingOrWorse: number;
}

function tally(vars: Record<string, { coach_observation: Classification }>): VariableTally {
  const values = Object.values(vars).map((v) => v.coach_observation);
  const count = (c: Classification): number => values.filter((v) => v === c).length;
  const foundation = count('FOUNDATION');
  const functional = count('FUNCTIONAL');
  const emerging = count('EMERGING');
  const critical = count('CRITICAL');
  return {
    foundation, functional, emerging, critical,
    total: values.length,
    functionalOrAbove: foundation + functional,
    emergingOrWorse: emerging + critical,
  };
}

const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);

/**
 * Evalúa la regla canónica de un nivel contra el conteo de variables.
 * Se recorre de mejor a peor y se devuelve la primera clase cuyos criterios
 * se cumplen; si ninguna se cumple, la peor clase declarada.
 */
function deriveFromRubric(
  compiled: CompiledV3,
  levelId: string,
  vars: Record<string, { coach_observation: Classification }>,
  ceiling: number | null,
  challenge: string | null,
): Classification {
  const level = compiled.movementLevelById.get(levelId);
  if (!level) throw new MissingCanonicalV3Error(`Nivel de Movement desconocido ${levelId}`);
  const t = tally(vars);
  const rules = level.classification_rule as unknown as Record<string, Record<string, unknown>>;

  const meets = (cls: Classification): boolean => {
    const r = rules[cls];
    if (!r) return false;

    const minFoundation = num(r.min_at_foundation);
    if (minFoundation != null && t.foundation < minFoundation) return false;

    const minFnOrAbove = num(r.min_at_functional_or_above);
    if (minFnOrAbove != null && t.functionalOrAbove < minFnOrAbove) return false;

    const minFunctional = num(r.min_at_functional);
    if (minFunctional != null && t.functional < minFunctional) return false;

    const maxEmerging = num(r.max_emerging);
    if (maxEmerging != null && t.emerging > maxEmerging) return false;

    const maxCritical = num(r.max_critical);
    if (maxCritical != null && t.critical > maxCritical) return false;

    if (r.no_critical === true && t.critical > 0) return false;

    if (r.none_below === 'FUNCTIONAL' && t.emergingOrWorse > 0) return false;

    if (r.all_at_functional_or_above === true && t.functionalOrAbove !== t.total) return false;

    const minEmergingOrCritical = num(r.min_at_emerging_or_critical);
    if (minEmergingOrCritical != null && t.emergingOrWorse < minEmergingOrCritical) return false;

    const minEmergingOrWorse = num(r.min_at_emerging_or_worse);
    if (minEmergingOrWorse != null && t.emergingOrWorse < minEmergingOrWorse) return false;

    const emergingRange = r.emerging_range as number[] | undefined;
    if (Array.isArray(emergingRange) && (t.emerging < emergingRange[0]! || t.emerging > emergingRange[1]!)) return false;

    // Ceiling numérico (L3)
    const ceilingMin = num(r.ceiling_min);
    if (ceilingMin != null) {
      if (ceiling == null) {
        throw new MissingCanonicalV3Error(
          `El nivel ${levelId} requiere coordination_ceiling (1-5) para aplicar la regla canónica.`,
        );
      }
      if (ceiling < ceilingMin) return false;
    }
    const ceilingMax = num(r.ceiling_max);
    if (ceilingMax != null && ceiling != null && ceiling > ceilingMax) return false;
    const ceilingRange = r.ceiling_range as number[] | undefined;
    if (Array.isArray(ceilingRange)) {
      if (ceiling == null) {
        throw new MissingCanonicalV3Error(`El nivel ${levelId} requiere coordination_ceiling.`);
      }
      if (ceiling < ceilingRange[0]! || ceiling > ceilingRange[1]!) return false;
    }

    // Ceiling por challenge (L4)
    const minChallenge = r.ceiling_min_challenge as string | undefined;
    if (minChallenge != null) {
      if (challenge == null) {
        throw new MissingCanonicalV3Error(
          `El nivel ${levelId} requiere problem_solving_ceiling para aplicar la regla canónica.`,
        );
      }
      const order = compiled.raw.challengeOrder;
      const got = order.indexOf(challenge);
      const need = order.indexOf(minChallenge);
      if (got < 0) {
        throw new MissingCanonicalV3Error(
          `problem_solving_ceiling "${challenge}" no está en challenge_order canónico (${order.join(', ')}).`,
        );
      }
      if (got < need) return false;
    }
    return true;
  };

  for (const cls of ORDER) {
    if (meets(cls)) return cls;
  }
  return 'CRITICAL';
}

export function evaluateMovement(
  compiled: CompiledV3,
  inputs: MovementLevelInput[],
): MovementResult | null {
  if (inputs.length === 0) return null;

  const byId = new Map(inputs.map((i) => [i.level_id, i]));
  const results: MovementLevelResult[] = [];

  for (const level of compiled.movementLevelsOrdered) {
    const input = byId.get(level.level_id);
    if (!input) continue;

    // Validación: sólo se aceptan variables declaradas en el Canonical.
    for (const varName of Object.keys(input.observation_variables)) {
      if (!level.observation_variables.includes(varName)) {
        throw new MissingCanonicalV3Error(
          `La variable "${varName}" no pertenece a ${level.level_id}. ` +
          `Variables canónicas: ${level.observation_variables.join(', ')}.`,
        );
      }
    }

    let classification: Classification;
    let method: MovementLevelResult['classification_method'];
    const reasonIds: string[] = [];

    if (input.coach_classification) {
      classification = input.coach_classification;
      method = 'COACH_DECLARED';
    } else {
      const missing = level.observation_variables.filter((v) => !input.observation_variables[v]);
      if (missing.length > 0) {
        throw new MissingCanonicalV3Error(
          `${level.level_id}: faltan las variables ${missing.join(', ')} y no se declaró coach_classification. ` +
          `El motor no infiere clasificaciones de Movement.`,
        );
      }
      classification = deriveFromRubric(
        compiled, level.level_id, input.observation_variables,
        input.coordination_ceiling ?? null, input.problem_solving_ceiling ?? null,
      );
      method = 'RUBRIC_DERIVED';
    }

    results.push({
      level_id: level.level_id,
      name: level.name,
      sequence_number: level.sequence_number,
      classification,
      classification_method: method,
      observation_variables: input.observation_variables,
      ...(input.coordination_ceiling !== undefined ? { coordination_ceiling: input.coordination_ceiling } : {}),
      ...(input.problem_solving_ceiling !== undefined ? { problem_solving_ceiling: input.problem_solving_ceiling } : {}),
      prerequisite_met: true, // se recalcula abajo
      reason_ids: reasonIds,
    });
  }

  if (results.length === 0) return null;

  // Prerrequisitos jerárquicos: cada nivel exige el anterior >= FUNCTIONAL.
  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    const level = compiled.movementLevelById.get(r.level_id)!;
    if (!level.prerequisite) { r.prerequisite_met = true; continue; }
    const prev = results[i - 1];
    if (!prev) { r.prerequisite_met = true; continue; }
    const ok = CLASSIFICATION_CODE[prev.classification] <= CLASSIFICATION_CODE.FUNCTIONAL;
    r.prerequisite_met = ok;
    if (!ok) r.reason_ids.push('REASON_V3_PREREQ_NOT_MET');
  }

  // Worst-case jerárquico: MIN(L1..L4) en términos de capacidad.
  let worst = results[0]!.classification;
  let limitedBy = results[0]!.level_id;
  for (const r of results) {
    if (CLASSIFICATION_CODE[r.classification] > CLASSIFICATION_CODE[worst]) {
      worst = r.classification;
      limitedBy = r.level_id;
    }
  }

  return {
    levels: results,
    domain_classification: worst,
    limited_by: limitedBy,
    reason_ids: ['REASON_V3_MOVEMENT_WORST_CASE'],
  };
}

/** Convierte el resultado de Movement en un DomainResult homogéneo. */
export function movementAsDomain(compiled: CompiledV3, movement: MovementResult) {
  const domain = compiled.domainByKey.get('MOVEMENT');
  if (!domain) throw new MissingCanonicalV3Error('Falta el dominio MOVEMENT en el canonical.');
  const criticalLevels = movement.levels.filter((l) => l.classification === 'CRITICAL');
  return {
    domain: 'MOVEMENT' as const,
    name: domain.name,
    impact_factor: domain.impact_factor,
    weighted_score: null,
    classification: movement.domain_classification,
    critical_component_flag: criticalLevels.length > 0,
    critical_components: criticalLevels.map((l) => l.level_id),
    classification_basis: 'WORST_CASE_HIERARCHICAL' as const,
    tests: [],
    reason_ids: movement.reason_ids,
  };
}
