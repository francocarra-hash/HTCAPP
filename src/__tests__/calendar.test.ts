/**
 * Calendario para suscribirse: las clases de la agenda salen en formato
 * iCalendar con un enlace privado que se puede cambiar por otro.
 */
import express from 'express';
import request from 'supertest';
import { createCalendarRouter } from '../api/router-calendar';
import { createAuthRouter, createTrainingRouter } from '../api/router-training';
import { calendarEvents, CalendarStudent, toIcs, zonedToUtc } from '../training/calendar';
import { InMemoryTrainingRepository } from '../training/repository';
import { localNow } from '../training/schedule';

const OLD = process.env.HTC_AUTH_PASSWORD;
beforeAll(() => { process.env.HTC_AUTH_PASSWORD = 'profe-secreto'; });
afterAll(() => {
  if (OLD === undefined) delete process.env.HTC_AUTH_PASSWORD;
  else process.env.HTC_AUTH_PASSWORD = OLD;
});

const TZ = 'America/Argentina/Buenos_Aires';
const st = (name: string, schedule: CalendarStudent['schedule'], billing: unknown = null): CalendarStudent =>
  ({ id: name, name, schedule, billing });
// 2026-11-16 es lunes.
const lunMie = { weekly: [{ weekday: 1, time: '18:00' }, { weekday: 3, time: '18:00' }], once: [], skip: [] };

describe('clases del calendario', () => {
  test('las clases a la misma hora van en un solo evento', () => {
    const ev = calendarEvents([
      st('Guille Paz', lunMie),
      st('Bruno Sosa', { weekly: [{ weekday: 1, time: '18:00' }], once: [], skip: [] }),
      st('Ana Ruiz', { weekly: [{ weekday: 1, time: '09:30' }], once: [], skip: [] }),
    ], '2026-11-16', '2026-11-18');
    expect(ev.map((e) => [e.date, e.time, e.students.map((s) => s.name)])).toEqual([
      ['2026-11-16', '09:30', ['Ana Ruiz']],
      ['2026-11-16', '18:00', ['Bruno Sosa', 'Guille Paz']],
      ['2026-11-18', '18:00', ['Guille Paz']],
    ]);
  });

  test('una clase cancelada no aparece y una pasada de día aparece en el día nuevo', () => {
    const ev = calendarEvents([st('Guille Paz', {
      ...lunMie, skip: ['2026-11-16', '2026-11-18'],
      once: [{ date: '2026-11-17', time: '10:00', note: 'Pasada del 16 nov', from: '2026-11-16' }],
    })], '2026-11-16', '2026-11-22');
    expect(ev).toEqual([{ date: '2026-11-17', time: '10:00', students: [{ name: 'Guille Paz', note: 'Pasada del 16 nov' }] }]);
  });

  test('no entran los alumnos en pausa, de baja ni los de programación a distancia', () => {
    const ev = calendarEvents([
      st('Pausa', lunMie, { estado: 'pausa' }),
      st('Baja', lunMie, { estado: 'baja' }),
      st('Distancia', lunMie, { modalidad: 'virtual_asinc' }),
      st('Activa', lunMie, { estado: 'activo', modalidad: 'presencial' }),
    ], '2026-11-16', '2026-11-16');
    expect(ev.flatMap((e) => e.students.map((s) => s.name))).toEqual(['Activa']);
  });
});

describe('formato iCalendar', () => {
  const now = new Date('2026-11-17T12:00:00Z');
  const ics = (events: Parameters<typeof toIcs>[0], minutes = 60) => toIcs(events, { name: 'HTC · Clases', tz: TZ, minutes, now });

  test('la hora local se pasa a UTC y la clase dura lo configurado', () => {
    expect(zonedToUtc('2026-11-16', '18:00', TZ).toISOString()).toBe('2026-11-16T21:00:00.000Z');
    const txt = ics([{ date: '2026-11-16', time: '18:00', students: [{ name: 'Guille Paz', note: null }] }], 90);
    expect(txt).toContain('DTSTART:20261116T210000Z\r\n');
    expect(txt).toContain('DTEND:20261116T223000Z\r\n');
    expect(txt).toContain('SUMMARY:Guille Paz\r\n');
    expect(txt).toContain('UID:htc-2026-11-16-1800@htc\r\n');
    expect(txt.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(txt.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  test('una clase tarde a la noche termina al día siguiente en UTC', () => {
    const txt = ics([{ date: '2026-11-16', time: '22:30', students: [{ name: 'Ana', note: null }] }]);
    expect(txt).toContain('DTSTART:20261117T013000Z');
  });

  test('sin hora cargada: evento de todo el día', () => {
    const txt = ics([{ date: '2026-11-30', time: null, students: [{ name: 'Ana', note: null }] }]);
    expect(txt).toContain('DTSTART;VALUE=DATE:20261130\r\n');
    expect(txt).toContain('DTEND;VALUE=DATE:20261201\r\n');
  });

  test('clase compartida: nombres de pila en el título y el detalle completo', () => {
    const txt = ics([{ date: '2026-11-16', time: '18:00', students: [{ name: 'Bruno Sosa', note: null }, { name: 'Guille Paz', note: 'Pasada del 14 nov' }] }]);
    expect(txt).toContain('SUMMARY:Bruno\\, Guille\r\n');
    expect(txt).toContain('DESCRIPTION:Bruno Sosa\\nGuille Paz (Pasada del 14 nov)\r\n');
  });

  test('ninguna línea pasa de 75 bytes', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ name: `Ñandú Peñaloza ${i}`, note: null }));
    const txt = ics([{ date: '2026-11-16', time: '18:00', students: many }]);
    for (const line of txt.split('\r\n')) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    expect(txt.replace(/\r\n /g, '')).toContain('Ñandú Peñaloza 11');
  });
});

describe('enlace del calendario', () => {
  async function setup() {
    const repo = new InMemoryTrainingRepository();
    const a = express();
    a.use(express.json());
    a.use('/api', createAuthRouter(repo));
    a.use('/api/training', createTrainingRouter(repo));
    a.use('/api/calendar', createCalendarRouter(repo));
    const auth = `Bearer ${(await request(a).post('/api/login').send({ username: 'profe', password: 'profe-secreto' })).body.token}`;
    const id = (await request(a).post('/api/training/students').set('Authorization', auth).send({ name: 'Guille Paz' })).body.student.id as string;
    const all = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, time: '18:00' }));
    await request(a).patch(`/api/training/students/${id}`).set('Authorization', auth).send({ schedule: { weekly: all, once: [], skip: [] } });
    return { a, auth, id };
  }

  test('el enlace lo pide el profe; el calendario se abre sin login', async () => {
    const { a, auth } = await setup();
    expect((await request(a).get('/api/training/calendar-link')).status).toBe(401);
    const link = (await request(a).get('/api/training/calendar-link').set('Authorization', auth)).body as { path: string };
    expect(link.path).toMatch(/^\/api\/calendar\/[A-Za-z0-9_-]{24,}\.ics$/);
    expect((await request(a).get('/api/training/calendar-link').set('Authorization', auth)).body.path).toBe(link.path);

    const res = await request(a).get(link.path);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/calendar');
    expect(res.text).toContain('SUMMARY:Guille Paz');
    expect(res.text).toContain(`UID:htc-${localNow().date}-1800@htc`);
  });

  test('con otra clave no hay calendario', async () => {
    const { a, auth } = await setup();
    await request(a).get('/api/training/calendar-link').set('Authorization', auth);
    expect((await request(a).get(`/api/calendar/${'x'.repeat(32)}.ics`)).status).toBe(404);
    expect((await request(a).get('/api/calendar/corto.ics')).status).toBe(404);
  });

  test('pedir un enlace nuevo anula el anterior', async () => {
    const { a, auth } = await setup();
    const old = (await request(a).get('/api/training/calendar-link').set('Authorization', auth)).body.path as string;
    const fresh = (await request(a).post('/api/training/calendar-link/reset').set('Authorization', auth)).body.path as string;
    expect(fresh).not.toBe(old);
    expect((await request(a).get(old)).status).toBe(404);
    expect((await request(a).get(fresh)).status).toBe(200);
  });

  test('lo que cambia en la agenda aparece al volver a pedir el calendario', async () => {
    const { a, auth, id } = await setup();
    const path = (await request(a).get('/api/training/calendar-link').set('Authorization', auth)).body.path as string;
    const today = localNow().date;
    await request(a).patch(`/api/training/students/${id}`).set('Authorization', auth)
      .send({ schedule: { weekly: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, time: '18:00' })), once: [], skip: [today] } });
    expect((await request(a).get(path)).text).not.toContain(`UID:htc-${today}-1800@htc`);
  });
});
