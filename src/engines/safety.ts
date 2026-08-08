/**
 * Safety Engine — consumes CLINICAL information only, never performance
 * classifications (Master Instructions — SAFETY; Decision Graph Node 2).
 * Evaluates canonical safety_rules in priority order; first match wins,
 * except non-terminal advisory rules (PAIN_LIMITED, CAUTION) which accumulate.
 */
import { CompiledCanonical } from '../canonical/compiler';
import { AssessmentInput } from '../models/assessment';
import { SafetyFlag, SafetyResult } from '../models/decision';
import { Pathway } from '../models/canonical';

/** Evaluates canonical vital_sign_gates (AUTHORITATIVE §9.1). */
function evaluateVitalSignGates(compiled: CompiledCanonical, input: AssessmentInput): string[] {
  const triggered: string[] = [];
  for (const gate of compiled.raw.vitalSignGates) {
    const value = gate.measure === 'systolic_bp' ? input.clinical.systolic_bp : input.clinical.diastolic_bp;
    if (value == null) continue;
    const hit =
      gate.operator === '>=' ? value >= gate.threshold :
      gate.operator === '>' ? value > gate.threshold :
      gate.operator === '<=' ? value <= gate.threshold :
      value < gate.threshold;
    if (hit) triggered.push(gate.id);
  }
  return triggered;
}

/** Evaluates canonical flag_rules that do not stop the assessment (§9.2). */
function evaluateFlags(compiled: CompiledCanonical, input: AssessmentInput): SafetyFlag[] {
  const flags: SafetyFlag[] = [];
  for (const rule of compiled.raw.flagRules) {
    let hit = false;
    if (rule.id === 'FLAG_PAIN_SIGNIFICANT') {
      const declared = input.clinical.current_pain_level;
      const worstEventPain = Math.max(
        0,
        ...input.clinical.events.filter((e) => e.type === 'PAIN' && e.intensity != null).map((e) => e.intensity as number),
      );
      const pain = Math.max(declared ?? 0, worstEventPain);
      hit = pain >= 6;
    }
    // FLAG_ASYMMETRY and FLAG_RESPIRATORY_DISTRESS need inputs the MVP does not
    // collect yet; they stay declared in canonical and are never inferred here.
    if (hit) {
      flags.push({ id: rule.id, severity: rule.severity, detail: rule.detail ?? rule.condition, reason_id: rule.reason_id });
    }
  }
  return flags;
}

export function runSafety(compiled: CompiledCanonical, input: AssessmentInput): SafetyResult {
  const clinical = input.clinical;
  const triggeredGates = evaluateVitalSignGates(compiled, input);
  const flags = evaluateFlags(compiled, input);
  const result: SafetyResult = {
    outcome: 'PROCEED',
    assessment_allowed: true,
    stop_decision_process: false,
    applied_rule_ids: [],
    reason_ids: [],
    flags,
    triggered_gates: triggeredGates,
  };

  for (const rule of compiled.raw.safetyRules) {
    const cond = rule.if as Record<string, unknown>;
    let matches = false;

    if (cond.vital_sign_gate_triggered === true) {
      matches = triggeredGates.length > 0;
    } else if (Array.isArray(cond.any_event_of_type)) {
      const types = cond.any_event_of_type as string[];
      // PAR-Q+ positive is a canonical RED_FLAG screening item (§9.1).
      matches = clinical.events.some((e) => types.includes(e.type)) ||
        (types.includes('RED_FLAG') && clinical.parq_positive === true);
    } else if (cond.health_markers_state !== undefined) {
      matches = clinical.health_markers_state === cond.health_markers_state;
    } else if (cond.general_health_classification !== undefined) {
      matches =
        clinical.general_health_classification === cond.general_health_classification &&
        (cond.training_tolerance_compromised === undefined ||
          clinical.training_tolerance_compromised === cond.training_tolerance_compromised);
    } else if (cond.any_event !== undefined) {
      const spec = cond.any_event as { type: string; significantly_limits?: boolean };
      matches = clinical.events.some(
        (e) => e.type === spec.type &&
          (spec.significantly_limits === undefined || e.significantly_limits === spec.significantly_limits),
      );
    } else if (cond.default === true) {
      matches = result.applied_rule_ids.length === 0;
    }

    if (!matches) continue;

    const then = rule.then as Record<string, unknown>;
    result.applied_rule_ids.push(rule.id);
    result.reason_ids.push(rule.reason_id);

    if (then.stop_decision_process === true) {
      result.outcome = String(then.outcome);
      result.assessment_allowed = Boolean(then.assessment_allowed);
      result.stop_decision_process = true;
      return result; // terminal rule — no further evaluation
    }
    if (then.force_p1 !== undefined) {
      result.outcome = String(then.outcome);
      result.force_p1 = String(then.force_p1);
      result.force_pathway = then.force_pathway as Pathway;
    }
    if (then.reduce_confidence === true) result.reduce_confidence = true;
    if (then.block_definitive_p1 === true) result.block_definitive_p1 = true;
    if (result.outcome === 'PROCEED' && then.outcome !== undefined) result.outcome = String(then.outcome);
  }

  return result;
}
