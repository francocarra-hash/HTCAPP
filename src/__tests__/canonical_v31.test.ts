/**
 * Canonical v3.1.0 — standards mined from HTC_SCORING_RUBRIC,
 * Aerobic System REFINED v1.1, MASTER_ASSESSMENT_FORM and Movement Standard FINAL.
 */
import { runClassification } from '../engines/classification';
import { runPipeline } from '../pipeline';
import { MissingCanonicalError } from '../models/canonical';
import { compiled, input } from './helpers';
import { TestResult } from '../models/assessment';

const male32 = { age: 32, sex: 'MALE' as const };

function r(partial: Partial<TestResult> & Pick<TestResult, 'test_id'>): TestResult {
  return { valid: true, confidence: 'HIGH', ...partial } as TestResult;
}

const cls = (test_id: string, value: number) =>
  runClassification(compiled(), male32, [r({ test_id, value })]).states[0]!.classification;

describe('v3.1.0 — Aerobic standards (Scoring Rubric + Aerobic System v1.1)', () => {
  test('RHR is LOWER_IS_BETTER: 55 → FOUNDATION, 65 → FUNCTIONAL, 80 → EMERGING, 95 → CRITICAL', () => {
    expect(cls('TEST_RHR', 55)).toBe('FOUNDATION');
    expect(cls('TEST_RHR', 65)).toBe('FUNCTIONAL');
    expect(cls('TEST_RHR', 80)).toBe('EMERGING');
    expect(cls('TEST_RHR', 95)).toBe('CRITICAL');
  });

  test('HR Recovery 1-min: 25 → FOUNDATION, 18 → FUNCTIONAL, 12 → EMERGING, 8 → CRITICAL', () => {
    expect(cls('TEST_HR_RECOVERY', 25)).toBe('FOUNDATION');
    expect(cls('TEST_HR_RECOVERY', 18)).toBe('FUNCTIONAL');
    expect(cls('TEST_HR_RECOVERY', 12)).toBe('EMERGING');
    expect(cls('TEST_HR_RECOVERY', 8)).toBe('CRITICAL');
  });

  test('HR Drift (DRAFT): 1% → FOUNDATION, 4% → FUNCTIONAL, 8% → EMERGING, 12% → CRITICAL', () => {
    const out = runClassification(compiled(), male32, [r({ test_id: 'TEST_HR_DRIFT', value: 4 })]);
    expect(out.states[0]!.classification).toBe('FUNCTIONAL');
    expect(out.warnings.some((w) => w.includes('STANDARD_HR_DRIFT'))).toBe(true);
    expect(cls('TEST_HR_DRIFT', 1)).toBe('FOUNDATION');
    expect(cls('TEST_HR_DRIFT', 8)).toBe('EMERGING');
    expect(cls('TEST_HR_DRIFT', 12)).toBe('CRITICAL');
  });

  test('Pace variability: 1.5 → FOUNDATION, 4 → FUNCTIONAL, 7 → EMERGING, 9 → CRITICAL', () => {
    expect(cls('TEST_PACE_VARIABILITY', 1.5)).toBe('FOUNDATION');
    expect(cls('TEST_PACE_VARIABILITY', 4)).toBe('FUNCTIONAL');
    expect(cls('TEST_PACE_VARIABILITY', 7)).toBe('EMERGING');
    expect(cls('TEST_PACE_VARIABILITY', 9)).toBe('CRITICAL');
  });

  test('Talk Test is ORDINAL_MAP: 1 → CRITICAL … 4 → FOUNDATION', () => {
    expect(cls('TEST_TALK_TEST', 1)).toBe('CRITICAL');
    expect(cls('TEST_TALK_TEST', 2)).toBe('EMERGING');
    expect(cls('TEST_TALK_TEST', 3)).toBe('FUNCTIONAL');
    expect(cls('TEST_TALK_TEST', 4)).toBe('FOUNDATION');
  });

  test('Talk Test rejects undefined ordinal levels (fail loudly)', () => {
    expect(() => cls('TEST_TALK_TEST', 5)).toThrow(MissingCanonicalError);
  });
});

describe('v3.1.0 — Mobility standards', () => {
  test('ROM % of norm: 96 → FOUNDATION, 90 → FUNCTIONAL, 75 → EMERGING, 60 → CRITICAL', () => {
    expect(cls('TEST_ROM_PERCENT_NORM', 96)).toBe('FOUNDATION');
    expect(cls('TEST_ROM_PERCENT_NORM', 90)).toBe('FUNCTIONAL');
    expect(cls('TEST_ROM_PERCENT_NORM', 75)).toBe('EMERGING');
    expect(cls('TEST_ROM_PERCENT_NORM', 60)).toBe('CRITICAL');
  });

  test('CARs score 0-10: 9 → FOUNDATION, 7 → FUNCTIONAL, 5 → EMERGING, 4 → CRITICAL', () => {
    expect(cls('TEST_CARS_SCORE', 9)).toBe('FOUNDATION');
    expect(cls('TEST_CARS_SCORE', 7)).toBe('FUNCTIONAL');
    expect(cls('TEST_CARS_SCORE', 5)).toBe('EMERGING');
    expect(cls('TEST_CARS_SCORE', 4)).toBe('CRITICAL');
  });

  test('CARs and ROM% both feed Joint Workspace, worst wins', () => {
    const out = runClassification(compiled(), male32, [
      r({ test_id: 'TEST_ROM_PERCENT_NORM', value: 96 }),  // FOUNDATION
      r({ test_id: 'TEST_CARS_SCORE', value: 4 }),         // CRITICAL
    ]);
    const jw = out.states.find((s) => s.capacity_id === 'CAP_JOINT_WORKSPACE')!;
    expect(jw.classification).toBe('CRITICAL');
  });

  test('Mobility Integration ordinal: 4 → FOUNDATION, 2 → EMERGING', () => {
    expect(cls('TEST_MOBILITY_INTEGRATION_FUNCTIONAL', 4)).toBe('FOUNDATION');
    expect(cls('TEST_MOBILITY_INTEGRATION_FUNCTIONAL', 2)).toBe('EMERGING');
  });

  test('AROM/PROM now applies to any joint (v1.1, restriction removed)', () => {
    // Same bands as before — the standard is no longer hip-IR-only.
    expect(cls('TEST_AROM_PROM_RATIO', 92)).toBe('FUNCTIONAL');
  });
});

describe('v3.1.0 — Strength standards (Force Endurance + Expression)', () => {
  test('Push-ups: 20 → FOUNDATION, 15 → FUNCTIONAL, 8 → EMERGING, 7 → CRITICAL', () => {
    expect(cls('TEST_PUSHUPS_ENDURANCE', 20)).toBe('FOUNDATION');
    expect(cls('TEST_PUSHUPS_ENDURANCE', 15)).toBe('FUNCTIONAL');
    expect(cls('TEST_PUSHUPS_ENDURANCE', 8)).toBe('EMERGING');
    expect(cls('TEST_PUSHUPS_ENDURANCE', 7)).toBe('CRITICAL');
  });

  test('Squats: 30 → FOUNDATION, 25 → FUNCTIONAL, 15 → EMERGING, 9 → CRITICAL', () => {
    expect(cls('TEST_SQUATS_ENDURANCE', 30)).toBe('FOUNDATION');
    expect(cls('TEST_SQUATS_ENDURANCE', 25)).toBe('FUNCTIONAL');
    expect(cls('TEST_SQUATS_ENDURANCE', 15)).toBe('EMERGING');
    expect(cls('TEST_SQUATS_ENDURANCE', 9)).toBe('CRITICAL');
  });

  test('CMJ: 50 → FOUNDATION, 40 → FUNCTIONAL, 25 → EMERGING, 15 → CRITICAL', () => {
    expect(cls('TEST_CMJ', 50)).toBe('FOUNDATION');
    expect(cls('TEST_CMJ', 40)).toBe('FUNCTIONAL');
    expect(cls('TEST_CMJ', 25)).toBe('EMERGING');
    expect(cls('TEST_CMJ', 15)).toBe('CRITICAL');
  });

  test('Broad Jump: 210 → FOUNDATION, 170 → FUNCTIONAL, 130 → EMERGING, 100 → CRITICAL', () => {
    expect(cls('TEST_BROAD_JUMP', 210)).toBe('FOUNDATION');
    expect(cls('TEST_BROAD_JUMP', 170)).toBe('FUNCTIONAL');
    expect(cls('TEST_BROAD_JUMP', 130)).toBe('EMERGING');
    expect(cls('TEST_BROAD_JUMP', 100)).toBe('CRITICAL');
  });

  test('Force Expression is now classifiable end-to-end (CMJ feeds CAP_FORCE_EXPRESSION)', () => {
    const out = runClassification(compiled(), male32, [r({ test_id: 'TEST_CMJ', value: 40 })]);
    expect(out.states[0]!.capacity_id).toBe('CAP_FORCE_EXPRESSION');
  });
});

describe('v3.1.0 — Movement levels (COACH_CLASSIFIED)', () => {
  test('coach classification passes through with audit flag', () => {
    const out = runClassification(compiled(), male32, [
      r({ test_id: 'TEST_MOVEMENT_L1_BODY_MAPPING', coach_classification: 'FUNCTIONAL' }),
    ]);
    expect(out.states[0]!.classification).toBe('FUNCTIONAL');
    expect(out.states[0]!.capacity_id).toBe('CAP_INTERNAL_BODY_MAPPING');
    expect(out.states[0]!.contributing_results[0]!.flags).toContain('COACH_CLASSIFIED');
  });

  test('COACH_CLASSIFIED without coach_classification fails loudly with the criteria in the message', () => {
    expect(() =>
      runClassification(compiled(), male32, [r({ test_id: 'TEST_MOVEMENT_L2_DYNAMIC_CONTROL', value: 3 })]),
    ).toThrow(/coach_classification is required/);
  });

  test('Movement e2e: L1 Functional + L2 Emerging → Movement bottleneck = Dynamic Control (earliest below Functional)', () => {
    const d = runPipeline(compiled(), input({
      test_results: [
        r({ test_id: 'TEST_MOVEMENT_L1_BODY_MAPPING', coach_classification: 'FUNCTIONAL' }),
        r({ test_id: 'TEST_MOVEMENT_L2_DYNAMIC_CONTROL', coach_classification: 'EMERGING' }),
        r({ test_id: 'TEST_MOVEMENT_L3_COORDINATION', coach_classification: 'EMERGING' }),
      ],
    }));
    const mv = d.domain_bottlenecks.find((b) => b.domain_id === 'DOMAIN_MOVEMENT')!;
    expect(mv.capacity_id).toBe('CAP_DYNAMIC_CONTROL');
    expect(d.primary_system_bottleneck.capacity_id).toBe('CAP_DYNAMIC_CONTROL');
    // Movement P1 → BUILD (DRAFT rule, Decision Graph Node 20 'P1 within Build')
    expect(d.pathway).toBe('BUILD');
    // downstream L3 = provisional manifestation
    expect(d.priorities.find((p) => p.capacity_id === 'CAP_MOVEMENT_COORDINATION')!.role).toBe('DEFER');
  });

  test('Movement impact factor 2.5 beats Aerobic in multi-domain scoring (OS 10.2)', () => {
    const d = runPipeline(compiled(), input({
      test_results: [
        r({ test_id: 'TEST_MOVEMENT_L1_BODY_MAPPING', coach_classification: 'EMERGING' }),  // 5 × 2.5 = 12.5
        r({ test_id: 'TEST_ROCKPORT_WALK', value: 40 }),                                     // 5 × 1.0 = 5
      ],
    }));
    expect(d.primary_system_bottleneck.capacity_id).toBe('CAP_INTERNAL_BODY_MAPPING');
    const score = d.audit_trail.candidate_scores.find((s) => s.capacity_id === 'CAP_INTERNAL_BODY_MAPPING')!;
    expect(score.score).toBe(12.5);
  });
});

describe('v3.1.0 — API catalogue input descriptors', () => {
  test('catalogue marks talk test as ordinal_map with es/en options and movement as coach_classified', () => {
    const c = compiled();
    const std = c.standardsByTest.get('TEST_TALK_TEST')![0]!;
    expect(std.classification_model.type).toBe('ORDINAL_MAP');
    expect(Object.keys(std.classification_model.map ?? {})).toEqual(['1', '2', '3', '4']);
    const mv = c.standardsByTest.get('TEST_MOVEMENT_L4_PROBLEM_SOLVING')![0]!;
    expect(mv.classification_model.type).toBe('COACH_CLASSIFIED');
  });
});
