/**
 * Copia de seguridad: un archivo con todos los datos del profe, sin contraseñas,
 * y la fecha de la última copia descargada.
 */
import express from 'express';
import request from 'supertest';
import { createAuthRouter, createTrainingRouter } from '../api/router-training';
import { InMemoryTrainingRepository } from '../training/repository';

const OLD = process.env.HTC_AUTH_PASSWORD;
beforeAll(() => { process.env.HTC_AUTH_PASSWORD = 'profe-secreto'; });
afterAll(() => {
  if (OLD === undefined) delete process.env.HTC_AUTH_PASSWORD;
  else process.env.HTC_AUTH_PASSWORD = OLD;
});

test('la copia trae todo lo cargado, sin contraseñas, y queda registrada', async () => {
  const repo = new InMemoryTrainingRepository();
  const a = express();
  a.use(express.json());
  a.use('/api', createAuthRouter(repo));
  a.use('/api/training', createTrainingRouter(repo));
  const auth = `Bearer ${(await request(a).post('/api/login').send({ username: 'profe', password: 'profe-secreto' })).body.token}`;
  const id = (await request(a).post('/api/training/students').set('Authorization', auth).send({ name: 'Ana Ruiz' })).body.student.id as string;
  await request(a).post('/api/training/sessions').set('Authorization', auth)
    .send({ text: '12/11/2026\nCat/Cow - Spinal Bridge\n[Plank 30s/ Hollow 20s] x2', student_ids: [id] });
  await request(a).put('/api/training/attendance').set('Authorization', auth).send({ student_ids: [id], day: '2026-11-12', mark: 'p' });

  expect((await request(a).get('/api/training/backup')).status).toBe(401);
  expect((await request(a).get('/api/training/backup/last').set('Authorization', auth)).body.last).toBeNull();
  const r = await request(a).get('/api/training/backup').set('Authorization', auth);
  expect(r.status).toBe(200);
  expect(r.body).toMatchObject({ app: 'HTC', format: 1 });
  expect(r.body.students).toEqual([expect.objectContaining({ id, name: 'Ana Ruiz' })]);
  expect(JSON.stringify(r.body)).not.toMatch(/password|scrypt/i);
  expect(r.body.sessions).toHaveLength(1);
  // La rutina va armada aunque la sesión se haya cargado como texto.
  expect(r.body.sessions[0].routine.blocks.length).toBeGreaterThan(0);
  expect(r.body.attendance).toEqual([expect.objectContaining({ student_id: id, day: '2026-11-12', mark: 'p' })]);
  for (const k of ['completions', 'payments', 'charges', 'reports', 'executions', 'responses', 'quality', 'exercises', 'changes']) {
    expect(Array.isArray(r.body[k])).toBe(true);
  }
  expect((await request(a).get('/api/training/backup/last').set('Authorization', auth)).body.last).toBe(r.body.exported_at);
});
