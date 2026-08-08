/**
 * HTC v3 — Canonical Loader + Compiler.
 * Carga canonical-v3/*.yaml, valida estructura e integridad referencial y
 * precomputa índices. Falla fuerte ante cualquier dato faltante.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { z } from 'zod';
import {
  AlertFlagDef, AlertFlagSchema, AssignmentRules, AssignmentRulesSchema,
  CanonicalVersionsSchema, Classification, ClassificationConfig, ClassificationConfigSchema,
  DomainKey, DomainSchema, DomainV3, MissingCanonicalV3Error, MovementLevelDef,
  MovementLevelSchema, ProgrammingConstraintDef, ProgrammingConstraintSchema,
  RedFlagV3, RedFlagV3Schema, ScoringConfig, ScoringConfigSchema, StopGateDef,
  StopGateSchema, TestDefSchema, TestDefV3, VersionSnapshotV3,
} from './models';

export interface LanguageMappingV3 {
  default_language: string;
  languages: string[];
  audiences: string[];
  verification_status?: string;
  labels: Record<string, Record<string, { es: string; en: string }>>;
  reasons: Record<string, { COACH: { es: string; en: string }; CLIENT: { es: string; en: string }; source?: string }>;
  report_sections: Array<{ id: string; es: string; en: string }>;
}

export interface CanonicalV3 {
  versions: VersionSnapshotV3;
  domains: DomainV3[];
  classificationConfig: ClassificationConfig;
  scoring: ScoringConfig;
  tests: TestDefV3[];
  movementLevels: MovementLevelDef[];
  movementAggregation: { method: string; logic: string; critical_component_rule: boolean };
  movementConstraints: ProgrammingConstraintDef[];
  movementP1Focus: Record<string, { focus: string; duration_weeks: [number, number]; constraint: string }>;
  challengeOrder: string[];
  rubrics: Record<string, Record<string, Record<string, string>>>;
  stopGates: StopGateDef[];
  alertFlags: AlertFlagDef[];
  redFlags: RedFlagV3[];
  assignmentRules: AssignmentRules;
  ranking: { primary: string; tiebreak_1: string; tiebreak_2: string };
  domainIterationOrder: string[];
  sessionDefaultMinutes: number;
  language: LanguageMappingV3;
}

export interface CompiledV3 {
  raw: CanonicalV3;
  domainByKey: Map<DomainKey, DomainV3>;
  testByKey: Map<string, TestDefV3>;
  testsByDomain: Map<DomainKey, TestDefV3[]>;
  movementLevelById: Map<string, MovementLevelDef>;
  /** Niveles ordenados por sequence_number. */
  movementLevelsOrdered: MovementLevelDef[];
  redFlagById: Map<string, RedFlagV3>;
  warnings: string[];
}

function readYaml(dir: string, file: string): Record<string, unknown> {
  const p = path.join(dir, file);
  if (!fs.existsSync(p)) {
    throw new MissingCanonicalV3Error(`${file} no encontrado en ${dir}. Canonical v3 incompleto.`);
  }
  try {
    return (yaml.load(fs.readFileSync(p, 'utf8')) ?? {}) as Record<string, unknown>;
  } catch (e) {
    throw new MissingCanonicalV3Error(`${file} tiene YAML inválido: ${e instanceof Error ? e.message : 'desconocido'}`);
  }
}

function parse<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const res = schema.safeParse(value);
  if (!res.success) {
    throw new MissingCanonicalV3Error(
      `${what} inválido: ${res.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  }
  return res.data;
}

function parseArray<T>(schema: z.ZodType<T>, items: unknown, what: string): T[] {
  if (!Array.isArray(items)) throw new MissingCanonicalV3Error(`${what} debe ser una lista.`);
  return items.map((item, i) => parse(schema, item, `${what}[${i}]`));
}

export function loadCanonicalV3(dir: string): CanonicalV3 {
  // canonical_versions.yaml
  const versionsFile = readYaml(dir, 'canonical_versions.yaml');
  const cv = parse(CanonicalVersionsSchema, versionsFile.canonical_versions, 'canonical_versions');

  // domains_taxonomy.yaml
  const taxonomy = readYaml(dir, 'domains_taxonomy.yaml');
  const domains = parseArray(DomainSchema, taxonomy.domains, 'domains');
  const classificationConfig = parse(ClassificationConfigSchema, taxonomy.classification, 'classification');

  // tests_and_thresholds.yaml
  const thresholdsFile = readYaml(dir, 'tests_and_thresholds.yaml');
  const scoring = parse(ScoringConfigSchema, thresholdsFile.scoring, 'scoring');
  const tests = parseArray(TestDefSchema, thresholdsFile.tests, 'tests');

  // movement_standard.yaml
  const movementFile = readYaml(dir, 'movement_standard.yaml');
  const movementLevels = parseArray(MovementLevelSchema, movementFile.levels, 'movement levels');
  const md = movementFile.movement_domain as Record<string, unknown>;
  const movementAggregation = {
    method: String(md?.aggregation_method ?? ''),
    logic: String(md?.aggregation_logic ?? ''),
    critical_component_rule: Boolean(md?.critical_component_rule),
  };
  const movementConstraints = parseArray(
    ProgrammingConstraintSchema, movementFile.programming_constraints, 'programming_constraints',
  );

  // movement_observation_rubrics.yaml
  const rubricsFile = readYaml(dir, 'movement_observation_rubrics.yaml');
  const rubrics = (rubricsFile.rubrics ?? {}) as CanonicalV3['rubrics'];

  // health_gates.yaml
  const gatesFile = readYaml(dir, 'health_gates.yaml');
  const stopGates = parseArray(StopGateSchema, gatesFile.stop_gates, 'stop_gates');
  const alertFlags = parseArray(AlertFlagSchema, gatesFile.alert_flags, 'alert_flags');
  const redFlags = parseArray(RedFlagV3Schema, gatesFile.red_flags, 'red_flags');

  // development_priority_assignment.yaml
  const priorityFile = readYaml(dir, 'development_priority_assignment.yaml');
  const assignmentRules = parse(AssignmentRulesSchema, priorityFile.assignment_rules, 'assignment_rules');
  const rankingRaw = priorityFile.ranking as Record<string, string>;
  const sessionArch = priorityFile.session_architecture as Record<string, number>;

  // language_mapping.yaml
  const langFile = readYaml(dir, 'language_mapping.yaml') as unknown as LanguageMappingV3;

  return {
    versions: {
      os_version: cv.os_version.current,
      clinical_specification_version: cv.clinical_specification_version.current,
      thresholds_version: cv.thresholds_version.current,
      movement_standard_version: cv.movement_standard_version.current,
      decision_engine_version: cv.decision_engine_version.current,
      report_template_version: cv.report_template_version.current,
      frozen_at: '',
    },
    domains,
    classificationConfig,
    scoring,
    tests,
    movementLevels,
    movementAggregation,
    movementConstraints,
    movementP1Focus: (movementFile.p1_focus_by_level ?? {}) as CanonicalV3['movementP1Focus'],
    challengeOrder: (movementFile.challenge_order ?? []) as string[],
    rubrics,
    stopGates,
    alertFlags,
    redFlags,
    assignmentRules,
    ranking: {
      primary: rankingRaw?.primary ?? '',
      tiebreak_1: rankingRaw?.tiebreak_1 ?? '',
      tiebreak_2: rankingRaw?.tiebreak_2 ?? '',
    },
    domainIterationOrder: (priorityFile.domain_iteration_order ?? []) as string[],
    sessionDefaultMinutes: Number(sessionArch?.default_total_minutes ?? 60),
    language: langFile,
  };
}

export function compileCanonicalV3(canonical: CanonicalV3): CompiledV3 {
  const warnings: string[] = [];
  const domainByKey = new Map(canonical.domains.map((d) => [d.key, d]));
  const testByKey = new Map(canonical.tests.map((t) => [t.key, t]));
  const movementLevelById = new Map(canonical.movementLevels.map((l) => [l.level_id, l]));
  const redFlagById = new Map(canonical.redFlags.map((f) => [f.id, f]));

  // Integridad referencial
  for (const t of canonical.tests) {
    if (!domainByKey.has(t.domain)) {
      throw new MissingCanonicalV3Error(`test ${t.key} referencia dominio desconocido ${t.domain}`);
    }
    for (const p of t.populations) {
      if (p.umbral_critical === p.umbral_foundation) {
        throw new MissingCanonicalV3Error(
          `test ${t.key} población ${p.id}: umbral_critical == umbral_foundation (división por cero en la interpolación)`,
        );
      }
      // Validation rule del schema: critical < foundation (o inverso).
      const ascending = p.umbral_foundation > p.umbral_critical;
      if (ascending === t.is_inverse) {
        throw new MissingCanonicalV3Error(
          `test ${t.key} población ${p.id}: la dirección de los umbrales no coincide con is_inverse=${t.is_inverse}`,
        );
      }
    }
  }

  for (const c of canonical.movementConstraints) {
    if (!movementLevelById.has(c.when_level)) {
      throw new MissingCanonicalV3Error(`constraint ${c.id} referencia nivel desconocido ${c.when_level}`);
    }
  }

  // Todo reason_id usado por gates/flags debe existir en language_mapping.
  const reasons = canonical.language.reasons ?? {};
  for (const g of canonical.stopGates) {
    if (!reasons[g.reason_id]) {
      throw new MissingCanonicalV3Error(`stop gate ${g.gate_id} usa reason ${g.reason_id} inexistente en language_mapping`);
    }
  }
  for (const f of canonical.alertFlags) {
    if (!reasons[f.reason_id]) {
      throw new MissingCanonicalV3Error(`alert flag ${f.flag_id} usa reason ${f.reason_id} inexistente en language_mapping`);
    }
  }

  // Pesos declarados vs total_weight del dominio.
  const testsByDomain = new Map<DomainKey, TestDefV3[]>();
  for (const t of canonical.tests) {
    testsByDomain.set(t.domain, [...(testsByDomain.get(t.domain) ?? []), t]);
  }
  for (const d of canonical.domains) {
    const declared = d.aggregation.total_weight;
    if (declared == null) continue;
    const sum = (testsByDomain.get(d.key) ?? []).reduce((acc, t) => acc + (t.weight ?? 0), 0);
    if (Math.abs(sum - declared) > 1e-9) {
      throw new MissingCanonicalV3Error(
        `dominio ${d.key}: la suma de pesos (${sum}) no coincide con total_weight declarado (${declared})`,
      );
    }
  }

  // Rubrics deben cubrir todas las variables declaradas por cada nivel.
  for (const level of canonical.movementLevels) {
    const rubric = canonical.rubrics[level.level_id];
    if (!rubric) {
      warnings.push(`No hay rubric para el nivel ${level.level_id}; el coach deberá declarar la clasificación.`);
      continue;
    }
    for (const v of level.observation_variables) {
      if (!rubric[v]) warnings.push(`Rubric de ${level.level_id} no cubre la variable "${v}".`);
    }
  }

  if (canonical.language.verification_status === 'DRAFT') {
    warnings.push('language_mapping v3 está en DRAFT: los textos requieren validación de HTC.');
  }

  // Poblaciones derivadas de literatura por el equipo de plataforma, aún sin
  // firma clínica. Se usan (para no dejar clientes sin evaluar) pero se declaran.
  const proposed = canonical.tests.flatMap((t) =>
    t.populations.filter((p) => p.approval_status === 'PROPOSED').map((p) => `${t.key}/${p.id}`),
  );
  if (proposed.length > 0) {
    warnings.push(
      `${proposed.length} banda(s) poblacional(es) PENDIENTE(S) DE APROBACIÓN CLÍNICA: ${proposed.join(', ')}. ` +
      'Derivadas de literatura por el equipo de plataforma; requieren firma de HTC. Ver PROPUESTA_POBLACIONES_v1.2.md.',
    );
  }

  return {
    raw: canonical,
    domainByKey,
    testByKey,
    testsByDomain,
    movementLevelById,
    movementLevelsOrdered: [...canonical.movementLevels].sort((a, b) => a.sequence_number - b.sequence_number),
    redFlagById,
    warnings,
  };
}

/** Congela las versiones canónicas para un assessment (Principio 6). */
export function freezeVersionsV3(compiled: CompiledV3): VersionSnapshotV3 {
  return { ...compiled.raw.versions, frozen_at: new Date().toISOString() };
}

/** Resuelve el texto de un reason_id. Falla fuerte si no existe. */
export function resolveReasonV3(
  compiled: CompiledV3,
  reasonId: string,
  audience: 'COACH' | 'CLIENT',
  language: 'es' | 'en',
): string {
  const entry = compiled.raw.language.reasons?.[reasonId];
  if (!entry) throw new MissingCanonicalV3Error(`No hay texto para ${reasonId} en language_mapping.yaml`);
  const text = entry[audience]?.[language];
  if (!text) throw new MissingCanonicalV3Error(`Falta texto de ${reasonId} para ${audience}/${language}`);
  return text;
}

export function resolveLabelV3(
  compiled: CompiledV3,
  group: string,
  key: string,
  language: 'es' | 'en',
): string {
  const entry = compiled.raw.language.labels?.[group]?.[key];
  if (!entry) throw new MissingCanonicalV3Error(`Falta label ${group}.${key}`);
  return entry[language];
}

/** Clasifica un score 0-3 con redondeo CONSERVADOR (peor clase en el borde). */
export function classifyScore(compiled: CompiledV3, score: number): Classification {
  const b = compiled.raw.classificationConfig.score_boundaries;
  if (score <= b.critical_max) return 'CRITICAL';
  if (score <= b.emerging_max) return 'EMERGING';
  if (score <= b.functional_max) return 'FUNCTIONAL';
  return 'FOUNDATION';
}
