/**
 * HTC v3 — Data Model.
 * Tipos y schemas del modelo clínico definido por HTC_PLATFORM_CLINICAL_SPECIFICATION_v1.0
 * y HTC_YAML_SCHEMA_UPDATED_POST_C5_v1.0 (C-1 a C-5 resueltos).
 *
 * El código no contiene conocimiento HTC: sólo la forma de los datos.
 */
import { z } from 'zod';

// ── Escalas y enums canónicos ───────────────────────────────────────────────
export const Classification = z.enum(['CRITICAL', 'EMERGING', 'FUNCTIONAL', 'FOUNDATION']);
export type Classification = z.infer<typeof Classification>;

export const DomainKey = z.enum(['STRENGTH', 'MOBILITY', 'AEROBIC', 'MOVEMENT']);
export type DomainKey = z.infer<typeof DomainKey>;

export const DevelopmentRole = z.enum([
  'P1', 'P1_PRIMARY', 'P1_SECONDARY', 'P2', 'SUPPORT', 'MAINTAIN', 'MONITOR', 'DEFER',
]);
export type DevelopmentRole = z.infer<typeof DevelopmentRole>;

export const HealthState = z.enum(['PASS', 'FLAGGED', 'BLOCKED']);
export type HealthState = z.infer<typeof HealthState>;

export const MovementLevelId = z.enum(['L1_IBM', 'L2_DC', 'L3_MC', 'L4_MPS']);
export type MovementLevelId = z.infer<typeof MovementLevelId>;

/** Códigos canónicos: 3 = peor … 0 = mejor (CLINICAL_SPEC "Classification Rule"). */
export const CLASSIFICATION_CODE: Record<Classification, number> = {
  CRITICAL: 3, EMERGING: 2, FUNCTIONAL: 1, FOUNDATION: 0,
};

/** Error que se lanza cuando falta un dato canónico. Nunca se inventa. */
export class MissingCanonicalV3Error extends Error {
  constructor(message: string) {
    super(`MISSING CANONICAL (v3): ${message}`);
    this.name = 'MissingCanonicalV3Error';
  }
}

// ── canonical_versions.yaml ─────────────────────────────────────────────────
export const CanonicalVersionsSchema = z.object({
  os_version: z.object({ current: z.string() }),
  clinical_specification_version: z.object({ current: z.string() }),
  thresholds_version: z.object({ current: z.string() }),
  movement_standard_version: z.object({ current: z.string(), levels: z.number().optional() }),
  decision_engine_version: z.object({ current: z.string() }),
  report_template_version: z.object({ current: z.string() }),
});
export type CanonicalVersionsRaw = z.infer<typeof CanonicalVersionsSchema>;

/** Snapshot inmutable congelado por assessment (Principio 6 / C-1..C-5). */
export interface VersionSnapshotV3 {
  os_version: string;
  clinical_specification_version: string;
  thresholds_version: string;
  movement_standard_version: string;
  decision_engine_version: string;
  report_template_version: string;
  frozen_at: string;
}

// ── domains_taxonomy.yaml ───────────────────────────────────────────────────
export const DomainSchema = z.object({
  id: z.string(),
  key: DomainKey,
  name: z.string(),
  tier: z.number(),
  order: z.number(),
  is_developable: z.boolean(),
  impact_factor: z.number(),
  critical_component_rule: z.boolean(),
  scale: z.string().optional(),
  scale_mvp: z.string().optional(),
  aggregation: z.object({
    method: z.string(),
    total_weight: z.number().optional(),
    total_weight_mvp: z.number().optional(),
    logic: z.string().optional(),
  }),
  capacity_names: z.array(z.string()).optional(),
  level_names: z.array(z.string()).optional(),
  source: z.string(),
});
export type DomainV3 = z.infer<typeof DomainSchema>;

export const ClassificationConfigSchema = z.object({
  states: z.array(Classification),
  codes: z.record(z.number()),
  score_boundaries: z.object({
    critical_max: z.number(),
    emerging_max: z.number(),
    functional_max: z.number(),
  }),
  rounding: z.enum(['CONSERVATIVE']),
  rounding_rule: z.string(),
});
export type ClassificationConfig = z.infer<typeof ClassificationConfigSchema>;

// ── tests_and_thresholds.yaml ───────────────────────────────────────────────
export const PopulationThresholdSchema = z.object({
  id: z.string(),
  sex: z.enum(['MALE', 'FEMALE']).nullable(),
  age_min: z.number().nullable(),
  age_max: z.number().nullable(),
  umbral_critical: z.number(),
  umbral_emerging: z.number(),
  umbral_functional: z.number(),
  umbral_foundation: z.number(),
  source: z.string().optional(),
  /**
   * APPROVED  — firmado por la autoridad clínica (Magnetia).
   * PROPOSED  — derivado de literatura por el equipo de plataforma; usable,
   *             pero pendiente de aprobación clínica. Se advierte al cargar
   *             y se marca en la UI. Nunca se presenta como canónico firmado.
   */
  approval_status: z.enum(['APPROVED', 'PROPOSED']).optional(),
  evidence: z.string().optional(),
  rationale: z.string().optional(),
});
export type PopulationThreshold = z.infer<typeof PopulationThresholdSchema>;

export const TestDefSchema = z.object({
  test_id: z.string(),
  key: z.string(),
  name: z.string(),
  domain: DomainKey,
  unit: z.string(),
  weight: z.number().optional(),
  weight_v2: z.number().optional(),
  is_inverse: z.boolean(),
  required_in_mvp: z.boolean().optional(),
  optional_in_mvp: z.boolean().optional(),
  requires_medical_clearance: z.boolean().optional(),
  source: z.string(),
  populations: z.array(PopulationThresholdSchema),
});
export type TestDefV3 = z.infer<typeof TestDefSchema>;

export const ScoringConfigSchema = z.object({
  formula: z.string(),
  clamp: z.tuple([z.number(), z.number()]),
  note: z.string().optional(),
});
export type ScoringConfig = z.infer<typeof ScoringConfigSchema>;

// ── movement_standard.yaml ──────────────────────────────────────────────────
export const MovementClassificationRuleSchema = z.object({
  FOUNDATION: z.record(z.unknown()),
  FUNCTIONAL: z.record(z.unknown()),
  EMERGING: z.record(z.unknown()),
  CRITICAL: z.record(z.unknown()),
});

export const MovementLevelSchema = z.object({
  level_id: MovementLevelId,
  sequence_number: z.number(),
  name: z.string(),
  description: z.string(),
  duration_assessment_min: z.number(),
  prerequisite: z.string().nullable(),
  progression_gate: z.string().nullable(),
  observation_variables: z.array(z.string()),
  output_ceiling: z.string().optional(),
  challenges: z.array(z.string()).optional(),
  typical_duration_weeks: z.record(z.number()),
  training_volume_percent: z.record(z.number()),
  classification_rule: MovementClassificationRuleSchema,
});
export type MovementLevelDef = z.infer<typeof MovementLevelSchema>;

export const ProgrammingConstraintSchema = z.object({
  id: z.string(),
  when_level: MovementLevelId,
  when_classification: z.array(Classification),
  description: z.string(),
  affected_domains: z.array(z.string()),
  mitigation: z.string(),
});
export type ProgrammingConstraintDef = z.infer<typeof ProgrammingConstraintSchema>;

// ── health_gates.yaml ───────────────────────────────────────────────────────
export const StopGateSchema = z.object({
  gate_id: z.string(),
  name: z.string(),
  input: z.string(),
  symptom_id: z.string().optional(),
  operator: z.string().optional(),
  threshold: z.number().optional(),
  unit: z.string().optional(),
  trigger: z.string().optional(),
  action: z.string(),
  reason_id: z.string(),
});
export type StopGateDef = z.infer<typeof StopGateSchema>;

export const AlertFlagSchema = z.object({
  flag_id: z.string(),
  name: z.string(),
  input: z.string(),
  operator: z.string(),
  threshold: z.number().optional(),
  range: z.tuple([z.number(), z.number()]).optional(),
  action: z.string(),
  severity: z.string(),
  reason_id: z.string(),
  source: z.string().optional(),
});
export type AlertFlagDef = z.infer<typeof AlertFlagSchema>;

export const RedFlagV3Schema = z.object({
  id: z.string(),
  label: z.object({ es: z.string(), en: z.string() }),
  severity: z.enum(['STOP', 'ALERT']),
  /**
   * Severidad condicional por ventana temporal (CLINICAL_CONFIRMATIONS #3).
   * Dentro de la ventana el evento es agudo (STOP); fuera, crónico estable (ALERT).
   */
  conditional: z.object({
    window_weeks: z.number().optional(),
    within_window: z.enum(['STOP', 'ALERT']).optional(),
    outside_window: z.enum(['STOP', 'ALERT']).optional(),
    outside_window_flag_id: z.string().optional(),
    acute: z.enum(['STOP', 'ALERT']).optional(),
    chronic_managed: z.enum(['STOP', 'ALERT']).optional(),
    chronic_flag_id: z.string().optional(),
  }).optional(),
  examples: z.array(z.string()).optional(),
  source: z.string().optional(),
  verification_status: z.string().optional(),
  note: z.string().optional(),
});
export type RedFlagV3 = z.infer<typeof RedFlagV3Schema>;

// ── development_priority_assignment.yaml ────────────────────────────────────
export const AssignmentRulesSchema = z.object({
  RULE_SINGLE_CRITICAL: z.object({
    when: z.string(),
    volumes: z.object({ p1: z.number(), p2: z.number(), support: z.number(), maintain: z.number() }),
    source: z.string(),
  }),
  RULE_MULTIPLE_CRITICAL: z.object({
    when: z.string(),
    volumes: z.object({
      p1_primary: z.number(), p1_secondary_total: z.number(),
      support: z.number(), maintain: z.number(),
    }),
    source: z.string(),
  }),
  RULE_NO_CRITICAL: z.object({
    when: z.string(),
    volumes: z.object({
      p2: z.number(), support: z.number(),
      maintain_first: z.number(), maintain_second: z.number(),
    }),
    source: z.string(),
  }),
});
export type AssignmentRules = z.infer<typeof AssignmentRulesSchema>;

// ── Entrada de assessment (API) ─────────────────────────────────────────────
export const ClientSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  age: z.number().int().min(1).max(120),
  sex: z.enum(['MALE', 'FEMALE']),
});

export const HealthGatesInputSchema = z.object({
  parq_positive: z.boolean().optional(),
  systolic_bp: z.number().min(50).max(300).optional(),
  diastolic_bp: z.number().min(30).max(200).optional(),
  chest_pain: z.boolean().optional(),
  current_pain_level: z.number().min(0).max(10).optional(),
  /** IDs de red_flags declarados presentes por el coach. */
  red_flags: z.array(z.string()).default([]),
  /**
   * Antigüedad del evento en semanas, por red flag condicional
   * (CLINICAL_CONFIRMATIONS #3: agudo/reciente = STOP, crónico estable = ALERT).
   * Ej.: { RF_CARDIOVASCULAR_EVENT: 6 } → fuera de la ventana de 2 semanas → ALERT.
   * Si el coach no lo informa, se aplica la severidad base (conservadora: STOP).
   */
  red_flag_weeks_since: z.record(z.number().min(0)).optional(),
}).default({ red_flags: [] });

export const NumericTestResultSchema = z.object({
  test_key: z.string(),
  value: z.number(),
});

/** Una variable de observación clasificada por el coach, con nota opcional. */
export const ObservationVariableSchema = z.object({
  coach_observation: Classification,
  notes: z.string().optional(),
});

export const MovementLevelInputSchema = z.object({
  level_id: MovementLevelId,
  observation_variables: z.record(ObservationVariableSchema),
  /** L3: 1-5. */
  coordination_ceiling: z.number().min(1).max(5).optional(),
  /** L4: constraint|environment|object|open_motor challenge. */
  problem_solving_ceiling: z.string().optional(),
  /**
   * El coach puede fijar la clasificación del nivel. Si se omite, el motor la
   * deriva de las variables con la regla canónica del rubric.
   */
  coach_classification: Classification.optional(),
  coach_notes: z.string().optional(),
});
export type MovementLevelInput = z.infer<typeof MovementLevelInputSchema>;

export const AssessmentV3InputSchema = z.object({
  client: ClientSchema,
  health_gates: HealthGatesInputSchema,
  test_results: z.array(NumericTestResultSchema).default([]),
  movement_levels: z.array(MovementLevelInputSchema).default([]),
  language: z.enum(['es', 'en']).default('es'),
  audience: z.enum(['COACH', 'CLIENT']).default('COACH'),
  session_minutes: z.number().int().min(10).max(240).optional(),
});
export type AssessmentV3Input = z.infer<typeof AssessmentV3InputSchema>;

// ── Salidas ─────────────────────────────────────────────────────────────────
export interface TestScore {
  test_key: string;
  test_id: string;
  name: string;
  domain: DomainKey;
  value: number;
  unit: string;
  population_id: string;
  umbral_critical: number;
  umbral_foundation: number;
  is_inverse: boolean;
  weight: number;
  score_0_3: number;
  classification: Classification;
  is_critical_component: boolean;
  /** La banda poblacional usada está propuesta, no firmada clínicamente. */
  population_pending_approval?: boolean;
  population_source?: string;
}

export interface DomainResult {
  domain: DomainKey;
  name: string;
  impact_factor: number;
  /** null cuando el dominio es cualitativo (Movement en MVP). */
  weighted_score: number | null;
  classification: Classification;
  critical_component_flag: boolean;
  critical_components: string[];
  /** Motivo de la clasificación final (override vs promedio). */
  classification_basis: 'WEIGHTED_AVERAGE' | 'CRITICAL_COMPONENT_OVERRIDE' | 'WORST_CASE_HIERARCHICAL';
  tests: TestScore[];
  reason_ids: string[];
}

export interface MovementLevelResult {
  level_id: MovementLevelId;
  name: string;
  sequence_number: number;
  classification: Classification;
  classification_method: 'COACH_DECLARED' | 'RUBRIC_DERIVED';
  observation_variables: Record<string, { coach_observation: Classification; notes?: string }>;
  coordination_ceiling?: number;
  problem_solving_ceiling?: string;
  prerequisite_met: boolean;
  reason_ids: string[];
}

export interface MovementResult {
  levels: MovementLevelResult[];
  domain_classification: Classification;
  limited_by: MovementLevelId | null;
  reason_ids: string[];
}

export interface HealthGateResult {
  status: HealthState;
  triggered_stop_gates: Array<{ gate_id: string; name: string; reason_id: string }>;
  alert_flags: Array<{ flag_id: string; name: string; severity: string; reason_id: string }>;
  red_flags_present: Array<{
    id: string;
    severity: 'STOP' | 'ALERT';
    label: string;
    /** true cuando una red flag STOP bajó a ALERT por estar fuera de su ventana. */
    downgraded_by_window?: boolean;
  }>;
  action: 'PROCEED' | 'MEDICAL_REFERRAL';
  reason_ids: string[];
}

export interface RoadmapAssignment {
  domain: DomainKey;
  role: DevelopmentRole;
  volume_percent: number;
  reason: string;
  reason_id: string;
  specific_focus?: string;
  duration_weeks?: [number, number] | null;
  success_criteria?: string;
}

export interface ProgrammingConstraint {
  type: string;
  description: string;
  affected_domains: string[];
  mitigation: string;
  reason_id: string;
}

export interface SessionArchitecture {
  total_minutes: number;
  breakdown: Array<{ domain: DomainKey; role: DevelopmentRole; minutes: number }>;
  constraints: string[];
}

export interface RoadmapResult {
  rule_applied: 'RULE_SINGLE_CRITICAL' | 'RULE_MULTIPLE_CRITICAL' | 'RULE_NO_CRITICAL';
  assignments: RoadmapAssignment[];
  constraints: ProgrammingConstraint[];
  session_architecture: SessionArchitecture;
  volume_total: number;
  volume_normalized: boolean;
  validation_warnings: string[];
  reason_ids: string[];
}

export interface AssessmentV3Result {
  assessment_id: string;
  client: { name: string; age: number; sex: 'MALE' | 'FEMALE' };
  timestamp: string;
  version_snapshot: VersionSnapshotV3;
  health_gates: HealthGateResult;
  domains: DomainResult[];
  movement: MovementResult | null;
  roadmap: RoadmapResult | null;
  reasoning: Array<{ id: string; text: string }>;
  audit_trail: {
    thresholds_used: Array<{ test_key: string; population_id: string; umbral_critical: number; umbral_foundation: number }>;
    applied_rules: string[];
    warnings: string[];
  };
}
