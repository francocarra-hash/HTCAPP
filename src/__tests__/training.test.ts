/**
 * Alumnos y sesiones: parser del formato del coach, corrección de fechas,
 * progreso y permisos (un alumno nunca ve rutas del coach ni datos de otro).
 */
import express from 'express';
import request from 'supertest';
import { doseOf, exerciseName, fixDates, parseBody, splitSessions } from '../training/parser';
import { buildProgress, exerciseKey } from '../training/progress';
import { InMemoryTrainingRepository } from '../training/repository';
import { createAuthRouter, createStudentRouter, createTrainingRouter } from '../api/router-training';
import { createRouter } from '../api/router';
import { InMemoryRepository } from '../db/repository';
import { compiled } from './helpers';

const ANA = { id: 'a', name: 'Ana Pérez', username: 'ana' };
const BETO = { id: 'b', name: 'Beto', username: 'beto' };

const SESSION = `Cat/ Cow - Spinal Bridge - Jefferson to plank to t-rotation
[Crawling 3 points 20s/ Crawling f+ tabletop b - High side plank 10r/ Copenhagen 30s
+10r - Rolling Tabletop 15/ SL 8 - Wall sit 1:30min/ 2min - Push up iso 30s/ ana inclined] x2
Chair Test:  25repes 30s
A1 - Skater Sq 10r + CMJ 3
A2 - Swimmers 15/ 20 + push ups 25/30/30/ ana 15 inclined
A3 - Skater sq 12- Lateral POGO 30s
x3
4x4 -> 15
S`;

describe('parser — cuerpo de la sesión', () => {
  const p = parseBody(SESSION, [ANA, BETO]);

  test('movilidad separada por " - " sin partir "t-rotation" ni "Cat/ Cow"', () => {
    expect(p.warmup).toEqual(['Cat/ Cow', 'Spinal Bridge', 'Jefferson to plank to t-rotation']);
  });

  test('circuito: estaciones, pares por "/", vueltas y dosis cortada en dos líneas', () => {
    expect(p.circuits).toHaveLength(1);
    const c = p.circuits[0]!;
    expect(c.rounds).toBe(2);
    expect(c.stations.map((s) => s.map((i) => i.text))).toEqual([
      ['Crawling 3 points 20s', 'Crawling f+ tabletop b'],
      ['High side plank 10r', 'Copenhagen 30s+10r'],
      ['Rolling Tabletop 15', 'SL 8'],
      ['Wall sit 1:30min/ 2min'],
      ['Push up iso 30s', 'inclined'],
    ]);
    // "SL 8" es una variante del ejercicio anterior.
    expect(c.stations[2]![1]!.name).toBe('Rolling Tabletop SL');
    // "ana inclined" es una variante personal.
    expect(c.stations[4]![1]!.who).toBe('Ana');
  });

  test('bloque principal: superseries, vueltas y variantes personales', () => {
    expect(p.strength?.rounds).toBe(3);
    expect(p.strength?.lines.map((l) => l.label)).toEqual(['A1', 'A2', 'A3']);
    expect(p.strength?.lines[0]!.items.map((i) => i.text)).toEqual(['Skater Sq 10r', 'CMJ 3']);
    expect(p.strength?.lines[1]!.items.map((i) => [i.who ?? '', i.text])).toEqual([
      ['', 'Swimmers 15/ 20'], ['', 'push ups 25/30/30'], ['Ana', '15 inclined'],
    ]);
    expect(p.strength?.lines[2]!.items.map((i) => i.text)).toEqual(['Skater sq 12', 'Lateral POGO 30s']);
  });

  test('notas extra se conservan tal cual', () => {
    expect(p.extras).toEqual(['Chair Test:  25repes 30s', '4x4 → 15', 'S']);
  });

  test('sesión sin estructura queda como nota', () => {
    const n = parseBody('Trabajo articular de seguimiento pieza por pieza', []);
    expect(n.note).toBe('Trabajo articular de seguimiento pieza por pieza');
    expect(n.warmup).toEqual([]);
  });

  test('circuito sin número de vueltas y dos circuitos en la misma sesión', () => {
    const q = parseBody('[Hollow body 35s - Kickstand 10+10s] x\nA1 - Pistol 8\n[SL Wall sit 25s - Long Bridge 45s] x1', []);
    expect(q.circuits.map((c) => c.rounds)).toEqual([null, 1]);
    expect(q.strength?.lines).toHaveLength(1);
  });
});

describe('parser — dosis y nombres', () => {
  test('tiempos, repeticiones por serie, kilos; los extras "+10r" no cuentan', () => {
    expect(doseOf('Wall sit 2:30min')).toEqual({ seconds: [150], reps: [], kg: [] });
    expect(doseOf('Wall sit 1:30min/ 2min').seconds).toEqual([90, 120]);
    expect(doseOf('Copenhagen 30s+10r')).toEqual({ seconds: [30], reps: [], kg: [] });
    expect(doseOf('Push ups 15+5s/20/25').reps).toEqual([15, 20, 25]);
    expect(doseOf('POGO 80 /95/ 105').reps).toEqual([80, 95, 105]);
    expect(doseOf('Calf Raise SL iso 35s 10kg')).toEqual({ seconds: [35], reps: [], kg: [10] });
    expect(doseOf('Ring L-sit 10sx2')).toEqual({ seconds: [10], reps: [], kg: [] });
  });

  test('nombre del ejercicio sin la dosis', () => {
    expect(exerciseName('Push up iso 30s+short elastic rom 8')).toBe('Push up iso');
    expect(exerciseName('3 forward hopsx3')).toBe('forward hops');
    expect(exerciseName('Knight Rotation 10k 12r both diagonals')).toBe('Knight Rotation both diagonals');
    expect(exerciseName('Elevated Pike ups 6r/8r')).toBe('Elevated Pike ups');
    expect(exerciseKey('SA Tabletop')).toBe(exerciseKey('Tabletop SA'));
    expect(exerciseKey('YIWTO')).toBe(exerciseKey('iywto'));
  });
});

describe('parser — sesiones y fechas', () => {
  test('cabecera "- Nombre" restringe la sesión a ese alumno; otro texto es título', () => {
    const { sessions } = splitSessions('13/2/2026\nA1 - x 1\n26/6/2026 - Beto\nA1 - y 2\n9/10/2026 - Hombros\nA1 - z 3', [ANA, BETO], null);
    expect(sessions.map((s) => [s.date, s.onlyFor, s.title])).toEqual([
      ['2026-02-13', null, null], ['2026-06-26', 'b', null], ['2026-10-09', null, 'Hombros'],
    ]);
  });

  test('texto sin fecha = una sesión con la fecha por defecto', () => {
    const { sessions } = splitSessions('A1 - Pistol 8', [ANA], '2026-10-16');
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.date).toBe('2026-10-16');
  });

  test('fechas fuera de orden: día/mes invertidos, mes y año mal tipeados', () => {
    // Secuencia tomada de notas reales: el orden de las sesiones vecinas resuelve cada error.
    const r = fixDates([
      { d: 20, m: 2, y: 2026 }, { d: 27, m: 2, y: 2026 }, { d: 3, m: 2, y: 2026 }, { d: 3, m: 4, y: 2026 },
      { d: 9, m: 3, y: 2026 }, { d: 13, m: 3, y: 2026 }, { d: 16, m: 3, y: 2026 },
      { d: 1, m: 5, y: 2026 }, { d: 8, m: 5, y: 2026 }, { d: 11, m: 6, y: 2026 }, { d: 18, m: 6, y: 2026 },
      { d: 22, m: 5, y: 2026 }, { d: 25, m: 5, y: 2026 }, { d: 1, m: 6, y: 2026 },
      { d: 13, m: 8, y: 2026 }, { d: 21, m: 8, y: 2027 }, { d: 24, m: 8, y: 2026 },
    ]);
    expect(r.map((x) => x.date)).toEqual([
      '2026-02-20', '2026-02-27', '2026-03-02', '2026-03-04',
      '2026-03-09', '2026-03-13', '2026-03-16',
      '2026-05-01', '2026-05-08', '2026-05-11', '2026-05-18',
      '2026-05-22', '2026-05-25', '2026-06-01',
      '2026-08-13', '2026-08-21', '2026-08-24',
    ]);
    expect(r[2]!.note).toMatch(/3\/2\/2026/);
    expect(r[0]!.note).toBeNull();
  });
});

describe('progreso', () => {
  const s = (date: string, body: string) => ({ date, parsed: parseBody(body, [ANA, BETO]) });
  const sessions = [
    s('2026-02-01', '[Wall sit 1:05min - Push up iso 30s/ ana inclined] x2'),
    s('2026-03-01', '[Wall sit 1:30min - Push up iso 40s/ ana inclined] x2'),
    s('2026-04-01', '[Wall sit 2:30min - Push up iso 45s/ ana inclined] x2'),
  ];

  test('serie por ejercicio con la dosis escrita y logros', () => {
    const p = buildProgress('Beto', sessions, new Date('2026-04-15'));
    const wall = p.exercises.find((e) => e.name === 'Wall sit')!;
    expect(wall.unit).toBe('s');
    expect(wall.points.map((x) => x.value)).toEqual([65, 90, 150]);
    expect(p.highlights[0]).toMatchObject({ name: 'Wall sit', from: 65, to: 150 });
    expect(p.exercises.find((e) => e.name === 'Push up iso')?.points.map((x) => x.value)).toEqual([30, 40, 45]);
    expect(p.stats.sessions).toBe(3);
  });

  test('la base que reemplaza una variante personal no cuenta para esa persona', () => {
    const p = buildProgress('Ana Pérez', sessions, new Date('2026-04-15'));
    expect(p.exercises.find((e) => e.name === 'Push up iso')).toBeUndefined();
    expect(p.exercises.find((e) => e.name === 'Wall sit')).toBeDefined();
  });
});

describe('API — alumnos, sesiones y permisos', () => {
  const OLD = process.env.HTC_AUTH_PASSWORD;
  beforeEach(() => { process.env.HTC_AUTH_PASSWORD = 'profe-secreto'; });
  afterAll(() => {
    if (OLD === undefined) delete process.env.HTC_AUTH_PASSWORD;
    else process.env.HTC_AUTH_PASSWORD = OLD;
  });

  function app() {
    const repo = new InMemoryTrainingRepository();
    const a = express();
    a.use(express.json());
    a.use('/api', createAuthRouter(repo));
    a.use('/api/training', createTrainingRouter(repo));
    a.use('/api/me', createStudentRouter(repo));
    a.use('/api', createRouter(compiled(), new InMemoryRepository()));
    return a;
  }
  async function coach(a: express.Express) {
    const r = await request(a).post('/api/login').send({ username: 'profe', password: 'profe-secreto' });
    expect(r.status).toBe(200);
    expect(r.body.role).toBe('coach');
    return `Bearer ${r.body.token}`;
  }

  test('el login viejo (sólo contraseña) sigue entrando como coach', async () => {
    const r = await request(app()).post('/api/login').send({ password: 'profe-secreto' });
    expect(r.status).toBe(200);
    expect(r.body.role).toBe('coach');
  });

  test('flujo completo: alta, carga compartida, sesión "solo para", vista del alumno', async () => {
    const a = app();
    const auth = await coach(a);
    const ana = await request(a).post('/api/training/students').set('Authorization', auth)
      .send({ name: 'Ana Pérez', age: 62, goal: 'Movilidad', notes: 'privado del coach' });
    expect(ana.status).toBe(201);
    expect(ana.body.student.username).toBe('ana');
    expect(ana.body.password).toMatch(/^ana-/);
    const beto = await request(a).post('/api/training/students').set('Authorization', auth).send({ name: 'Beto' });
    const ids = [ana.body.student.id, beto.body.student.id];

    const text = '1/9/2026\n[Wall sit 1min] x2\n4/9/2026 - Beto\n[Wall sit 2min] x2';
    const prev = await request(a).post('/api/training/sessions/preview').set('Authorization', auth)
      .send({ text, student_ids: ids });
    expect(prev.status).toBe(200);
    expect(prev.body.sessions.map((s: { participant_ids: string[] }) => s.participant_ids.length)).toEqual([2, 1]);
    const saved = await request(a).post('/api/training/sessions').set('Authorization', auth).send({ text, student_ids: ids });
    expect(saved.status).toBe(201);

    const login = await request(a).post('/api/login').send({ username: 'ANA', password: ana.body.password });
    expect(login.status).toBe(200);
    expect(login.body.role).toBe('student');
    const me = await request(a).get('/api/me').set('Authorization', `Bearer ${login.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.student.name).toBe('Ana Pérez');
    expect(me.body.sessions).toHaveLength(1); // la del 4/9 era sólo de Beto
    expect(me.body.partners.map((p: { name: string }) => p.name)).toEqual(['Beto']);
    expect(me.body).not.toHaveProperty('student.password_hash');
    expect(me.body.student.goal).toBe('Movilidad');
    expect(me.body.student.notes).toBeNull(); // las notas del coach no le llegan al alumno
  });

  test('un token de alumno no abre rutas del coach ni del motor de evaluación', async () => {
    const a = app();
    const auth = await coach(a);
    const ana = await request(a).post('/api/training/students').set('Authorization', auth).send({ name: 'Ana' });
    const login = await request(a).post('/api/login').send({ username: 'ana', password: ana.body.password });
    const st = `Bearer ${login.body.token}`;
    expect((await request(a).get('/api/training/students').set('Authorization', st)).status).toBe(401);
    expect((await request(a).get('/api/clients').set('Authorization', st)).status).toBe(401);
    // …y un token de coach no es un alumno.
    expect((await request(a).get('/api/me').set('Authorization', auth)).status).toBe(401);
  });

  test('contraseña incorrecta, cambio de contraseña y reseteo por el coach', async () => {
    const a = app();
    const auth = await coach(a);
    const ana = await request(a).post('/api/training/students').set('Authorization', auth).send({ name: 'Ana' });
    expect((await request(a).post('/api/login').send({ username: 'ana', password: 'nope' })).status).toBe(401);
    const tok = (await request(a).post('/api/login').send({ username: 'ana', password: ana.body.password })).body.token;
    const bad = await request(a).post('/api/me/password').set('Authorization', `Bearer ${tok}`).send({ current: 'x', next: 'nueva123' });
    expect(bad.status).toBe(400);
    const ok = await request(a).post('/api/me/password').set('Authorization', `Bearer ${tok}`)
      .send({ current: ana.body.password, next: 'nueva123' });
    expect(ok.status).toBe(200);
    expect((await request(a).post('/api/login').send({ username: 'ana', password: 'nueva123' })).status).toBe(200);
    const reset = await request(a).post(`/api/training/students/${ana.body.student.id}/password`).set('Authorization', auth).send({});
    expect(reset.body.password).toMatch(/^ana-/);
    expect((await request(a).post('/api/login').send({ username: 'ana', password: reset.body.password })).status).toBe(200);
  });

  test('el usuario del profe está reservado', async () => {
    const a = app();
    const auth = await coach(a);
    const r = await request(a).post('/api/training/students').set('Authorization', auth).send({ name: 'X', username: 'profe' });
    expect(r.status).toBe(409);
  });
});
