/**
 * Pagos separados de los períodos: registrar un pago nunca crea ni cambia
 * sesiones; crear un período es aparte y no se duplica; y la revisión de los
 * registros viejos muestra los paquetes duplicados antes de corregirlos.
 */
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { createAuthRouter, createTrainingRouter } from '../api/router-training';
import { Charge, InMemoryTrainingRepository, Payment } from '../training/repository';
import { periodKey, reviewLegacy } from '../training/charges';

const OLD = process.env.HTC_AUTH_PASSWORD;
beforeAll(() => { process.env.HTC_AUTH_PASSWORD = 'profe-secreto'; });
afterAll(() => {
  if (OLD === undefined) delete process.env.HTC_AUTH_PASSWORD;
  else process.env.HTC_AUTH_PASSWORD = OLD;
});

function app(repo = new InMemoryTrainingRepository()) {
  const a = express();
  a.use(express.json());
  a.use('/api', createAuthRouter(repo));
  a.use('/api/training', createTrainingRouter(repo));
  return { a, repo };
}

async function setup(billing: Record<string, unknown> = { clases_sem: 2, ciclo_sem: 4, pago_modo: 'clases', cuota: 300, cuenta_desde: '2026-10-01', saldo_inicial: 0 }) {
  const { a, repo } = app();
  const auth = `Bearer ${(await request(a).post('/api/login').send({ username: 'profe', password: 'profe-secreto' })).body.token}`;
  const st = await request(a).post('/api/training/students').set('Authorization', auth).send({ name: 'Ana' });
  const id = st.body.student.id as string;
  await request(a).patch(`/api/training/students/${id}`).set('Authorization', auth).send({ billing });
  const charge = (body: Record<string, unknown>) => request(a).post('/api/training/charges').set('Authorization', auth).send({ student_id: id, ...body });
  const pay = (body: Record<string, unknown>) => request(a).post('/api/training/payments').set('Authorization', auth).send({ student_id: id, ...body });
  const fin = async () => (await request(a).get('/api/training/finance').set('Authorization', auth)).body as { charges: Charge[]; payments: Payment[] };
  return { a, repo, auth, id, charge, pay, fin };
}

/** Lo que importa de las sesiones de cada período: no puede cambiar al pagar. */
const sessionsOf = (cs: Charge[]) => cs.map((c) => ({ id: c.id, sessions: c.sessions, starts_on: c.starts_on, period_key: c.period_key }));

describe('crear períodos: aparte del pago y sin duplicar', () => {
  test('paquete nuevo con sus clases; el mismo inicio no se crea dos veces', async () => {
    const { charge } = await setup();
    const p1 = await charge({ kind: 'paquete', starts_on: '2026-10-01', sessions: 8, amount: 300 });
    expect(p1.status).toBe(201);
    expect(p1.body.charge).toMatchObject({ period_key: 'paq-1', sessions: 8, amount: 300 });
    const again = await charge({ kind: 'paquete', starts_on: '2026-10-01', sessions: 8, amount: 300 });
    expect(again.status).toBe(409);
    expect(again.body.charge.id).toBe(p1.body.charge.id);
    const p2 = await charge({ kind: 'paquete', starts_on: '2026-10-29', sessions: 8, amount: 300 });
    expect(p2.body.charge.period_key).toBe('paq-2');
    expect((await charge({ kind: 'paquete', starts_on: '2026-11-30', amount: 300 })).status).toBe(400);
  });

  test('mes: se guarda el 1° y el mismo mes no se repite', async () => {
    const { charge } = await setup({ pago_modo: 'mensual', cuota: 100 });
    const m = await charge({ kind: 'mes', starts_on: '2026-11-15', amount: 100 });
    expect(m.body.charge).toMatchObject({ period_key: '2026-11', starts_on: '2026-11-01', sessions: null });
    expect((await charge({ kind: 'mes', starts_on: '2026-11-03', amount: 100 })).status).toBe(409);
  });

  test('sumar clases a un período es explícito y queda en el registro de cambios con el motivo', async () => {
    const { a, auth, id, charge, repo } = await setup();
    const p = (await charge({ kind: 'paquete', starts_on: '2026-10-01', sessions: 8, amount: 300 })).body.charge as Charge;
    const r = await request(a).patch(`/api/training/charges/${p.id}`).set('Authorization', auth).send({ sessions: 10, reason: '2 clases extra de recuperación' });
    expect(r.body.charge.sessions).toBe(10);
    const log = (await repo.listChanges({ studentId: id })).filter((c) => c.entity === 'charge');
    expect(log.map((c) => c.action)).toEqual(['create', 'update']);
    expect(log[1]).toMatchObject({ reason: '2 clases extra de recuperación' });
  });

  test('un período con pagos no se puede borrar', async () => {
    const { a, auth, charge, pay } = await setup();
    const p = (await charge({ kind: 'paquete', starts_on: '2026-10-01', sessions: 8, amount: 300 })).body.charge as Charge;
    await pay({ charge_id: p.id, paid_on: '2026-10-02', amount: 300 });
    expect((await request(a).delete(`/api/training/charges/${p.id}`).set('Authorization', auth)).status).toBe(409);
  });
});

describe('registrar pagos: sólo cambia lo abonado y el saldo del período', () => {
  async function twoPackages() {
    const ctx = await setup();
    const p1 = (await ctx.charge({ kind: 'paquete', starts_on: '2026-10-01', sessions: 8, amount: 300 })).body.charge as Charge;
    const p2 = (await ctx.charge({ kind: 'paquete', starts_on: '2026-10-29', sessions: 8, amount: 300 })).body.charge as Charge;
    await request(ctx.a).put('/api/training/attendance').set('Authorization', ctx.auth).send({ student_ids: [ctx.id], day: '2026-10-02', mark: 'p' });
    const before = await ctx.fin();
    return { ...ctx, p1, p2, before };
  }

  test('sin período elegido no se registra; y no vale el período de otro alumno', async () => {
    const { pay, a, auth, p1 } = await twoPackages();
    expect((await pay({ paid_on: '2026-10-02', amount: 300 })).status).toBe(400);
    const otro = await request(a).post('/api/training/students').set('Authorization', auth).send({ name: 'Beto' });
    const r = await request(a).post('/api/training/payments').set('Authorization', auth)
      .send({ student_id: otro.body.student.id, charge_id: p1.id, paid_on: '2026-10-02', amount: 300 });
    expect(r.status).toBe(400);
  });

  test('las clases que mande un cliente viejo se ignoran: el pago no suma sesiones', async () => {
    const { pay, fin, p1, before } = await twoPackages();
    const r = await pay({ charge_id: p1.id, paid_on: '2026-10-02', amount: 300, classes: 8, period: '2026-10' });
    expect(r.status).toBe(201);
    expect(r.body.payment).toMatchObject({ classes: null, charge_id: p1.id });
    expect(sessionsOf((await fin()).charges)).toEqual(sessionsOf(before.charges));
  });

  test('pago registrado tarde: se recibió el 2/10 y se carga hoy; la fecha efectiva queda 2/10', async () => {
    const { pay, fin, p1, before } = await twoPackages();
    const r = await pay({ charge_id: p1.id, paid_on: '2026-10-02', amount: 300 });
    expect(r.body.payment.paid_on).toBe('2026-10-02');
    // La fecha de registro la pone el servidor (ahora), no el formulario.
    expect(Date.now() - Date.parse(r.body.payment.created_at)).toBeLessThan(60_000);
    const after = await fin();
    expect(sessionsOf(after.charges)).toEqual(sessionsOf(before.charges));
    expect(after.charges).toHaveLength(2);
  });

  test('pago recibido tarde: el paquete de octubre se paga en noviembre y sigue siendo el de octubre', async () => {
    const { pay, fin, p1, before } = await twoPackages();
    await pay({ charge_id: p1.id, paid_on: '2026-11-20', amount: 300 });
    const after = await fin();
    expect(sessionsOf(after.charges)).toEqual(sessionsOf(before.charges));
    expect(after.payments[0]).toMatchObject({ charge_id: p1.id, paid_on: '2026-11-20' });
  });

  test('pago parcial: dos pagos al mismo período, el saldo baja y las clases no cambian', async () => {
    const { pay, fin, p1, before } = await twoPackages();
    await pay({ charge_id: p1.id, paid_on: '2026-10-02', amount: 100 });
    await pay({ charge_id: p1.id, paid_on: '2026-10-09', amount: 150 });
    const after = await fin();
    expect(sessionsOf(after.charges)).toEqual(sessionsOf(before.charges));
    const paid = after.payments.filter((p) => p.charge_id === p1.id).reduce((s, p) => s + p.amount, 0);
    expect(paid).toBe(250);
    expect(p1.amount - paid).toBe(50);
  });

  test('pago de un período anterior: con el de noviembre creado, se paga el de octubre', async () => {
    const { pay, fin, p1, p2, before } = await twoPackages();
    await pay({ charge_id: p2.id, paid_on: '2026-10-30', amount: 300 });
    await pay({ charge_id: p1.id, paid_on: '2026-11-02', amount: 300 });
    const after = await fin();
    expect(sessionsOf(after.charges)).toEqual(sessionsOf(before.charges));
    expect(after.payments.find((p) => p.paid_on === '2026-11-02')!.charge_id).toBe(p1.id);
  });

  test('borrar un pago no toca el período y queda en el registro de cambios', async () => {
    const { a, auth, id, pay, fin, p1, before, repo } = await twoPackages();
    const r = await pay({ charge_id: p1.id, paid_on: '2026-10-02', amount: 300 });
    await request(a).delete(`/api/training/payments/${r.body.payment.id}`).set('Authorization', auth);
    expect(sessionsOf((await fin()).charges)).toEqual(sessionsOf(before.charges));
    const log = (await repo.listChanges({ studentId: id })).filter((c) => c.entity === 'payment');
    expect(log.map((c) => c.action)).toEqual(['create', 'delete']);
  });
});

describe('revisión de los registros viejos', () => {
  /** Período y pago como quedan después de la migración 010 (1 a 1 desde cada pago viejo). */
  function legacy(repo: InMemoryTrainingRepository, studentId: string, n: number, paidOn: string, classes: number, amount: number) {
    const pid = randomUUID();
    const charge: Charge = {
      id: randomUUID(), student_id: studentId, kind: 'paquete', period_key: `paq-${n}`, starts_on: paidOn, sessions: classes, amount,
      in_opening: false, migrated_from: pid, reviewed_at: null, note: null, created_at: `${paidOn}T12:00:00.000Z`,
    };
    repo.seedCharge(charge);
    repo.seedPayment({ id: pid, student_id: studentId, paid_on: paidOn, amount, classes, period: null, charge_id: charge.id, note: null, created_at: `${paidOn}T12:00:00.000Z` });
    return charge;
  }

  async function scenario() {
    const ctx = await setup({ clases_sem: 1, ciclo_sem: 4, pago_modo: 'clases', cuota: 250, cuenta_desde: '2026-10-26', saldo_inicial: -1 });
    const { a, auth, id, repo } = ctx;
    // Como Ari: arrancó el paquete el 26/10 sin pagar; pagó el 30/10 y el mismo paquete se volvió a cargar el 3/11.
    const c1 = legacy(repo, id, 1, '2026-10-30', 4, 250);
    const c2 = legacy(repo, id, 2, '2026-11-03', 4, 250);
    await request(a).put('/api/training/attendance').set('Authorization', auth).send({ student_ids: [id], day: '2026-11-02', mark: 'p' });
    await request(a).put('/api/training/attendance').set('Authorization', auth).send({ student_ids: [id], day: '2026-11-09', mark: 'a' });
    // Como Luli: el saldo inicial ya contaba el paquete en curso y el pago de ese paquete sumó 8 más.
    const luli = (await request(a).post('/api/training/students').set('Authorization', auth).send({ name: 'Luli' })).body.student.id as string;
    await request(a).patch(`/api/training/students/${luli}`).set('Authorization', auth)
      .send({ billing: { clases_sem: 2, ciclo_sem: 4, pago_modo: 'clases', cuenta_desde: '2026-11-06', saldo_inicial: 7 } });
    const l1 = legacy(repo, luli, 1, '2026-11-12', 8, 400);
    await request(a).put('/api/training/attendance').set('Authorization', auth).send({ student_ids: [luli], day: '2026-11-10', mark: 'p' });
    // Uno normal: pagó después de la primera clase del paquete nuevo.
    const ok = (await request(a).post('/api/training/students').set('Authorization', auth).send({ name: 'Carlos' })).body.student.id as string;
    await request(a).patch(`/api/training/students/${ok}`).set('Authorization', auth)
      .send({ billing: { clases_sem: 2, ciclo_sem: 4, pago_modo: 'clases', cuenta_desde: '2026-10-23', saldo_inicial: 1 } });
    legacy(repo, ok, 1, '2026-11-03', 8, 300);
    await request(a).put('/api/training/attendance').set('Authorization', auth).send({ student_ids: [ok], day: '2026-10-27', mark: 'p' });
    await request(a).put('/api/training/attendance').set('Authorization', auth).send({ student_ids: [ok], day: '2026-11-03', mark: 'p' });
    const review = async () => (await request(a).get('/api/training/charges/review').set('Authorization', auth)).body.items as Array<{
      student_id: string; charge: Charge; restan_antes: number; proposal: { action: string; into?: Charge }; restan_hoy: number; restan_corregido: number;
    }>;
    return { ...ctx, c1, c2, luli, l1, ok, review };
  }

  test('muestra los duplicados con la corrección propuesta y no cambia nada', async () => {
    const { review, id, c1, c2, luli, l1, ok, repo } = await scenario();
    const items = await review();
    expect(items.map((x) => x.charge.id).sort()).toEqual([c2.id, l1.id].sort());
    const ari = items.find((x) => x.student_id === id)!;
    expect(ari.proposal).toMatchObject({ action: 'merge', into: { id: c1.id } });
    expect(ari.restan_antes).toBe(2);
    const lu = items.find((x) => x.student_id === luli)!;
    expect(lu.proposal.action).toBe('opening');
    expect(lu.restan_antes).toBe(6);
    expect(lu.restan_corregido).toBe(lu.restan_hoy - 8);
    expect(items.some((x) => x.student_id === ok)).toBe(false);
    // Mostrar no corrige: los períodos siguen iguales.
    expect(await repo.listCharges(id)).toHaveLength(2);
  });

  test('unir: el pago pasa al período original, se quitan las clases repetidas y asistencias y pagos quedan', async () => {
    const { a, auth, id, c1, c2, review, repo, fin } = await scenario();
    const attBefore = await repo.listAttendance(id);
    const r = await request(a).post(`/api/training/charges/${c2.id}/resolve`).set('Authorization', auth).send({ action: 'merge', into: c1.id });
    expect(r.status).toBe(200);
    const after = await fin();
    expect(after.charges.filter((c) => c.student_id === id).map((c) => c.id)).toEqual([c1.id]);
    const pays = after.payments.filter((p) => p.student_id === id);
    expect(pays).toHaveLength(2);
    expect(pays.every((p) => p.charge_id === c1.id)).toBe(true);
    expect(await repo.listAttendance(id)).toEqual(attBefore);
    expect((await review()).some((x) => x.student_id === id)).toBe(false);
    const log = (await repo.listChanges({ studentId: id })).filter((c) => c.entity === 'charge');
    expect(log[0]).toMatchObject({ action: 'delete', before: { id: c2.id } });
  });

  test('ya contado en el saldo inicial: el período queda con su pago pero no suma clases', async () => {
    const { a, auth, luli, l1, review, repo } = await scenario();
    await request(a).post(`/api/training/charges/${l1.id}/resolve`).set('Authorization', auth).send({ action: 'opening' });
    const c = await repo.getCharge(l1.id);
    expect(c).toMatchObject({ in_opening: true, sessions: 8 });
    expect((await repo.listPayments(luli))[0]!.charge_id).toBe(l1.id);
    expect((await review()).some((x) => x.student_id === luli)).toBe(false);
  });

  test('está bien así: no cambia nada y deja de aparecer', async () => {
    const { a, auth, id, c2, review, repo } = await scenario();
    await request(a).post(`/api/training/charges/${c2.id}/resolve`).set('Authorization', auth).send({ action: 'keep' });
    expect(await repo.getCharge(c2.id)).toMatchObject({ sessions: 4, in_opening: false });
    expect((await review()).some((x) => x.student_id === id)).toBe(false);
  });

  test('unir sólo con un período del mismo alumno', async () => {
    const { a, auth, c2, l1 } = await scenario();
    const r = await request(a).post(`/api/training/charges/${c2.id}/resolve`).set('Authorization', auth).send({ action: 'merge', into: l1.id });
    expect(r.status).toBe(400);
  });

  test('los períodos creados con el flujo nuevo no se marcan', () => {
    const charge: Charge = {
      id: 'c', student_id: 's', kind: 'paquete', period_key: 'paq-1', starts_on: '2026-10-01', sessions: 8, amount: 1,
      in_opening: false, migrated_from: null, reviewed_at: null, note: null, created_at: '2026-10-01T00:00:00Z',
    };
    const items = reviewLegacy({
      today: '2026-11-13',
      students: [{ id: 's', name: 'X', billing: { pago_modo: 'clases', cuenta_desde: '2026-10-01', saldo_inicial: 8, clases_sem: 2 }, weekly: 2, marks: [] }],
      charges: [charge],
      payments: [{ id: 'p', student_id: 's', paid_on: '2026-10-01', amount: 1, classes: null, period: null, charge_id: 'c', note: null, created_at: '' }],
    });
    expect(items).toEqual([]);
  });

  test('claves de período', () => {
    expect(periodKey('mes', '2026-11-15', [])).toBe('2026-11');
    const c = { period_key: 'paq-3' } as Charge;
    expect(periodKey('paquete', '2026-11-15', [c])).toBe('paq-4');
    expect(periodKey('programacion', '2026-11-15', [c])).toBe('prog-1');
  });
});
