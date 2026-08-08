/**
 * HTC v3 — Movement Engine (C-4) + Health Gates (C-1).
 */
import * as path from 'path';
import { loadCanonicalV3, compileCanonicalV3, CompiledV3 } from '../v3/canonical';
import { evaluateMovement, worseOf } from '../v3/movement';
import { runHealthGates } from '../v3/health-gates';
import { MissingCanonicalV3Error, Classification, MovementLevelInput } from '../v3/models';

const DIR = path.join(__dirname, '..', '..', 'canonical-v3');
let c: CompiledV3;
beforeAll(() => { c = compileCanonicalV3(loadCanonicalV3(DIR)); });

const lvl = (
  level_id: MovementLevelInput['level_id'],
  cls: Classification,
  extra: Partial<MovementLevelInput> = {},
): MovementLevelInput => ({
  level_id, observation_variables: {}, coach_classification: cls, ...extra,
});

const vars = (obj: Record<string, Classification>) =>
  Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, { coach_observation: v }]));

describe('C-4 — Movement: 4 niveles jerárquicos', () => {
  test('el canonical define exactamente 4 niveles en orden', () => {
    expect(c.movementLevelsOrdered.map((l) => l.level_id)).toEqual(['L1_IBM', 'L2_DC', 'L3_MC', 'L4_MPS']);
  });

  test('ejemplo publicado: L1 Fn, L2 E, L3 Fn, L4 F → dominio EMERGING, limitado por L2', () => {
    const m = evaluateMovement(c, [
      lvl('L1_IBM', 'FUNCTIONAL'), lvl('L2_DC', 'EMERGING'),
      lvl('L3_MC', 'FUNCTIONAL'), lvl('L4_MPS', 'FOUNDATION'),
    ])!;
    expect(m.domain_classification).toBe('EMERGING');
    expect(m.limited_by).toBe('L2_DC');
  });

  test('worst-case: un CRITICAL en cualquier nivel define el dominio', () => {
    const m = evaluateMovement(c, [
      lvl('L1_IBM', 'FOUNDATION'), lvl('L2_DC', 'FOUNDATION'),
      lvl('L3_MC', 'CRITICAL'), lvl('L4_MPS', 'FOUNDATION'),
    ])!;
    expect(m.domain_classification).toBe('CRITICAL');
    expect(m.limited_by).toBe('L3_MC');
  });

  test('todos FOUNDATION → dominio FOUNDATION', () => {
    const m = evaluateMovement(c, [lvl('L1_IBM', 'FOUNDATION'), lvl('L2_DC', 'FOUNDATION')])!;
    expect(m.domain_classification).toBe('FOUNDATION');
  });

  test('prerrequisito jerárquico: L1 por debajo de FUNCTIONAL marca L2 como no accesible', () => {
    const m = evaluateMovement(c, [lvl('L1_IBM', 'CRITICAL'), lvl('L2_DC', 'FUNCTIONAL')])!;
    const l2 = m.levels.find((l) => l.level_id === 'L2_DC')!;
    expect(l2.prerequisite_met).toBe(false);
    expect(l2.reason_ids).toContain('REASON_V3_PREREQ_NOT_MET');
  });

  test('worseOf respeta el orden canónico de códigos', () => {
    expect(worseOf('FOUNDATION', 'EMERGING')).toBe('EMERGING');
    expect(worseOf('CRITICAL', 'EMERGING')).toBe('CRITICAL');
    expect(worseOf('FUNCTIONAL', 'FUNCTIONAL')).toBe('FUNCTIONAL');
  });

  test('sin niveles cargados devuelve null (Movement es opcional)', () => {
    expect(evaluateMovement(c, [])).toBeNull();
  });
});

describe('Movement — derivación desde el rubric canónico', () => {
  test('L1 con 4/5 en Foundation y ninguna por debajo de Functional → FOUNDATION', () => {
    const m = evaluateMovement(c, [{
      level_id: 'L1_IBM',
      observation_variables: vars({
        perception: 'FOUNDATION', precision: 'FOUNDATION', selective_motor_control: 'FOUNDATION',
        correction: 'FOUNDATION', attention: 'FUNCTIONAL',
      }),
    }])!;
    expect(m.levels[0]!.classification).toBe('FOUNDATION');
    expect(m.levels[0]!.classification_method).toBe('RUBRIC_DERIVED');
  });

  test('L1 del ejemplo publicado (4 Fn + 1 E) → FUNCTIONAL', () => {
    const m = evaluateMovement(c, [{
      level_id: 'L1_IBM',
      observation_variables: vars({
        perception: 'FUNCTIONAL', precision: 'FUNCTIONAL', selective_motor_control: 'EMERGING',
        correction: 'FUNCTIONAL', attention: 'FUNCTIONAL',
      }),
    }])!;
    expect(m.levels[0]!.classification).toBe('FUNCTIONAL');
  });

  test('L1 con mayoría en Emerging/Critical → CRITICAL', () => {
    const m = evaluateMovement(c, [{
      level_id: 'L1_IBM',
      observation_variables: vars({
        perception: 'CRITICAL', precision: 'EMERGING', selective_motor_control: 'EMERGING',
        correction: 'EMERGING', attention: 'FUNCTIONAL',
      }),
    }])!;
    expect(m.levels[0]!.classification).toBe('CRITICAL');
  });

  test('L3 exige coordination_ceiling para aplicar su regla', () => {
    expect(() => evaluateMovement(c, [{
      level_id: 'L3_MC',
      observation_variables: vars({
        rhythm_accuracy: 'FUNCTIONAL', synchronization: 'FUNCTIONAL', timing: 'FUNCTIONAL',
        complexity_tolerance: 'FUNCTIONAL', error_recovery: 'FUNCTIONAL',
      }),
    }])).toThrow(/coordination_ceiling/);
  });

  test('L3 con ceiling 4 y mayoría Functional → FUNCTIONAL', () => {
    const m = evaluateMovement(c, [{
      level_id: 'L3_MC',
      coordination_ceiling: 4,
      observation_variables: vars({
        rhythm_accuracy: 'FUNCTIONAL', synchronization: 'FUNCTIONAL', timing: 'FUNCTIONAL',
        complexity_tolerance: 'FUNCTIONAL', error_recovery: 'FUNCTIONAL',
      }),
    }])!;
    expect(m.levels[0]!.classification).toBe('FUNCTIONAL');
  });

  test('L4 usa la escalera de challenges del canonical', () => {
    const m = evaluateMovement(c, [{
      level_id: 'L4_MPS',
      problem_solving_ceiling: 'object_challenge',
      observation_variables: vars({
        solution_generation: 'FUNCTIONAL', strategy_selection: 'FUNCTIONAL', exploration: 'FUNCTIONAL',
        learning_speed: 'FUNCTIONAL', error_recovery: 'FUNCTIONAL', autonomy: 'FUNCTIONAL',
      }),
    }])!;
    expect(m.levels[0]!.classification).toBe('FUNCTIONAL');
  });

  test('un challenge fuera del orden canónico falla fuerte', () => {
    expect(() => evaluateMovement(c, [{
      level_id: 'L4_MPS',
      problem_solving_ceiling: 'inventado',
      observation_variables: vars({
        solution_generation: 'FUNCTIONAL', strategy_selection: 'FUNCTIONAL', exploration: 'FUNCTIONAL',
        learning_speed: 'FUNCTIONAL', error_recovery: 'FUNCTIONAL', autonomy: 'FUNCTIONAL',
      }),
    }])).toThrow(/challenge_order/);
  });

  test('faltan variables y no hay coach_classification → falla fuerte, no infiere', () => {
    expect(() => evaluateMovement(c, [{
      level_id: 'L1_IBM',
      observation_variables: vars({ perception: 'FUNCTIONAL' }),
    }])).toThrow(/faltan las variables/);
  });

  test('una variable ajena al nivel es rechazada', () => {
    expect(() => evaluateMovement(c, [{
      level_id: 'L1_IBM',
      observation_variables: vars({ dynamic_balance: 'FUNCTIONAL' }),
      coach_classification: 'FUNCTIONAL',
    }])).toThrow(/no pertenece a L1_IBM/);
  });
});

describe('C-1 — Health Gates transversales', () => {
  const base = { red_flags: [] };

  test('sin hallazgos → PASS y se procede', () => {
    const h = runHealthGates(c, { ...base, systolic_bp: 120, diastolic_bp: 78, current_pain_level: 1 });
    expect(h.status).toBe('PASS');
    expect(h.action).toBe('PROCEED');
    expect(h.reason_ids).toContain('REASON_V3_HEALTH_PASS');
  });

  test('PAR-Q+ positivo → BLOCKED + derivación médica', () => {
    const h = runHealthGates(c, { ...base, parq_positive: true });
    expect(h.status).toBe('BLOCKED');
    expect(h.action).toBe('MEDICAL_REFERRAL');
    expect(h.triggered_stop_gates.map((g) => g.gate_id)).toContain('PAR_Q_PLUS');
  });

  test('PAS ≥ 180 → BLOCKED', () => {
    const h = runHealthGates(c, { ...base, systolic_bp: 185, diastolic_bp: 95 });
    expect(h.status).toBe('BLOCKED');
    expect(h.triggered_stop_gates.map((g) => g.gate_id)).toContain('BP_SBP');
  });

  test('PAD ≥ 110 → BLOCKED aunque la sistólica sea normal', () => {
    const h = runHealthGates(c, { ...base, systolic_bp: 130, diastolic_bp: 112 });
    expect(h.triggered_stop_gates.map((g) => g.gate_id)).toContain('BP_DBP');
  });

  test('el umbral es exacto: 179/109 pasa, 180/110 bloquea', () => {
    expect(runHealthGates(c, { ...base, systolic_bp: 179, diastolic_bp: 109 }).status).toBe('PASS');
    expect(runHealthGates(c, { ...base, systolic_bp: 180, diastolic_bp: 109 }).status).toBe('BLOCKED');
    expect(runHealthGates(c, { ...base, systolic_bp: 179, diastolic_bp: 110 }).status).toBe('BLOCKED');
  });

  test('dolor torácico → BLOCKED', () => {
    const h = runHealthGates(c, { ...base, chest_pain: true });
    expect(h.status).toBe('BLOCKED');
    expect(h.reason_ids).toContain('REASON_V3_GATE_CHEST_PAIN');
  });

  test('dolor ≥6 → FLAGGED, la evaluación continúa', () => {
    const h = runHealthGates(c, { ...base, current_pain_level: 7 });
    expect(h.status).toBe('FLAGGED');
    expect(h.action).toBe('PROCEED');
    expect(h.alert_flags.map((f) => f.flag_id)).toContain('PAIN_6');
  });

  test('dolor 4-5 → flag MONITOR (banda intermedia del canonical)', () => {
    const h = runHealthGates(c, { ...base, current_pain_level: 4 });
    expect(h.alert_flags.map((f) => f.flag_id)).toContain('PAIN_MONITOR');
    expect(h.status).toBe('FLAGGED');
  });

  test('dolor 3 no levanta ningún flag', () => {
    expect(runHealthGates(c, { ...base, current_pain_level: 3 }).status).toBe('PASS');
  });

  test('red flag de severidad STOP bloquea; una ALERT sólo marca', () => {
    const stop = runHealthGates(c, { red_flags: ['RF_SEVERE_DYSPNEA'] });
    expect(stop.status).toBe('BLOCKED');
    // v1.1: fiebre/infección aguda pasó a STOP. Una crónica manejada sigue en ALERT.
    const alert = runHealthGates(c, { red_flags: ['RF_KNOWN_ARRHYTHMIA'] });
    expect(alert.status).toBe('FLAGGED');
    expect(alert.action).toBe('PROCEED');
  });

  test('el catálogo de red flags incluye las condicionales y sus contrapartes crónicas (v1.1)', () => {
    // 13 originales + 4 contrapartes crónicas agregadas por CLINICAL_CONFIRMATIONS #3.
    expect(c.raw.redFlags).toHaveLength(17);
    // STOP base: agudas + las condicionales dentro de su ventana.
    expect(c.raw.redFlags.filter((f) => f.severity === 'STOP').map((f) => f.id).sort())
      .toEqual([
        'RF_CARDIOVASCULAR_EVENT', 'RF_DIZZINESS', 'RF_FEVER_INFECTION',
        'RF_NEURO_SYMPTOMS', 'RF_RECENT_HOSPITALIZATION', 'RF_RECENT_SURGERY', 'RF_SEVERE_DYSPNEA',
      ]);
  });

  test('una red flag inexistente falla fuerte', () => {
    expect(() => runHealthGates(c, { red_flags: ['RF_INVENTADA'] })).toThrow(MissingCanonicalV3Error);
  });
});
