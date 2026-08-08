export type Classification = 'CRITICAL' | 'EMERGING' | 'FUNCTIONAL' | 'FOUNDATION';
export type DomainKey = 'STRENGTH' | 'MOBILITY' | 'AEROBIC' | 'MOVEMENT';
export type Role = 'P1' | 'P1_PRIMARY' | 'P1_SECONDARY' | 'P2' | 'SUPPORT' | 'MAINTAIN' | 'MONITOR' | 'DEFER';
export type HealthStatus = 'PASS' | 'FLAGGED' | 'BLOCKED';

export interface CatalogueTest {
  key: string;
  name: string;
  domain: DomainKey;
  unit: string;
  weight: number | null;
  is_inverse: boolean;
  optional_in_mvp: boolean;
  requires_medical_clearance: boolean;
  populations: Array<{
    id: string; sex: 'MALE' | 'FEMALE' | null; age_min: number | null; age_max: number | null;
    umbral_critical: number; umbral_foundation: number;
  }>;
}

export interface CatalogueLevel {
  level_id: 'L1_IBM' | 'L2_DC' | 'L3_MC' | 'L4_MPS';
  name: string;
  description: string;
  sequence_number: number;
  observation_variables: string[];
  needs_coordination_ceiling: boolean;
  needs_problem_solving_ceiling: boolean;
}

export interface Catalogue {
  domains: Array<{ key: DomainKey; name: string; order: number; impact_factor: number; critical_component_rule: boolean }>;
  tests: CatalogueTest[];
  movement_levels: CatalogueLevel[];
  challenge_order: string[];
  red_flags: Array<{
    id: string;
    label: { es: string; en: string };
    severity: 'STOP' | 'ALERT';
    /** Ventana en semanas: dentro es agudo (STOP), fuera crónico (ALERT). */
    window_weeks?: number | null;
  }>;
  override_categories: string[];
}

/** rubrics[level_id][variable][FOUNDATION|FUNCTIONAL|EMERGING|CRITICAL|question] */
export type Rubrics = Record<string, Record<string, Record<string, string>>>;

export interface AssessmentSummary {
  assessment_id: string;
  client_name: string;
  client_age: number;
  client_sex: string;
  timestamp: string;
  health_status: HealthStatus;
  p1_domain: DomainKey | null;
  rule_applied: string | null;
  coach_confirmed: boolean | null;
}

export interface CoachConfirmation {
  confirmed: boolean;
  override_reason: string | null;
  override_reason_category: string | null;
  clinical_confidence: number | null;
  confirmed_at: string;
}

export interface ClientReport {
  client: { name: string; age: number };
  sections: Array<{ id: string; title: string; content: string[] }>;
}

export interface TestScore {
  test_key: string; name: string; domain: DomainKey; value: number; unit: string;
  population_id: string; umbral_critical: number; umbral_foundation: number;
  score_0_3: number; classification: Classification; is_critical_component: boolean; weight: number;
  /** Banda poblacional derivada de literatura, aún sin firma clínica. */
  population_pending_approval?: boolean;
  population_source?: string;
}

export interface DomainResult {
  domain: DomainKey; name: string; impact_factor: number;
  weighted_score: number | null; classification: Classification;
  critical_component_flag: boolean; critical_components: string[];
  classification_basis: 'WEIGHTED_AVERAGE' | 'CRITICAL_COMPONENT_OVERRIDE' | 'WORST_CASE_HIERARCHICAL';
  tests: TestScore[];
}

export interface MovementLevelResult {
  level_id: string; name: string; sequence_number: number;
  classification: Classification; classification_method: string;
  coordination_ceiling?: number; problem_solving_ceiling?: string;
  prerequisite_met: boolean;
}

export interface AssessmentV3 {
  assessment_id: string;
  client: { name: string; age: number; sex: 'MALE' | 'FEMALE' };
  timestamp: string;
  version_snapshot: Record<string, string>;
  health_gates: {
    status: HealthStatus;
    action: string;
    triggered_stop_gates: Array<{ gate_id: string; name: string }>;
    alert_flags: Array<{ flag_id: string; name: string; severity: string }>;
    red_flags_present: Array<{ id: string; severity: string; label: string }>;
  };
  domains: DomainResult[];
  movement: { levels: MovementLevelResult[]; domain_classification: Classification; limited_by: string | null } | null;
  roadmap: {
    rule_applied: string;
    assignments: Array<{
      domain: DomainKey; role: Role; volume_percent: number; reason: string;
      specific_focus?: string; duration_weeks?: [number, number]; success_criteria?: string;
    }>;
    constraints: Array<{ type: string; description: string; mitigation: string }>;
    session_architecture: { total_minutes: number; breakdown: Array<{ domain: DomainKey; role: Role; minutes: number }> };
    volume_normalized: boolean;
    validation_warnings: string[];
  } | null;
  reasoning: Array<{ id: string; text: string }>;
  audit_trail: {
    thresholds_used: Array<{ test_key: string; population_id: string; umbral_critical: number; umbral_foundation: number }>;
    applied_rules: string[];
    warnings: string[];
  };
}
