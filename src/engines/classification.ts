/**
 * Classification Engine — Raw Result → Applicable Standard → Classification.
 * (Platform Data §9; Decision Graph Node 3.)
 * Threshold semantics: lower-bound-inclusive for HIGHER_IS_BETTER (documented
 * technical convention in canonical/standards.yaml header).
 */
import { CompiledCanonical } from '../canonical/compiler';
import { Classification, ClassificationState, MissingCanonicalError, Standard } from '../models/canonical';
import { TestResult } from '../models/assessment';
import { CapacityState } from '../models/decision';
import { ClientPopulation, resolveStandard } from '../resolvers/standard-resolver';
import { aggregateCapacity } from './aggregation';

const ORDER: Record<Classification, number> = { CRITICAL: 0, EMERGING: 1, FUNCTIONAL: 2, FOUNDATION: 3 };

export function isBelowFunctional(c: ClassificationState): boolean {
  return c === 'CRITICAL' || c === 'EMERGING';
}

export function worstOf(a: Classification, b: Classification): Classification {
  return ORDER[a] <= ORDER[b] ? a : b;
}

function classifyNumeric(std: Standard, value: number): Classification {
  const type = std.classification_model.type;
  if (type === 'ORDINAL_MAP') {
    const map = std.classification_model.map;
    if (!map) throw new MissingCanonicalError(`Standard ${std.id} is ORDINAL_MAP but has no map.`);
    const cls = map[String(value)];
    if (!cls) {
      throw new MissingCanonicalError(
        `Standard ${std.id}: value ${value} is not a defined ordinal level (valid: ${Object.keys(map).join(', ')}).`,
      );
    }
    return cls;
  }
  const t = std.thresholds;
  if (!t) throw new MissingCanonicalError(`Standard ${std.id} has no thresholds.`);
  // A null/absent foundation bound is allowed: the source defined C/E/Fn but no
  // Foundation cut-off. Conservative behavior: FOUNDATION is unreachable until
  // HTC supplies the bound (never award the top tier without data).
  if (type === 'HIGHER_IS_BETTER') {
    if (t.functional_min == null || t.emerging_min == null) {
      throw new MissingCanonicalError(`Standard ${std.id} thresholds incomplete (functional_min/emerging_min required).`);
    }
    if (t.foundation_min != null && value >= t.foundation_min) return 'FOUNDATION';
    if (value >= t.functional_min) return 'FUNCTIONAL';
    if (value >= t.emerging_min) return 'EMERGING';
    return 'CRITICAL';
  }
  if (type === 'LOWER_IS_BETTER') {
    if (t.functional_max == null || t.emerging_max == null) {
      throw new MissingCanonicalError(`Standard ${std.id} thresholds incomplete (functional_max/emerging_max required).`);
    }
    if (t.foundation_max != null && value <= t.foundation_max) return 'FOUNDATION';
    if (value <= t.functional_max) return 'FUNCTIONAL';
    if (value <= t.emerging_max) return 'EMERGING';
    return 'CRITICAL';
  }
  throw new MissingCanonicalError(`Standard ${std.id} model ${type} cannot classify a plain numeric value.`);
}

/**
 * ALGORITHMIC classification — Mobility Regional Screen rules
 * (Mobility Standard §4, deterministic; rule structure lives in canonical).
 */
function classifyAlgorithmic(
  std: Standard,
  regions: Record<string, string>,
  flags: string[],
): Classification {
  const interpretations = Object.values(regions);
  if (interpretations.length === 0) {
    throw new MissingCanonicalError(`Algorithmic standard ${std.id} requires region_interpretations input.`);
  }
  const count = (pred: (v: string) => boolean) => interpretations.filter(pred).length;

  // Rules evaluated in canonical order (MOB_RULE_1..6). The engine implements
  // the documented rule semantics; the rule list itself lives in canonical.
  if (count((v) => v === 'PAINFUL') > 0) {
    flags.push('RED_FLAG_PAINFUL_REGION', 'DEEP_DIVE_REQUIRED');
    // "AT LEAST EMERGING" — combined with remaining rules, worst case wins below.
    if (count((v) => v === 'CRITICAL_BLOCKING') > 0) return 'CRITICAL';
    return 'EMERGING';
  }
  if (count((v) => v === 'CRITICAL_BLOCKING') > 0) {
    flags.push('DEEP_DIVE_REQUIRED');
    return 'CRITICAL';
  }
  if (count((v) => v === 'LIMITED' || v === 'ASYMMETRICAL') >= 2) {
    flags.push('DEEP_DIVE_REQUIRED');
    return 'EMERGING';
  }
  if (count((v) => v === 'LIMITED') === 1) return 'FUNCTIONAL';
  if (count((v) => v === 'ASYMMETRICAL') > 0) {
    flags.push('FLAG_ASYMMETRY');
    return 'FUNCTIONAL';
  }
  if (interpretations.every((v) => v === 'CLEAR')) return 'FOUNDATION';
  // NEEDS_DEEPER or unresolved combination: no canonical rule matches.
  flags.push('DEEP_DIVE_REQUIRED');
  return 'EMERGING';
}

export interface ClassificationOutput {
  states: CapacityState[];
  standardsUsed: Array<{ standard_id: string; version: string; test_id: string; evidence_refs: string[]; verification_status: string }>;
  warnings: string[];
  /** Rules applied by the aggregation engine (audit trail). */
  aggregationRules: string[];
}

/**
 * Classify all test results and aggregate them into capacity states.
 * Aggregation of multiple tests per capacity uses WORST classification
 * (conservative; aggregation formula not canonically defined — see
 * CANONICAL_GAPS.md, pending HTC confirmation).
 */
export function runClassification(
  compiled: CompiledCanonical,
  client: ClientPopulation,
  results: TestResult[],
): ClassificationOutput {
  const warnings: string[] = [];
  const standardsUsed: ClassificationOutput['standardsUsed'] = [];
  const perCapacity = new Map<string, CapacityState>();

  for (const r of results) {
    const test = compiled.testById.get(r.test_id);
    if (!test) throw new MissingCanonicalError(`Unknown test ${r.test_id} — not defined in canonical/tests.yaml.`);
    if (!test.active) {
      throw new MissingCanonicalError(`Test ${r.test_id} is inactive (${test.notes ?? 'missing canonical data'}).`);
    }
    const capacityIds = compiled.capacitiesByTest.get(r.test_id);
    if (!capacityIds || capacityIds.length === 0) {
      throw new MissingCanonicalError(`Test ${r.test_id} has no explicit test_capacity_link. Relationships are never inferred from names.`);
    }

    const flags: string[] = [];
    let classification: ClassificationState;
    let rawValue: number | string;
    let standardId = '';
    let standardVersion = '';

    if (r.valid === false) {
      classification = 'INVALID_RESULT';
      rawValue = r.value ?? 'invalid';
    } else {
      const std = resolveStandard(compiled, r.test_id, client, warnings);
      standardId = std.id;
      standardVersion = std.version;
      standardsUsed.push({
        standard_id: std.id, version: std.version, test_id: r.test_id,
        evidence_refs: std.evidence.based_on, verification_status: std.verification_status,
      });
      if (std.classification_model.type === 'ALGORITHMIC') {
        classification = classifyAlgorithmic(std, r.region_interpretations ?? {}, flags);
        rawValue = JSON.stringify(r.region_interpretations ?? {});
      } else if (std.classification_model.type === 'COACH_CLASSIFIED') {
        // Movement levels: the coach applies the canonical criteria directly.
        if (!r.coach_classification) {
          throw new MissingCanonicalError(
            `Test ${r.test_id} uses COACH_CLASSIFIED standard ${std.id}: coach_classification is required ` +
            `(criteria: ${std.classification_model.basis}).`,
          );
        }
        classification = r.coach_classification;
        rawValue = r.coach_classification;
        flags.push('COACH_CLASSIFIED');
      } else {
        if (r.value == null) throw new MissingCanonicalError(`Test ${r.test_id} requires a numeric value.`);
        classification = classifyNumeric(std, r.value);
        rawValue = r.value;
      }
      if (r.pain_during_test != null && r.pain_during_test > 0) flags.push('PAIN_DURING_TEST');
    }

    for (const capacityId of capacityIds) {
      const cap = compiled.capacityById.get(capacityId);
      if (!cap) throw new MissingCanonicalError(`Link points to unknown capacity ${capacityId}`);
      const existing = perCapacity.get(capacityId);
      const contribution = {
        test_id: r.test_id, standard_id: standardId, standard_version: standardVersion,
        raw_value: rawValue, classification, flags,
      };
      if (!existing) {
        perCapacity.set(capacityId, {
          capacity_id: capacityId,
          domain_id: cap.domain_id,
          hierarchy_level: cap.hierarchy_level,
          classification,
          confidence: r.confidence,
          contributing_results: [contribution],
        });
      } else {
        existing.contributing_results.push(contribution);
        // Confidence: lowest wins (Platform Data §10 — low confidence taints the capacity).
        const confOrder = { LOW: 0, MODERATE: 1, HIGH: 2 } as const;
        if (confOrder[r.confidence] < confOrder[existing.confidence]) existing.confidence = r.confidence;
      }
    }
  }

  // Aggregate multi-test capacities using the canonical strategy (never hardcoded).
  const aggregationRules = new Set<string>();
  for (const state of perCapacity.values()) {
    if (state.contributing_results.length < 2) continue;
    const agg = aggregateCapacity(compiled, {
      capacity_id: state.capacity_id,
      components: state.contributing_results.map((c) => ({
        test_id: c.test_id,
        classification: c.classification,
        weight: compiled.weightOf(c.test_id, state.capacity_id),
      })),
    });
    state.classification = agg.classification;
    state.critical_component_flag = agg.critical_component_flag;
    state.critical_components = agg.critical_components;
    state.aggregation_score = agg.score;
    for (const rule of agg.applied_rules) aggregationRules.add(rule);
  }

  return { states: [...perCapacity.values()], standardsUsed, warnings, aggregationRules: [...aggregationRules] };
}
