/**
 * Sesión guardada al marcar presente: si el profe se olvida de cargar la clase,
 * no se pierde. Y si saca el presente, se deshace sin tocar lo que él editó.
 */
import express from 'express';
import request from 'supertest';
import { createAuthRouter, createStudentRouter, createTrainingRouter } from '../api/router-training';
import { InMemoryTrainingRepository } from '../training/repository';
import { localNow } from '../training/schedule';

const OLD = process.env.HTC_AUTH_PASSWORD;
beforeAll(() => { process.env.HTC_AUTH_PASSWORD = 'profe-secreto'; });
afterAll(() => {
  if (OLD === undefined) delete process.env.HTC_AUTH_PASSWORD;
  else process.env.HTC_AUTH_PASSWORD = OLD;
});

const addDays = (iso: string, n: number): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const TODAY = localNow().date;
const LAST_WEEK = addDays(TODAY, -7);
const YESTERDAY = addDays(TODAY, -1);
const routine = (name: string) => ({
  note: null,
  blocks: [{ id: 'b1', kind: 'list', title: 'Bloque', rounds: 3, groups: [{ id: 'g1', items: [{ id: 'i1', name, dose: '10' }] }] }],
});

async function setup() {
  const repo = new InMemoryTrainingRepository();
  const a = express();
  a.use(express.json());
  a.use('/api', createAuthRouter(repo));
  a.use('/api/training', createTrainingRouter(repo));
  a.use('/api/me', createStudentRouter(repo));
  const auth = `Bearer ${(await request(a).post('/api/login').send({ username: 'profe', password: 'profe-secreto' })).body.token}`;
  const student = async (name: string) => (await request(a).post('/api/training/students').set('Authorization', auth).send({ name })).body.student.id as string;
  const session = async (ids: string[], date: string, status: 'done' | 'planned', name = 'Wall sit') =>
    (await request(a).post('/api/training/sessions/routine').set('Authorization', auth)
      .send({ date, status, participant_ids: ids, routine: routine(name), title: 'Piernas' })).body.session.id as string;
  const mark = async (ids: string[], day: string, m: 'p' | 'a' | 'e' | null) =>
    (await request(a).put('/api/training/attendance').set('Authorization', auth).send({ student_ids: ids, day, mark: m })).body;
  const sessionsOf = async (id: string) => (await request(a).get(`/api/training/students/${id}`).set('Authorization', auth)).body.sessions as Array<{
    id: string; date: string; status: string; title: string | null; participant_ids: string[]; auto_from: string | null;
    routine: { blocks: Array<{ groups: Array<{ items: Array<{ id: string; name: string }> }> }> };
  }>;
  return { a, auth, repo, student, session, mark, sessionsOf };
}

describe('marcar presente guarda la clase', () => {
  test('sin sesión ese día: se guarda una copia de la anterior, y aparece en el historial', async () => {
    const { student, session, mark, sessionsOf } = await setup();
    const id = await student('Ezequiel Poggio');
    const prev = await session([id], LAST_WEEK, 'done', 'Copenhagen iso');
    const r = await mark([id], YESTERDAY, 'p');
    expect(r.sessions.created).toEqual([expect.objectContaining({ student_id: id, kind: 'copia', from_date: LAST_WEEK })]);
    const ss = await sessionsOf(id);
    const auto = ss.find((s) => s.date === YESTERDAY)!;
    expect(auto).toMatchObject({ status: 'done', title: 'Piernas', auto_from: prev, participant_ids: [id] });
    expect(auto.routine.blocks[0]!.groups[0]!.items[0]!.name).toBe('Copenhagen iso');
    // Copia con ids nuevos: lo que se registre en una no pisa a la otra.
    const orig = ss.find((s) => s.id === prev)!;
    expect(auto.routine.blocks[0]!.groups[0]!.items[0]!.id).not.toBe(orig.routine.blocks[0]!.groups[0]!.items[0]!.id);
  });

  test('si ya tenía la sesión cargada ese día, no se agrega otra', async () => {
    const { student, session, mark, sessionsOf } = await setup();
    const id = await student('Ana');
    await session([id], LAST_WEEK, 'done');
    await session([id], YESTERDAY, 'done');
    expect((await mark([id], YESTERDAY, 'p')).sessions.created).toEqual([]);
    expect((await sessionsOf(id)).filter((s) => s.date === YESTERDAY)).toHaveLength(1);
  });

  test('si tenía una rutina asignada para ese día, pasa a hecha (y vuelve a asignada al sacar el presente)', async () => {
    const { student, session, mark, sessionsOf } = await setup();
    const id = await student('Ana');
    const planned = await session([id], YESTERDAY, 'planned');
    expect((await mark([id], YESTERDAY, 'p')).sessions.created).toEqual([expect.objectContaining({ session_id: planned, kind: 'asignada' })]);
    expect((await sessionsOf(id)).find((s) => s.id === planned)!.status).toBe('done');
    expect((await mark([id], YESTERDAY, null)).sessions.removed).toBe(1);
    expect((await sessionsOf(id)).find((s) => s.id === planned)).toMatchObject({ status: 'planned', auto_from: null });
  });

  test('alumno sin sesiones anteriores: queda una sesión vacía para que la clase figure', async () => {
    const { student, mark, sessionsOf } = await setup();
    const id = await student('Nuevo');
    expect((await mark([id], TODAY, 'p')).sessions.created).toEqual([expect.objectContaining({ kind: 'vacia', from_date: null })]);
    expect(await sessionsOf(id)).toEqual([expect.objectContaining({ date: TODAY, status: 'done', auto_from: 'none' })]);
  });

  test('un día que todavía no pasó no guarda nada', async () => {
    const { student, session, mark, sessionsOf } = await setup();
    const id = await student('Ana');
    await session([id], LAST_WEEK, 'done');
    expect((await mark([id], addDays(TODAY, 2), 'p')).sessions.created).toEqual([]);
    expect(await sessionsOf(id)).toHaveLength(1);
  });

  test('ausente o "ejercicios" no guardan sesión', async () => {
    const { student, session, mark, sessionsOf } = await setup();
    const id = await student('Ana');
    await session([id], LAST_WEEK, 'done');
    await mark([id], YESTERDAY, 'a');
    await mark([id], TODAY, 'e');
    expect(await sessionsOf(id)).toHaveLength(1);
  });

  test('clase compartida: los dos quedan en la misma sesión nueva, marcados juntos o de a uno', async () => {
    const { student, session, mark, sessionsOf } = await setup();
    const carlos = await student('Carlos');
    const ceci = await student('Ceci');
    await session([carlos, ceci], LAST_WEEK, 'done');
    await mark([carlos, ceci], YESTERDAY, 'p');
    const a = (await sessionsOf(carlos)).filter((s) => s.date === YESTERDAY);
    expect(a).toHaveLength(1);
    expect(a[0]!.participant_ids.sort()).toEqual([carlos, ceci].sort());
    // De a uno, otro día.
    await mark([carlos], TODAY, 'p');
    await mark([ceci], TODAY, 'p');
    const b = (await sessionsOf(ceci)).filter((s) => s.date === TODAY);
    expect(b).toHaveLength(1);
    expect(b[0]!.participant_ids.sort()).toEqual([carlos, ceci].sort());
  });
});

describe('sacar el presente', () => {
  test('se deshace la copia si nadie la tocó', async () => {
    const { student, session, mark, sessionsOf } = await setup();
    const id = await student('Ana');
    await session([id], LAST_WEEK, 'done');
    await mark([id], YESTERDAY, 'p');
    expect((await mark([id], YESTERDAY, 'a')).sessions.removed).toBe(1);
    expect((await sessionsOf(id)).map((s) => s.date)).toEqual([LAST_WEEK]);
  });

  test('en una clase compartida sólo sale ese alumno', async () => {
    const { student, session, mark, sessionsOf } = await setup();
    const carlos = await student('Carlos');
    const ceci = await student('Ceci');
    await session([carlos, ceci], LAST_WEEK, 'done');
    await mark([carlos, ceci], YESTERDAY, 'p');
    await mark([ceci], YESTERDAY, null);
    expect((await sessionsOf(carlos)).find((s) => s.date === YESTERDAY)!.participant_ids).toEqual([carlos]);
    expect((await sessionsOf(ceci)).find((s) => s.date === YESTERDAY)).toBeUndefined();
  });

  test('si el profe la editó, queda como está', async () => {
    const { a, auth, student, session, mark, sessionsOf } = await setup();
    const id = await student('Ana');
    await session([id], LAST_WEEK, 'done');
    const created = (await mark([id], YESTERDAY, 'p')).sessions.created[0].session_id as string;
    await request(a).patch(`/api/training/sessions/${created}`).set('Authorization', auth).send({ routine: routine('Pistol squat') });
    expect((await sessionsOf(id)).find((s) => s.id === created)!.auto_from).toBeNull();
    expect((await mark([id], YESTERDAY, null)).sessions.removed).toBe(0);
    expect((await sessionsOf(id)).find((s) => s.id === created)).toBeDefined();
  });

  test('si se corrigió lo realizado en esa sesión, queda como está', async () => {
    const { a, auth, student, session, mark, sessionsOf } = await setup();
    const id = await student('Ana');
    await session([id], LAST_WEEK, 'done');
    const created = (await mark([id], YESTERDAY, 'p')).sessions.created[0].session_id as string;
    const item = (await sessionsOf(id)).find((s) => s.id === created)!.routine.blocks[0]!.groups[0]!.items[0]!.id;
    const put = await request(a).put(`/api/training/sessions/${created}/record/${id}`).set('Authorization', auth)
      .send({ executions: [{ item_id: item, tracking: 'dinamica', load_config: null, sets: [{ n: 1, reps: 12 }] }] });
    expect(put.status).toBe(200);
    expect((await mark([id], YESTERDAY, null)).sessions.removed).toBe(0);
    expect((await sessionsOf(id)).find((s) => s.id === created)).toBeDefined();
  });
});

describe('cargar la sesión de verdad después', () => {
  test('desde Planificar: reemplaza a la copia, no queda repetida', async () => {
    const { student, session, mark, sessionsOf } = await setup();
    const id = await student('Ana');
    await session([id], LAST_WEEK, 'done');
    await mark([id], YESTERDAY, 'p');
    const real = await session([id], YESTERDAY, 'done', 'Pistol squat');
    const day = (await sessionsOf(id)).filter((s) => s.date === YESTERDAY);
    expect(day.map((s) => s.id)).toEqual([real]);
  });

  test('una rutina asignada nueva para ese día no borra la copia', async () => {
    const { student, session, mark, sessionsOf } = await setup();
    const id = await student('Ana');
    await session([id], LAST_WEEK, 'done');
    await mark([id], YESTERDAY, 'p');
    await session([id], YESTERDAY, 'planned', 'Pistol squat');
    expect((await sessionsOf(id)).filter((s) => s.date === YESTERDAY)).toHaveLength(2);
  });

  test('en una clase compartida sólo sale de la copia el que se cargó', async () => {
    const { student, session, mark, sessionsOf } = await setup();
    const carlos = await student('Carlos');
    const ceci = await student('Ceci');
    await session([carlos, ceci], LAST_WEEK, 'done');
    await mark([carlos, ceci], YESTERDAY, 'p');
    await session([carlos], YESTERDAY, 'done', 'Pistol squat');
    expect((await sessionsOf(ceci)).filter((s) => s.date === YESTERDAY)).toEqual([expect.objectContaining({ participant_ids: [ceci] })]);
    expect((await sessionsOf(carlos)).filter((s) => s.date === YESTERDAY)).toHaveLength(1);
  });
});
