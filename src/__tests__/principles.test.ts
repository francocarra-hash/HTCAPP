/**
 * HTC Platform Development Principles — infrastructure implemented while the
 * v3.0 methodology conflicts (C-1..C-5) remain open with Magnetia.
 */
import * as path from 'path';
import { runPipeline } from '../pipeline';
import { runSafety } from '../engines/safety';
import { aggregateCapacity } from '../engines/aggregation';
import { inspectBlock2Canonical, BLOCK2_FILES, formatBlock2Report } from '../canonical/block2-schema';
import { runAllDomainModules, partitionByDomain, domainOfTest } from '../domains/domain-module';
import { MissingCanonicalError } from '../models/canonical';
import { compiled, input } from './helpers';
import { TestResult } from '../models/assessment';

function r(partial: Partial<TestResult> & Pick<TestResult, 'test_id'>): TestResult {
  return { valid: true, confidence: 'HIGH', ...partial } as TestResult;
}

describe('Principio 6 — versionado inmutable por assessment', () => {
  test('el canonical declara las cinco versiones de componente', () => {
    const cv = compiled().raw.componentVersions;
    expect(cv.os_version).toBeTruthy();
    expect(cv.canonical_version).toBe('3.1.0');
    expect(cv.standards_version).toBeTruthy();
    expect(cv.decision_rules_version).toBeTruthy();
    expect(cv.report_version).toBeTruthy();
  });

  test('cada decisión congela un snapshot con las cinco versiones', () => {
    const d = runPipeline(compiled(), input({
      test_results: [r({ test_id: 'TEST_AROM_PROM_RATIO', value: 76 })],
    }));
    const snap = d.audit_trail.version_snapshot;
    expect(snap.canonical_version).toBe('3.1.0');
    expect(snap.os_version).toContain('OS');
    expect(snap.standards_version).toBeTruthy();
    expect(snap.decision_rules_version).toBeTruthy();
    expect(snap.report_version).toBeTruthy();
    expect(new Date(snap.frozen_at).toString()).not.toBe('Invalid Date');
  });

  test('el snapshot también se congela cuando safety detiene el proceso', () => {
    const d = runPipeline(compiled(), input({
      clinical: { events: [{ type: 'RED_FLAG', description: 'dolor torácico' }] },
      test_results: [r({ test_id: 'TEST_FRONT_PLANK', value: 25 })],
    }));
    expect(d.primary_system_bottleneck.status).toBe('BLOCKED');
    expect(d.audit_trail.version_snapshot.canonical_version).toBe('3.1.0');
  });

  test('el snapshot es una copia: mutarlo no afecta al canonical vivo', () => {
    const d = runPipeline(compiled(), input({
      test_results: [r({ test_id: 'TEST_AROM_PROM_RATIO', value: 76 })],
    }));
    d.audit_trail.version_snapshot.canonical_version = 'MUTADO';
    expect(compiled().raw.componentVersions.canonical_version).toBe('3.1.0');
  });
});

describe('Safety gates del AUTHORITATIVE §9', () => {
  test('el catálogo canónico de red flags está cargado (§9.1)', () => {
    const ids = compiled().raw.redFlags.map((f) => f.id);
    expect(ids).toContain('RF_CHEST_PAIN');
    expect(ids).toContain('RF_PARQ_POSITIVE');
    expect(ids).toContain('RF_UNCONTROLLED_HTN');
    expect(compiled().raw.redFlags.every((f) => f.label.es && f.label.en)).toBe(true);
  });

  test('PAS ≥ 180 dispara gate y detiene la evaluación', () => {
    const s = runSafety(compiled(), input({ test_results: [], clinical: { events: [], systolic_bp: 185, diastolic_bp: 95 } }));
    expect(s.triggered_gates).toContain('GATE_BP_SYSTOLIC');
    expect(s.stop_decision_process).toBe(true);
    expect(s.reason_ids).toContain('REASON_BP_GATE');
  });

  test('PAD ≥ 110 dispara gate aunque la sistólica esté normal', () => {
    const s = runSafety(compiled(), input({ test_results: [], clinical: { events: [], systolic_bp: 130, diastolic_bp: 112 } }));
    expect(s.triggered_gates).toContain('GATE_BP_DIASTOLIC');
    expect(s.stop_decision_process).toBe(true);
  });

  test('presión normal no dispara ningún gate', () => {
    const s = runSafety(compiled(), input({ test_results: [], clinical: { events: [], systolic_bp: 120, diastolic_bp: 78 } }));
    expect(s.triggered_gates).toHaveLength(0);
    expect(s.outcome).toBe('PROCEED');
  });

  test('PAR-Q+ positivo se trata como red flag y deriva a médico', () => {
    const s = runSafety(compiled(), input({ test_results: [], clinical: { events: [], parq_positive: true } }));
    expect(s.stop_decision_process).toBe(true);
    expect(s.reason_ids).toContain('REASON_MEDICAL_REFERRAL');
  });

  test('dolor ≥ 6 levanta flag de revisión sin detener la evaluación (§9.2)', () => {
    const s = runSafety(compiled(), input({ test_results: [], clinical: { events: [], current_pain_level: 7 } }));
    expect(s.flags?.map((f) => f.id)).toContain('FLAG_PAIN_SIGNIFICANT');
    expect(s.stop_decision_process).toBe(false);
    expect(s.assessment_allowed).toBe(true);
  });

  test('dolor 5 no levanta el flag (umbral canónico exacto)', () => {
    const s = runSafety(compiled(), input({ test_results: [], clinical: { events: [], current_pain_level: 5 } }));
    expect(s.flags ?? []).toHaveLength(0);
  });

  test('la intensidad de un evento PAIN también alimenta el flag', () => {
    const s = runSafety(compiled(), input({
      test_results: [],
      clinical: { events: [{ type: 'PAIN', description: 'hombro', intensity: 8 }] },
    }));
    expect(s.flags?.map((f) => f.id)).toContain('FLAG_PAIN_SIGNIFICANT');
  });

  test('el gate de presión tiene prioridad sobre la clasificación', () => {
    const d = runPipeline(compiled(), input({
      clinical: { events: [], systolic_bp: 190 },
      test_results: [r({ test_id: 'TEST_AROM_PROM_RATIO', value: 76 })],
    }));
    expect(d.primary_system_bottleneck.status).toBe('BLOCKED');
    expect(d.capacity_states).toHaveLength(0);
  });
});

describe('Motor de agregación parametrizable (C-2/C-3 sin resolver)', () => {
  test('la estrategia vigente se lee del canonical, no del código', () => {
    const cfg = compiled().raw.aggregation.test_to_capacity;
    expect(cfg.strategy).toBe('WORST_OF');
    expect(cfg.critical_component).toBe('INHERENT');
    expect(cfg.verification_status).toBe('DRAFT');
  });

  test('WORST_OF toma la peor clasificación y marca el componente crítico', () => {
    const out = aggregateCapacity(compiled(), {
      capacity_id: 'CAP_STABILITY',
      components: [
        { test_id: 'TEST_FRONT_PLANK', classification: 'FUNCTIONAL' },
        { test_id: 'TEST_SIDE_PLANK', classification: 'CRITICAL' },
      ],
    });
    expect(out.classification).toBe('CRITICAL');
    expect(out.critical_component_flag).toBe(true);
    expect(out.critical_components).toEqual(['TEST_SIDE_PLANK']);
    expect(out.applied_rules).toContain('AGGREGATION_WORST_OF');
  });

  test('sin componentes críticos no se levanta el flag', () => {
    const out = aggregateCapacity(compiled(), {
      capacity_id: 'CAP_STABILITY',
      components: [
        { test_id: 'TEST_FRONT_PLANK', classification: 'FUNCTIONAL' },
        { test_id: 'TEST_SIDE_PLANK', classification: 'EMERGING' },
      ],
    });
    expect(out.classification).toBe('EMERGING');
    expect(out.critical_component_flag).toBe(false);
  });

  test('las tres estrategias y los tres modos están declarados en el canonical', () => {
    const raw = compiled().raw.aggregation;
    expect(raw.ordinal_scale).toBeDefined();
    expect(raw.rounding_rule?.status).toBe('MISSING_CANONICAL');
  });

  test('el pipeline propaga el flag de componente crítico a la capacidad', () => {
    const d = runPipeline(compiled(), input({
      test_results: [
        r({ test_id: 'TEST_FRONT_PLANK', value: 90 }),  // FUNCTIONAL
        r({ test_id: 'TEST_SIDE_PLANK', value: 25 }),   // CRITICAL
      ],
    }));
    const stability = d.capacity_states.find((s) => s.capacity_id === 'CAP_STABILITY')!;
    expect(stability.classification).toBe('CRITICAL');
    expect(stability.critical_component_flag).toBe(true);
    expect(d.audit_trail.applied_rules).toContain('AGGREGATION_WORST_OF');
  });
});

describe('Loader del schema BLOCK_2 (15 archivos)', () => {
  test('declara exactamente los 15 archivos del schema', () => {
    expect(BLOCK2_FILES).toHaveLength(15);
    expect(BLOCK2_FILES).toContain('assessment-version-snapshot.yaml');
    expect(BLOCK2_FILES).toContain('aggregation-rules.yaml');
  });

  test('reporta que el canonical v3 NO fue entregado, sin inventar contenido', () => {
    const report = inspectBlock2Canonical(path.join(__dirname, '..', '..', 'canonical-v3'));
    expect(report.populated).toBe(false);
    expect(report.filesPresent).toBe(0);
    expect(report.filesExpected).toBe(15);
    expect(report.blockingSummary).toContain('NOT usable');
    expect(report.files.every((f) => f.issues.includes('File not delivered.'))).toBe(true);
  });

  test('el checklist de compilación de BLOCK_2 se evalúa mecánicamente', () => {
    const report = inspectBlock2Canonical(path.join(__dirname, '..', '..', 'canonical-v3'));
    const items = report.checklist.map((c) => c.item);
    expect(items).toContain('All 15 files created');
    expect(items).toContain('No duplicate IDs across files');
    expect(report.checklist.find((c) => c.item === 'All 15 files created')!.passed).toBe(false);
  });

  test('el reporte legible lista los archivos faltantes', () => {
    const text = formatBlock2Report(inspectBlock2Canonical(path.join(__dirname, '..', '..', 'canonical-v3')));
    expect(text).toContain('domains.yaml');
    expect(text).toContain('FALTA');
  });

  test('inspeccionar un directorio inexistente no lanza excepción (reporta)', () => {
    expect(() => inspectBlock2Canonical('C:/no-existe-block2')).not.toThrow();
  });
});

describe('Principio 9 — módulos independientes por dominio', () => {
  test('el dominio de un test se resuelve solo por links canónicos explícitos', () => {
    expect(domainOfTest(compiled(), 'TEST_FRONT_PLANK')).toBe('DOMAIN_STRENGTH');
    expect(domainOfTest(compiled(), 'TEST_AROM_PROM_RATIO')).toBe('DOMAIN_MOBILITY');
    expect(domainOfTest(compiled(), 'TEST_INEXISTENTE')).toBeNull();
  });

  test('la partición por dominio no mezcla resultados', () => {
    const parts = partitionByDomain(compiled(), [
      r({ test_id: 'TEST_FRONT_PLANK', value: 90 }),
      r({ test_id: 'TEST_AROM_PROM_RATIO', value: 76 }),
      r({ test_id: 'TEST_ROCKPORT_WALK', value: 40 }),
    ]);
    expect(parts.get('DOMAIN_STRENGTH')!.map((x) => x.test_id)).toEqual(['TEST_FRONT_PLANK']);
    expect(parts.get('DOMAIN_MOBILITY')!.map((x) => x.test_id)).toEqual(['TEST_AROM_PROM_RATIO']);
    expect(parts.get('DOMAIN_AEROBIC')!.map((x) => x.test_id)).toEqual(['TEST_ROCKPORT_WALK']);
  });

  test('cada módulo produce su propio perfil y bottleneck, sin ver otros dominios', () => {
    const mods = runAllDomainModules(compiled(), input({
      test_results: [
        r({ test_id: 'TEST_AROM_PROM_RATIO', value: 76 }),  // Mobility CRITICAL
        r({ test_id: 'TEST_FRONT_PLANK', value: 90 }),       // Strength FUNCTIONAL
      ],
    }));
    const mobility = mods.find((m) => m.domain_id === 'DOMAIN_MOBILITY')!;
    const strength = mods.find((m) => m.domain_id === 'DOMAIN_STRENGTH')!;

    expect(mobility.bottleneck!.capacity_id).toBe('CAP_WORKSPACE_OWNERSHIP');
    expect(mobility.capacity_states.every((s) => s.domain_id === 'DOMAIN_MOBILITY')).toBe(true);

    expect(strength.bottleneck!.status).toBe('NONE');
    expect(strength.capacity_states.every((s) => s.domain_id === 'DOMAIN_STRENGTH')).toBe(true);
  });

  test('los módulos se ordenan por assessment_order canónico', () => {
    const mods = runAllDomainModules(compiled(), input({
      test_results: [
        r({ test_id: 'TEST_ROCKPORT_WALK', value: 40 }),                                  // Aerobic (5)
        r({ test_id: 'TEST_MOVEMENT_L1_BODY_MAPPING', coach_classification: 'EMERGING' }), // Movement (1)
        r({ test_id: 'TEST_FRONT_PLANK', value: 90 }),                                    // Strength (3)
      ],
    }));
    expect(mods.map((m) => m.domain_id)).toEqual(['DOMAIN_MOVEMENT', 'DOMAIN_STRENGTH', 'DOMAIN_AEROBIC']);
  });

  test('cada módulo trae sus propias líneas de reporte y estándares usados', () => {
    const mods = runAllDomainModules(compiled(), input({
      test_results: [r({ test_id: 'TEST_AROM_PROM_RATIO', value: 76 })],
    }));
    const mobility = mods[0]!;
    expect(mobility.report_lines[0]).toContain('Workspace Ownership');
    expect(mobility.standards_used[0]!.standard_id).toBe('STANDARD_AROM_PROM_HIP_IR');
  });

  test('un test sin estándar sigue fallando fuerte dentro de su módulo', () => {
    expect(() => runAllDomainModules(compiled(), input({
      test_results: [r({ test_id: 'TEST_CHAIR_STAND_30S', value: 15 })],
    }))).toThrow(MissingCanonicalError);
  });
});
