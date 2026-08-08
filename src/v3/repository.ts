/**
 * HTC v3 — Persistencia de evaluaciones.
 *
 * Dos implementaciones tras la misma interfaz:
 *   · InMemoryV3Repository  — demo local (los datos se pierden al reiniciar)
 *   · PgV3Repository        — piloto (PostgreSQL, migración 003)
 *
 * Regla de inmutabilidad (Principio 6 / CLINICAL_SPEC): el resultado se guarda
 * COMPLETO en jsonb tal como se calculó. Nunca se recalcula al leerlo; las
 * columnas normalizadas existen sólo para listar y filtrar.
 */
import { Pool } from 'pg';
import { AssessmentV3Result } from './models';

export interface CoachConfirmationV3 {
  confirmed: boolean;
  override_reason: string | null;
  override_reason_category: string | null;
  clinical_confidence: number | null;
  confirmed_at: string;
}

export interface StoredAssessmentV3 {
  assessment: AssessmentV3Result;
  coach_confirmation: CoachConfirmationV3 | null;
}

export interface AssessmentSummaryV3 {
  assessment_id: string;
  client_name: string;
  client_age: number;
  client_sex: string;
  timestamp: string;
  health_status: string;
  p1_domain: string | null;
  rule_applied: string | null;
  coach_confirmed: boolean | null;
}

export interface V3Repository {
  save(result: AssessmentV3Result): Promise<void>;
  get(id: string): Promise<StoredAssessmentV3 | undefined>;
  list(): Promise<AssessmentSummaryV3[]>;
  confirm(id: string, confirmation: CoachConfirmationV3): Promise<StoredAssessmentV3 | undefined>;
}

function summarize(a: AssessmentV3Result, confirmed: boolean | null): AssessmentSummaryV3 {
  const p1 = a.roadmap?.assignments.find((x) => x.role === 'P1' || x.role === 'P1_PRIMARY');
  return {
    assessment_id: a.assessment_id,
    client_name: a.client.name,
    client_age: a.client.age,
    client_sex: a.client.sex,
    timestamp: a.timestamp,
    health_status: a.health_gates.status,
    p1_domain: p1?.domain ?? null,
    rule_applied: a.roadmap?.rule_applied ?? null,
    coach_confirmed: confirmed,
  };
}

export class InMemoryV3Repository implements V3Repository {
  private items = new Map<string, StoredAssessmentV3>();

  async save(result: AssessmentV3Result): Promise<void> {
    this.items.set(result.assessment_id, { assessment: result, coach_confirmation: null });
  }

  async get(id: string): Promise<StoredAssessmentV3 | undefined> {
    return this.items.get(id);
  }

  async list(): Promise<AssessmentSummaryV3[]> {
    return [...this.items.values()]
      .sort((a, b) => b.assessment.timestamp.localeCompare(a.assessment.timestamp))
      .map((s) => summarize(s.assessment, s.coach_confirmation?.confirmed ?? null));
  }

  async confirm(id: string, confirmation: CoachConfirmationV3): Promise<StoredAssessmentV3 | undefined> {
    const found = this.items.get(id);
    if (!found) return undefined;
    found.coach_confirmation = confirmation;
    return found;
  }
}

interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: any[] }>;
}

export class PgV3Repository implements V3Repository {
  constructor(private pool: Pool | Queryable) {}

  async save(result: AssessmentV3Result): Promise<void> {
    const p1 = result.roadmap?.assignments.find((x) => x.role === 'P1' || x.role === 'P1_PRIMARY');
    await this.pool.query(
      `INSERT INTO v3_assessments (
         assessment_id, client_name, client_age, client_sex, assessed_at,
         health_status, p1_domain, rule_applied,
         os_version, thresholds_version, movement_standard_version,
         decision_engine_version, report_template_version, frozen_at,
         result
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        result.assessment_id, result.client.name, result.client.age, result.client.sex, result.timestamp,
        result.health_gates.status, p1?.domain ?? null, result.roadmap?.rule_applied ?? null,
        result.version_snapshot.os_version, result.version_snapshot.thresholds_version,
        result.version_snapshot.movement_standard_version, result.version_snapshot.decision_engine_version,
        result.version_snapshot.report_template_version, result.version_snapshot.frozen_at,
        JSON.stringify(result),
      ],
    );
  }

  async get(id: string): Promise<StoredAssessmentV3 | undefined> {
    const res = await this.pool.query(
      `SELECT result, coach_confirmed, override_reason, override_reason_category,
              clinical_confidence, confirmed_at
         FROM v3_assessments WHERE assessment_id = $1`,
      [id],
    );
    const row = res.rows[0];
    if (!row) return undefined;
    return {
      // El jsonb se devuelve tal cual se guardó: nunca se recalcula.
      assessment: typeof row.result === 'string' ? JSON.parse(row.result) : row.result,
      coach_confirmation: row.coach_confirmed === null ? null : {
        confirmed: row.coach_confirmed,
        override_reason: row.override_reason,
        override_reason_category: row.override_reason_category,
        clinical_confidence: row.clinical_confidence,
        confirmed_at: row.confirmed_at?.toISOString?.() ?? String(row.confirmed_at),
      },
    };
  }

  async list(): Promise<AssessmentSummaryV3[]> {
    const res = await this.pool.query(
      `SELECT assessment_id, client_name, client_age, client_sex, assessed_at,
              health_status, p1_domain, rule_applied, coach_confirmed
         FROM v3_assessments ORDER BY assessed_at DESC LIMIT 200`,
    );
    return res.rows.map((r) => ({
      assessment_id: r.assessment_id,
      client_name: r.client_name,
      client_age: r.client_age,
      client_sex: r.client_sex,
      timestamp: r.assessed_at?.toISOString?.() ?? String(r.assessed_at),
      health_status: r.health_status,
      p1_domain: r.p1_domain,
      rule_applied: r.rule_applied,
      coach_confirmed: r.coach_confirmed,
    }));
  }

  async confirm(id: string, c: CoachConfirmationV3): Promise<StoredAssessmentV3 | undefined> {
    const res = await this.pool.query(
      `UPDATE v3_assessments
          SET coach_confirmed = $2, override_reason = $3,
              override_reason_category = $4, clinical_confidence = $5, confirmed_at = $6
        WHERE assessment_id = $1
        RETURNING assessment_id`,
      [id, c.confirmed, c.override_reason, c.override_reason_category, c.clinical_confidence, c.confirmed_at],
    );
    if (res.rows.length === 0) return undefined;
    return this.get(id);
  }
}
