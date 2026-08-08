/**
 * Persistence layer. Two implementations behind one async interface:
 *   - InMemoryRepository: default for dev/tests (no external services).
 *   - PgRepository (pg-repository.ts): activated by DATABASE_URL for the pilot.
 * The audit log is append-only by construction (no update/delete methods).
 */
import { randomUUID } from 'crypto';
import { Decision } from '../models/decision';
import { AssessmentInput } from '../models/assessment';

export interface StoredAssessment {
  id: string;
  client_id: string;
  input: AssessmentInput;
  decision: Decision;
  created_at: string;
}

export interface ClientRecord {
  id: string;
  name: string;
  age: number;
  sex: string;
  activity_level?: string;
  created_at: string;
}

export interface CoachConfirmation {
  confirmed: boolean;
  override_reason: string | null;
  override_reason_category?: string | null;
  clinical_confidence?: number | null;
}

export interface Repository {
  upsertClient(input: AssessmentInput): Promise<ClientRecord>;
  saveAssessment(clientId: string, input: AssessmentInput, decision: Decision): Promise<StoredAssessment>;
  getClient(clientId: string): Promise<ClientRecord | undefined>;
  listClients(): Promise<ClientRecord[]>;
  getClientHistory(clientId: string): Promise<StoredAssessment[]>;
  getDecision(decisionId: string): Promise<StoredAssessment | undefined>;
  confirmDecision(decisionId: string, confirmation: CoachConfirmation): Promise<StoredAssessment | undefined>;
}

export class InMemoryRepository implements Repository {
  private clients = new Map<string, ClientRecord>();
  private assessments = new Map<string, StoredAssessment>();
  private byDecision = new Map<string, string>();

  async upsertClient(input: AssessmentInput): Promise<ClientRecord> {
    const existingId = input.client.id;
    if (existingId && this.clients.has(existingId)) return this.clients.get(existingId)!;
    const record: ClientRecord = {
      id: existingId ?? randomUUID(),
      name: input.client.name,
      age: input.client.age,
      sex: input.client.sex,
      activity_level: input.client.activity_level,
      created_at: new Date().toISOString(),
    };
    this.clients.set(record.id, record);
    return record;
  }

  async saveAssessment(clientId: string, input: AssessmentInput, decision: Decision): Promise<StoredAssessment> {
    const stored: StoredAssessment = {
      id: randomUUID(), client_id: clientId, input, decision, created_at: new Date().toISOString(),
    };
    this.assessments.set(stored.id, stored);
    this.byDecision.set(decision.decision_id, stored.id);
    return stored;
  }

  async getClient(clientId: string): Promise<ClientRecord | undefined> {
    return this.clients.get(clientId);
  }

  async listClients(): Promise<ClientRecord[]> {
    return [...this.clients.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async getClientHistory(clientId: string): Promise<StoredAssessment[]> {
    return [...this.assessments.values()]
      .filter((a) => a.client_id === clientId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async getDecision(decisionId: string): Promise<StoredAssessment | undefined> {
    const id = this.byDecision.get(decisionId);
    return id ? this.assessments.get(id) : undefined;
  }

  async confirmDecision(decisionId: string, confirmation: CoachConfirmation): Promise<StoredAssessment | undefined> {
    const stored = await this.getDecision(decisionId);
    if (!stored) return undefined;
    // Coach override requires a reason (Platform Data §29).
    stored.decision.coach_confirmation = {
      confirmed: confirmation.confirmed,
      override_reason: confirmation.override_reason,
      override_reason_category: confirmation.override_reason_category ?? null,
      clinical_confidence: confirmation.clinical_confidence ?? null,
    };
    return stored;
  }
}
