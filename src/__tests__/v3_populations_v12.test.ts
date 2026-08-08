/**
 * v1.2 — Bandas poblacionales derivadas de literatura (PROPOSED).
 * Fuentes: NHANES 1999-2008 (RHR), JOSPT 2018 (handgrip), Bohannon 2006 (5xSTS).
 * Estas bandas NO están firmadas clínicamente: el sistema las usa pero lo declara.
 */
import * as path from 'path';
import { loadCanonicalV3, compileCanonicalV3, CompiledV3 } from '../v3/canonical';
import { scoreTest } from '../v3/classification';
import { runAssessmentV3 } from '../v3/pipeline';
import { MissingCanonicalV3Error } from '../v3/models';

const DIR = path.join(__dirname, '..', '..', 'canonical-v3');
let c: CompiledV3;
let warnings: string[];
beforeAll(() => {
  const loaded = loadCanonicalV3(DIR);
  c = compileCanonicalV3(loaded);
  warnings = c.warnings;
});

const client = (age: number, sex: 'MALE' | 'FEMALE' = 'MALE') => ({ name: 'Test', age, sex });

describe('Trazabilidad: lo propuesto se declara, nunca se presenta como firmado', () => {
  test('el canonical advierte al cargar qué bandas están pendientes', () => {
    const w = warnings.find((x) => x.includes('PENDIENTE(S) DE APROBACIÓN CLÍNICA'));
    expect(w).toBeDefined();
    expect(w).toContain('RHR/AGE_18_30');
    expect(w).toContain('SIT_TO_STAND_5X/GENERAL_65_PLUS');
  });

  test('un resultado que usa banda propuesta lo marca', () => {
    const r = scoreTest(c, 'RHR', 62, client(25));
    expect(r.population_id).toBe('AGE_18_30');
    expect(r.population_pending_approval).toBe(true);
    expect(r.population_source).toContain('Ostchega');
  });

  test('una banda aprobada por Magnetia NO lleva la marca', () => {
    const r = scoreTest(c, 'HANDGRIP', 45, client(35));
    expect(r.population_id).toBe('MALE_30_50');
    expect(r.population_pending_approval).toBeUndefined();
  });

  test('la evaluación declara en su auditoría que usó bandas propuestas', () => {
    const r = runAssessmentV3(c, {
      client: client(25), health_gates: { red_flags: [] },
      test_results: [{ test_key: 'RHR', value: 62 }], movement_levels: [],
    });
    const w = r.audit_trail.warnings.find((x) => x.includes('Esta evaluación usó'));
    expect(w).toBeDefined();
    expect(w).toContain('Resting Heart Rate');
  });
});

describe('RHR 18-30 (NHANES 1999-2008)', () => {
  test('un cliente de 25 años ya tiene dominio Aeróbico (antes quedaba bloqueado)', () => {
    const r = runAssessmentV3(c, {
      client: client(25), health_gates: { red_flags: [] },
      test_results: [{ test_key: 'RHR', value: 62 }], movement_levels: [],
    });
    const aerobic = r.domains.find((d) => d.domain === 'AEROBIC');
    expect(aerobic).toBeDefined();
    // 62 bpm → ((90-62)/(90-60))×3 = 2.8 → FOUNDATION
    expect(aerobic!.classification).toBe('FOUNDATION');
  });

  test('coincide con la banda 30-50 (NHANES agrupa 20-39, sin diferencia)', () => {
    const joven = scoreTest(c, 'RHR', 70, client(25));
    const adulto = scoreTest(c, 'RHR', 70, client(40));
    expect(joven.score_0_3).toBe(adulto.score_0_3);
    expect(joven.classification).toBe(adulto.classification);
  });

  test('la media poblacional de NHANES (71 bpm) cae en FUNCTIONAL', () => {
    expect(scoreTest(c, 'RHR', 71, client(25)).classification).toBe('FUNCTIONAL');
  });

  test('HALLAZGO: el P95 poblacional (89 bpm) ya clasifica CRITICAL', () => {
    // Con critical=90 y foundation=60, un RHR de 89 da score 0.1 → CRITICAL.
    // Es decir: ~5% de la población adulta sana entra en CRITICAL por RHR.
    // Puede ser intencional (HTC es exigente), pero está reportado a HTC
    // porque afecta a la banda 30-50 ya APROBADA, no sólo a la propuesta.
    const r = scoreTest(c, 'RHR', 89, client(25));
    expect(r.score_0_3).toBeCloseTo(0.1, 2);
    expect(r.classification).toBe('CRITICAL');
    // Mismo comportamiento en la banda aprobada: no es un efecto de v1.2.
    expect(scoreTest(c, 'RHR', 89, client(40)).classification).toBe('CRITICAL');
  });
});

describe('Handgrip 18-20 (JOSPT 2018)', () => {
  test('un cliente de 19 años se evalúa con la banda 18-20', () => {
    const r = scoreTest(c, 'HANDGRIP', 45, client(19));
    expect(r.population_id).toBe('MALE_18_20');
    expect(r.population_pending_approval).toBe(true);
  });

  test('mujer de 18 años usa la banda femenina', () => {
    const r = scoreTest(c, 'HANDGRIP', 28, client(18, 'FEMALE'));
    expect(r.population_id).toBe('FEMALE_18_20');
    // ((28-20)/(36-20))×3 = 1.5 exacto → EMERGING por la regla de borde.
    expect(r.score_0_3).toBeCloseTo(1.5, 3);
    expect(r.classification).toBe('EMERGING');
  });

  test('los umbrales son los mismos que 20-30 (no se inventaron valores)', () => {
    const joven = scoreTest(c, 'HANDGRIP', 45, client(19));
    const adulto = scoreTest(c, 'HANDGRIP', 45, client(25));
    expect(joven.umbral_critical).toBe(adulto.umbral_critical);
    expect(joven.umbral_foundation).toBe(adulto.umbral_foundation);
  });
});

describe('5xSTS 65+ (Bohannon 2006 — riesgo de caídas)', () => {
  test('un cliente de 70 años se evalúa con la banda 65+', () => {
    const r = scoreTest(c, 'SIT_TO_STAND_5X', 13, client(70));
    expect(r.population_id).toBe('GENERAL_65_PLUS');
  });

  test('13 s a los 70 años → FOUNDATION (norma de 70-79 es 12.6 s)', () => {
    const r = scoreTest(c, 'SIT_TO_STAND_5X', 13, client(70));
    expect(r.score_0_3).toBeCloseTo(2.625, 2);
    expect(r.classification).toBe('FOUNDATION');
  });

  test('16 s → EMERGING: supera el corte de caídas recurrentes (>15 s)', () => {
    const r = scoreTest(c, 'SIT_TO_STAND_5X', 16, client(70));
    expect(r.classification).toBe('EMERGING');
  });

  test('CLAVE — con los umbrales de adulto, ese mismo cliente quedaría FUNCTIONAL', () => {
    // Justificación de por qué 65+ necesita banda propia y más estricta:
    // 16 s en un mayor implica riesgo de caídas; con la banda 18-65 se
    // clasificaría como FUNCTIONAL y el riesgo pasaría desapercibido.
    const mayor = scoreTest(c, 'SIT_TO_STAND_5X', 16, client(70));
    const adulto = scoreTest(c, 'SIT_TO_STAND_5X', 16, client(45));
    expect(adulto.classification).toBe('FUNCTIONAL');
    expect(mayor.classification).toBe('EMERGING');
  });

  test('21 s → CRITICAL', () => {
    expect(scoreTest(c, 'SIT_TO_STAND_5X', 21, client(70)).classification).toBe('CRITICAL');
  });

  test('un cliente de 18 años ya entra en la banda general', () => {
    const r = scoreTest(c, 'SIT_TO_STAND_5X', 14, client(18));
    expect(r.population_id).toBe('GENERAL_18_20');
    expect(r.population_pending_approval).toBe(true);
  });

  test('extender a 18 años NO contamina la banda adulta ya aprobada', () => {
    // 18-19 va en banda propia justamente para que un adulto de 20-65 siga
    // usando la banda firmada por Magnetia, sin marca de provisional.
    const adulto = scoreTest(c, 'SIT_TO_STAND_5X', 14, client(45));
    expect(adulto.population_id).toBe('GENERAL_20_65');
    expect(adulto.population_pending_approval).toBeUndefined();
  });
});

describe('Menores de 18: se mantiene el bloqueo deliberado', () => {
  test('handgrip a los 16 años sigue fallando fuerte', () => {
    expect(() => scoreTest(c, 'HANDGRIP', 35, client(16))).toThrow(MissingCanonicalV3Error);
  });

  test('RHR a los 15 años sigue fallando fuerte', () => {
    expect(() => scoreTest(c, 'RHR', 70, client(15))).toThrow(/no tiene umbrales/);
  });

  test('5xSTS a los 17 años sigue fallando fuerte', () => {
    expect(() => scoreTest(c, 'SIT_TO_STAND_5X', 14, client(17))).toThrow(MissingCanonicalV3Error);
  });
});
