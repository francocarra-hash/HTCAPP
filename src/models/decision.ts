/**
 * Decision output model — Reasoning Card + audit trail (Decision Graph §24).
 */
import { ClassificationState, ConfidenceLevel, Pathway, PriorityRole, Strategy } from './canonical';

export interface CapacityState {
  capacity_id: string;
  domain_id: string;
  hierarchy_level: number;
  classification: ClassificationState;
  confidence: ConfidenceLevel;
  /** True when any contributing test is CRITICAL (AUTHORITATIVE §5.3: never hide it). */
  critical_component_flag?: boolean;
  critical_components?: string[];
  /** Numeric value when an average-based aggregation strategy was used. */
  aggregation_score?: number | null;
  contributing_results: Array<{
    test_id: string;
    standard_id: string;
    standard_version: string;
    raw_value: number | string;
    classification: ClassificationState;
    flags: string[];
  }>;
}

export interface DomainBottleneck {
  domain_id: string;
  capacity_id: string | null;
  status: 'CONFIRMED' | 'UNCONFIRMED' | 'NONE';
  reason_ids: string[];
}

export interface CandidateScore {
  capacity_id: string;
  domain_id: string;
  classification: ClassificationState;
  classification_points: number;
  impact_factor: number;
  score: number;
}

export interface SuggestedRelationship {
  source_capacity_id: string;
  target_capacity_id: string;
  type: string;
  coach_confirmed: boolean;
}

export interface PriorityAssignment {
  capacity_id: string;
  role: PriorityRole;
  reason_id: string;
}

export interface SafetyFlag {
  id: string;
  severity: string;
  detail: string;
  reason_id: string;
}

export interface SafetyResult {
  outcome: string;
  assessment_allowed: boolean;
  stop_decision_process: boolean;
  applied_rule_ids: string[];
  reason_ids: string[];
  /** Non-blocking flags for coach review (AUTHORITATIVE §9.2). */
  flags?: SafetyFlag[];
  /** Vital-sign gates that fired (AUTHORITATIVE §9.1). */
  triggered_gates?: string[];
  force_p1?: string;
  force_pathway?: Pathway;
  block_definitive_p1?: boolean;
  reduce_confidence?: boolean;
}

/**
 * Immutable version snapshot (Development Principles §6).
 * Frozen at assessment time; historical decisions are never recalculated.
 */
export interface VersionSnapshot {
  os_version: string;
  canonical_version: string;
  standards_version: string;
  decision_rules_version: string;
  report_version: string;
  frozen_at: string;
}

export interface AuditTrail {
  canonical_version: string;
  /** Five component versions frozen for this decision (Principio 6). */
  version_snapshot: VersionSnapshot;
  timestamp: string;
  safety: SafetyResult;
  standards_used: Array<{ standard_id: string; version: string; test_id: string; evidence_refs: string[]; verification_status: string }>;
  applied_rules: string[];
  candidate_scores: CandidateScore[];
  warnings: string[];
}

export interface Decision {
  decision_id: string;
  client_name: string;
  capacity_states: CapacityState[];
  domain_bottlenecks: DomainBottleneck[];
  suggested_relationships: SuggestedRelationship[];
  primary_system_bottleneck: {
    capacity_id: string | null;
    domain_id: string | null;
    classification: ClassificationState | null;
    status: 'CONFIRMED' | 'UNCONFIRMED' | 'NONE' | 'BLOCKED';
  };
  priorities: PriorityAssignment[];
  strategy: Strategy;
  pathway: Pathway | null;
  system_confidence: number;
  reasoning_ids: string[];
  /** Rendered by the Language Resolver for the requested audience/language. */
  reasoning_text: string[];
  reassessment: { weeks: number | null; exit_criteria: string | null; triggers: string[] };
  coach_confirmation: {
    confirmed: boolean | null;
    override_reason: string | null;
    /** Blueprint v3.0 §6 categories: MEDICAL / MOTIVATIONAL / SPORT_CONTEXT / LIFESTYLE_CONSTRAINT / COACH_JUDGMENT / OTHER */
    override_reason_category?: string | null;
    /** Coach-assessed reliability 0-100 (Product Spec v3.0 confidence architecture). */
    clinical_confidence?: number | null;
  };
  audit_trail: AuditTrail;
}
