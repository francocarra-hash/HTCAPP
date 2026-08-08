import { runSafety } from '../engines/safety';
import { compiled, input } from './helpers';

describe('Safety Engine — clinical information only, never classifications', () => {
  test('no clinical events → PROCEED', () => {
    const s = runSafety(compiled(), input({ test_results: [] }));
    expect(s.outcome).toBe('PROCEED');
    expect(s.assessment_allowed).toBe(true);
    expect(s.applied_rule_ids).toEqual(['SAFETY_PROCEED']);
  });

  test('RED_FLAG → MEDICAL_REFERRAL_REQUIRED, decision process stops', () => {
    const s = runSafety(compiled(), input({
      test_results: [],
      clinical: { events: [{ type: 'RED_FLAG', description: 'unexplained weight loss' }] },
    }));
    expect(s.outcome).toBe('MEDICAL_REFERRAL_REQUIRED');
    expect(s.assessment_allowed).toBe(false);
    expect(s.stop_decision_process).toBe(true);
    expect(s.reason_ids).toContain('REASON_MEDICAL_REFERRAL');
  });

  test('Health Markers gate CRITICAL → STOP with medical referral', () => {
    const s = runSafety(compiled(), input({
      test_results: [],
      clinical: { events: [], health_markers_state: 'CRITICAL' },
    }));
    expect(s.outcome).toBe('STOP_MEDICAL_REFERRAL');
    expect(s.stop_decision_process).toBe(true);
  });

  test('General Health CRITICAL + tolerance compromised → HEALTH_OVERRIDE (Rule 18.1)', () => {
    const s = runSafety(compiled(), input({
      test_results: [],
      clinical: { events: [], general_health_classification: 'CRITICAL', training_tolerance_compromised: true },
    }));
    expect(s.outcome).toBe('HEALTH_OVERRIDE');
    expect(s.force_p1).toBe('CAP_GENERAL_HEALTH_STATUS');
    expect(s.force_pathway).toBe('RESTORE');
    expect(s.stop_decision_process).toBe(false);
  });

  test('General Health CRITICAL without compromised tolerance does NOT force override', () => {
    const s = runSafety(compiled(), input({
      test_results: [],
      clinical: { events: [], general_health_classification: 'CRITICAL', training_tolerance_compromised: false },
    }));
    expect(s.force_p1).toBeUndefined();
  });

  test('Health Markers EMERGING_MULTIPLE → PROCEED_WITH_CAUTION (gate)', () => {
    const s = runSafety(compiled(), input({
      test_results: [],
      clinical: { events: [], health_markers_state: 'EMERGING_MULTIPLE' },
    }));
    expect(s.outcome).toBe('PROCEED_WITH_CAUTION');
    expect(s.assessment_allowed).toBe(true);
  });

  test('significant PAIN → PAIN_LIMITED: reduce confidence + block definitive P1 (Rule 2.2)', () => {
    const s = runSafety(compiled(), input({
      test_results: [],
      clinical: { events: [{ type: 'PAIN', description: 'shoulder pain', intensity: 7, significantly_limits: true }] },
    }));
    expect(s.outcome).toBe('PAIN_LIMITED');
    expect(s.reduce_confidence).toBe(true);
    expect(s.block_definitive_p1).toBe(true);
  });

  test('PAIN not marked significantly_limits does NOT trigger PAIN_LIMITED (never inferred from intensity)', () => {
    const s = runSafety(compiled(), input({
      test_results: [],
      clinical: { events: [{ type: 'PAIN', description: 'mild soreness', intensity: 2 }] },
    }));
    expect(s.outcome).toBe('PROCEED');
  });

  test('RED_FLAG takes precedence over everything else (priority order)', () => {
    const s = runSafety(compiled(), input({
      test_results: [],
      clinical: {
        events: [
          { type: 'PAIN', description: 'pain', significantly_limits: true },
          { type: 'RED_FLAG', description: 'cardiac symptoms' },
        ],
        general_health_classification: 'CRITICAL',
        training_tolerance_compromised: true,
      },
    }));
    expect(s.outcome).toBe('MEDICAL_REFERRAL_REQUIRED');
    expect(s.stop_decision_process).toBe(true);
  });

  test('safety result carries applied rule ids for the audit trail', () => {
    const s = runSafety(compiled(), input({
      test_results: [],
      clinical: { events: [{ type: 'PAIN', description: 'x', significantly_limits: true }] },
    }));
    expect(s.applied_rule_ids).toContain('SAFETY_PAIN_LIMITED');
  });
});
