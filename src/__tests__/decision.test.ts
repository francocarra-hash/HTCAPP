import { runPipeline } from '../pipeline';
import { compiled, input } from './helpers';
import { MissingCanonicalError } from '../models/canonical';
import { TestResult } from '../models/assessment';

function r(partial: Partial<TestResult> & Pick<TestResult, 'test_id'>): TestResult {
  return { valid: true, confidence: 'HIGH', ...partial } as TestResult;
}

describe('Decision Engine — full Decision Graph model', () => {
  test('Decision Graph worked example: Workspace Ownership CRITICAL → P1 + pathway MOVE', () => {
    const d = runPipeline(compiled(), input({
      test_results: [
        r({ test_id: 'TEST_AROM_PROM_RATIO', value: 76 }),   // CRITICAL (example: 76%)
        r({ test_id: 'TEST_FRONT_PLANK', value: 90 }),       // Stability FUNCTIONAL
        r({ test_id: 'TEST_DEAD_HANG', value: 45 }),         // Force Endurance FUNCTIONAL
      ],
    }));
    expect(d.primary_system_bottleneck.capacity_id).toBe('CAP_WORKSPACE_OWNERSHIP');
    expect(d.primary_system_bottleneck.status).toBe('CONFIRMED');
    expect(d.pathway).toBe('MOVE');
    expect(d.priorities.find((p) => p.role === 'P1')!.capacity_id).toBe('CAP_WORKSPACE_OWNERSHIP');
  });

  test('domain bottleneck = EARLIEST capacity below Functional, not the worst', () => {
    // Stability EMERGING (level 1) + Force Production CRITICAL (level 2):
    // earliest below Functional is Stability even though Force Production is worse.
    const d = runPipeline(compiled(), input({
      test_results: [
        r({ test_id: 'TEST_FRONT_PLANK', value: 45 }),                 // Stability EMERGING
        r({ test_id: 'TEST_FORCE_PRODUCTION_SPECTRUM', value: 2 }),    // Force Production CRITICAL
      ],
    }));
    const strengthBottleneck = d.domain_bottlenecks.find((b) => b.domain_id === 'DOMAIN_STRENGTH')!;
    expect(strengthBottleneck.capacity_id).toBe('CAP_STABILITY');
    // downstream Force Production is a provisional manifestation → DEFER
    expect(d.priorities.find((p) => p.capacity_id === 'CAP_FORCE_PRODUCTION')!.role).toBe('DEFER');
  });

  test('multi-domain scoring OS 10.3: Stability CRITICAL (10×2.0) beats Aerobic EMERGING (5×1.0)', () => {
    const d = runPipeline(compiled(), input({
      test_results: [
        r({ test_id: 'TEST_FRONT_PLANK', value: 25 }),     // Stability CRITICAL → 20 pts
        r({ test_id: 'TEST_ROCKPORT_WALK', value: 40 }),   // Aerobic Base EMERGING → 5 pts
      ],
    }));
    expect(d.primary_system_bottleneck.capacity_id).toBe('CAP_STABILITY');
    expect(d.pathway).toBe('BUILD');
    const scores = d.audit_trail.candidate_scores;
    expect(scores.find((s) => s.capacity_id === 'CAP_STABILITY')!.score).toBe(20);
    expect(scores.find((s) => s.capacity_id === 'CAP_AEROBIC_BASE')!.score).toBe(5);
  });

  test('score gap > 10 → SEQUENTIAL strategy (OS 10.8)', () => {
    const d = runPipeline(compiled(), input({
      test_results: [
        r({ test_id: 'TEST_FRONT_PLANK', value: 25 }),     // 20 pts
        r({ test_id: 'TEST_ROCKPORT_WALK', value: 40 }),   // 5 pts → gap 15
      ],
    }));
    expect(d.strategy).toBe('SEQUENTIAL');
    expect(d.audit_trail.applied_rules).toContain('OS_10_8_SCORE_GAP_GT_10');
  });

  test('score gap < 10 → CONCURRENT strategy (OS 10.8)', () => {
    const d = runPipeline(compiled(), input({
      test_results: [
        r({ test_id: 'TEST_AROM_PROM_RATIO', value: 85 }),  // Workspace Ownership EMERGING → 5×1.8 = 9
        r({ test_id: 'TEST_ROCKPORT_WALK', value: 40 }),    // Aerobic Base EMERGING → 5×1.0 = 5 → gap 4
      ],
    }));
    expect(d.strategy).toBe('CONCURRENT');
    expect(d.priorities.find((p) => p.role === 'P2')!.capacity_id).toBe('CAP_AEROBIC_BASE');
  });

  test('cross-domain manifestation exclusion: Aerobic Base cause → Force Endurance cannot be P1 (Rule 11.2)', () => {
    // MASTER TABLES T5: Aerobic Base may influence Force Endurance.
    // Both below Functional → Force Endurance excluded as manifestation even
    // though its score (10×1.5=15) beats Aerobic Base (10×1.0=10).
    const d = runPipeline(compiled(), input({
      test_results: [
        r({ test_id: 'TEST_ROCKPORT_WALK', value: 30 }),  // Aerobic Base CRITICAL
        r({ test_id: 'TEST_DEAD_HANG', value: 15 }),      // Force Endurance CRITICAL (male)
      ],
    }));
    expect(d.primary_system_bottleneck.capacity_id).toBe('CAP_AEROBIC_BASE');
    expect(d.priorities.find((p) => p.capacity_id === 'CAP_FORCE_ENDURANCE')!.role).toBe('DEFER');
    expect(d.suggested_relationships.some(
      (s) => s.source_capacity_id === 'CAP_AEROBIC_BASE' && s.target_capacity_id === 'CAP_FORCE_ENDURANCE',
    )).toBe(true);
  });

  test('LOW confidence bottleneck → UNCONFIRMED, no definitive P1, ASSESSMENT_REQUIRED (Rule 18.6)', () => {
    const d = runPipeline(compiled(), input({
      test_results: [r({ test_id: 'TEST_AROM_PROM_RATIO', value: 76, confidence: 'LOW' })],
    }));
    expect(d.primary_system_bottleneck.capacity_id).toBeNull();
    expect(d.strategy).toBe('ASSESSMENT_REQUIRED');
    expect(d.pathway).toBeNull();
    expect(d.priorities.find((p) => p.capacity_id === 'CAP_WORKSPACE_OWNERSHIP')!.role).toBe('UNCONFIRMED');
  });

  test('health override: General Health CRITICAL → P1 = General Health, RESTORE, others MAINTAIN/DEFER', () => {
    const d = runPipeline(compiled(), input({
      clinical: { events: [], general_health_classification: 'CRITICAL', training_tolerance_compromised: true },
      test_results: [
        r({ test_id: 'TEST_FRONT_PLANK', value: 25 }),   // CRITICAL — would win scoring, but health overrides
        r({ test_id: 'TEST_DEAD_HANG', value: 65 }),     // FOUNDATION
      ],
    }));
    expect(d.primary_system_bottleneck.capacity_id).toBe('CAP_GENERAL_HEALTH_STATUS');
    expect(d.pathway).toBe('RESTORE');
    expect(d.strategy).toBe('RESTORE_FIRST');
    expect(d.priorities.find((p) => p.capacity_id === 'CAP_STABILITY')!.role).toBe('DEFER');
    expect(d.priorities.find((p) => p.capacity_id === 'CAP_FORCE_ENDURANCE')!.role).toBe('MAINTAIN');
  });

  test('red flag stops everything: BLOCKED primary, no classification performed', () => {
    const d = runPipeline(compiled(), input({
      clinical: { events: [{ type: 'RED_FLAG', description: 'chest pain on exertion' }] },
      test_results: [r({ test_id: 'TEST_FRONT_PLANK', value: 25 })],
    }));
    expect(d.primary_system_bottleneck.status).toBe('BLOCKED');
    expect(d.capacity_states).toHaveLength(0);
    expect(d.pathway).toBeNull();
    expect(d.reasoning_ids).toContain('REASON_MEDICAL_REFERRAL');
  });

  test('all Functional+ with PERFORMANCE goal → PERFORM pathway, MAINTAIN roles', () => {
    const d = runPipeline(compiled(), input({
      client: { name: 'X', age: 32, sex: 'MALE', primary_goal: 'PERFORMANCE' },
      test_results: [
        r({ test_id: 'TEST_FRONT_PLANK', value: 130 }),
        r({ test_id: 'TEST_DEAD_HANG', value: 65 }),
        r({ test_id: 'TEST_ROCKPORT_WALK', value: 56 }),
      ],
    }));
    expect(d.primary_system_bottleneck.status).toBe('NONE');
    expect(d.pathway).toBe('PERFORM');
    expect(d.priorities.every((p) => p.role === 'MAINTAIN')).toBe(true);
  });

  test('all Functional+ with LONG_TERM_MAINTENANCE goal → SUSTAIN pathway', () => {
    const d = runPipeline(compiled(), input({
      client: { name: 'X', age: 32, sex: 'MALE', primary_goal: 'LONG_TERM_MAINTENANCE' },
      test_results: [r({ test_id: 'TEST_FRONT_PLANK', value: 130 })],
    }));
    expect(d.pathway).toBe('SUSTAIN');
  });

  test('no bottleneck and no covering goal → FAILS LOUDLY (no pathway rule invented)', () => {
    expect(() => runPipeline(compiled(), input({
      test_results: [r({ test_id: 'TEST_FRONT_PLANK', value: 130 })],
    }))).toThrow(MissingCanonicalError);
  });

  test('single P1 invariant: never more than one P1 role', () => {
    const d = runPipeline(compiled(), input({
      test_results: [
        r({ test_id: 'TEST_FRONT_PLANK', value: 25 }),
        r({ test_id: 'TEST_ROCKPORT_WALK', value: 30 }),
        r({ test_id: 'TEST_AROM_PROM_RATIO', value: 76 }),
      ],
    }));
    expect(d.priorities.filter((p) => p.role === 'P1')).toHaveLength(1);
  });

  test('pain-limited assessment degrades system confidence and blocks definitive P1', () => {
    const d = runPipeline(compiled(), input({
      clinical: { events: [{ type: 'PAIN', description: 'hip pain', intensity: 6, significantly_limits: true }] },
      test_results: [r({ test_id: 'TEST_AROM_PROM_RATIO', value: 76 })],
    }));
    expect(d.primary_system_bottleneck.status).toBe('UNCONFIRMED');
    expect(d.strategy).toBe('ASSESSMENT_REQUIRED');
    expect(d.system_confidence).toBeLessThan(100);
  });

  test('reassessment window comes from canonical (Workspace Ownership → 6 weeks, ≥90% AROM/PROM)', () => {
    const d = runPipeline(compiled(), input({
      test_results: [r({ test_id: 'TEST_AROM_PROM_RATIO', value: 76 })],
    }));
    expect(d.reassessment.weeks).toBe(6);
    expect(d.reassessment.exit_criteria).toBe('AROM/PROM >= 90%');
  });

  test('audit trail records canonical version, standards, rules and scores', () => {
    const d = runPipeline(compiled(), input({
      test_results: [r({ test_id: 'TEST_AROM_PROM_RATIO', value: 76 })],
    }));
    expect(d.audit_trail.canonical_version).toBe('3.1.0');
    expect(d.audit_trail.standards_used[0]!.standard_id).toBe('STANDARD_AROM_PROM_HIP_IR');
    expect(d.audit_trail.standards_used[0]!.evidence_refs).toContain('REF_HTC_OPERATIONAL');
    expect(d.audit_trail.applied_rules).toContain('RULE_18_7_SINGLE_P1');
    expect(d.audit_trail.candidate_scores.length).toBeGreaterThan(0);
  });
});
