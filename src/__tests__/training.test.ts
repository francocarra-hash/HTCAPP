/**
 * Alumnos y sesiones: parser del formato del coach, corrección de fechas,
 * progreso y permisos (un alumno nunca ve rutas del coach ni datos de otro).
 */
import express from 'express';
import request from 'supertest';
import { doseOf, exerciseName, fixDates, parseBody, splitSessions } from '../training/parser';
import { buildProgress, exerciseKey } from '../training/progress';
import { InMemoryTrainingRepository } from '../training/repository';
import { routineFromParsed } from '../training/routine';
import { suggestCapacity } from '../training/capacities';
import { nextSessions, occurrences } from '../training/schedule';
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

describe('rutina en bloques', () => {
  const r = routineFromParsed(parseBody(SESSION, [ANA, BETO]));

  test('el texto se convierte en bloques con ids estables', () => {
    expect(r.blocks.map((b) => [b.kind, b.title, b.rounds])).toEqual([
      ['list', 'Movilidad', null], ['circuit', 'Circuito', 2], ['superset', 'Bloque principal', 3], ['notes', 'Notas', null],
    ]);
    const station = r.blocks[1]!.groups[1]!.items;
    expect(station.map((i) => [i.id, i.name, i.dose])).toEqual([
      ['b1g1i0', 'High side plank', '10r'], ['b1g1i1', 'Copenhagen', '30s+10r'],
    ]);
    // "SL 8" queda con el nombre completo del ejercicio que modifica.
    expect(r.blocks[1]!.groups[2]!.items[1]).toMatchObject({ name: 'Rolling Tabletop SL', dose: '8' });
    expect(r.blocks[2]!.groups[1]!.items[2]).toMatchObject({ who: 'Ana', name: '15 inclined' });
  });

  test('capacidad sugerida por el nombre (el coach la puede cambiar)', () => {
    expect(suggestCapacity('CMJ')).toBe('reactividad');
    expect(suggestCapacity('Chair Jump Squat')).toBe('reactividad');
    expect(suggestCapacity('Hip CARs')).toBe('movilidad');
    expect(suggestCapacity('Jefferson to plank')).toBe('movilidad');
    expect(suggestCapacity('SL No eyes')).toBe('control_motor');
    expect(suggestCapacity('Copenhagen')).toBe('estabilidad');
    expect(suggestCapacity('Wall sit')).toBe('fuerza');
    expect(suggestCapacity('Skater Sq')).toBe('fuerza');
    expect(suggestCapacity('Supine thumbs up')).toBeNull();
  });
});

describe('agenda', () => {
  const sched = { weekly: [{ weekday: 1, time: '18:00' }, { weekday: 4, time: '18:00' }], once: [{ date: '2026-10-24', time: '10:00', note: 'recupera' }], skip: ['2026-10-22'] };

  test('días fijos, fecha puntual y día cancelado', () => {
    expect(occurrences(sched, '2026-10-19', '2026-10-26').map((o) => `${o.date} ${o.time}`)).toEqual([
      '2026-10-19 18:00', '2026-10-24 10:00', '2026-10-26 18:00',
    ]);
  });

  test('la de hoy cuenta si todavía no pasó su hora', () => {
    expect(nextSessions(sched, 1, { date: '2026-10-19', time: '17:00' })[0]).toMatchObject({ date: '2026-10-19' });
    expect(nextSessions(sched, 1, { date: '2026-10-19', time: '19:00' })[0]).toMatchObject({ date: '2026-10-24' });
    expect(nextSessions(null)).toEqual([]);
  });
});

describe('progreso', () => {
  const s = (date: string, body: string) => ({ date, routine: routineFromParsed(parseBody(body, [ANA, BETO])) });
  const sessions = [
    s('2026-02-01', '[Wall sit 1:05min - Push up iso 30s/ ana inclined] x2'),
    s('2026-03-01', '[Wall sit 1:30min - Push up iso 40s/ ana inclined] x2'),
    s('2026-04-01', '[Wall sit 2:30min - Push up iso 45s/ ana inclined] x2'),
  ];

  test('serie por ejercicio con la dosis escrita, logros y capacidades', () => {
    const p = buildProgress('Beto', sessions, (_k, name) => ({ capacity: suggestCapacity(name) }), new Date('2026-04-15'));
    expect(p.capacities.map((c) => [c.id, c.tracked, c.improved])).toEqual([['fuerza', 2, 2]]);
    expect(p.capacities[0]!.top).toMatchObject({ name: 'Wall sit', from: 65, to: 150 });
    expect(p.stats.process_week).toBeGreaterThan(9);
    const wall = p.exercises.find((e) => e.name === 'Wall sit')!;
    expect(wall.unit).toBe('s');
    expect(wall.points.map((x) => x.value)).toEqual([65, 90, 150]);
    expect(p.highlights[0]).toMatchObject({ name: 'Wall sit', from: 65, to: 150 });
    expect(p.exercises.find((e) => e.name === 'Push up iso')?.points.map((x) => x.value)).toEqual([30, 40, 45]);
    expect(p.stats.sessions).toBe(3);
  });

  test('la base que reemplaza una variante personal no cuenta para esa persona', () => {
    const p = buildProgress('Ana Pérez', sessions, undefined, new Date('2026-04-15'));
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

  test('rutina asignada: el alumno tilda, anota, termina y al profe le llega', async () => {
    const a = app();
    const auth = await coach(a);
    const ana = await request(a).post('/api/training/students').set('Authorization', auth).send({ name: 'Ana' });
    const routine = {
      blocks: [
        { id: 'm', kind: 'list', title: 'Movilidad', rounds: null, groups: [{ id: 'g0', items: [{ id: 'i0', name: 'Hip CARs', dose: '5' }] }] },
        { id: 'f', kind: 'superset', title: 'Fuerza', rounds: 3, groups: [{ id: 'g1', items: [{ id: 'i1', name: 'Wall sit', dose: '1min' }, { id: 'i2', name: 'CMJ', dose: '3' }] }] },
      ],
    };
    const created = await request(a).post('/api/training/sessions/routine').set('Authorization', auth)
      .send({ date: '2026-10-20', status: 'planned', participant_ids: [ana.body.student.id], routine });
    expect(created.status).toBe(201);
    expect(created.body.session.routine.blocks[1].groups[0].items.map((i: { capacity: string }) => i.capacity)).toEqual(['fuerza', 'reactividad']);
    const sid = created.body.session.id;

    const tok = `Bearer ${(await request(a).post('/api/login').send({ username: 'ana', password: ana.body.password })).body.token}`;
    const prog = await request(a).put(`/api/me/sessions/${sid}/progress`).set('Authorization', tok)
      .send({ checks: ['i1'], notes: { i1: 'hice 50s, me ardía' } });
    expect(prog.status).toBe(200);
    expect(prog.body.completion.completed_at).toBeNull();

    const done = await request(a).post(`/api/me/sessions/${sid}/complete`).set('Authorization', tok).send({ checks: ['i0', 'i1', 'i2'] });
    expect(done.body.completion.completed_at).toBeTruthy();
    const fb = await request(a).post(`/api/me/sessions/${sid}/complete`).set('Authorization', tok).send({ feeling: 4, comment: 'Bien' });
    expect(fb.body.completion.completed_at).toBe(done.body.completion.completed_at); // no se pisa la hora
    expect(fb.body.completion.notes).toEqual({ i1: 'hice 50s, me ardía' });

    const act = await request(a).get('/api/training/activity').set('Authorization', auth);
    expect(act.body.unseen).toBe(1);
    expect(act.body.items[0]).toMatchObject({ student_name: 'Ana', feeling: 4, checks: 3, total: 3 });
    expect(act.body.items[0].notes).toEqual([{ item: 'Wall sit 1min', note: 'hice 50s, me ardía' }]);
    await request(a).post('/api/training/activity/seen').set('Authorization', auth);
    expect((await request(a).get('/api/training/activity').set('Authorization', auth)).body.unseen).toBe(0);

    // Otro alumno no puede tocar esa sesión.
    const beto = await request(a).post('/api/training/students').set('Authorization', auth).send({ name: 'Beto' });
    const tb = `Bearer ${(await request(a).post('/api/login').send({ username: 'beto', password: beto.body.password })).body.token}`;
    expect((await request(a).post(`/api/me/sessions/${sid}/complete`).set('Authorization', tb).send({})).status).toBe(404);
  });

  test('biblioteca: ejercicios de todos los alumnos y capacidad fijada por el coach', async () => {
    const a = app();
    const auth = await coach(a);
    const ana = await request(a).post('/api/training/students').set('Authorization', auth).send({ name: 'Ana' });
    await request(a).post('/api/training/sessions').set('Authorization', auth)
      .send({ text: '1/9/2026\n[Kickstand 10 - Wall sit 1min] x2', student_ids: [ana.body.student.id] });
    const lib = await request(a).get('/api/training/exercises').set('Authorization', auth);
    const kick = lib.body.exercises.find((e: { name: string }) => e.name === 'Kickstand');
    expect(kick).toMatchObject({ uses: 1, students: ['Ana'], capacity: 'fuerza', capacity_source: 'auto' });
    await request(a).put(`/api/training/exercises/${encodeURIComponent(kick.key)}`).set('Authorization', auth)
      .send({ name: 'Kickstand RDL', capacity: 'control_motor' });
    const lib2 = await request(a).get('/api/training/exercises').set('Authorization', auth);
    expect(lib2.body.exercises.find((e: { key: string }) => e.key === kick.key))
      .toMatchObject({ name: 'Kickstand RDL', capacity: 'control_motor', capacity_source: 'coach' });
    const custom = await request(a).post('/api/training/exercises').set('Authorization', auth).send({ name: 'Turkish get up', capacity: 'estabilidad' });
    expect(custom.status).toBe(201);
  });

  test('agenda del alumno: la próxima sesión aparece en la lista', async () => {
    const a = app();
    const auth = await coach(a);
    const ana = await request(a).post('/api/training/students').set('Authorization', auth).send({ name: 'Ana' });
    const all = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, time: null }));
    const r = await request(a).patch(`/api/training/students/${ana.body.student.id}`).set('Authorization', auth)
      .send({ schedule: { weekly: all, once: [], skip: [] } });
    expect(r.status).toBe(200);
    expect(r.body.next_sessions).toHaveLength(3);
    const list = await request(a).get('/api/training/students').set('Authorization', auth);
    expect(list.body.students[0].next_session).toBeTruthy();
    const bad = await request(a).patch(`/api/training/students/${ana.body.student.id}`).set('Authorization', auth)
      .send({ schedule: { weekly: [{ weekday: 9, time: '25:00' }], once: [], skip: [] } });
    expect(bad.status).toBe(400);
  });

  test('el usuario del profe está reservado', async () => {
    const a = app();
    const auth = await coach(a);
    const r = await request(a).post('/api/training/students').set('Authorization', auth).send({ name: 'X', username: 'profe' });
    expect(r.status).toBe(409);
  });
});
