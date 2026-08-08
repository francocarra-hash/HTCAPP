import express from 'express';
import request from 'supertest';
import { createRouter } from '../api/router';
import { InMemoryRepository } from '../db/repository';
import { compiled } from './helpers';

function app() {
  const a = express();
  a.use(express.json());
  a.use(createRouter(compiled(), new InMemoryRepository()));
  return a;
}

const moveCase = {
  client: { name: 'Caso Move', age: 32, sex: 'MALE' },
  clinical: { events: [] },
  test_results: [
    { test_id: 'TEST_AROM_PROM_RATIO', value: 76, valid: true, confidence: 'HIGH' },
    { test_id: 'TEST_FRONT_PLANK', value: 90, valid: true, confidence: 'HIGH' },
    { test_id: 'TEST_DEAD_HANG', value: 45, valid: true, confidence: 'HIGH' },
  ],
  language: 'es',
  audience: 'COACH',
};

describe('REST API — end to end', () => {
  test('GET /canonical/version returns loaded canonical version', async () => {
    const res = await request(app()).get('/canonical/version');
    expect(res.status).toBe(200);
    expect(res.body.canonical_version).toBe('3.1.0');
  });

  test('POST /assess runs full pipeline: MOVE pathway for the documented mobility case', async () => {
    const res = await request(app()).post('/assess').send(moveCase);
    expect(res.status).toBe(200);
    expect(res.body.decision.pathway).toBe('MOVE');
    expect(res.body.decision.primary_system_bottleneck.capacity_id).toBe('CAP_WORKSPACE_OWNERSHIP');
    expect(res.body.decision.reasoning_text.length).toBeGreaterThan(0);
    expect(res.body.decision.audit_trail.standards_used.length).toBe(3);
  });

  test('POST /assess responds in < 100ms (performance requirement)', async () => {
    const a = app();
    await request(a).post('/assess').send(moveCase); // warm-up
    const t0 = Date.now();
    const res = await request(a).post('/assess').send(moveCase);
    const elapsed = Date.now() - t0;
    expect(res.status).toBe(200);
    expect(elapsed).toBeLessThan(100);
  });

  test('POST /assess with invalid body → 400', async () => {
    const res = await request(app()).post('/assess').send({ client: { name: 'x' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_INPUT');
  });

  test('POST /assess with unknown test → 409 MISSING_CANONICAL (fail loudly, no invention)', async () => {
    const res = await request(app()).post('/assess').send({
      ...moveCase,
      test_results: [{ test_id: 'TEST_FLEXIBILITY_CM', value: 18, valid: true, confidence: 'HIGH' }],
    });
    expect(res.status).toBe(409);
    expect(res.body.message).toContain('MISSING CANONICAL');
  });

  test('GET /clients/:id returns history after assessment', async () => {
    const a = app();
    const assess = await request(a).post('/assess').send(moveCase);
    const res = await request(a).get(`/clients/${assess.body.client_id}`);
    expect(res.status).toBe(200);
    expect(res.body.assessments).toHaveLength(1);
    expect(res.body.assessments[0].pathway).toBe('MOVE');
  });

  test('GET /decisions/:id returns the stored decision', async () => {
    const a = app();
    const assess = await request(a).post('/assess').send(moveCase);
    const res = await request(a).get(`/decisions/${assess.body.decision.decision_id}`);
    expect(res.status).toBe(200);
    expect(res.body.decision.decision_id).toBe(assess.body.decision.decision_id);
  });

  test('GET /decisions/:id/audit exposes full traceability', async () => {
    const a = app();
    const assess = await request(a).post('/assess').send(moveCase);
    const res = await request(a).get(`/decisions/${assess.body.decision.decision_id}/audit`);
    expect(res.status).toBe(200);
    expect(res.body.audit_trail.canonical_version).toBe('3.1.0');
    expect(res.body.audit_trail.applied_rules.length).toBeGreaterThan(0);
  });

  test('GET /decisions/:id/report renders the client report in Spanish', async () => {
    const a = app();
    const assess = await request(a).post('/assess').send(moveCase);
    const res = await request(a).get(`/decisions/${assess.body.decision.decision_id}/report?lang=es`);
    expect(res.status).toBe(200);
    expect(res.body.sections).toHaveLength(9);
  });

  test('POST /decisions/:id/confirm — coach confirms', async () => {
    const a = app();
    const assess = await request(a).post('/assess').send(moveCase);
    const res = await request(a)
      .post(`/decisions/${assess.body.decision.decision_id}/confirm`)
      .send({ confirmed: true });
    expect(res.status).toBe(200);
    expect(res.body.coach_confirmation.confirmed).toBe(true);
  });

  test('POST /decisions/:id/confirm — override WITHOUT reason is rejected (422)', async () => {
    const a = app();
    const assess = await request(a).post('/assess').send(moveCase);
    const res = await request(a)
      .post(`/decisions/${assess.body.decision.decision_id}/confirm`)
      .send({ confirmed: false });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('OVERRIDE_REASON_REQUIRED');
  });

  test('POST /decisions/:id/confirm — override with reason + category is recorded', async () => {
    const a = app();
    const assess = await request(a).post('/assess').send(moveCase);
    const res = await request(a)
      .post(`/decisions/${assess.body.decision.decision_id}/confirm`)
      .send({
        confirmed: false,
        override_reason: 'Clinical context: recent hip surgery, prioritizing tolerance.',
        override_reason_category: 'MEDICAL',
        clinical_confidence: 85,
      });
    expect(res.status).toBe(200);
    expect(res.body.coach_confirmation.override_reason).toContain('hip surgery');
    expect(res.body.coach_confirmation.override_reason_category).toBe('MEDICAL');
    expect(res.body.coach_confirmation.clinical_confidence).toBe(85);
  });

  test('POST /decisions/:id/confirm — override without category is rejected (Blueprint §6)', async () => {
    const a = app();
    const assess = await request(a).post('/assess').send(moveCase);
    const res = await request(a)
      .post(`/decisions/${assess.body.decision.decision_id}/confirm`)
      .send({ confirmed: false, override_reason: 'some reason' });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('OVERRIDE_CATEGORY_REQUIRED');
  });

  test('GET /clients lists all clients with last decision summary', async () => {
    const a = app();
    await request(a).post('/assess').send(moveCase);
    const res = await request(a).get('/clients');
    expect(res.status).toBe(200);
    expect(res.body.clients).toHaveLength(1);
    expect(res.body.clients[0].last_assessment.pathway).toBe('MOVE');
  });

  test('GET /canonical/tests exposes the canonical test catalogue for the UI', async () => {
    const res = await request(app()).get('/canonical/tests');
    expect(res.status).toBe(200);
    const grip = res.body.tests.find((t: { id: string }) => t.id === 'TEST_HANDGRIP');
    expect(grip.capacities[0].id).toBe('CAP_HEALTH_STRENGTH_MARKERS');
    expect(grip.has_standard).toBe(true);
    // inactive tests (no capacity link) are not offered to the coach
    expect(res.body.tests.some((t: { id: string }) => t.id === 'TEST_SINGLE_LEG_BALANCE')).toBe(false);
  });

  test('unknown decision id → 404', async () => {
    const res = await request(app()).get('/decisions/nope');
    expect(res.status).toBe(404);
  });

  test('out-of-scope module /interventions → 501 MODULE_NOT_IMPLEMENTED', async () => {
    const res = await request(app()).get('/interventions');
    expect(res.status).toBe(501);
    expect(res.body.message).toContain('MODULE NOT IMPLEMENTED');
  });

  test('red-flag case returns BLOCKED decision with medical referral reasoning', async () => {
    const res = await request(app()).post('/assess').send({
      ...moveCase,
      clinical: { events: [{ type: 'RED_FLAG', description: 'syncope during exercise' }] },
    });
    expect(res.status).toBe(200);
    expect(res.body.decision.primary_system_bottleneck.status).toBe('BLOCKED');
    expect(res.body.decision.reasoning_ids).toContain('REASON_MEDICAL_REFERRAL');
  });

  test('multi-domain BUILD case end-to-end: stability critical wins scoring', async () => {
    const res = await request(app()).post('/assess').send({
      ...moveCase,
      client: { name: 'Caso Build', age: 32, sex: 'MALE' },
      test_results: [
        { test_id: 'TEST_FRONT_PLANK', value: 25, valid: true, confidence: 'HIGH' },
        { test_id: 'TEST_ROCKPORT_WALK', value: 40, valid: true, confidence: 'HIGH' },
      ],
    });
    expect(res.body.decision.pathway).toBe('BUILD');
    expect(res.body.decision.primary_system_bottleneck.capacity_id).toBe('CAP_STABILITY');
    expect(res.body.decision.strategy).toBe('SEQUENTIAL');
  });
});
