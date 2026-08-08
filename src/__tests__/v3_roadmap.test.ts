/**
 * HTC v3 — Development Priority Assignment Engine + pipeline completo.
 * Contrasta contra los 3 escenarios publicados en el documento del motor.
 */
import * as path from 'path';
import { loadCanonicalV3, compileCanonicalV3, CompiledV3 } from '../v3/canonical';
import { buildRoadmap, rankDomains } from '../v3/roadmap';
import { runAssessmentV3 } from '../v3/pipeline';
import { Classification, DomainKey, DomainResult, MissingCanonicalV3Error } from '../v3/models';

const DIR = path.join(__dirname, '..', '..', 'canonical-v3');
let c: CompiledV3;
beforeAll(() => { c = compileCanonicalV3(loadCanonicalV3(DIR)); });

/** Construye un DomainResult sintético para probar el roadmap aisladamente. */
function dom(
  domain: DomainKey, classification: Classification, criticals: string[] = [],
): DomainResult {
  const d = c.domainByKey.get(domain)!;
  return {
    domain, name: d.name, impact_factor: d.impact_factor,
    weighted_score: null, classification,
    critical_component_flag: criticals.length > 0, critical_components: criticals,
    classification_basis: criticals.length > 0 ? 'CRITICAL_COMPONENT_OVERRIDE' : 'WEIGHTED_AVERAGE',
    tests: [], reason_ids: [],
  };
}

const roleOf = (r: ReturnType<typeof buildRoadmap>, d: DomainKey) =>
  r.assignments.find((a) => a.domain === d)!;

describe('Ranking de dominios', () => {
  test('Rule A: peor clasificación primero', () => {
    const ranked = rankDomains([
      dom('AEROBIC', 'FOUNDATION'), dom('STRENGTH', 'CRITICAL'), dom('MOBILITY', 'EMERGING'),
    ]);
    expect(ranked.map((d) => d.domain)).toEqual(['STRENGTH', 'MOBILITY', 'AEROBIC']);
  });

  test('Rule B: empate de clasificación se resuelve por impact factor', () => {
    const ranked = rankDomains([
      dom('AEROBIC', 'EMERGING'), dom('MOBILITY', 'EMERGING'), dom('MOVEMENT', 'EMERGING'), dom('STRENGTH', 'EMERGING'),
    ]);
    expect(ranked.map((d) => d.domain)).toEqual(['STRENGTH', 'MOVEMENT', 'MOBILITY', 'AEROBIC']);
  });

  test('Rule C: a igual clasificación e impacto, menos componentes críticos rankea primero', () => {
    const pocos = dom('MOBILITY', 'CRITICAL', ['HIP_AROM']);
    const muchos = dom('MOBILITY', 'CRITICAL', ['HIP_AROM', 'ANKLE_DF', 'SHOULDER_ER']);
    expect(rankDomains([muchos, pocos])[0]!.critical_components).toHaveLength(1);
  });
});

describe('RULE_SINGLE_CRITICAL — escenario 1 del documento', () => {
  const r = () => buildRoadmap(c, [
    dom('STRENGTH', 'CRITICAL', ['HANDGRIP']),
    dom('MOBILITY', 'FUNCTIONAL'),
    dom('AEROBIC', 'FOUNDATION'),
    dom('MOVEMENT', 'EMERGING'),
  ], null);

  test('el dominio crítico es P1 con 70%', () => {
    const p1 = roleOf(r(), 'STRENGTH');
    expect(p1.role).toBe('P1');
    expect(p1.volume_percent).toBe(70);
    expect(p1.reason_id).toBe('REASON_V3_AUTO_P1');
  });

  test('el EMERGING pasa a P2 con 20%', () => {
    const p2 = roleOf(r(), 'MOVEMENT');
    expect(p2.role).toBe('P2');
    expect(p2.volume_percent).toBe(20);
  });

  test('el volumen suma exactamente 100% sin normalizar', () => {
    const res = r();
    expect(res.assignments.reduce((a, x) => a + x.volume_percent, 0)).toBe(100);
    expect(res.volume_normalized).toBe(false);
  });

  test('el P1 arrastra el criterio de éxito del componente crítico', () => {
    expect(roleOf(r(), 'STRENGTH').success_criteria).toContain('HANDGRIP');
  });

  test('la regla aplicada queda registrada', () => {
    expect(r().rule_applied).toBe('RULE_SINGLE_CRITICAL');
  });
});

describe('RULE_MULTIPLE_CRITICAL — escenario 2 del documento', () => {
  const r = () => buildRoadmap(c, [
    dom('STRENGTH', 'CRITICAL', ['HANDGRIP']),
    dom('MOBILITY', 'CRITICAL', ['HIP_AROM', 'ANKLE_DF']),
    dom('AEROBIC', 'FUNCTIONAL'),
    dom('MOVEMENT', 'EMERGING'),
  ], null);

  test('Strength (impact 3.0) es P1_PRIMARY y Mobility (2.0) P1_SECONDARY', () => {
    expect(roleOf(r(), 'STRENGTH').role).toBe('P1_PRIMARY');
    expect(roleOf(r(), 'MOBILITY').role).toBe('P1_SECONDARY');
  });

  test('los volúmenes coinciden con la tabla: 35 / 35 / 20 / 10', () => {
    const res = r();
    expect(roleOf(res, 'STRENGTH').volume_percent).toBe(35);
    expect(roleOf(res, 'MOBILITY').volume_percent).toBe(35);
    expect(roleOf(res, 'MOVEMENT').volume_percent).toBe(20);
    expect(roleOf(res, 'AEROBIC').volume_percent).toBe(10);
    expect(res.volume_normalized).toBe(false);
  });

  test('sólo puede haber un P1_PRIMARY (Validation Rule 2)', () => {
    expect(r().assignments.filter((a) => a.role === 'P1_PRIMARY')).toHaveLength(1);
  });

  test('con 3 dominios críticos el esfuerzo P1 secundario se reparte en partes iguales', () => {
    const res = buildRoadmap(c, [
      dom('STRENGTH', 'CRITICAL'), dom('MOBILITY', 'CRITICAL'),
      dom('AEROBIC', 'CRITICAL'), dom('MOVEMENT', 'FUNCTIONAL'),
    ], null);
    const secondaries = res.assignments.filter((a) => a.role === 'P1_SECONDARY');
    expect(secondaries).toHaveLength(2);
    // 35 + 17.5 + 17.5 + 20 = 90 → se normaliza a 100 (Validation Rule 1).
    expect(res.volume_normalized).toBe(true);
    expect(secondaries[0]!.volume_percent).toBeCloseTo(secondaries[1]!.volume_percent, 2);
    expect(res.assignments.reduce((a, x) => a + x.volume_percent, 0)).toBeCloseTo(100, 1);
    // El primario conserva el doble de volumen que cada secundario.
    expect(roleOf(res, 'STRENGTH').volume_percent).toBeCloseTo(secondaries[0]!.volume_percent * 2, 1);
  });
});

describe('RULE_NO_CRITICAL — escenario 3 del documento', () => {
  const r = () => buildRoadmap(c, [
    dom('STRENGTH', 'FUNCTIONAL'),
    dom('MOBILITY', 'EMERGING'),
    dom('AEROBIC', 'FOUNDATION'),
    dom('MOVEMENT', 'FOUNDATION'),
  ], null);

  test('el peor dominio es P2 con 40% (no hay P1 sin CRITICAL)', () => {
    const res = r();
    expect(roleOf(res, 'MOBILITY').role).toBe('P2');
    expect(roleOf(res, 'MOBILITY').volume_percent).toBe(40);
    expect(res.assignments.some((a) => a.role === 'P1')).toBe(false);
  });

  test('reparto 40/30/20/10 y suma 100%', () => {
    const res = r();
    expect(res.assignments.map((a) => a.volume_percent).sort((x, y) => y - x)).toEqual([40, 30, 20, 10]);
    expect(res.volume_normalized).toBe(false);
  });
});

describe('Constraints de Movement', () => {
  test('L2 EMERGING genera el constraint de control dinámico', () => {
    const movement = {
      levels: [
        { level_id: 'L2_DC' as const, name: 'Dynamic Control', sequence_number: 2,
          classification: 'EMERGING' as const, classification_method: 'COACH_DECLARED' as const,
          observation_variables: {}, prerequisite_met: true, reason_ids: [] },
      ],
      domain_classification: 'EMERGING' as const, limited_by: 'L2_DC' as const, reason_ids: [],
    };
    const res = buildRoadmap(c, [dom('STRENGTH', 'CRITICAL', ['HANDGRIP']), dom('MOVEMENT', 'EMERGING')], movement);
    expect(res.constraints.map((x) => x.type)).toContain('DYNAMIC_CONTROL_LIMIT');
    expect(res.session_architecture.constraints.join(' ')).toContain('bilateral');
  });

  test('Movement CRITICAL sin constraints documentados falla fuerte (Validation Rule 4)', () => {
    // Movement CRITICAL por L1, que no tiene constraint declarado en el canonical.
    const movement = {
      levels: [
        { level_id: 'L1_IBM' as const, name: 'IBM', sequence_number: 1,
          classification: 'CRITICAL' as const, classification_method: 'COACH_DECLARED' as const,
          observation_variables: {}, prerequisite_met: true, reason_ids: [] },
      ],
      domain_classification: 'CRITICAL' as const, limited_by: 'L1_IBM' as const, reason_ids: [],
    };
    expect(() => buildRoadmap(c, [dom('MOVEMENT', 'CRITICAL', ['L1_IBM']), dom('STRENGTH', 'FUNCTIONAL')], movement))
      .toThrow(/Validation Rule 4/);
  });

  test('Movement P1 arrastra el foco específico del nivel limitante', () => {
    const movement = {
      levels: [
        { level_id: 'L2_DC' as const, name: 'Dynamic Control', sequence_number: 2,
          classification: 'CRITICAL' as const, classification_method: 'COACH_DECLARED' as const,
          observation_variables: {}, prerequisite_met: true, reason_ids: [] },
      ],
      domain_classification: 'CRITICAL' as const, limited_by: 'L2_DC' as const, reason_ids: [],
    };
    const res = buildRoadmap(c, [dom('MOVEMENT', 'CRITICAL', ['L2_DC']), dom('STRENGTH', 'FUNCTIONAL')], movement);
    const mv = roleOf(res, 'MOVEMENT');
    expect(mv.specific_focus).toContain('dynamic stability');
    expect(mv.duration_weeks).toEqual([6, 8]);
  });
});

describe('Arquitectura de sesión y validaciones', () => {
  test('los minutos se reparten según el volumen', () => {
    const res = buildRoadmap(c, [
      dom('STRENGTH', 'CRITICAL', ['HANDGRIP']), dom('MOBILITY', 'FUNCTIONAL'),
      dom('AEROBIC', 'FOUNDATION'), dom('MOVEMENT', 'EMERGING'),
    ], null, 60);
    expect(res.session_architecture.total_minutes).toBe(60);
    const p1 = res.session_architecture.breakdown.find((b) => b.domain === 'STRENGTH')!;
    expect(p1.minutes).toBe(42); // 70% de 60
  });

  test('con menos de 4 dominios el volumen se normaliza y queda registrado', () => {
    const res = buildRoadmap(c, [dom('STRENGTH', 'CRITICAL', ['HANDGRIP']), dom('MOBILITY', 'FUNCTIONAL')], null);
    expect(res.volume_normalized).toBe(true);
    expect(res.assignments.reduce((a, x) => a + x.volume_percent, 0)).toBeCloseTo(100, 1);
    expect(res.validation_warnings.join(' ')).toContain('OBS-2');
  });

  test('sin dominios falla fuerte', () => {
    expect(() => buildRoadmap(c, [], null)).toThrow(MissingCanonicalV3Error);
  });
});

describe('Pipeline v3 end-to-end', () => {
  const client = { name: 'Diego M.', age: 28, sex: 'MALE' as const };

  test('STOP gate corta el pipeline: no clasifica ni arma roadmap', () => {
    const r = runAssessmentV3(c, {
      client,
      health_gates: { systolic_bp: 190, red_flags: [] },
      test_results: [{ test_key: 'HANDGRIP', value: 45 }],
    });
    expect(r.health_gates.status).toBe('BLOCKED');
    expect(r.domains).toHaveLength(0);
    expect(r.roadmap).toBeNull();
    expect(r.reasoning.some((x) => x.id === 'REASON_V3_GATE_BP')).toBe(true);
  });

  test('caso completo (4 dominios): grip crítico → Strength CRITICAL → P1 automático', () => {
    // Cliente de 35 años: cubierto por MALE_30_50 (grip) y AGE_30_50 (RHR).
    const r = runAssessmentV3(c, {
      client: { name: 'Diego M.', age: 35, sex: 'MALE' },
      health_gates: { systolic_bp: 120, diastolic_bp: 78, red_flags: [] },
      test_results: [
        { test_key: 'HANDGRIP', value: 31 },   // CRITICAL
        { test_key: 'WALL_SIT', value: 45 },
        { test_key: 'PUSHUP', value: 18 },
        { test_key: 'HIP_AROM', value: 75 },
        { test_key: 'RHR', value: 58 },
      ],
      movement_levels: [
        { level_id: 'L1_IBM', observation_variables: {}, coach_classification: 'FUNCTIONAL' },
        { level_id: 'L2_DC', observation_variables: {}, coach_classification: 'EMERGING' },
      ],
    });
    const strength = r.domains.find((d) => d.domain === 'STRENGTH')!;
    expect(strength.classification).toBe('CRITICAL');
    expect(strength.critical_components).toEqual(['HANDGRIP']);
    expect(r.roadmap!.rule_applied).toBe('RULE_SINGLE_CRITICAL');
    expect(r.roadmap!.assignments.find((a) => a.role === 'P1')!.domain).toBe('STRENGTH');
    expect(r.movement!.domain_classification).toBe('EMERGING');
    // Los 4 dominios presentes → el volumen suma 100 sin normalizar.
    expect(r.roadmap!.volume_normalized).toBe(false);
  });

  test('población no cubierta corta la evaluación con mensaje accionable (menor de 18)', () => {
    // v1.2 cubrió RHR 18-30; el bloqueo deliberado ahora es < 18 años.
    expect(() => runAssessmentV3(c, {
      client: { name: 'Menor', age: 16, sex: 'MALE' },
      health_gates: { red_flags: [] },
      test_results: [{ test_key: 'RHR', value: 58 }],
    })).toThrow(/RHR no tiene umbrales para MALE de 16 años/);
  });

  test('congela las 6 versiones canónicas (Principio 6)', () => {
    const r = runAssessmentV3(c, {
      client, health_gates: { red_flags: [] },
      test_results: [{ test_key: 'HANDGRIP', value: 45 }],
    });
    expect(r.version_snapshot.os_version).toBe('3.0');
    expect(r.version_snapshot.thresholds_version).toBe('1.1'); // v1.1: +handgrip 50+
    expect(r.version_snapshot.movement_standard_version).toBe('FINAL_1');
    expect(new Date(r.version_snapshot.frozen_at).toString()).not.toBe('Invalid Date');
  });

  test('el audit trail registra los umbrales usados por test', () => {
    const r = runAssessmentV3(c, {
      client, health_gates: { red_flags: [] },
      test_results: [{ test_key: 'HANDGRIP', value: 45 }],
    });
    expect(r.audit_trail.thresholds_used[0]).toEqual({
      test_key: 'HANDGRIP', population_id: 'MALE_20_30', umbral_critical: 30, umbral_foundation: 57,
    });
  });

  test('el razonamiento se renderiza en español y en inglés', () => {
    const base = {
      client, health_gates: { current_pain_level: 7, red_flags: [] },
      test_results: [{ test_key: 'HANDGRIP', value: 45 }],
    };
    const es = runAssessmentV3(c, { ...base, language: 'es' });
    const en = runAssessmentV3(c, { ...base, language: 'en' });
    const painEs = es.reasoning.find((x) => x.id === 'REASON_V3_FLAG_PAIN')!.text;
    const painEn = en.reasoning.find((x) => x.id === 'REASON_V3_FLAG_PAIN')!.text;
    expect(painEs).toContain('Dolor');
    expect(painEn).toContain('Pain');
  });

  test('dolor ≥6 no bloquea: clasifica igual y deja el flag', () => {
    const r = runAssessmentV3(c, {
      client, health_gates: { current_pain_level: 8, red_flags: [] },
      test_results: [{ test_key: 'HANDGRIP', value: 45 }],
    });
    expect(r.health_gates.status).toBe('FLAGGED');
    expect(r.domains.length).toBeGreaterThan(0);
    expect(r.roadmap).not.toBeNull();
  });
});
