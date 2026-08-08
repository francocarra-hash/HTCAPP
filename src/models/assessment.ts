/**
 * Assessment input model (Platform Data §3-§10; Decision Graph §3).
 */
import { z } from 'zod';

export const Sex = z.enum(['MALE', 'FEMALE']);
export const Audience = z.enum(['COACH', 'CLIENT']);
export const Language = z.enum(['es', 'en']);

export const ClinicalEventSchema = z.object({
  type: z.enum(['PAIN', 'SYMPTOM', 'CONTRAINDICATION', 'RED_FLAG', 'RECENT_SURGERY', 'MEDICAL_RESTRICTION']),
  description: z.string(),
  /** Pain intensity 0-10 when type = PAIN. */
  intensity: z.number().min(0).max(10).optional(),
  /**
   * Coach-declared: does this event significantly limit assessment quality or
   * training tolerance? The engine NEVER infers this from intensity — no
   * canonical threshold exists (see safety_rules.yaml gap note).
   */
  significantly_limits: z.boolean().optional(),
});
export type ClinicalEvent = z.infer<typeof ClinicalEventSchema>;

export const RegionInterpretation = z.enum(['CLEAR', 'LIMITED', 'ASYMMETRICAL', 'PAINFUL', 'NEEDS_DEEPER', 'CRITICAL_BLOCKING']);

export const TestResultSchema = z.object({
  test_id: z.string(),
  /** Numeric/ordinal result value. */
  value: z.number().optional(),
  /**
   * For COACH_CLASSIFIED standards (Movement levels): the coach applies the
   * canonical criteria and records the classification directly.
   */
  coach_classification: z.enum(['CRITICAL', 'EMERGING', 'FUNCTIONAL', 'FOUNDATION']).optional(),
  /** For observation tests (mobility regional screen). */
  region_interpretations: z.record(RegionInterpretation).optional(),
  side: z.enum(['LEFT', 'RIGHT', 'BILATERAL']).optional(),
  pain_during_test: z.number().min(0).max(10).optional(),
  valid: z.boolean().default(true),
  confidence: z.enum(['HIGH', 'MODERATE', 'LOW']).default('HIGH'),
  notes: z.string().optional(),
});
export type TestResult = z.infer<typeof TestResultSchema>;

export const AssessmentInputSchema = z.object({
  client: z.object({
    id: z.string().optional(),
    name: z.string(),
    age: z.number().int().min(1).max(120),
    sex: Sex,
    activity_level: z.string().optional(),
    primary_goal: z.enum(['PERFORMANCE', 'LONG_TERM_MAINTENANCE', 'GENERAL_HEALTH']).optional(),
    /** Capacities the coach marks as goal-critical (Rule 18.4). */
    goal_capacity_ids: z.array(z.string()).optional(),
  }),
  clinical: z.object({
    events: z.array(ClinicalEventSchema).default([]),
    /**
     * General Health classification from clinical intake / lab interpretation
     * (Health Markers Standard). Provided by the coach after reading labs —
     * the platform does not interpret raw biomarkers in MVP.
     */
    general_health_classification: z.enum(['CRITICAL', 'EMERGING', 'FUNCTIONAL', 'FOUNDATION']).optional(),
    /** Health Markers binary gate state (Health Markers Standard §5). */
    health_markers_state: z.enum(['CRITICAL', 'EMERGING_MULTIPLE', 'OK']).optional(),
    training_tolerance_compromised: z.boolean().optional(),
    /** Resting blood pressure — evaluated against canonical vital_sign_gates (AUTHORITATIVE §9.1). */
    systolic_bp: z.number().min(50).max(300).optional(),
    diastolic_bp: z.number().min(30).max(200).optional(),
    /** PAR-Q+ screening: any YES answer requires physician clearance (§9.1). */
    parq_positive: z.boolean().optional(),
    /** Current pain 0-10; >= 6 raises a coach-review flag (§9.2). */
    current_pain_level: z.number().min(0).max(10).optional(),
  }).default({ events: [] }),
  test_results: z.array(TestResultSchema),
  language: Language.default('es'),
  audience: Audience.default('COACH'),
});
export type AssessmentInput = z.infer<typeof AssessmentInputSchema>;
