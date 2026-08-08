/**
 * Confirmaciones clínicas de Magnetia (2026-08-02) + Handgrip 50+.
 * Fuentes: HTC_CLINICAL_CONFIRMATIONS_v1.0_FINAL,
 *          HTC_PLATFORM_CLINICAL_SPECIFICATION_v1.1_CORRECTED,
 *          HANDGRIP_THRESHOLDS_AGE_50PLUS_v1.0,
 *          HTC_THRESHOLDS_CANONICAL_v1.1_UPDATED.
 */
import * as path from 'path';
import { loadCanonicalV3, compileCanonicalV3, CompiledV3 } from '../v3/canonical';
import { scoreTest } from '../v3/classification';
import { runHealthGates } from '../v3/health-gates';
import { runAssessmentV3 } from '../v3/pipeline';

const DIR = path.join(__dirname, '..', '..', 'canonical-v3');
let c: CompiledV3;
beforeAll(() => { c = compileCanonicalV3(loadCanonicalV3(DIR)); });

const client = (age: number, sex: 'MALE' | 'FEMALE') => ({ name: 'Test', age, sex });

describe('Versiones v1.1 congeladas', () => {
  test('thresholds y clinical spec pasan a 1.1', () => {
    expect(c.raw.versions.thresholds_version).toBe('1.1');
    expect(c.raw.versions.clinical_specification_version).toBe('1.1');
  });

  test('cada assessment congela las versiones vigentes', () => {
    const r = runAssessmentV3(c, {
      client: client(35, 'MALE'), health_gates: { red_flags: [] },
      test_results: [{ test_key: 'RHR', value: 58 }], movement_levels: [],
    });
    expect(r.version_snapshot.thresholds_version).toBe('1.1');
  });
});

describe('C4 — Handgrip 50+ (4 poblaciones nuevas)', () => {
  test('las 4 bandas de Magnetia están cargadas (v1.2 sumó 18-20)', () => {
    const grip = c.raw.tests.find((t) => t.key === 'HANDGRIP')!;
    expect(grip.populations).toHaveLength(10); // 8 aprobadas + 2 propuestas 18-20
    expect(grip.populations.map((p) => p.id)).toEqual(expect.arrayContaining([
      'MALE_50_60', 'MALE_60_PLUS', 'FEMALE_50_60', 'FEMALE_60_PLUS',
    ]));
  });

  test('ejemplo del documento: mujer 55, 26 kg → 1.8 → FUNCTIONAL', () => {
    const r = scoreTest(c, 'HANDGRIP', 26, client(55, 'FEMALE'));
    expect(r.population_id).toBe('FEMALE_50_60');
    expect(r.score_0_3).toBeCloseTo(1.8, 2);
    expect(r.classification).toBe('FUNCTIONAL');
  });

  test('ejemplo del documento: hombre 65, 25 kg → 0 → CRITICAL', () => {
    const r = scoreTest(c, 'HANDGRIP', 25, client(65, 'MALE'));
    expect(r.population_id).toBe('MALE_60_PLUS');
    expect(r.score_0_3).toBe(0);
    expect(r.classification).toBe('CRITICAL');
  });

  test('ejemplo del documento: mujer 55, 28 kg → 2.2 → FUNCTIONAL', () => {
    const r = scoreTest(c, 'HANDGRIP', 28, client(55, 'FEMALE'));
    expect(r.score_0_3).toBeCloseTo(2.2, 2);
    expect(r.classification).toBe('FUNCTIONAL');
  });

  test('hombre 55 usa la banda 50-60, no la de 30-50', () => {
    const r = scoreTest(c, 'HANDGRIP', 45, client(55, 'MALE'));
    expect(r.population_id).toBe('MALE_50_60');
    // ((45-28)/(57-28))×3 = 1.7586
    expect(r.score_0_3).toBeCloseTo(1.76, 2);
  });

  test('mujer 62 usa la banda 60+', () => {
    const r = scoreTest(c, 'HANDGRIP', 24, client(62, 'FEMALE'));
    expect(r.population_id).toBe('FEMALE_60_PLUS');
    expect(r.classification).toBe('FUNCTIONAL');
  });

  test('un cliente de 55 años ya no queda fuera del piloto (end-to-end)', () => {
    const r = runAssessmentV3(c, {
      client: client(55, 'FEMALE'), health_gates: { red_flags: [] },
      test_results: [{ test_key: 'HANDGRIP', value: 26 }], movement_levels: [],
    });
    const strength = r.domains.find((d) => d.domain === 'STRENGTH')!;
    expect(strength.tests[0]!.classification).toBe('FUNCTIONAL');
  });

  test('sigue fallando fuerte por debajo de 18 años (no se extrapola)', () => {
    expect(() => scoreTest(c, 'HANDGRIP', 40, client(16, 'MALE'))).toThrow(/no tiene umbrales/);
  });
});

describe('C1 — Interpolación confirmada (sin cambios)', () => {
  test('Dead Hang 39 s → 2.90 → FOUNDATION', () => {
    const r = scoreTest(c, 'DEAD_HANG', 39, client(35, 'MALE'));
    expect(r.score_0_3).toBeCloseTo(2.9, 2);
    expect(r.classification).toBe('FOUNDATION');
  });

  test('la regla de borde sigue asignando la peor clase (0.75 → CRITICAL)', () => {
    // Wall Sit: crítico 20, foundation 60 → valor 30 da (10/40)×3 = 0.75 exacto
    const r = scoreTest(c, 'WALL_SIT', 30, client(35, 'MALE'));
    expect(r.score_0_3).toBeCloseTo(0.75, 3);
    expect(r.classification).toBe('CRITICAL');
  });
});

describe('C2 — Las tablas de decisión mandan (suman 100%)', () => {
  test('1 CRITICAL → 70/20/5/5', () => {
    const v = c.raw.assignmentRules.RULE_SINGLE_CRITICAL.volumes;
    expect(v.p1 + v.p2 + v.support + v.maintain).toBe(100);
    expect([v.p1, v.p2, v.support, v.maintain]).toEqual([70, 20, 5, 5]);
  });

  test('2+ CRITICAL → 35/35/20/10', () => {
    const v = c.raw.assignmentRules.RULE_MULTIPLE_CRITICAL.volumes;
    expect(v.p1_primary + v.p1_secondary_total + v.support + v.maintain).toBe(100);
  });

  test('sin CRITICAL → 40/30/30', () => {
    const v = c.raw.assignmentRules.RULE_NO_CRITICAL.volumes;
    expect(v.p2 + v.support + v.maintain_first + v.maintain_second).toBe(100);
    expect(v.p2).toBe(40);
    expect(v.support).toBe(30);
    expect(v.maintain_first + v.maintain_second).toBe(30);
  });

  test('el roadmap real siempre suma 100', () => {
    const r = runAssessmentV3(c, {
      client: client(35, 'MALE'), health_gates: { red_flags: [] },
      test_results: [
        { test_key: 'HANDGRIP', value: 31 },
        { test_key: 'HIP_AROM', value: 75 },
        { test_key: 'RHR', value: 58 },
      ],
      movement_levels: [{ level_id: 'L1_IBM', observation_variables: {}, coach_classification: 'FUNCTIONAL' }],
    });
    // Invariante exacta en centésimas (sumar flotantes nunca da 100 redondo).
    const cents = r.roadmap!.assignments.reduce((s, a) => s + Math.round(a.volume_percent * 100), 0);
    expect(cents).toBe(10000);
  });
});

describe('C3 — Red flags condicionales (agudo STOP / crónico ALERT)', () => {
  const gates = (red_flags: string[], weeks?: Record<string, number>) =>
    runHealthGates(c, { red_flags, ...(weeks ? { red_flag_weeks_since: weeks } : {}) });

  test('evento cardiovascular sin antigüedad declarada → STOP (conservador)', () => {
    const r = gates(['RF_CARDIOVASCULAR_EVENT']);
    expect(r.status).toBe('BLOCKED');
    expect(r.triggered_stop_gates.map((g) => g.gate_id)).toContain('RF_CARDIOVASCULAR_EVENT');
  });

  test('evento cardiovascular de 1 semana → STOP (dentro de la ventana de 2)', () => {
    const r = gates(['RF_CARDIOVASCULAR_EVENT'], { RF_CARDIOVASCULAR_EVENT: 1 });
    expect(r.status).toBe('BLOCKED');
  });

  test('evento cardiovascular de 6 semanas → ALERT (crónico manejado)', () => {
    const r = gates(['RF_CARDIOVASCULAR_EVENT'], { RF_CARDIOVASCULAR_EVENT: 6 });
    expect(r.status).toBe('FLAGGED');
    expect(r.triggered_stop_gates).toHaveLength(0);
    const flagged = r.red_flags_present.find((f) => f.id === 'RF_CARDIOVASCULAR_EVENT')!;
    expect(flagged.severity).toBe('ALERT');
    expect(flagged.downgraded_by_window).toBe(true);
    expect(flagged.label).toContain('crónica');
  });

  test('cirugía de 2 semanas → STOP; de 6 semanas → ALERT (ventana de 4)', () => {
    expect(gates(['RF_RECENT_SURGERY'], { RF_RECENT_SURGERY: 2 }).status).toBe('BLOCKED');
    expect(gates(['RF_RECENT_SURGERY'], { RF_RECENT_SURGERY: 6 }).status).toBe('FLAGGED');
  });

  test('hospitalización de 5 semanas → ALERT', () => {
    const r = gates(['RF_RECENT_HOSPITALIZATION'], { RF_RECENT_HOSPITALIZATION: 5 });
    expect(r.status).toBe('FLAGGED');
  });

  test('fiebre / infección aguda → STOP', () => {
    expect(gates(['RF_FEVER_INFECTION']).status).toBe('BLOCKED');
  });

  test('arritmia manejada sigue siendo ALERT (no bloquea)', () => {
    const r = gates(['RF_KNOWN_ARRHYTHMIA']);
    expect(r.status).toBe('FLAGGED');
    expect(r.triggered_stop_gates).toHaveLength(0);
  });

  test('trastorno neurológico crónico = ALERT, síntomas agudos = STOP', () => {
    expect(gates(['RF_NEURO_DISORDER']).status).toBe('FLAGGED');
    expect(gates(['RF_NEURO_SYMPTOMS']).status).toBe('BLOCKED');
  });

  test('las contrapartes crónicas existen y son ALERT', () => {
    for (const id of ['RF_CHRONIC_CARDIOVASCULAR_MANAGED', 'RF_POST_SURGERY_CLEARED',
                      'RF_POST_HOSPITALIZATION_CLEARED', 'RF_CHRONIC_INFECTION_MANAGED']) {
      expect(c.redFlagById.get(id)!.severity).toBe('ALERT');
    }
  });

  test('un STOP condicional bloquea el pipeline completo', () => {
    const r = runAssessmentV3(c, {
      client: client(35, 'MALE'),
      health_gates: { red_flags: ['RF_CARDIOVASCULAR_EVENT'], red_flag_weeks_since: { RF_CARDIOVASCULAR_EVENT: 1 } },
      test_results: [{ test_key: 'HANDGRIP', value: 45 }], movement_levels: [],
    });
    expect(r.health_gates.status).toBe('BLOCKED');
    expect(r.domains).toHaveLength(0);
    expect(r.roadmap).toBeNull();
  });

  test('fuera de ventana la evaluación continúa y clasifica', () => {
    const r = runAssessmentV3(c, {
      client: client(35, 'MALE'),
      health_gates: { red_flags: ['RF_CARDIOVASCULAR_EVENT'], red_flag_weeks_since: { RF_CARDIOVASCULAR_EVENT: 8 } },
      test_results: [{ test_key: 'HANDGRIP', value: 45 }], movement_levels: [],
    });
    expect(r.health_gates.status).toBe('FLAGGED');
    expect(r.domains.length).toBeGreaterThan(0);
    expect(r.roadmap).not.toBeNull();
  });
});
