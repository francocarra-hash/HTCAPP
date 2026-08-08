/**
 * Pilot readiness — single-coach auth + PostgreSQL repository (fake pool).
 */
import express from 'express';
import request from 'supertest';
import { createRouter } from '../api/router';
import { InMemoryRepository } from '../db/repository';
import { PgRepository } from '../db/pg-repository';
import { compiled } from './helpers';
import { runPipeline } from '../pipeline';
import { input } from './helpers';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api', createRouter(compiled(), new InMemoryRepository()));
  return a;
}

describe('Auth — single coach pilot', () => {
  afterEach(() => {
    delete process.env.HTC_AUTH_PASSWORD;
  });

  test('auth disabled (no HTC_AUTH_PASSWORD) → API is open, version reports auth_enabled=false', async () => {
    const res = await request(app()).get('/api/canonical/version');
    expect(res.status).toBe(200);
    expect(res.body.auth_enabled).toBe(false);
    const clients = await request(app()).get('/api/clients');
    expect(clients.status).toBe(200);
  });

  test('auth enabled → protected routes return 401 without token', async () => {
    process.env.HTC_AUTH_PASSWORD = 'piloto-htc-2026';
    const res = await request(app()).get('/api/clients');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
  });

  test('login with wrong password → 401', async () => {
    process.env.HTC_AUTH_PASSWORD = 'piloto-htc-2026';
    const res = await request(app()).post('/api/login').send({ password: 'nope' });
    expect(res.status).toBe(401);
  });

  test('login with correct password → token grants access', async () => {
    process.env.HTC_AUTH_PASSWORD = 'piloto-htc-2026';
    const a = app();
    const login = await request(a).post('/api/login').send({ password: 'piloto-htc-2026' });
    expect(login.status).toBe(200);
    expect(typeof login.body.token).toBe('string');
    const res = await request(a).get('/api/clients').set('Authorization', `Bearer ${login.body.token}`);
    expect(res.status).toBe(200);
  });

  test('tampered token is rejected', async () => {
    process.env.HTC_AUTH_PASSWORD = 'piloto-htc-2026';
    const a = app();
    const login = await request(a).post('/api/login').send({ password: 'piloto-htc-2026' });
    const tampered = `${login.body.token.split('.')[0]}.invalidsignature`;
    const res = await request(a).get('/api/clients').set('Authorization', `Bearer ${tampered}`);
    expect(res.status).toBe(401);
  });

  test('version endpoint stays public so the UI can detect auth mode', async () => {
    process.env.HTC_AUTH_PASSWORD = 'piloto-htc-2026';
    const res = await request(app()).get('/api/canonical/version');
    expect(res.status).toBe(200);
    expect(res.body.auth_enabled).toBe(true);
  });
});

describe('PgRepository — SQL behavior against fake pool', () => {
  interface Q { text: string; params?: unknown[] }

  function fakePool(responses: Array<{ match: RegExp; rows: unknown[] }>) {
    const queries: Q[] = [];
    return {
      queries,
      query: async (text: string, params?: unknown[]) => {
        queries.push({ text, params });
        const hit = responses.find((r) => r.match.test(text));
        return { rows: hit ? hit.rows : [] };
      },
    };
  }

  const decision = () => runPipeline(compiled(), input({
    test_results: [{ test_id: 'TEST_AROM_PROM_RATIO', value: 76, valid: true, confidence: 'HIGH' }],
  }));

  test('saveAssessment writes assessment, raw_results, decision, priority_roles and append-only audit_log', async () => {
    const pool = fakePool([
      { match: /INSERT INTO assessments/, rows: [{ id: 'A1', created_at: new Date().toISOString() }] },
    ]);
    const repo = new PgRepository(pool);
    const d = decision();
    const testInput = input({ test_results: [{ test_id: 'TEST_AROM_PROM_RATIO', value: 76, valid: true, confidence: 'HIGH' }] });
    const stored = await repo.saveAssessment('C1', testInput, d);

    expect(stored.id).toBe('A1');
    const texts = pool.queries.map((q) => q.text);
    expect(texts.some((t) => /INSERT INTO raw_results/.test(t))).toBe(true);
    expect(texts.some((t) => /INSERT INTO decisions/.test(t))).toBe(true);
    expect(texts.some((t) => /INSERT INTO priority_roles/.test(t))).toBe(true);
    expect(texts.some((t) => /INSERT INTO audit_log/.test(t))).toBe(true);
    // append-only: never UPDATE/DELETE on audit_log
    expect(texts.some((t) => /(UPDATE|DELETE).*audit_log/s.test(t))).toBe(false);
    // decision id persisted as primary key
    const decisionInsert = pool.queries.find((q) => /INSERT INTO decisions/.test(q.text))!;
    expect(decisionInsert.params![0]).toBe(d.decision_id);
  });

  test('confirmDecision updates the decision and appends a COACH_CONFIRMATION audit entry', async () => {
    const d = decision();
    const pool = fakePool([
      { match: /FROM decisions d JOIN assessments a/, rows: [{ id: 'A1', client_id: 'C1', input: {}, created_at: new Date().toISOString(), full_decision: d }] },
    ]);
    const repo = new PgRepository(pool);
    const stored = await repo.confirmDecision(d.decision_id, {
      confirmed: false, override_reason: 'cirugía reciente', override_reason_category: 'MEDICAL', clinical_confidence: 70,
    });
    expect(stored!.decision.coach_confirmation.override_reason_category).toBe('MEDICAL');
    const texts = pool.queries.map((q) => q.text);
    expect(texts.some((t) => /UPDATE decisions SET coach_confirmed/.test(t))).toBe(true);
    expect(texts.some((t) => /INSERT INTO audit_log/.test(t) && /COACH_CONFIRMATION/.test(t))).toBe(true);
  });

  test('getDecision with malformed id resolves to not-found instead of throwing', async () => {
    const repo = new PgRepository({
      query: async () => { throw new Error('invalid input syntax for type uuid'); },
    });
    await expect(repo.getDecision('nope')).resolves.toBeUndefined();
  });
});
