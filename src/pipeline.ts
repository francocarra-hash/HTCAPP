/**
 * HTC Decision Pipeline — executes the mandated layer sequence:
 * Assessment → Classification → Safety → Decision → Pathway → Reasoning →
 * Language Mapping → (Client Report built separately).
 * Never bypasses a layer (Master Instructions — SYSTEM ARCHITECTURE).
 */
import { randomUUID } from 'crypto';
import { CompiledCanonical } from './canonical/compiler';
import { AssessmentInput, AssessmentInputSchema } from './models/assessment';
import { Decision, VersionSnapshot } from './models/decision';
import { runClassification } from './engines/classification';
import { runSafety } from './engines/safety';
import { runDecision } from './engines/decision';
import { assignPathway } from './engines/pathway';
import { resolveReason } from './resolvers/language-resolver';

/**
 * system_confidence: HIGH=100 / MODERATE=70 / LOW=30 averaged over contributing
 * capacity states. TECHNICAL IMPLEMENTATION DETAIL — no canonical formula
 * exists (Developer Handoff v3.0 names the function but not the math).
 * Flagged in CANONICAL_GAPS.md for HTC validation.
 */
const CONFIDENCE_POINTS = { HIGH: 100, MODERATE: 70, LOW: 30 } as const;

/**
 * Freezes the five component versions for this decision (Principio 6).
 * A stored decision must render identically years later, so the snapshot is
 * copied into the audit trail and never re-derived from the live canonical.
 */
function freezeVersions(compiled: CompiledCanonical): VersionSnapshot {
  const cv = compiled.raw.componentVersions;
  return {
    os_version: cv.os_version,
    canonical_version: cv.canonical_version,
    standards_version: cv.standards_version,
    decision_rules_version: cv.decision_rules_version,
    report_version: cv.report_version,
    frozen_at: new Date().toISOString(),
  };
}

export function runPipeline(compiled: CompiledCanonical, rawInput: unknown): Decision {
  const input: AssessmentInput = AssessmentInputSchema.parse(rawInput);
  const warnings: string[] = [];
  const versionSnapshot = freezeVersions(compiled);

  // 1. Safety FIRST (health precedes performance).
  const safety = runSafety(compiled, input);

  if (safety.stop_decision_process) {
    // Medical referral / gate STOP: no classification-based decision is made.
    return {
      decision_id: randomUUID(),
      client_name: input.client.name,
      capacity_states: [],
      domain_bottlenecks: [],
      suggested_relationships: [],
      primary_system_bottleneck: { capacity_id: null, domain_id: null, classification: null, status: 'BLOCKED' },
      priorities: [],
      strategy: 'ASSESSMENT_REQUIRED',
      pathway: null,
      system_confidence: 0,
      reasoning_ids: safety.reason_ids,
      reasoning_text: safety.reason_ids.map((id) => resolveReason(compiled, id, input.audience, input.language)),
      reassessment: { weeks: null, exit_criteria: null, triggers: ['SYMPTOMS_WORSEN'] },
      coach_confirmation: { confirmed: null, override_reason: null },
      audit_trail: {
        canonical_version: compiled.raw.version,
        version_snapshot: versionSnapshot,
        timestamp: new Date().toISOString(),
        safety,
        standards_used: [],
        applied_rules: safety.applied_rule_ids,
        candidate_scores: [],
        warnings,
      },
    };
  }

  // 2. Classification (raw → standard → classification).
  const classification = runClassification(
    compiled,
    { age: input.client.age, sex: input.client.sex, activity_level: input.client.activity_level },
    input.test_results,
  );
  warnings.push(...classification.warnings);

  // Pain-limited safety outcome reduces confidence of all states (Node 5.3).
  if (safety.reduce_confidence) {
    for (const s of classification.states) {
      if (s.confidence === 'HIGH') s.confidence = 'MODERATE';
      else s.confidence = 'LOW';
    }
  }

  // 3-4. Decision Engine (bottlenecks → candidates → scoring → roles → strategy).
  const decision = runDecision(compiled, input, classification.states, safety);

  // 5. Pathway.
  const pathwayResult = assignPathway(compiled, input, decision);
  const reasoningIds = [...new Set([...decision.reasoning_ids, pathwayResult.reason_id])];

  // 6. Reasoning → Language Mapping (IDs → text; text never generated in code).
  const reasoningText = reasoningIds.map((id) => resolveReason(compiled, id, input.audience, input.language));

  // Reassessment window from canonical criteria (never invented).
  let reassessWeeks: number | null = null;
  let exitCriteria: string | null = null;
  if (decision.primary.capacity_id) {
    const win = compiled.raw.reassessmentWindows.find((w) => w.capacity_id === decision.primary.capacity_id);
    if (win) {
      reassessWeeks = win.weeks;
      exitCriteria = win.exit_criteria;
    } else {
      warnings.push(
        `No canonical reassessment window for ${decision.primary.capacity_id} — coach must set it manually (MASTER TABLES T8 gap).`,
      );
    }
  }

  const confidenceValues = classification.states.map((s) => CONFIDENCE_POINTS[s.confidence]);
  const systemConfidence = confidenceValues.length
    ? Math.round(confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length)
    : 0;

  return {
    decision_id: randomUUID(),
    client_name: input.client.name,
    capacity_states: classification.states,
    domain_bottlenecks: decision.domain_bottlenecks,
    suggested_relationships: decision.suggested_relationships,
    primary_system_bottleneck: decision.primary,
    priorities: decision.priorities,
    strategy: decision.strategy,
    pathway: pathwayResult.pathway,
    system_confidence: systemConfidence,
    reasoning_ids: reasoningIds,
    reasoning_text: reasoningText,
    reassessment: { weeks: reassessWeeks, exit_criteria: exitCriteria, triggers: compiled.raw.decisionRules.reassessment_triggers.values },
    coach_confirmation: { confirmed: null, override_reason: null },
    audit_trail: {
      canonical_version: compiled.raw.version,
      version_snapshot: versionSnapshot,
      timestamp: new Date().toISOString(),
      safety,
      standards_used: classification.standardsUsed,
      applied_rules: [...safety.applied_rule_ids, ...decision.applied_rules, ...classification.aggregationRules],
      candidate_scores: decision.candidate_scores,
      warnings,
    },
  };
}
