/**
 * HTC v3 — Classification Engine.
 * Verifica la fórmula de interpolación (C-2) y el Critical Component Rule (C-3)
 * contra los ejemplos publicados en los documentos canónicos.
 */
import * as path from 'path';
import { loadCanonicalV3, compileCanonicalV3, CompiledV3, classifyScore } from '../v3/canonical';
import { scoreTest, interpolateScore, resolvePopulation, aggregateNumericDomain, classifyNumericDomains } from '../v3/classification';
import { MissingCanonicalV3Error } from '../v3/models';

const DIR = path.join(__dirname, '..', '..', 'canonical-v3');
let c: CompiledV3;
beforeAll(() => { c = compileCanonicalV3(loadCanonicalV3(DIR)); });

const male28 = { age: 28, sex: 'MALE' as const };
const female35 = { age: 35, sex: 'FEMALE' as const };

describe('Canonical v3 — carga y validación', () => {
  test('carga las 4 versiones + los 4 dominios desarrollables', () => {
    expect(c.raw.versions.os_version).toBe('3.0');
    expect(c.raw.domains.map((d) => d.key).sort()).toEqual(['AEROBIC', 'MOBILITY', 'MOVEMENT', 'STRENGTH']);
  });

  test('impact factors de C-1..C-5: Strength 3.0 > Movement 2.5 > Mobility 2.0 > Aerobic 1.5', () => {
    expect(c.domainByKey.get('STRENGTH')!.impact_factor).toBe(3.0);
    expect(c.domainByKey.get('MOVEMENT')!.impact_factor).toBe(2.5);
    expect(c.domainByKey.get('MOBILITY')!.impact_factor).toBe(2.0);
    expect(c.domainByKey.get('AEROBIC')!.impact_factor).toBe(1.5);
  });

  test('los pesos de Strength suman 11.5 y los de Mobility 6.5', () => {
    const sum = (k: 'STRENGTH' | 'MOBILITY') =>
      c.testsByDomain.get(k)!.reduce((a, t) => a + (t.weight ?? 0), 0);
    expect(sum('STRENGTH')).toBe(11.5);
    expect(sum('MOBILITY')).toBe(6.5);
  });

  test('Health NO es un dominio (C-1)', () => {
    expect(c.raw.domains.some((d) => d.key === ('HEALTH' as never))).toBe(false);
    expect(c.raw.stopGates.length).toBeGreaterThan(0);
  });

  test('el compilador rechaza umbrales cuya dirección contradice is_inverse', () => {
    const canonical = loadCanonicalV3(DIR);
    const grip = canonical.tests.find((t) => t.key === 'HANDGRIP')!;
    grip.is_inverse = true; // ascendente pero declarado inverso
    expect(() => compileCanonicalV3(canonical)).toThrow(MissingCanonicalV3Error);
  });
});

describe('C-2 — Interpolación 0-3 y redondeo conservador', () => {
  test('los 4 bordes de clasificación aplican la PEOR clase (regla conservadora)', () => {
    expect(classifyScore(c, 0.74)).toBe('CRITICAL');
    expect(classifyScore(c, 0.75)).toBe('CRITICAL');   // borde → peor
    expect(classifyScore(c, 0.76)).toBe('EMERGING');
    expect(classifyScore(c, 1.5)).toBe('EMERGING');    // borde → peor
    expect(classifyScore(c, 1.51)).toBe('FUNCTIONAL');
    expect(classifyScore(c, 2.25)).toBe('FUNCTIONAL'); // borde → peor
    expect(classifyScore(c, 2.26)).toBe('FOUNDATION');
  });

  test('ejemplo publicado: Handgrip 45 kg (M 20-30) → 1.67 FUNCTIONAL', () => {
    const s = scoreTest(c, 'HANDGRIP', 45, male28);
    expect(s.score_0_3).toBeCloseTo(1.667, 2);
    expect(s.classification).toBe('FUNCTIONAL');
    expect(s.population_id).toBe('MALE_20_30');
  });

  test('ejemplo publicado: Wall Sit 45 s → 1.875 FUNCTIONAL', () => {
    expect(scoreTest(c, 'WALL_SIT', 45, male28).score_0_3).toBeCloseTo(1.875, 3);
  });

  test('ejemplo publicado: Push-Up 18 reps (M) → 1.56 FUNCTIONAL', () => {
    const s = scoreTest(c, 'PUSHUP', 18, male28);
    expect(s.score_0_3).toBeCloseTo(1.56, 2);
    expect(s.classification).toBe('FUNCTIONAL');
  });

  test('ejemplo publicado: Inverted Row 12 reps → 1.4 EMERGING', () => {
    const s = scoreTest(c, 'INVERTED_ROW', 12, male28);
    expect(s.score_0_3).toBeCloseTo(1.4, 2);
    expect(s.classification).toBe('EMERGING');
  });

  test('ejemplo publicado del schema: RHR 75 bpm (30-50) → exactamente 1.5 → EMERGING', () => {
    const s = scoreTest(c, 'RHR', 75, { age: 40, sex: 'MALE' });
    expect(s.score_0_3).toBe(1.5);
    expect(s.classification).toBe('EMERGING');
  });

  test('test inverso: la fórmula única equivale a la variante "inversa" del schema', () => {
    const pop = resolvePopulation(c.testByKey.get('RHR')!, { age: 40, sex: 'MALE' });
    const directa = interpolateScore(c, 75, pop);
    const inversa = ((pop.umbral_critical - 75) / (pop.umbral_critical - pop.umbral_foundation)) * 3;
    expect(directa).toBeCloseTo(inversa, 10);
  });

  test('5xSTS es inverso: 12 s (rápido) → FOUNDATION, 24 s (lento) → CRITICAL', () => {
    expect(scoreTest(c, 'SIT_TO_STAND_5X', 12, male28).classification).toBe('FOUNDATION');
    expect(scoreTest(c, 'SIT_TO_STAND_5X', 24, male28).classification).toBe('CRITICAL');
  });

  test('clamp a [0,3]: valores fuera de rango no se salen de la escala', () => {
    expect(scoreTest(c, 'HANDGRIP', 5, male28).score_0_3).toBe(0);
    expect(scoreTest(c, 'HANDGRIP', 200, male28).score_0_3).toBe(3);
    expect(scoreTest(c, 'RHR', 200, { age: 40, sex: 'MALE' }).score_0_3).toBe(0);
  });

  test('selecciona la población por sexo y edad', () => {
    expect(scoreTest(c, 'HANDGRIP', 30, female35).population_id).toBe('FEMALE_30_50');
    expect(scoreTest(c, 'HANDGRIP', 45, { age: 45, sex: 'MALE' }).population_id).toBe('MALE_30_50');
  });

  test('población no cubierta → falla fuerte, nunca extrapola', () => {
    // v1.1 cubrió handgrip 50+; v1.2 cubrió 18-20 y RHR 18-30.
    // El bloqueo deliberado que queda es el de menores de 18 años.
    expect(() => scoreTest(c, 'HANDGRIP', 40, { age: 16, sex: 'MALE' })).toThrow(MissingCanonicalV3Error);
    expect(() => scoreTest(c, 'RHR', 60, { age: 15, sex: 'MALE' })).toThrow(/no tiene umbrales/);
  });

  test('test inexistente → falla fuerte', () => {
    expect(() => scoreTest(c, 'TEST_INVENTADO', 10, male28)).toThrow(MissingCanonicalV3Error);
  });
});

describe('C-3 — Critical Component Rule (AUTO OVERRIDE)', () => {
  test('un componente CRITICAL fuerza el dominio a CRITICAL aunque el promedio sea FUNCTIONAL', () => {
    // Ejemplo del documento: grip crítico + resto funcional → dominio CRITICAL
    const { domains } = classifyNumericDomains(c, male28, [
      { test_key: 'HANDGRIP', value: 31 },      // score ~0.11 → CRITICAL
      { test_key: 'WALL_SIT', value: 45 },      // FUNCTIONAL
      { test_key: 'PUSHUP', value: 18 },        // FUNCTIONAL
      { test_key: 'INVERTED_ROW', value: 15 },  // FUNCTIONAL+
    ]);
    const strength = domains.find((d) => d.domain === 'STRENGTH')!;
    expect(strength.classification).toBe('CRITICAL');
    expect(strength.classification_basis).toBe('CRITICAL_COMPONENT_OVERRIDE');
    expect(strength.critical_components).toEqual(['HANDGRIP']);
    expect(strength.reason_ids).toContain('REASON_V3_CRITICAL_COMPONENT');
  });

  test('sin componentes críticos, el dominio usa el promedio ponderado', () => {
    const { domains } = classifyNumericDomains(c, male28, [
      { test_key: 'HANDGRIP', value: 45 },
      { test_key: 'WALL_SIT', value: 45 },
    ]);
    const s = domains[0]!;
    expect(s.classification_basis).toBe('WEIGHTED_AVERAGE');
    expect(s.critical_component_flag).toBe(false);
    // (1.667×3 + 1.875×1.5) / 4.5
    expect(s.weighted_score).toBeCloseTo((1.6667 * 3 + 1.875 * 1.5) / 4.5, 2);
  });

  test('el promedio ponderado respeta los pesos canónicos (grip pesa 3, wall sit 1.5)', () => {
    const alto = aggregateNumericDomain(c, 'STRENGTH', [
      scoreTest(c, 'HANDGRIP', 55, male28),
      scoreTest(c, 'WALL_SIT', 25, male28),
    ]);
    const bajo = aggregateNumericDomain(c, 'STRENGTH', [
      scoreTest(c, 'HANDGRIP', 35, male28),
      scoreTest(c, 'WALL_SIT', 58, male28),
    ]);
    expect(alto.weighted_score!).toBeGreaterThan(bajo.weighted_score!);
  });

  test('el flag de componente crítico identifica QUÉ test lo causó', () => {
    const { domains } = classifyNumericDomains(c, male28, [
      { test_key: 'HIP_AROM', value: 41 },       // CRITICAL
      { test_key: 'ANKLE_DF', value: 14 },
      { test_key: 'SHOULDER_ER', value: 65 },
    ]);
    const mob = domains.find((d) => d.domain === 'MOBILITY')!;
    expect(mob.classification).toBe('CRITICAL');
    expect(mob.critical_components).toEqual(['HIP_AROM']);
  });

  test('Aerobic funciona sólo con RHR (MVP)', () => {
    const { domains } = classifyNumericDomains(c, { age: 40, sex: 'FEMALE' }, [
      { test_key: 'RHR', value: 58 },
    ]);
    const aer = domains.find((d) => d.domain === 'AEROBIC')!;
    expect(aer.classification).toBe('FOUNDATION');
    expect(aer.tests).toHaveLength(1);
  });
});
