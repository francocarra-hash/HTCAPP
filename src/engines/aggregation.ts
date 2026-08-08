/**
 * Aggregation Engine — combines several test classifications into one capacity
 * classification.
 *
 * The strategy is NOT decided here: it is read from
 * canonical/decision_rules.yaml → `aggregation.test_to_capacity`.
 * This module only knows HOW to execute each declared strategy.
 *
 * Supported (declared in canonical `supported_strategies`):
 *   WORST_OF          — capacity takes the worst classification (in force today)
 *   SIMPLE_AVERAGE    — ordinal mean, then rounded
 *   WEIGHTED_AVERAGE  — weighted ordinal mean, then rounded
 *
 * Critical-component handling (`critical_component_modes`):
 *   OVERRIDE  — any CRITICAL component forces the capacity to CRITICAL (BLOCK_1 D6)
 *   FLAG      — classification untouched; a flag is raised (AUTHORITATIVE §5.2)
 *   INHERENT  — the strategy already guarantees it (WORST_OF)
 *
 * ⚠️ Average-based strategies FAIL LOUDLY while `rounding_rule.status` is
 * MISSING_CANONICAL: no source defines midpoint rounding (is 1.5 FUNCTIONAL or
 * EMERGING?). Never guessed here.
 */
import { CompiledCanonical } from '../canonical/compiler';
import {
  AggregationConfig, Classification, ClassificationState, MissingCanonicalError,
} from '../models/canonical';

const ORDER: Record<Classification, number> = { CRITICAL: 0, EMERGING: 1, FUNCTIONAL: 2, FOUNDATION: 3 };

export interface AggregationInput {
  capacity_id: string;
  /** One entry per contributing test result. */
  components: Array<{ test_id: string; classification: ClassificationState; weight?: number }>;
}

export interface AggregationOutput {
  classification: ClassificationState;
  strategy: string;
  critical_component_mode: string;
  /** True when at least one component is CRITICAL (regardless of mode). */
  critical_component_flag: boolean;
  critical_components: string[];
  /** Numeric value when an average strategy was used. */
  score: number | null;
  applied_rules: string[];
}

function isScorable(c: ClassificationState): c is Classification {
  return c === 'CRITICAL' || c === 'EMERGING' || c === 'FUNCTIONAL' || c === 'FOUNDATION';
}

function ordinalOf(cfg: AggregationConfig, c: Classification): number {
  const scale = cfg.ordinal_scale;
  if (!scale) throw new MissingCanonicalError('aggregation.ordinal_scale is required for average strategies.');
  const v = scale[c];
  if (typeof v !== 'number') {
    throw new MissingCanonicalError(`aggregation.ordinal_scale has no numeric value for ${c}.`);
  }
  return v;
}

function requireRoundingRule(cfg: AggregationConfig, strategy: string): never | void {
  const status = cfg.rounding_rule?.status;
  if (status === 'MISSING_CANONICAL') {
    throw new MissingCanonicalError(
      `aggregation strategy ${strategy} requires a rounding rule, but decision_rules.yaml declares ` +
      `rounding_rule.status = MISSING_CANONICAL. ${cfg.rounding_rule?.note ?? ''} ` +
      `Ask Magnetia before enabling average-based aggregation.`,
    );
  }
}

export function aggregateCapacity(
  compiled: CompiledCanonical,
  input: AggregationInput,
): AggregationOutput {
  const cfg = compiled.raw.aggregation;
  const strategy = cfg.test_to_capacity.strategy;
  const mode = cfg.test_to_capacity.critical_component;
  const applied: string[] = [`AGGREGATION_${strategy}`];

  const scorable = input.components.filter((c) => isScorable(c.classification));
  const criticals = input.components.filter((c) => c.classification === 'CRITICAL').map((c) => c.test_id);

  if (scorable.length === 0) {
    // Nothing usable: preserve the single state (INVALID_RESULT / NOT_ASSESSED).
    const only = input.components[0]?.classification ?? 'NOT_ASSESSED';
    return {
      classification: only, strategy, critical_component_mode: mode,
      critical_component_flag: false, critical_components: [], score: null, applied_rules: applied,
    };
  }

  let classification: ClassificationState;
  let score: number | null = null;

  if (strategy === 'WORST_OF') {
    classification = scorable
      .map((c) => c.classification as Classification)
      .reduce((worst, c) => (ORDER[c] <= ORDER[worst] ? c : worst));
  } else {
    requireRoundingRule(cfg, strategy);
    let sum = 0;
    let weightTotal = 0;
    for (const c of scorable) {
      const w = strategy === 'WEIGHTED_AVERAGE' ? c.weight : 1;
      if (strategy === 'WEIGHTED_AVERAGE' && (w === undefined || w === null)) {
        throw new MissingCanonicalError(
          `WEIGHTED_AVERAGE requires a weight for test ${c.test_id} in capacity ${input.capacity_id}; none is declared in canonical.`,
        );
      }
      const weight = w ?? 1;
      sum += ordinalOf(cfg, c.classification as Classification) * weight;
      weightTotal += weight;
    }
    score = sum / weightTotal;
    // Rounding rule exists (checked above); resolve nearest ordinal.
    const rounded = Math.round(score);
    const entry = Object.entries(cfg.ordinal_scale ?? {})
      .find(([, v]) => v === rounded);
    if (!entry) {
      throw new MissingCanonicalError(`aggregation.ordinal_scale has no classification for ordinal ${rounded}.`);
    }
    classification = entry[0] as Classification;
  }

  // Critical-component handling.
  if (criticals.length > 0) {
    if (mode === 'OVERRIDE' && classification !== 'CRITICAL') {
      classification = 'CRITICAL';
      applied.push('CRITICAL_COMPONENT_OVERRIDE');
    } else if (mode === 'FLAG') {
      applied.push('CRITICAL_COMPONENT_FLAG');
    } else if (mode === 'INHERENT') {
      applied.push('CRITICAL_COMPONENT_INHERENT');
    }
  }

  return {
    classification,
    strategy,
    critical_component_mode: mode,
    critical_component_flag: criticals.length > 0,
    critical_components: criticals,
    score,
    applied_rules: applied,
  };
}
