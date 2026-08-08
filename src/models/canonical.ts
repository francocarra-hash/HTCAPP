/**
 * Canonical type definitions (Zod schemas).
 * The application NEVER contains HTC knowledge — it validates and consumes
 * these structures loaded from canonical/*.yaml.
 */
import { z } from 'zod';

export const VerificationStatus = z.enum(['VERIFIED', 'DRAFT', 'PLACEHOLDER']);
export type VerificationStatus = z.infer<typeof VerificationStatus>;

export const Classification = z.enum(['CRITICAL', 'EMERGING', 'FUNCTIONAL', 'FOUNDATION']);
export type Classification = z.infer<typeof Classification>;

export const ClassificationState = z.enum([
  'CRITICAL', 'EMERGING', 'FUNCTIONAL', 'FOUNDATION', 'NOT_ASSESSED', 'INVALID_RESULT',
]);
export type ClassificationState = z.infer<typeof ClassificationState>;

export const ConfidenceLevel = z.enum(['HIGH', 'MODERATE', 'LOW']);
export type ConfidenceLevel = z.infer<typeof ConfidenceLevel>;

export const PriorityRole = z.enum(['P1', 'P2', 'P3', 'SUPPORT', 'MAINTAIN', 'DEFER', 'MONITOR', 'UNCONFIRMED']);
export type PriorityRole = z.infer<typeof PriorityRole>;

export const Pathway = z.enum(['RESTORE', 'MOVE', 'BUILD', 'PERFORM', 'SUSTAIN']);
export type Pathway = z.infer<typeof Pathway>;

export const Strategy = z.enum(['SEQUENTIAL', 'CONCURRENT', 'INTEGRATED', 'RESTORE_FIRST', 'ASSESSMENT_REQUIRED']);
export type Strategy = z.infer<typeof Strategy>;

// ── domains.yaml ─────────────────────────────────────────────────────────────
export const DomainSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  assessment_order: z.number().int(),
  conflict_tier: z.number().int(),
  impact_factor: z.number(),
  is_gatekeeper: z.boolean(),
  version: z.string(),
  verification_status: VerificationStatus,
  sources: z.array(z.string()),
  notes: z.string().optional(),
});
export type Domain = z.infer<typeof DomainSchema>;

// ── capacities.yaml ──────────────────────────────────────────────────────────
export const CapacitySchema = z.object({
  id: z.string(),
  domain_id: z.string(),
  name: z.string(),
  hierarchy_level: z.number().int(),
  capacity_type: z.enum(['Health', 'Foundation', 'Development', 'Integration', 'Expression']),
  parent_capacity_id: z.string().nullable(),
  required_predecessor_id: z.string().nullable(),
  description: z.string(),
  conflict_tier: z.number().int().optional(),
  impact_factor: z.number().optional(),
  active: z.boolean(),
  verification_status: VerificationStatus,
  sources: z.array(z.string()),
  subcapacities: z.array(z.string()).optional(),
});
export type Capacity = z.infer<typeof CapacitySchema>;

// ── tests.yaml ───────────────────────────────────────────────────────────────
export const TestSchema = z.object({
  id: z.string(),
  name: z.string(),
  measurement_type: z.enum(['Numeric', 'Ordinal', 'Boolean', 'Observation']),
  unit: z.string(),
  equipment: z.string(),
  core_test: z.boolean(),
  deep_dive: z.boolean(),
  sided: z.boolean().optional(),
  asymmetry_rule: z.string().optional(),
  protocol_source: z.string(),
  reassessment_weeks: z.number().int().nullable(),
  active: z.boolean(),
  verification_status: VerificationStatus,
  notes: z.string().optional(),
});
export type TestDef = z.infer<typeof TestSchema>;

// ── test_capacity_links.yaml ─────────────────────────────────────────────────
export const TestCapacityLinkSchema = z.object({
  test_id: z.string(),
  capacity_id: z.string(),
  weight: z.number().optional(),
  verification_status: VerificationStatus,
  source: z.string(),
});
export type TestCapacityLink = z.infer<typeof TestCapacityLinkSchema>;

// ── standards.yaml ───────────────────────────────────────────────────────────
export const PopulationSchema = z.object({
  sex: z.enum(['MALE', 'FEMALE']).nullable().optional(),
  age_min: z.number().nullable().optional(),
  age_max: z.number().nullable().optional(),
  activity_level: z.string().nullable().optional(),
});
export type Population = z.infer<typeof PopulationSchema>;

export const AlgorithmicRuleSchema = z.object({
  id: z.string(),
  if: z.string(),
  then: z.record(z.unknown()),
});

export const StandardSchema = z.object({
  id: z.string(),
  test_id: z.string(),
  population: PopulationSchema.nullable(),
  body_region: z.string().optional(),
  classification_model: z.object({
    type: z.enum(['HIGHER_IS_BETTER', 'LOWER_IS_BETTER', 'ALGORITHMIC', 'ORDINAL_MAP', 'COACH_CLASSIFIED']),
    basis: z.string(),
    rules: z.array(AlgorithmicRuleSchema).optional(),
    /** ORDINAL_MAP: input value (as string key) → classification. */
    map: z.record(Classification).optional(),
    /** ORDINAL_MAP: es/en labels per value, for UI rendering. */
    map_labels: z.record(z.object({ es: z.string(), en: z.string() })).optional(),
  }),
  thresholds: z
    .object({
      foundation_min: z.number().nullable().optional(),
      functional_min: z.number().nullable().optional(),
      emerging_min: z.number().nullable().optional(),
      foundation_max: z.number().nullable().optional(),
      functional_max: z.number().nullable().optional(),
      emerging_max: z.number().nullable().optional(),
    })
    .optional(),
  unit: z.string(),
  standard_type: z.string(),
  evidence: z.object({
    based_on: z.array(z.string()),
    sample_size: z.number().optional(),
    data_source: z.string().optional(),
  }),
  version: z.string(),
  verification_status: VerificationStatus,
  source: z.string(),
  notes: z.string().optional(),
});
export type Standard = z.infer<typeof StandardSchema>;

// ── relationships.yaml ───────────────────────────────────────────────────────
export const DependencySchema = z.object({
  capacity_id: z.string(),
  depends_on: z.string(),
  verification_status: VerificationStatus,
  source: z.string(),
});
export type Dependency = z.infer<typeof DependencySchema>;

export const CrossDomainInfluenceSchema = z.object({
  source_capacity_id: z.string(),
  target_capacity_id: z.string(),
  type: z.string(),
  verification_status: VerificationStatus,
  source: z.string(),
});
export type CrossDomainInfluence = z.infer<typeof CrossDomainInfluenceSchema>;

// ── decision_rules.yaml (structural subset the engine consumes) ──────────────
export const DecisionRulesSchema = z.object({
  classifications: z.object({
    ordered_worst_to_best: z.array(z.string()),
    additional_states: z.array(z.string()),
    functional_floor: z.string(),
  }),
  priority_roles: z.object({ values: z.array(z.string()) }),
  strategies: z.object({ values: z.array(z.string()) }),
  pathways: z.object({ values: z.array(z.string()) }),
  domain_bottleneck: z.object({
    rule: z.literal('EARLIEST_CAPACITY_BELOW_FUNCTIONAL'),
    multiple_limitation_tiebreak: z.array(z.string()),
  }),
  multi_domain_scoring: z.object({
    classification_points: z.record(z.number()),
    strategy_threshold: z.object({ rule: z.string() }),
  }),
  tie_breakers: z.object({ ordered: z.array(z.string()) }),
  pathway_rules: z.any(),
  reassessment_triggers: z.object({ values: z.array(z.string()), plateau_rule: z.string() }),
  non_negotiables: z.array(z.string()),
});
export type DecisionRules = z.infer<typeof DecisionRulesSchema>;

// ── safety_rules.yaml ────────────────────────────────────────────────────────
export const SafetyRuleSchema = z.object({
  id: z.string(),
  priority: z.number().int(),
  if: z.record(z.unknown()),
  then: z.record(z.unknown()),
  reason_id: z.string(),
  verification_status: VerificationStatus,
  source: z.string(),
});
export type SafetyRule = z.infer<typeof SafetyRuleSchema>;

// ── criteria.yaml ────────────────────────────────────────────────────────────
export const ReassessmentWindowSchema = z.object({
  capacity_id: z.string(),
  weeks: z.number().int(),
  exit_criteria: z.string(),
  verification_status: VerificationStatus,
  source: z.string(),
});
export type ReassessmentWindow = z.infer<typeof ReassessmentWindowSchema>;

// ── language_mapping.yaml ────────────────────────────────────────────────────
export const LangTextSchema = z.object({ es: z.string(), en: z.string() });
export const ReasonEntrySchema = z.object({
  COACH: LangTextSchema,
  CLIENT: LangTextSchema,
  source: z.string().optional(),
});
export type ReasonEntry = z.infer<typeof ReasonEntrySchema>;

// ── references.yaml ──────────────────────────────────────────────────────────
export const ReferenceSchema = z.object({
  id: z.string(),
  title: z.string(),
  detail: z.string().optional(),
  type: z.string(),
  verification_status: VerificationStatus,
  source: z.string(),
});
export type Reference = z.infer<typeof ReferenceSchema>;

// ── Component versions (Development Principles §6) ───────────────────────────
export const ComponentVersionsSchema = z.object({
  os_version: z.string(),
  canonical_version: z.string(),
  standards_version: z.string(),
  decision_rules_version: z.string(),
  report_version: z.string(),
  note: z.string().optional(),
});
export type ComponentVersions = z.infer<typeof ComponentVersionsSchema>;

// ── Aggregation configuration (parameterized, never hardcoded) ───────────────
export const AggregationStrategy = z.enum(['WORST_OF', 'SIMPLE_AVERAGE', 'WEIGHTED_AVERAGE']);
export type AggregationStrategy = z.infer<typeof AggregationStrategy>;

export const CriticalComponentMode = z.enum(['OVERRIDE', 'FLAG', 'INHERENT']);
export type CriticalComponentMode = z.infer<typeof CriticalComponentMode>;

export const AggregationConfigSchema = z.object({
  test_to_capacity: z.object({
    strategy: AggregationStrategy,
    critical_component: CriticalComponentMode,
    verification_status: VerificationStatus,
    source: z.string(),
  }),
  ordinal_scale: z.record(z.union([z.number(), z.string()])).optional(),
  rounding_rule: z.object({ status: z.string(), note: z.string().optional() }).optional(),
});
export type AggregationConfig = z.infer<typeof AggregationConfigSchema>;

// ── Safety: red flags, vital-sign gates and flag rules (AUTHORITATIVE §9) ────
export const RedFlagSchema = z.object({
  id: z.string(),
  label: z.object({ es: z.string(), en: z.string() }),
  action: z.enum(['STOP', 'FLAG']),
  note: z.string().optional(),
});
export type RedFlag = z.infer<typeof RedFlagSchema>;

export const VitalSignGateSchema = z.object({
  id: z.string(),
  measure: z.enum(['systolic_bp', 'diastolic_bp']),
  operator: z.enum(['>=', '<=', '>', '<']),
  threshold: z.number(),
  unit: z.string(),
  action: z.enum(['STOP', 'FLAG']),
  reason_id: z.string(),
  verification_status: VerificationStatus,
  source: z.string(),
});
export type VitalSignGate = z.infer<typeof VitalSignGateSchema>;

export const FlagRuleSchema = z.object({
  id: z.string(),
  condition: z.string(),
  action: z.string(),
  detail: z.string().optional(),
  severity: z.string(),
  reason_id: z.string(),
  verification_status: VerificationStatus,
  source: z.string(),
});
export type FlagRule = z.infer<typeof FlagRuleSchema>;

// ── Aggregate canonical bundle ───────────────────────────────────────────────
export interface Canonical {
  version: string;
  componentVersions: ComponentVersions;
  aggregation: AggregationConfig;
  redFlags: RedFlag[];
  vitalSignGates: VitalSignGate[];
  flagRules: FlagRule[];
  domains: Domain[];
  capacities: Capacity[];
  tests: TestDef[];
  links: TestCapacityLink[];
  standards: Standard[];
  dependencies: Dependency[];
  influences: CrossDomainInfluence[];
  decisionRules: DecisionRules;
  safetyRules: SafetyRule[];
  reassessmentWindows: ReassessmentWindow[];
  languageMapping: {
    default_language: string;
    languages: string[];
    audiences: string[];
    labels: Record<string, Record<string, { es: string; en: string }>>;
    reasons: Record<string, ReasonEntry>;
    client_report_sections: Array<{ id: string; es: string; en: string }>;
  };
  references: Reference[];
}

/** Error thrown whenever required canonical data is missing or unusable. */
export class MissingCanonicalError extends Error {
  constructor(message: string) {
    super(`MISSING CANONICAL: ${message}`);
    this.name = 'MissingCanonicalError';
  }
}

/** Error thrown when a module outside the approved MVP scope is requested. */
export class ModuleNotImplementedError extends Error {
  constructor(module: string) {
    super(`MODULE NOT IMPLEMENTED: ${module} is out of MVP scope (HTC AI Master Instructions).`);
    this.name = 'ModuleNotImplementedError';
  }
}
