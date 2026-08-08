/**
 * Decision Engine — full Decision Graph model (approved resolution C1):
 *   Node 5  Within-domain bottleneck (earliest capacity below Functional)
 *   Node 6  Candidate bottleneck list
 *   Node 7  Cross-domain relationship suggestions (coach must confirm)
 *   Node 8-9 Multi-domain scoring (OS 10.3) → Primary System Bottleneck
 *   Node 10 Priority role assignment
 *   Node 11 Strategy selection
 * All rule parameters come from canonical decision_rules.yaml.
 */
import { CompiledCanonical } from '../canonical/compiler';
import { Classification, MissingCanonicalError, Strategy } from '../models/canonical';
import { AssessmentInput } from '../models/assessment';
import {
  CandidateScore, CapacityState, DomainBottleneck, PriorityAssignment,
  SafetyResult, SuggestedRelationship,
} from '../models/decision';
import { isBelowFunctional } from './classification';

export interface DecisionOutput {
  domain_bottlenecks: DomainBottleneck[];
  suggested_relationships: SuggestedRelationship[];
  candidate_scores: CandidateScore[];
  primary: { capacity_id: string | null; domain_id: string | null; classification: CapacityState['classification'] | null; status: 'CONFIRMED' | 'UNCONFIRMED' | 'NONE' | 'BLOCKED' };
  priorities: PriorityAssignment[];
  strategy: Strategy;
  applied_rules: string[];
  reasoning_ids: string[];
}

/** Node 5 — one bottleneck per domain: earliest capacity below Functional. */
export function findDomainBottlenecks(
  compiled: CompiledCanonical,
  states: CapacityState[],
): DomainBottleneck[] {
  const byDomain = new Map<string, CapacityState[]>();
  for (const s of states) {
    const arr = byDomain.get(s.domain_id) ?? [];
    arr.push(s);
    byDomain.set(s.domain_id, arr);
  }
  const out: DomainBottleneck[] = [];
  for (const [domainId, domainStates] of byDomain) {
    const ordered = [...domainStates].sort((a, b) => a.hierarchy_level - b.hierarchy_level);
    const below = ordered.filter((s) => isBelowFunctional(s.classification));
    if (below.length === 0) {
      out.push({ domain_id: domainId, capacity_id: null, status: 'NONE', reason_ids: [] });
      continue;
    }
    const earliest = below[0]!;
    // Exception 2 (Platform Data §13): low confidence ⇒ bottleneck Unconfirmed.
    if (earliest.confidence === 'LOW') {
      out.push({
        domain_id: domainId, capacity_id: earliest.capacity_id, status: 'UNCONFIRMED',
        reason_ids: ['REASON_LOW_CONFIDENCE'],
      });
      continue;
    }
    out.push({
      domain_id: domainId, capacity_id: earliest.capacity_id, status: 'CONFIRMED',
      reason_ids: ['REASON_DOMAIN_BOTTLENECK'],
    });
  }
  return out;
}

/** Node 7 — suggest cross-domain relationships from canonical influence map. */
export function suggestRelationships(
  compiled: CompiledCanonical,
  states: CapacityState[],
): SuggestedRelationship[] {
  const stateOf = new Map(states.map((s) => [s.capacity_id, s]));
  const suggestions: SuggestedRelationship[] = [];
  for (const inf of compiled.raw.influences) {
    const src = stateOf.get(inf.source_capacity_id);
    const tgt = stateOf.get(inf.target_capacity_id);
    if (!src || !tgt) continue;
    if (isBelowFunctional(src.classification) && isBelowFunctional(tgt.classification)) {
      suggestions.push({
        source_capacity_id: inf.source_capacity_id,
        target_capacity_id: inf.target_capacity_id,
        type: 'CONTRIBUTES_TO',
        coach_confirmed: false,
      });
    }
  }
  return suggestions;
}

export function runDecision(
  compiled: CompiledCanonical,
  input: AssessmentInput,
  states: CapacityState[],
  safety: SafetyResult,
): DecisionOutput {
  const rules = compiled.raw.decisionRules;
  const applied: string[] = [];
  const reasoning: string[] = [...safety.reason_ids];

  const bottlenecks = findDomainBottlenecks(compiled, states);
  const suggestions = suggestRelationships(compiled, states);
  const stateOf = new Map(states.map((s) => [s.capacity_id, s]));

  // ── Health override (Rule 18.1 via Safety Engine) ─────────────────────────
  if (safety.force_p1) {
    applied.push('RULE_18_1_HEALTH_OVERRIDE');
    const priorities: PriorityAssignment[] = [
      { capacity_id: safety.force_p1, role: 'P1', reason_id: 'REASON_HEALTH_OVERRIDE' },
    ];
    // Everything else at least Functional → MAINTAIN; below Functional → DEFER
    // (allowed roles per safety rule: SUPPORT/MAINTAIN/DEFER).
    for (const s of states) {
      if (s.capacity_id === safety.force_p1) continue;
      if (isBelowFunctional(s.classification)) {
        priorities.push({ capacity_id: s.capacity_id, role: 'DEFER', reason_id: 'REASON_ROLE_DEFER' });
      } else if (s.classification === 'FUNCTIONAL' || s.classification === 'FOUNDATION') {
        priorities.push({ capacity_id: s.capacity_id, role: 'MAINTAIN', reason_id: 'REASON_ROLE_MAINTAIN' });
      }
    }
    const healthCap = compiled.capacityById.get(safety.force_p1);
    return {
      domain_bottlenecks: bottlenecks,
      suggested_relationships: suggestions,
      candidate_scores: [],
      primary: {
        capacity_id: safety.force_p1,
        domain_id: healthCap?.domain_id ?? null,
        classification: 'CRITICAL',
        status: 'CONFIRMED',
      },
      priorities,
      strategy: 'RESTORE_FIRST',
      applied_rules: [...safety.applied_rule_ids, ...applied, 'REASON_STRATEGY_RESTORE_FIRST'],
      reasoning_ids: [...reasoning, 'REASON_STRATEGY_RESTORE_FIRST'],
    };
  }

  // ── Node 6: candidate list = confirmed domain bottlenecks ─────────────────
  const confirmed = bottlenecks.filter((b) => b.status === 'CONFIRMED' && b.capacity_id);
  const unconfirmed = bottlenecks.filter((b) => b.status === 'UNCONFIRMED');

  // Manifestation exclusion (Rule 11.2): a candidate that is the target of a
  // suggested causal relationship whose source is also a candidate cannot be P1.
  const candidateIds = new Set(confirmed.map((b) => b.capacity_id as string));
  const excludedAsManifestation = new Set<string>();
  for (const s of suggestions) {
    if (candidateIds.has(s.source_capacity_id) && candidateIds.has(s.target_capacity_id)) {
      excludedAsManifestation.add(s.target_capacity_id);
      applied.push('RULE_MANIFESTATION_EXCLUSION');
    }
  }

  // Dependency rule 18.3 across domains: candidate whose canonical dependency
  // is itself below Functional cannot be P1.
  const excludedByDependency = new Set<string>();
  for (const id of candidateIds) {
    const dep = compiled.dependsOn.get(id);
    if (dep) {
      const depState = stateOf.get(dep);
      if (depState && isBelowFunctional(depState.classification)) {
        excludedByDependency.add(id);
        applied.push('RULE_18_3_DEPENDENCY');
      }
    }
  }

  const eligible = confirmed.filter(
    (b) => !excludedAsManifestation.has(b.capacity_id as string) && !excludedByDependency.has(b.capacity_id as string),
  );

  // ── Node 8-9: multi-domain scoring (OS 10.3) ──────────────────────────────
  const points = rules.multi_domain_scoring.classification_points;
  const scores: CandidateScore[] = eligible.map((b) => {
    const st = stateOf.get(b.capacity_id as string)!;
    const p = points[st.classification];
    if (p === undefined) {
      throw new MissingCanonicalError(`classification_points missing for ${st.classification} in decision_rules.yaml`);
    }
    const impact = compiled.impactFactorOf(st.capacity_id);
    return {
      capacity_id: st.capacity_id,
      domain_id: st.domain_id,
      classification: st.classification,
      classification_points: p,
      impact_factor: impact,
      score: p * impact,
    };
  });
  scores.sort((a, b) => b.score - a.score);
  if (scores.length > 0) applied.push('MULTI_DOMAIN_SCORING_OS_10_3');

  // Goal modifier (Rule 18.4): on exact ties, goal-critical capacity wins.
  const goalIds = new Set(input.client.goal_capacity_ids ?? []);
  if (scores.length >= 2 && scores[0]!.score === scores[1]!.score) {
    const tied = scores.filter((s) => s.score === scores[0]!.score);
    const goalPick = tied.find((s) => goalIds.has(s.capacity_id));
    if (goalPick && scores[0]!.capacity_id !== goalPick.capacity_id) {
      const idx = scores.findIndex((s) => s.capacity_id === goalPick.capacity_id);
      const [g] = scores.splice(idx, 1);
      scores.unshift(g!);
      applied.push('RULE_18_4_GOAL_MODIFIER');
      reasoning.push('REASON_GOAL_MODIFIER');
    }
  }

  // ── No eligible candidate ─────────────────────────────────────────────────
  if (scores.length === 0) {
    if (unconfirmed.length > 0 || safety.block_definitive_p1) {
      applied.push('RULE_18_6_CONFIDENCE');
      reasoning.push('REASON_LOW_CONFIDENCE', 'REASON_STRATEGY_ASSESSMENT_REQUIRED');
      const priorities: PriorityAssignment[] = unconfirmed
        .filter((b) => b.capacity_id)
        .map((b) => ({ capacity_id: b.capacity_id as string, role: 'UNCONFIRMED' as const, reason_id: 'REASON_ROLE_UNCONFIRMED' }));
      return {
        domain_bottlenecks: bottlenecks, suggested_relationships: suggestions, candidate_scores: [],
        primary: { capacity_id: null, domain_id: null, classification: null, status: safety.block_definitive_p1 ? 'BLOCKED' : 'UNCONFIRMED' },
        priorities, strategy: 'ASSESSMENT_REQUIRED', applied_rules: applied, reasoning_ids: reasoning,
      };
    }
    // No bottleneck at all — Perform/Sustain territory (pathway engine decides).
    const priorities: PriorityAssignment[] = states
      .filter((s) => s.classification === 'FUNCTIONAL' || s.classification === 'FOUNDATION')
      .map((s) => ({ capacity_id: s.capacity_id, role: 'MAINTAIN' as const, reason_id: 'REASON_ROLE_MAINTAIN' }));
    return {
      domain_bottlenecks: bottlenecks, suggested_relationships: suggestions, candidate_scores: [],
      primary: { capacity_id: null, domain_id: null, classification: null, status: 'NONE' },
      priorities, strategy: 'CONCURRENT', applied_rules: applied, reasoning_ids: reasoning,
    };
  }

  // ── P1 (Rule 18.7 single P1) ──────────────────────────────────────────────
  const p1 = scores[0]!;
  applied.push('RULE_18_7_SINGLE_P1');
  reasoning.push('REASON_MULTI_DOMAIN_SCORE', 'REASON_ROLE_P1');

  // Safety advisory: pain-limited assessments block definitive P1.
  const p1Status: 'CONFIRMED' | 'UNCONFIRMED' = safety.block_definitive_p1 ? 'UNCONFIRMED' : 'CONFIRMED';
  if (safety.block_definitive_p1) {
    applied.push('RULE_18_6_CONFIDENCE');
    reasoning.push('REASON_LOW_CONFIDENCE');
  }

  const priorities: PriorityAssignment[] = [
    { capacity_id: p1.capacity_id, role: p1Status === 'CONFIRMED' ? 'P1' : 'UNCONFIRMED', reason_id: p1Status === 'CONFIRMED' ? 'REASON_ROLE_P1' : 'REASON_ROLE_UNCONFIRMED' },
  ];

  // ── P2/P3: next candidates, DEFER if they depend on P1 ────────────────────
  let p2DependsOnP1 = false;
  const rest = scores.slice(1);
  const roleFor = (idx: number): 'P2' | 'P3' => (idx === 0 ? 'P2' : 'P3');
  rest.slice(0, 2).forEach((cand, idx) => {
    const dep = compiled.dependsOn.get(cand.capacity_id);
    const dependsOnP1 = dep === p1.capacity_id ||
      suggestions.some((s) => s.source_capacity_id === p1.capacity_id && s.target_capacity_id === cand.capacity_id);
    if (dependsOnP1) {
      if (idx === 0) p2DependsOnP1 = true;
      priorities.push({ capacity_id: cand.capacity_id, role: 'DEFER', reason_id: 'REASON_ROLE_DEFER' });
    } else {
      priorities.push({ capacity_id: cand.capacity_id, role: roleFor(idx), reason_id: idx === 0 ? 'REASON_ROLE_P2' : 'REASON_ROLE_P3' });
    }
  });

  // Excluded candidates (manifestations / dependency-blocked) → DEFER.
  for (const id of [...excludedAsManifestation, ...excludedByDependency]) {
    if (!priorities.some((p) => p.capacity_id === id)) {
      priorities.push({ capacity_id: id, role: 'DEFER', reason_id: 'REASON_MANIFESTATION_EXCLUDED' });
      reasoning.push('REASON_CAUSE_BEFORE_MANIFESTATION');
    }
  }

  // Unconfirmed domain bottlenecks → UNCONFIRMED role.
  for (const b of unconfirmed) {
    if (b.capacity_id && !priorities.some((p) => p.capacity_id === b.capacity_id)) {
      priorities.push({ capacity_id: b.capacity_id, role: 'UNCONFIRMED', reason_id: 'REASON_ROLE_UNCONFIRMED' });
    }
  }

  // Downstream manifestations inside P1's domain → DEFER (Node 5).
  for (const s of states) {
    if (s.domain_id === p1.domain_id && s.capacity_id !== p1.capacity_id &&
        isBelowFunctional(s.classification) && !priorities.some((p) => p.capacity_id === s.capacity_id)) {
      priorities.push({ capacity_id: s.capacity_id, role: 'DEFER', reason_id: 'REASON_ROLE_DEFER' });
    }
  }

  // Capacities at least Functional → MAINTAIN (Rule 5.5 / §16).
  for (const s of states) {
    if ((s.classification === 'FUNCTIONAL' || s.classification === 'FOUNDATION') &&
        !priorities.some((p) => p.capacity_id === s.capacity_id)) {
      priorities.push({ capacity_id: s.capacity_id, role: 'MAINTAIN', reason_id: 'REASON_ROLE_MAINTAIN' });
    }
  }

  // ── Node 11: strategy ─────────────────────────────────────────────────────
  let strategy: Strategy;
  const scoreGap = rest.length > 0 ? p1.score - rest[0]!.score : Infinity;
  if (p1Status === 'UNCONFIRMED') {
    strategy = 'ASSESSMENT_REQUIRED';
    reasoning.push('REASON_STRATEGY_ASSESSMENT_REQUIRED');
  } else if (p2DependsOnP1) {
    strategy = 'SEQUENTIAL';
    applied.push('STRATEGY_RULE_6_1_DEPENDENCY');
    reasoning.push('REASON_STRATEGY_SEQUENTIAL');
  } else if (rest.length === 0) {
    strategy = 'SEQUENTIAL';
    reasoning.push('REASON_STRATEGY_SEQUENTIAL');
  } else if (scoreGap > 10) {
    // OS 10.8: score difference > 10 points → Sequential blocks.
    strategy = 'SEQUENTIAL';
    applied.push('OS_10_8_SCORE_GAP_GT_10');
    reasoning.push('REASON_STRATEGY_SEQUENTIAL');
  } else {
    strategy = 'CONCURRENT';
    applied.push('OS_10_8_SCORE_GAP_LT_10');
    reasoning.push('REASON_STRATEGY_CONCURRENT');
  }

  const p1State = stateOf.get(p1.capacity_id)!;
  return {
    domain_bottlenecks: bottlenecks,
    suggested_relationships: suggestions,
    candidate_scores: scores,
    primary: { capacity_id: p1.capacity_id, domain_id: p1.domain_id, classification: p1State.classification, status: p1Status },
    priorities,
    strategy,
    applied_rules: applied,
    reasoning_ids: [...new Set(reasoning)],
  };
}
