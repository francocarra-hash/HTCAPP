export type Classification = 'CRITICAL' | 'EMERGING' | 'FUNCTIONAL' | 'FOUNDATION' | 'NOT_ASSESSED' | 'INVALID_RESULT';
export type Pathway = 'RESTORE' | 'MOVE' | 'BUILD' | 'PERFORM' | 'SUSTAIN';
export type Role = 'P1' | 'P2' | 'P3' | 'SUPPORT' | 'MAINTAIN' | 'DEFER' | 'MONITOR' | 'UNCONFIRMED';

export interface CanonicalTest {
  id: string;
  name: string;
  unit: string;
  measurement_type: 'Numeric' | 'Ordinal' | 'Boolean' | 'Observation';
  core_test: boolean;
  sided: boolean;
  asymmetry_rule: string | null;
  capacities: Array<{ id: string; name: string; domain_id: string }>;
  has_standard: boolean;
  input: {
    kind: 'numeric' | 'ordinal_map' | 'coach_classified' | 'regions';
    options?: Array<{ value: string; es: string; en: string }>;
    criteria?: string;
  };
}

export interface ClientSummary {
  id: string;
  name: string;
  age: number;
  sex: string;
  activity_level?: string;
  created_at: string;
  assessments_count: number;
  last_assessment: {
    date: string;
    decision_id: string;
    pathway: Pathway | null;
    p1: string | null;
    p1_status: string;
    coach_confirmed: boolean | null;
  } | null;
}

export interface VersionSnapshot {
  os_version: string;
  canonical_version: string;
  standards_version: string;
  decision_rules_version: string;
  report_version: string;
  frozen_at: string;
}

export interface SafetyFlag {
  id: string;
  severity: string;
  detail: string;
  reason_id: string;
}

export interface CapacityState {
  capacity_id: string;
  domain_id: string;
  hierarchy_level: number;
  classification: Classification;
  confidence: 'HIGH' | 'MODERATE' | 'LOW';
  critical_component_flag?: boolean;
  critical_components?: string[];
  aggregation_score?: number | null;
  contributing_results: Array<{
    test_id: string;
    standard_id: string;
    standard_version: string;
    raw_value: number | string;
    classification: Classification;
    flags: string[];
  }>;
}

export interface Decision {
  decision_id: string;
  client_name: string;
  capacity_states: CapacityState[];
  domain_bottlenecks: Array<{ domain_id: string; capacity_id: string | null; status: string; reason_ids: string[] }>;
  suggested_relationships: Array<{ source_capacity_id: string; target_capacity_id: string; type: string; coach_confirmed: boolean }>;
  primary_system_bottleneck: { capacity_id: string | null; domain_id: string | null; classification: Classification | null; status: string };
  priorities: Array<{ capacity_id: string; role: Role; reason_id: string }>;
  strategy: string;
  pathway: Pathway | null;
  system_confidence: number;
  reasoning_ids: string[];
  reasoning_text: string[];
  reassessment: { weeks: number | null; exit_criteria: string | null; triggers: string[] };
  coach_confirmation: { confirmed: boolean | null; override_reason: string | null; override_reason_category?: string | null; clinical_confidence?: number | null };
  audit_trail: {
    canonical_version: string;
    version_snapshot: VersionSnapshot;
    timestamp: string;
    safety: { outcome: string; applied_rule_ids: string[]; flags?: SafetyFlag[]; triggered_gates?: string[] };
    standards_used: Array<{ standard_id: string; version: string; test_id: string; evidence_refs: string[]; verification_status: string }>;
    applied_rules: string[];
    candidate_scores: Array<{ capacity_id: string; domain_id: string; classification: Classification; classification_points: number; impact_factor: number; score: number }>;
    warnings: string[];
  };
}

export interface ClientReport {
  sections: Array<{ id: string; title: string; content: string[] }>;
}

export interface AssessResponse {
  client_id: string;
  assessment_id: string;
  decision: Decision;
}
