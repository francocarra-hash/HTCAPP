import { runClassification } from '../engines/classification';
import { MissingCanonicalError } from '../models/canonical';
import { compiled } from './helpers';
import { TestResult } from '../models/assessment';

const male32 = { age: 32, sex: 'MALE' as const };
const female32 = { age: 32, sex: 'FEMALE' as const };

function r(partial: Partial<TestResult> & Pick<TestResult, 'test_id'>): TestResult {
  return { valid: true, confidence: 'HIGH', ...partial } as TestResult;
}

describe('Classification Engine — standards from canonical only', () => {
  test('handgrip 45kg male 30-34 → FUNCTIONAL (iGRIPS band 43.6-55.9)', () => {
    const out = runClassification(compiled(), male32, [r({ test_id: 'TEST_HANDGRIP', value: 45 })]);
    expect(out.states[0]!.classification).toBe('FUNCTIONAL');
    expect(out.standardsUsed[0]!.standard_id).toBe('STANDARD_GRIP_IGRIPS_MALE_30_34');
  });

  test('handgrip 34kg male 30-34 → CRITICAL (<35 = <P5)', () => {
    const out = runClassification(compiled(), male32, [r({ test_id: 'TEST_HANDGRIP', value: 34 })]);
    expect(out.states[0]!.classification).toBe('CRITICAL');
  });

  test('handgrip 56kg male 30-34 → FOUNDATION (≥55.9)', () => {
    const out = runClassification(compiled(), male32, [r({ test_id: 'TEST_HANDGRIP', value: 56 })]);
    expect(out.states[0]!.classification).toBe('FOUNDATION');
  });

  test('handgrip female uses the female iGRIPS band (22kg → EMERGING)', () => {
    const out = runClassification(compiled(), female32, [r({ test_id: 'TEST_HANDGRIP', value: 22 })]);
    expect(out.states[0]!.classification).toBe('EMERGING');
    expect(out.standardsUsed[0]!.standard_id).toBe('STANDARD_GRIP_IGRIPS_FEMALE_30_34');
  });

  test('handgrip outside the published 30-34 band FAILS LOUDLY (age 28)', () => {
    expect(() =>
      runClassification(compiled(), { age: 28, sex: 'MALE' }, [r({ test_id: 'TEST_HANDGRIP', value: 45 })]),
    ).toThrow(MissingCanonicalError);
  });

  test('PLACEHOLDER standard (chair stand 60-64) FAILS LOUDLY', () => {
    expect(() =>
      runClassification(compiled(), { age: 62, sex: 'MALE' }, [r({ test_id: 'TEST_CHAIR_STAND_30S', value: 15 })]),
    ).toThrow(/PLACEHOLDER/);
  });

  test('front plank bands: 25s CRITICAL / 45s EMERGING / 90s FUNCTIONAL / 130s FOUNDATION', () => {
    const c = compiled();
    const cls = (v: number) =>
      runClassification(c, male32, [r({ test_id: 'TEST_FRONT_PLANK', value: v })]).states[0]!.classification;
    expect(cls(25)).toBe('CRITICAL');
    expect(cls(45)).toBe('EMERGING');
    expect(cls(90)).toBe('FUNCTIONAL');
    expect(cls(130)).toBe('FOUNDATION');
  });

  test('dead hang is sex-specific: 35s → EMERGING (male) but FUNCTIONAL (female)', () => {
    const c = compiled();
    const m = runClassification(c, male32, [r({ test_id: 'TEST_DEAD_HANG', value: 35 })]);
    const f = runClassification(c, female32, [r({ test_id: 'TEST_DEAD_HANG', value: 35 })]);
    expect(m.states[0]!.classification).toBe('EMERGING');
    expect(f.states[0]!.classification).toBe('FUNCTIONAL');
  });

  test('force production universal reps: 3 → CRITICAL, 5 → EMERGING, 7 → FUNCTIONAL, 8 → FOUNDATION', () => {
    const c = compiled();
    const cls = (v: number) =>
      runClassification(c, male32, [r({ test_id: 'TEST_FORCE_PRODUCTION_SPECTRUM', value: v })]).states[0]!.classification;
    expect(cls(3)).toBe('CRITICAL');
    expect(cls(5)).toBe('EMERGING');
    expect(cls(7)).toBe('FUNCTIONAL');
    expect(cls(8)).toBe('FOUNDATION');
  });

  test('AROM/PROM 76% → CRITICAL (Decision Graph worked example)', () => {
    const out = runClassification(compiled(), male32, [r({ test_id: 'TEST_AROM_PROM_RATIO', value: 76 })]);
    expect(out.states[0]!.classification).toBe('CRITICAL');
    expect(out.states[0]!.capacity_id).toBe('CAP_WORKSPACE_OWNERSHIP');
  });

  test('Rockport VO2 uses DRAFT standard with warning (40 → EMERGING)', () => {
    const out = runClassification(compiled(), male32, [r({ test_id: 'TEST_ROCKPORT_WALK', value: 40 })]);
    expect(out.states[0]!.classification).toBe('EMERGING');
    expect(out.warnings.some((w) => w.includes('STANDARD_ROCKPORT_VO2'))).toBe(true);
  });

  test('mobility regional screen: all CLEAR → FOUNDATION', () => {
    const out = runClassification(compiled(), male32, [r({
      test_id: 'TEST_MOBILITY_REGIONAL_SCREEN',
      region_interpretations: { SPINE: 'CLEAR', HIP: 'CLEAR', SHOULDER: 'CLEAR', ANKLE: 'CLEAR' },
    })]);
    expect(out.states[0]!.classification).toBe('FOUNDATION');
  });

  test('mobility regional screen: PAINFUL region → EMERGING + red flag (Rule 1)', () => {
    const out = runClassification(compiled(), male32, [r({
      test_id: 'TEST_MOBILITY_REGIONAL_SCREEN',
      region_interpretations: { SPINE: 'CLEAR', HIP: 'PAINFUL', SHOULDER: 'CLEAR', ANKLE: 'CLEAR' },
    })]);
    expect(out.states[0]!.classification).toBe('EMERGING');
    expect(out.states[0]!.contributing_results[0]!.flags).toContain('RED_FLAG_PAINFUL_REGION');
  });

  test('mobility regional screen: CRITICAL_BLOCKING region → CRITICAL (Rule 2)', () => {
    const out = runClassification(compiled(), male32, [r({
      test_id: 'TEST_MOBILITY_REGIONAL_SCREEN',
      region_interpretations: { SPINE: 'CLEAR', HIP: 'CRITICAL_BLOCKING', SHOULDER: 'CLEAR', ANKLE: 'CLEAR' },
    })]);
    expect(out.states[0]!.classification).toBe('CRITICAL');
  });

  test('mobility regional screen: 2 LIMITED regions → EMERGING (Rule 3)', () => {
    const out = runClassification(compiled(), male32, [r({
      test_id: 'TEST_MOBILITY_REGIONAL_SCREEN',
      region_interpretations: { SPINE: 'LIMITED', HIP: 'LIMITED', SHOULDER: 'CLEAR', ANKLE: 'CLEAR' },
    })]);
    expect(out.states[0]!.classification).toBe('EMERGING');
  });

  test('multiple stability tests aggregate to the WORST classification', () => {
    const out = runClassification(compiled(), male32, [
      r({ test_id: 'TEST_FRONT_PLANK', value: 90 }),      // FUNCTIONAL
      r({ test_id: 'TEST_SIDE_PLANK', value: 25 }),       // CRITICAL
      r({ test_id: 'TEST_BIERING_SORENSEN', value: 70 }), // FUNCTIONAL
    ]);
    const stability = out.states.find((s) => s.capacity_id === 'CAP_STABILITY')!;
    expect(stability.classification).toBe('CRITICAL');
    expect(stability.contributing_results).toHaveLength(3);
  });

  test('invalid result → INVALID_RESULT, no standard consulted', () => {
    const out = runClassification(compiled(), male32, [r({ test_id: 'TEST_FRONT_PLANK', value: 90, valid: false })]);
    expect(out.states[0]!.classification).toBe('INVALID_RESULT');
    expect(out.standardsUsed).toHaveLength(0);
  });

  test('unknown test id FAILS LOUDLY (never inferred)', () => {
    expect(() => runClassification(compiled(), male32, [r({ test_id: 'TEST_FLEXIBILITY_CM', value: 18 })]))
      .toThrow(MissingCanonicalError);
  });

  test('inactive test without capacity link FAILS LOUDLY (single leg balance)', () => {
    expect(() => runClassification(compiled(), male32, [r({ test_id: 'TEST_SINGLE_LEG_BALANCE', value: 40 })]))
      .toThrow(MissingCanonicalError);
  });

  test('lowest test confidence taints the capacity confidence', () => {
    const out = runClassification(compiled(), male32, [
      r({ test_id: 'TEST_FRONT_PLANK', value: 90, confidence: 'HIGH' }),
      r({ test_id: 'TEST_SIDE_PLANK', value: 80, confidence: 'LOW' }),
    ]);
    expect(out.states.find((s) => s.capacity_id === 'CAP_STABILITY')!.confidence).toBe('LOW');
  });
});
