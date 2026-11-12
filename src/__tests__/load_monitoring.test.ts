/**
 * Progreso y monitoreo de carga: los 7 escenarios de aceptación de HTC más
 * integridad histórica, duplicados, permisos, "Mi plan y pagos" y recientes.
 */
import express from 'express';
import request from 'supertest';
import {
  compareExercise, dataQuality, ExecSet, Execution, SetSchema, volumeLoad,
} from '../training/execution';
import { buildMonitoring, routineDiff } from '../training/monitoring';
import { InMemoryTrainingRepository } from '../training/repository';
import { createAuthRouter, createStudentRouter, createTrainingRouter } from '../api/router-training';
import { BillingSchema } from '../training/billing';

const set = (p: Partial<ExecSet>): ExecSet => SetSchema.parse({ n: 1, ...p });
let seq = 0;
const exec = (day: string, p: Partial<Execution>): Execution => ({
  id: `e${++seq}`, session_id: `s-${day}`, student_id: 'st', item_id: 'b0g0i0', day,
  exercise_key: 'k', exercise_name: 'Ejercicio', variant: null, tracking: 'dinamica', load_config: null, assistance: null,
  body_mass_kg: null, prescribed: { text: '', name: '', dose: '', block: '', rounds: null, sets: null }, sets: [], notes: null,
  source: 'coach', data_quality: 'completo', version: 1, created_at: `${day}T10:00:00Z`, updated_at: `${day}T10:00:00Z`, ...p,
});

describe('aceptación — progreso con lo realizado', () => {
  test('1. Wall sit 120 s → 150 s: +30 s y +25% de duración, sin hablar de fuerza', () => {
    const c = compareExercise([
      exec('2026-10-01', { exercise_name: 'Wall sit', tracking: 'isometrica', load_config: 'peso_corporal', sets: [set({ secs: 120 })] }),
      exec('2026-10-29', { exercise_name: 'Wall sit', tracking: 'isometrica', load_config: 'peso_corporal', sets: [set({ secs: 150 })] }),
    ])!;
    expect(c.groups).toHaveLength(1);
    const hold = c.groups[0]!.changes.find((x) => x.id === 'hold')!;
    expect(hold).toMatchObject({ label: 'Duración del sostén', unit: 's', abs: 30, pct: 25 });
    expect(hold.baseline).toEqual({ value: 120, day: '2026-10-01' });
    expect(hold.current).toEqual({ value: 150, day: '2026-10-29' });
    const text = c.groups[0]!.interpretation.join(' ');
    expect(text).toContain('no equivale a un porcentaje igual de fuerza');
    expect(text).not.toMatch(/fuerza (subió|mejoró)|25% m[aá]s de fuerza/i);
  });

  test('2. Búlgara de peso corporal a con carga: quedan separadas y no se comparan directo', () => {
    const c = compareExercise([
      exec('2026-10-01', { exercise_name: 'Bulgarian split squat', load_config: 'peso_corporal', sets: [set({ reps: 12 }), set({ n: 2, reps: 12 })] }),
      exec('2026-10-08', { exercise_name: 'Bulgarian split squat', load_config: 'peso_corporal', sets: [set({ reps: 14 })] }),
      exec('2026-10-15', { exercise_name: 'Bulgarian split squat', load_config: 'dos_mancuernas', sets: [set({ reps: 8, load: 10 })] }),
    ])!;
    expect(c.groups).toHaveLength(2);
    expect(c.transitions).toEqual([{ day: '2026-10-15', from: 'peso corporal · sin carga externa', to: 'dos mancuernas · con carga externa (kg)' }]);
    const weighted = c.groups.find((g) => g.label.startsWith('dos mancuernas'))!;
    expect(weighted.records).toHaveLength(1);
    expect(weighted.changes.every((x) => x.current === null && x.pct === null)).toBe(true);
    const bw = c.groups.find((g) => g.label.startsWith('peso corporal'))!;
    expect(bw.changes.find((x) => x.id === 'reps_set')).toMatchObject({ abs: 2 });
  });

  test('3. Repeticiones sin carga: se guardan, el volumen de carga queda vacío (no cero)', () => {
    const sets = [set({ reps: 10 }), set({ n: 2, reps: 9 })];
    const v = volumeLoad(sets);
    expect(v.value).toBeNull();
    expect(v.reason).toBe('Sin carga externa registrada.');
    expect(dataQuality('dinamica', null, sets)).toBe('incompleto');
    expect(dataQuality('dinamica', 'peso_corporal', sets)).toBe('completo');
    // Si una serie tiene carga y otra no, tampoco se calcula.
    expect(volumeLoad([set({ reps: 10, load: 20 }), set({ n: 2, reps: 10 })]).value).toBeNull();
    expect(volumeLoad([set({ reps: 10, load: 20 }), set({ n: 2, reps: 8, load: 20 })]).value).toBe(360);
    const c = compareExercise([exec('2026-10-01', { sets }), exec('2026-10-08', { sets: [set({ reps: 12 })] })])!;
    expect(c.groups[0]!.records[0]!.values.reps_total).toBe(19);
    expect(c.groups[0]!.records[0]!.values.volume).toBeNull();
  });

  test('4. Mismas 8 reps con 20 kg, RIR 3 → RIR 1: no se dice que mejoró', () => {
    const list = [
      exec('2026-10-01', { load_config: 'barra', sets: [set({ reps: 8, load: 20, rir: 3 })] }),
      exec('2026-10-08', { load_config: 'barra', sets: [set({ reps: 8, load: 20, rir: 1 })] }),
    ];
    const g = compareExercise(list)!.groups[0]!;
    expect(g.changes.every((x) => x.abs === 0)).toBe(true);
    const text = g.interpretation.join(' ');
    expect(text).toContain('Mismo rendimiento');
    expect(text).toContain('no indica que mejoró');
    expect(text).not.toMatch(/subió/);
    // En "Para revisar" aparece como más esfuerzo con el mismo trabajo.
    const m = buildMonitoring({
      today: '2026-10-10', studentName: 'Ana', sessions: [], executions: list, responses: [], attendance: [], changes: [],
      info: () => ({ capacity: 'fuerza' }),
    });
    expect(m.review.map((r) => r.kind)).toContain('esfuerzo');
  });

  test('5. Copenhagen mejora: queda en el progreso del ejercicio y no toca evaluaciones', () => {
    const list = [
      exec('2026-10-01', { exercise_name: 'Copenhagen', tracking: 'isometrica', load_config: 'peso_corporal', sets: [set({ secs: 20 })] }),
      exec('2026-10-20', { exercise_name: 'Copenhagen', tracking: 'isometrica', load_config: 'peso_corporal', sets: [set({ secs: 35 })] }),
    ];
    const m = buildMonitoring({
      today: '2026-10-21', studentName: 'Ana', sessions: [], executions: list, responses: [], attendance: [], changes: [],
      info: () => ({ capacity: 'estabilidad' }),
    });
    expect(m.exercises[0]!.groups[0]!.changes[0]).toMatchObject({ id: 'hold', abs: 15 });
    // El monitoreo no devuelve ni modifica clasificaciones formales.
    expect(JSON.stringify(m)).not.toMatch(/classification|clasificaci[oó]n formal/i);
  });

  test('7. Unilateral: cada lado por separado, sin sumarlos', () => {
    const sets = [set({ side: 'L', reps: 10, load: 12 }), set({ n: 1, side: 'R', reps: 8, load: 12 })];
    const v = volumeLoad(sets);
    expect(v.value).toBeNull();
    expect(v.per_side).toEqual({ L: 120, R: 96 });
    const c = compareExercise([
      exec('2026-10-01', { load_config: 'mancuerna', sets }),
      exec('2026-10-08', { load_config: 'mancuerna', sets: [set({ side: 'L', reps: 10, load: 14 }), set({ side: 'R', reps: 10, load: 12 })] }),
    ])!;
    expect(c.groups.map((g) => g.label).sort()).toEqual(['una mancuerna · con carga externa (kg) · lado derecho', 'una mancuerna · con carga externa (kg) · lado izquierdo']);
    const right = c.groups.find((g) => g.label.endsWith('derecho'))!;
    expect(right.changes.find((x) => x.id === 'reps_set')).toMatchObject({ abs: 2 });
    const left = c.groups.find((g) => g.label.endsWith('izquierdo'))!;
    expect(left.changes.find((x) => x.id === 'load')).toMatchObject({ abs: 2 });
  });

  test('comparación limitada si no se sabe el equipamiento', () => {
    const g = compareExercise([
      exec('2026-10-01', { sets: [set({ reps: 8, load: 20 })] }),
      exec('2026-10-08', { sets: [set({ reps: 8, load: 22.5 })] }),
    ])!.groups[0]!;
    expect(g.limited).toBe(true);
    expect(g.reasons.join(' ')).toContain('equipamiento');
    expect(g.changes.find((x) => x.id === 'load')).toMatchObject({ abs: 2.5, pct: 12.5 });
  });

  test('diferencias de la programación', () => {
    const before = { blocks: [{ id: 'b0', kind: 'superset' as const, title: 'A', rounds: 3, groups: [{ id: 'g', items: [{ id: 'i1', name: 'Pistol', dose: '5' }, { id: 'i2', name: 'Row', dose: '10' }] }] }] };
    const after = { blocks: [{ id: 'b0', kind: 'superset' as const, title: 'A', rounds: 4, groups: [{ id: 'g', items: [{ id: 'i1', name: 'Pistol', dose: '6' }, { id: 'i3', name: 'Dips', dose: '8' }] }] }] };
    expect(routineDiff(before, after)).toEqual(['Cambió: Pistol 5 → Pistol 6', 'Agregó: Dips 8', 'Quitó: Row 10']);
  });
});

describe('monitoreo — carga interna y adherencia', () => {
  test('sRPE × minutos, sesiones sin dato y exposición contada como entradas', () => {
    const routine = { blocks: [{ id: 'b0', kind: 'superset' as const, title: 'A', rounds: 1, groups: [{ id: 'g', items: [{ id: 'i1', name: 'Pistol', dose: '5' }, { id: 'i2', name: 'Cat cow', dose: '' }] }] }] };
    const m = buildMonitoring({
      today: '2026-10-10', studentName: 'Ana',
      sessions: [
        { id: 's1', date: '2026-10-06', status: 'done', routine, checks: null, completed_at: null },
        { id: 's2', date: '2026-10-08', status: 'planned', routine, checks: ['i1'], completed_at: '2026-10-08T12:00:00Z' },
        { id: 's3', date: '2026-10-09', status: 'planned', routine, checks: null, completed_at: null },
      ],
      executions: [],
      responses: [{ session_id: 's1', student_id: 'st', srpe: 6, duration_min: 50, status: null, fatigue: null, soreness: null, pain: 3, pain_area: 'rodilla', recovery: null, note: null, source: 'coach', version: 1, created_at: '', updated_at: '' }],
      attendance: [{ day: '2026-10-07', mark: 'a' }],
      changes: [],
      info: (k) => ({ capacity: k.includes('pistol') ? 'fuerza' : 'movilidad' }),
    });
    const w = m.windows.find((x) => x.key === '7d')!;
    expect(w.realized).toBe(2);
    expect(w.srpe_load).toBe(300);
    expect(w.srpe_sessions).toBe(1);
    expect(w.missing_srpe).toBe(1);
    expect(w).toMatchObject({ present: 2, absent: 1, assigned_not_done: 1, partial: 1 });
    expect(w.prescription).toEqual({ done: 1, total: 2, sessions: 1 });
    expect(w.exposure).toEqual([{ capacity: 'fuerza', label: 'Fuerza', entries: 2 }, { capacity: 'movilidad', label: 'Movilidad', entries: 2 }]);
    expect(m.review.map((r) => r.kind).sort()).toEqual(['asistencia', 'datos', 'sintomas']);
  });
});

describe('API — registro de lo realizado, cambios, plan y pagos', () => {
  const OLD = process.env.HTC_AUTH_PASSWORD;
  beforeEach(() => { process.env.HTC_AUTH_PASSWORD = 'profe-secreto'; });
  afterAll(() => {
    if (OLD === undefined) delete process.env.HTC_AUTH_PASSWORD;
    else process.env.HTC_AUTH_PASSWORD = OLD;
  });

  function app() {
    const repo = new InMemoryTrainingRepository();
    const a = express();
    a.use(express.json({ limit: '1mb' }));
    a.use('/api', createAuthRouter(repo));
    a.use('/api/training', createTrainingRouter(repo));
    a.use('/api/me', createStudentRouter(repo));
    return a;
  }
  async function setup() {
    const a = app();
    const auth = `Bearer ${(await request(a).post('/api/login').send({ username: 'profe', password: 'profe-secreto' })).body.token}`;
    const ana = await request(a).post('/api/training/students').set('Authorization', auth).send({ name: 'Ana' });
    const id = ana.body.student.id as string;
    const tok = `Bearer ${(await request(a).post('/api/login').send({ username: 'ana', password: ana.body.password })).body.token}`;
    const routine = { blocks: [{ id: 'b0', kind: 'superset', title: 'A', rounds: 3, groups: [{ id: 'g0', items: [{ id: 'i1', name: 'Goblet squat', dose: '3x8 20kg' }, { id: 'i2', name: 'Wall sit', dose: '45s' }] }] }] };
    const s = await request(a).post('/api/training/sessions/routine').set('Authorization', auth)
      .send({ date: '2026-10-01', status: 'planned', participant_ids: [id], routine });
    return { a, auth, id, tok, sid: s.body.session.id as string, routine };
  }

  test('6. Editar la rutina no cambia lo ya registrado ni su prescripción original', async () => {
    const { a, auth, id, sid, routine } = await setup();
    const put = await request(a).put(`/api/training/sessions/${sid}/record/${id}`).set('Authorization', auth).send({
      executions: [{ item_id: 'i1', tracking: 'dinamica', load_config: 'kettlebell', sets: [{ n: 1, reps: 8, load: 20 }, { n: 2, reps: 8, load: 20 }] }],
      response: { srpe: 7, duration_min: 55 },
    });
    expect(put.status).toBe(200);
    expect(put.body.executions[0].prescribed).toMatchObject({ text: 'Goblet squat 3x8 20kg', sets: 3 });
    const edited = JSON.parse(JSON.stringify(routine));
    edited.blocks[0].groups[0].items[0].dose = '4x6 24kg';
    const p = await request(a).patch(`/api/training/sessions/${sid}`).set('Authorization', auth)
      .send({ routine: edited, change_category: 'progresar', change_reason: 'Subir carga' });
    expect(p.status).toBe(200);
    const rec = await request(a).get(`/api/training/sessions/${sid}/record/${id}`).set('Authorization', auth);
    expect(rec.body.executions[0].prescribed.text).toBe('Goblet squat 3x8 20kg');
    expect(rec.body.executions[0].sets.map((x: ExecSet) => x.load)).toEqual([20, 20]);
    const mon = await request(a).get(`/api/training/students/${id}/monitoring`).set('Authorization', auth);
    expect(mon.body.monitoring.changes[0]).toMatchObject({
      category: 'progresar', reason: 'Subir carga', lines: ['Cambió: Goblet squat 3x8 20kg → Goblet squat 4x6 24kg'],
    });
    expect(mon.body.monitoring.changes[0].context).toContain('sRPE 7');
  });

  test('sin duplicados, correcciones versionadas y el alumno no pisa lo del profe', async () => {
    const { a, auth, id, tok, sid } = await setup();
    const body = { executions: [{ item_id: 'i1', tracking: 'dinamica', load_config: 'kettlebell', sets: [{ n: 1, reps: 8, load: 20 }] }] };
    await request(a).put(`/api/training/sessions/${sid}/record/${id}`).set('Authorization', auth).send(body);
    await request(a).put(`/api/training/sessions/${sid}/record/${id}`).set('Authorization', auth).send(body);
    const fix = { ...body, reason: 'Eran 10', executions: [{ ...body.executions[0], sets: [{ n: 1, reps: 10, load: 20 }] }] };
    const r = await request(a).put(`/api/training/sessions/${sid}/record/${id}`).set('Authorization', auth).send(fix);
    expect(r.body.executions).toHaveLength(1);
    expect(r.body.executions[0].version).toBe(2);
    const rec = await request(a).get(`/api/training/sessions/${sid}/record/${id}`).set('Authorization', auth);
    expect(rec.body.changes.map((c: { action: string }) => c.action)).toEqual(['create', 'update']);
    expect(rec.body.changes[1]).toMatchObject({ reason: 'Eran 10' });
    expect(rec.body.changes[1].before.sets[0].reps).toBe(8);
    // El alumno registra lo suyo, pero no pisa lo que cargó el profe.
    const mine = await request(a).put(`/api/me/sessions/${sid}/record`).set('Authorization', tok).send({
      executions: [
        { item_id: 'i1', tracking: 'dinamica', sets: [{ n: 1, reps: 1 }] },
        { item_id: 'i2', tracking: 'isometrica', sets: [{ n: 1, secs: 50, rpe: 7 }] },
      ],
      response: { srpe: 6, duration_min: 40, pain: 0 },
    });
    expect(mine.status).toBe(200);
    expect(mine.body.skipped).toEqual(['i1']);
    const byItem = Object.fromEntries(mine.body.executions.map((e: Execution) => [e.item_id, e]));
    expect(byItem.i1.sets[0].reps).toBe(10);
    expect(byItem.i2).toMatchObject({ source: 'client', data_quality: 'completo' });
    // Un alumno no puede registrar en la sesión de otro ni usar rutas del profe.
    expect((await request(a).get(`/api/training/students/${id}/monitoring`).set('Authorization', tok)).status).toBe(401);
  });

  test('Mi plan y pagos: sin datos internos; el link sólo si es de Mercado Pago y de la cuota que sigue', async () => {
    const { a, auth, id, tok } = await setup();
    const bad = await request(a).patch(`/api/training/students/${id}`).set('Authorization', auth).send({
      billing: { cuota: 100, enfoque: 'Rodilla', pago_link: { url: 'https://example.com/pagar', monto: 100, moneda: 'USD', creado: new Date().toISOString() } },
    });
    expect(bad.status).toBe(400);
    const ok = await request(a).patch(`/api/training/students/${id}`).set('Authorization', auth).send({
      billing: { cuota: 100, enfoque: 'Rodilla', rehab: true, pago_link: { url: 'https://mpago.la/abc123', monto: 100, moneda: 'USD', creado: new Date().toISOString() } },
    });
    expect(ok.status).toBe(200);
    await request(a).post('/api/training/payments').set('Authorization', auth).send({ student_id: id, paid_on: '2026-09-01', amount: 100, classes: 8, note: 'interno' });
    let plan = await request(a).get('/api/me/plan').set('Authorization', tok);
    expect(plan.status).toBe(200);
    expect(plan.body.students[0].billing).toMatchObject({ enfoque: null, rehab: false });
    expect(plan.body.payments[0].note).toBeNull();
    // El link se cargó antes del último pago: ya no corresponde.
    expect(plan.body.students[0].billing.pago_link).toBeNull();
    await request(a).patch(`/api/training/students/${id}`).set('Authorization', auth).send({
      billing: { ...BillingSchema.parse({ cuota: 100 }), pago_link: { url: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=1', monto: 100, moneda: 'USD', creado: new Date(Date.now() + 1000).toISOString() } },
    });
    plan = await request(a).get('/api/me/plan').set('Authorization', tok);
    expect(plan.body.students[0].billing.pago_link.url).toContain('mercadopago.com.ar');
    // Avisar que pagó no registra ningún pago.
    await request(a).post('/api/me/plan/aviso').set('Authorization', tok);
    const fin = await request(a).get('/api/training/finance').set('Authorization', auth);
    expect(fin.body.payments).toHaveLength(1);
    expect(fin.body.students[0].billing.pago_avisado).toBeTruthy();
  });

  test('recientes de Planificar: el último primero y sin duplicados', async () => {
    const { a, auth, id } = await setup();
    const beto = (await request(a).post('/api/training/students').set('Authorization', auth).send({ name: 'Beto' })).body.student.id;
    await request(a).put('/api/training/prefs/plan-recent').set('Authorization', auth).send({ id });
    await request(a).put('/api/training/prefs/plan-recent').set('Authorization', auth).send({ id: beto });
    const r = await request(a).put('/api/training/prefs/plan-recent').set('Authorization', auth).send({ id });
    expect(r.body.ids).toEqual([id, beto]);
    expect((await request(a).get('/api/training/prefs/plan-recent').set('Authorization', auth)).body.ids).toEqual([id, beto]);
  });
});
