/**
 * PostgreSQL repository (schema: migrations/001 + 002).
 * Normalized columns are written for querying/reporting; the jsonb columns
 * (assessments.input, decisions.full_decision) preserve full fidelity.
 * audit_log is append-only: this class only ever INSERTs into it.
 */
import { Pool } from 'pg';
import { ClientRecord, CoachConfirmation, Repository, StoredAssessment } from './repository';
import { AssessmentInput } from '../models/assessment';
import { Decision } from '../models/decision';

interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: any[] }>;
}

export class PgRepository implements Repository {
  constructor(private pool: Pool | Queryable) {}

  async upsertClient(input: AssessmentInput): Promise<ClientRecord> {
    if (input.client.id) {
      const existing = await this.getClient(input.client.id);
      if (existing) return existing;
    }
    const res = await this.pool.query(
      `INSERT INTO clients (name, age, sex, activity_level, goals)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, age, sex, activity_level, created_at`,
      [input.client.name, input.client.age, input.client.sex, input.client.activity_level ?? null,
       JSON.stringify({ primary_goal: input.client.primary_goal ?? null, goal_capacity_ids: input.client.goal_capacity_ids ?? [] })],
    );
    return this.toClient(res.rows[0]);
  }

  async saveAssessment(clientId: string, input: AssessmentInput, decision: Decision): Promise<StoredAssessment> {
    const assessment = await this.pool.query(
      `INSERT INTO assessments (client_id, session_date, type, status, input)
       VALUES ($1, CURRENT_DATE, 'INITIAL', 'COMPLETE', $2)
       RETURNING id, created_at`,
      [clientId, JSON.stringify(input)],
    );
    const assessmentId: string = assessment.rows[0].id;

    for (const r of input.test_results) {
      await this.pool.query(
        `INSERT INTO raw_results (assessment_id, test_id, side, raw_value, pain_during_test, valid, confidence)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [assessmentId, r.test_id, r.side ?? null,
         JSON.stringify({ value: r.value ?? null, coach_classification: r.coach_classification ?? null, region_interpretations: r.region_interpretations ?? null }),
         r.pain_during_test ?? null, r.valid, r.confidence],
      );
    }

    await this.pool.query(
      `INSERT INTO decisions (id, assessment_id, p1_capacity_id, p1_status, pathway, strategy,
                              system_confidence, reasoning_ids, audit_trail, full_decision)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [decision.decision_id, assessmentId,
       decision.primary_system_bottleneck.capacity_id, decision.primary_system_bottleneck.status,
       decision.pathway, decision.strategy, decision.system_confidence,
       JSON.stringify(decision.reasoning_ids), JSON.stringify(decision.audit_trail), JSON.stringify(decision)],
    );

    for (const p of decision.priorities) {
      await this.pool.query(
        `INSERT INTO priority_roles (decision_id, capacity_id, role, reason_id, automated)
         VALUES ($1, $2, $3, $4, true)`,
        [decision.decision_id, p.capacity_id, p.role, p.reason_id],
      );
    }

    await this.pool.query(
      `INSERT INTO audit_log (decision_id, entry_type, canonical_refs, payload)
       VALUES ($1, 'DECISION_CREATED', $2, $3)`,
      [decision.decision_id,
       JSON.stringify(decision.audit_trail.standards_used.map((s) => s.standard_id)),
       JSON.stringify(decision.audit_trail)],
    );

    return {
      id: assessmentId,
      client_id: clientId,
      input,
      decision,
      created_at: new Date(assessment.rows[0].created_at).toISOString(),
    };
  }

  async getClient(clientId: string): Promise<ClientRecord | undefined> {
    const res = await this.pool.query(
      'SELECT id, name, age, sex, activity_level, created_at FROM clients WHERE id = $1', [clientId],
    ).catch(() => ({ rows: [] })); // invalid uuid → not found, not a 500
    return res.rows[0] ? this.toClient(res.rows[0]) : undefined;
  }

  async listClients(): Promise<ClientRecord[]> {
    const res = await this.pool.query(
      'SELECT id, name, age, sex, activity_level, created_at FROM clients ORDER BY created_at DESC',
    );
    return res.rows.map((r) => this.toClient(r));
  }

  async getClientHistory(clientId: string): Promise<StoredAssessment[]> {
    const res = await this.pool.query(
      `SELECT a.id, a.client_id, a.input, a.created_at, d.full_decision
       FROM assessments a JOIN decisions d ON d.assessment_id = a.id
       WHERE a.client_id = $1 ORDER BY a.created_at ASC`,
      [clientId],
    );
    return res.rows.map((r) => this.toStored(r));
  }

  async getDecision(decisionId: string): Promise<StoredAssessment | undefined> {
    const res = await this.pool.query(
      `SELECT a.id, a.client_id, a.input, a.created_at, d.full_decision
       FROM decisions d JOIN assessments a ON a.id = d.assessment_id
       WHERE d.id = $1`,
      [decisionId],
    ).catch(() => ({ rows: [] }));
    return res.rows[0] ? this.toStored(res.rows[0]) : undefined;
  }

  async confirmDecision(decisionId: string, c: CoachConfirmation): Promise<StoredAssessment | undefined> {
    const stored = await this.getDecision(decisionId);
    if (!stored) return undefined;
    stored.decision.coach_confirmation = {
      confirmed: c.confirmed,
      override_reason: c.override_reason,
      override_reason_category: c.override_reason_category ?? null,
      clinical_confidence: c.clinical_confidence ?? null,
    };
    await this.pool.query(
      `UPDATE decisions SET coach_confirmed = $2, coach_override_reason = $3, full_decision = $4 WHERE id = $1`,
      [decisionId, c.confirmed, c.override_reason, JSON.stringify(stored.decision)],
    );
    await this.pool.query(
      `INSERT INTO audit_log (decision_id, entry_type, payload)
       VALUES ($1, 'COACH_CONFIRMATION', $2)`,
      [decisionId, JSON.stringify(stored.decision.coach_confirmation)],
    );
    return stored;
  }

  private toClient(r: any): ClientRecord {
    return {
      id: r.id, name: r.name, age: r.age, sex: r.sex,
      activity_level: r.activity_level ?? undefined,
      created_at: new Date(r.created_at).toISOString(),
    };
  }

  private toStored(r: any): StoredAssessment {
    return {
      id: r.id,
      client_id: r.client_id,
      input: r.input as AssessmentInput,
      decision: r.full_decision as Decision,
      created_at: new Date(r.created_at).toISOString(),
    };
  }
}
