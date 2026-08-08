/**
 * HTC v3 — API: autenticación, persistencia, confirmación del coach y reporte.
 */
import express from 'express';
import request from 'supertest';
import * as path from 'path';
import { loadCanonicalV3, compileCanonicalV3, CompiledV3 } from '../v3/canonical';
import { createRouterV3 } from '../api/router-v3';
import { InMemoryV3Repository } from '../v3/repository';

const DIR = path.join(__dirname, '..', '..', 'canonical-v3');
let c: CompiledV3;
beforeAll(() => { c = compileCanonicalV3(loadCanonicalV3(DIR)); });

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/v3', createRouterV3(c, new InMemoryV3Repository()));
  return a;
}

const caso = {
  client: { name: 'Diego M.', age: 35, sex: 'MALE' },
  health_gates: { systolic_bp: 120, diastolic_bp: 78, red_flags: [] },
  test_results: [
    { test_key: 'HANDGRIP', value: 31 },
    { test_key: 'WALL_SIT', value: 45 },
    { test_key: 'HIP_AROM', value: 75 },
    { test_key: 'RHR', value: 58 },
  ],
  movement_levels: [
    { level_id: 'L1_IBM', observation_variables: {}, coach_classification: 'FUNCTIONAL' },
    { level_id: 'L2_DC', observation_variables: {}, coach_classification: 'EMERGING' },
  ],
};

describe('Seguridad — /api/v3 protegida igual que el resto', () => {
  const OLD = process.env.HTC_AUTH_PASSWORD;
  afterEach(() => {
    if (OLD === undefined) delete process.env.HTC_AUTH_PASSWORD;
    else process.env.HTC_AUTH_PASSWORD = OLD;
  });

  test('con auth habilitada, sin token responde 401 (no expone datos clínicos)', async () => {
    process.env.HTC_AUTH_PASSWORD = 'secreto-de-prueba';
    const res = await request(app()).get('/api/v3/assessments');
    expect(res.status).toBe(401);
  });

  test('con auth habilitada, POST /assess sin token también responde 401', async () => {
    process.env.HTC_AUTH_PASSWORD = 'secreto-de-prueba';
    const res = await request(app()).post('/api/v3/assess').send(caso);
    expect(res.status).toBe(401);
  });

  test('sin auth configurada (demo local) el acceso es abierto', async () => {
    delete process.env.HTC_AUTH_PASSWORD;
    const res = await request(app()).get('/api/v3/canonical/versions');
    expect(res.status).toBe(200);
  });
});

describe('Catálogo y rubrics', () => {
  test('el catálogo trae dominios, tests, niveles y categorías de override', async () => {
    const res = await request(app()).get('/api/v3/canonical/catalogue');
    expect(res.status).toBe(200);
    expect(res.body.domains).toHaveLength(4);
    expect(res.body.tests).toHaveLength(12);
    expect(res.body.movement_levels).toHaveLength(4);
    expect(res.body.override_categories).toContain('MEDICAL');
  });

  test('los rubrics exponen las 20 variables de observación', async () => {
    const res = await request(app()).get('/api/v3/canonical/rubrics');
    const r = res.body.rubrics;
    const total = Object.values(r).reduce((acc: number, lvl) => acc + Object.keys(lvl as object).length, 0);
    expect(total).toBe(20);
    expect(r.L1_IBM.perception.FOUNDATION).toBeTruthy();
    expect(r.L4_MPS.autonomy.CRITICAL).toBeTruthy();
  });
});

describe('Evaluación y persistencia', () => {
  test('POST /assess guarda y GET /assessments lo lista', async () => {
    const a = app();
    const post = await request(a).post('/api/v3/assess').send(caso);
    expect(post.status).toBe(200);
    const id = post.body.assessment.assessment_id;

    const list = await request(a).get('/api/v3/assessments');
    expect(list.body.assessments).toHaveLength(1);
    expect(list.body.assessments[0]).toMatchObject({
      assessment_id: id, client_name: 'Diego M.', p1_domain: 'STRENGTH',
      rule_applied: 'RULE_SINGLE_CRITICAL', coach_confirmed: null,
    });
  });

  test('GET /assessments/:id devuelve el resultado guardado sin recalcular', async () => {
    const a = app();
    const post = await request(a).post('/api/v3/assess').send(caso);
    const id = post.body.assessment.assessment_id;
    const get = await request(a).get(`/api/v3/assessments/${id}`);
    expect(get.status).toBe(200);
    // Mismo objeto exacto: inmutabilidad (Principio 6).
    expect(get.body.assessment).toEqual(post.body.assessment);
  });

  test('un id inexistente devuelve 404', async () => {
    const res = await request(app()).get('/api/v3/assessments/no-existe');
    expect(res.status).toBe(404);
  });

  test('un test fuera de la tabla canónica devuelve 409 con el motivo', async () => {
    const res = await request(app()).post('/api/v3/assess').send({
      ...caso, test_results: [{ test_key: 'TEST_INVENTADO', value: 10 }],
    });
    expect(res.status).toBe(409);
    expect(res.body.message).toContain('MISSING CANONICAL');
  });

  test('población no cubierta devuelve 409 accionable', async () => {
    const res = await request(app()).post('/api/v3/assess').send({
      ...caso, client: { name: 'Menor de edad', age: 16, sex: 'MALE' },
      test_results: [{ test_key: 'RHR', value: 58 }], movement_levels: [],
    });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/no tiene umbrales/);
  });
});

describe('Coach-led — confirmación y override', () => {
  const setup = async () => {
    const a = app();
    const post = await request(a).post('/api/v3/assess').send(caso);
    return { a, id: post.body.assessment.assessment_id as string };
  };

  test('el coach confirma la recomendación', async () => {
    const { a, id } = await setup();
    const res = await request(a).post(`/api/v3/assessments/${id}/confirm`)
      .send({ confirmed: true, clinical_confidence: 90 });
    expect(res.status).toBe(200);
    expect(res.body.coach_confirmation.confirmed).toBe(true);
    expect(res.body.coach_confirmation.clinical_confidence).toBe(90);
  });

  test('un override SIN razón se rechaza', async () => {
    const { a, id } = await setup();
    const res = await request(a).post(`/api/v3/assessments/${id}/confirm`).send({ confirmed: false });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('OVERRIDE_REASON_REQUIRED');
  });

  test('un override SIN categoría se rechaza', async () => {
    const { a, id } = await setup();
    const res = await request(a).post(`/api/v3/assessments/${id}/confirm`)
      .send({ confirmed: false, override_reason: 'porque sí' });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('OVERRIDE_CATEGORY_REQUIRED');
  });

  test('un override con razón y categoría queda registrado', async () => {
    const { a, id } = await setup();
    const res = await request(a).post(`/api/v3/assessments/${id}/confirm`).send({
      confirmed: false,
      override_reason: 'Cirugía de hombro hace 5 semanas; priorizo tolerancia.',
      override_reason_category: 'MEDICAL',
      clinical_confidence: 75,
    });
    expect(res.status).toBe(200);
    expect(res.body.coach_confirmation.override_reason_category).toBe('MEDICAL');
    expect(res.body.coach_confirmation.confirmed_at).toBeTruthy();

    const list = await request(a).get('/api/v3/assessments');
    expect(list.body.assessments[0].coach_confirmed).toBe(false);
  });

  test('una categoría inventada se rechaza', async () => {
    const { a, id } = await setup();
    const res = await request(a).post(`/api/v3/assessments/${id}/confirm`)
      .send({ confirmed: false, override_reason: 'x', override_reason_category: 'INVENTADA' });
    expect(res.status).toBe(422);
  });

  test('clinical_confidence fuera de 0-100 se rechaza', async () => {
    const { a, id } = await setup();
    const res = await request(a).post(`/api/v3/assessments/${id}/confirm`)
      .send({ confirmed: true, clinical_confidence: 150 });
    expect(res.status).toBe(422);
  });
});

describe('Reporte del cliente', () => {
  test('se genera en español con las secciones canónicas', async () => {
    const a = app();
    const post = await request(a).post('/api/v3/assess').send(caso);
    const id = post.body.assessment.assessment_id;
    const res = await request(a).get(`/api/v3/assessments/${id}/report?lang=es`);
    expect(res.status).toBe(200);
    const ids = res.body.sections.map((s: { id: string }) => s.id);
    expect(ids).toContain('DOMAIN_PROFILE');
    expect(ids).toContain('BOTTLENECK');
    expect(ids).toContain('ROADMAP');
    const profile = res.body.sections.find((s: { id: string }) => s.id === 'DOMAIN_PROFILE');
    expect(profile.content.join(' ')).toContain('Fuerza');
  });

  test('se genera en inglés con los mismos datos', async () => {
    const a = app();
    const post = await request(a).post('/api/v3/assess').send(caso);
    const id = post.body.assessment.assessment_id;
    const res = await request(a).get(`/api/v3/assessments/${id}/report?lang=en`);
    const profile = res.body.sections.find((s: { id: string }) => s.id === 'DOMAIN_PROFILE');
    expect(profile.content.join(' ')).toContain('Strength');
  });

  test('un caso bloqueado explica la derivación médica al cliente', async () => {
    const a = app();
    const post = await request(a).post('/api/v3/assess').send({
      ...caso, health_gates: { systolic_bp: 190, red_flags: [] },
    });
    const id = post.body.assessment.assessment_id;
    const res = await request(a).get(`/api/v3/assessments/${id}/report?lang=es`);
    const health = res.body.sections.find((s: { id: string }) => s.id === 'HEALTH_STATUS');
    expect(health.content.join(' ')).toContain('médico');
  });
});
