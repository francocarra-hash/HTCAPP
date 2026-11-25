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

import { gunzipSync } from 'zlib';
import { isDue, mailConfig, readableBackup, buildBackup, sendBackup, weekOf, autoStatus } from '../training/backup';

describe('copia automática por mail', () => {
  // 2026-11-27 es viernes.
  test('se manda los viernes desde las 8, una vez por semana; si falló, se reintenta el finde', () => {
    expect(isDue({ date: '2026-11-27', time: '07:59' }, undefined)).toBe(false);
    expect(isDue({ date: '2026-11-27', time: '08:00' }, undefined)).toBe(true);
    expect(isDue({ date: '2026-11-26', time: '20:00' }, undefined)).toBe(false);
    const sent = { at: 'x', ok: true, error: null, week: weekOf('2026-11-27') };
    expect(isDue({ date: '2026-11-27', time: '10:00' }, sent)).toBe(false);
    expect(isDue({ date: '2026-11-28', time: '10:00' }, sent)).toBe(false);
    const failed = { ...sent, ok: false, error: 'auth' };
    expect(isDue({ date: '2026-11-28', time: '10:00' }, failed)).toBe(true);
    expect(isDue({ date: '2026-11-29', time: '23:00' }, failed)).toBe(true);
    expect(isDue({ date: '2026-11-30', time: '10:00' }, failed)).toBe(false);
    // La semana siguiente vuelve a tocar.
    expect(isDue({ date: '2026-12-04', time: '09:00' }, sent)).toBe(true);
  });

  test('configuración: sin usuario y contraseña no se manda; por defecto Gmail y a la misma cuenta', () => {
    expect(mailConfig({})).toBeNull();
    expect(mailConfig({ HTC_SMTP_USER: 'profe@example.com', HTC_SMTP_PASS: 'abcd efgh ijkl mnop' }))
      .toEqual({ host: 'smtp.gmail.com', port: 465, user: 'profe@example.com', pass: 'abcdefghijklmnop', to: 'profe@example.com' });
    expect(mailConfig({ HTC_SMTP_USER: 'a@example.com', HTC_SMTP_PASS: 'x', HTC_BACKUP_TO: 'b@example.com' })!.to).toBe('b@example.com');
  });

  test('el mail lleva la copia completa comprimida y las rutinas en texto, y queda registrado', async () => {
    const repo = new InMemoryTrainingRepository();
    const s = await repo.createStudent({ name: 'Ana Ruiz', username: 'ana', age: null, sex: null, goal: null, notes: null, password_hash: 'secreto' });
    await repo.createSessions([{ date: '2026-11-20', date_raw: null, date_note: null, title: 'Piernas', body: '', seq: 0, status: 'done', participant_ids: [s.id],
      routine: { note: null, blocks: [{ id: 'b', kind: 'circuit', title: '', rounds: 2, groups: [{ id: 'g', items: [{ id: 'i', name: 'Plank', dose: '30s' }, { id: 'j', name: 'Hollow', dose: '20s' }] }] }] } }]);
    const sent: Array<{ subject: string; attachments: Array<{ filename: string; content: Buffer }> }> = [];
    const st = await sendBackup(repo, { host: 'h', port: 465, user: 'u@example.com', pass: 'p', to: 'u@example.com' }, async (_cfg, msg) => { sent.push(msg); });
    expect(st.ok).toBe(true);
    expect(sent[0]!.subject).toMatch(/^HTC · Copia de seguridad del \d\d\/\d\d\/\d{4}$/);
    const [json, txt] = sent[0]!.attachments;
    const data = JSON.parse(gunzipSync(json!.content).toString('utf8'));
    expect(data.students).toEqual([expect.objectContaining({ name: 'Ana Ruiz' })]);
    expect(JSON.stringify(data)).not.toContain('secreto');
    expect(txt!.content.toString('utf8')).toContain('Viernes 20 de noviembre de 2026 · Piernas\n[Plank 30s/ Hollow 20s] x2');
    expect(await autoStatus(repo)).toMatchObject({ ok: true, error: null });
  });

  test('si el mail falla, queda el error para mostrarlo', async () => {
    const repo = new InMemoryTrainingRepository();
    const st = await sendBackup(repo, { host: 'h', port: 465, user: 'u', pass: 'p', to: 'u' }, async () => { throw new Error('Invalid login'); });
    expect(st).toMatchObject({ ok: false, error: 'Invalid login' });
    expect(await autoStatus(repo)).toMatchObject({ ok: false, error: 'Invalid login' });
  });

  test('las rutinas en texto van por alumno, de la más nueva a la más vieja', async () => {
    const repo = new InMemoryTrainingRepository();
    const s = await repo.createStudent({ name: 'Bruno', username: 'bruno', age: null, sex: null, goal: null, notes: null, password_hash: 'x' });
    const r = (name: string) => ({ note: null, blocks: [{ id: 'b', kind: 'list' as const, title: '', rounds: null, groups: [{ id: 'g', items: [{ id: 'i', name, dose: '' }] }] }] });
    await repo.createSessions([
      { date: '2026-11-13', date_raw: null, date_note: null, title: null, body: '', seq: 0, status: 'done', participant_ids: [s.id], routine: r('Wall sit') },
      { date: '2026-11-20', date_raw: null, date_note: null, title: null, body: '', seq: 0, status: 'done', participant_ids: [s.id], routine: r('Pistol') },
    ]);
    const txt = readableBackup(await buildBackup(repo));
    expect(txt.indexOf('Pistol')).toBeLessThan(txt.indexOf('Wall sit'));
    expect(txt).toContain('BRUNO\n2 sesiones');
  });

  test('la app muestra si el envío está configurado; probar sin configurar avisa', async () => {
    const repo = new InMemoryTrainingRepository();
    const a = express();
    a.use(express.json());
    a.use('/api', createAuthRouter(repo));
    a.use('/api/training', createTrainingRouter(repo));
    const auth = `Bearer ${(await request(a).post('/api/login').send({ username: 'profe', password: 'profe-secreto' })).body.token}`;
    const prev = { u: process.env.HTC_SMTP_USER, p: process.env.HTC_SMTP_PASS };
    delete process.env.HTC_SMTP_USER; delete process.env.HTC_SMTP_PASS;
    try {
      expect((await request(a).get('/api/training/backup/last').set('Authorization', auth)).body.auto).toEqual({ configured: false, to: null, status: null });
      const r = await request(a).post('/api/training/backup/send').set('Authorization', auth);
      expect(r.status).toBe(400);
      expect(r.body.error).toBe('NOT_CONFIGURED');
    } finally {
      if (prev.u !== undefined) process.env.HTC_SMTP_USER = prev.u;
      if (prev.p !== undefined) process.env.HTC_SMTP_PASS = prev.p;
    }
  });
});
