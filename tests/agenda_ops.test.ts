/**
 * Cambios de la agenda desde la pantalla del profe: cada acción (cambiar la
 * hora, pasar de día, cancelar, volver a agendar, sumar) deja la agenda como
 * la leen el resto de la app y el calendario.
 */
import {
  addClass, cancelClass, dayState, moveClass, restoreClass, Sched, setFixedTime, setTime, tidy, toggleFixed,
} from '../web/src/app/agendaOps';
import { occurrences } from '../src/training/schedule';

// 2026-11-16 es lunes; 18 miércoles; 23 lunes.
const base: Sched = { weekly: [{ weekday: 1, time: '18:00' }, { weekday: 3, time: '18:00' }], once: [], skip: [] };
const week = (s: Sched) => occurrences(s, '2026-11-16', '2026-11-22').map((o) => `${o.date} ${o.time}`);
const count = (s: Sched) => occurrences(s, '2026-11-01', '2026-11-30').length;

describe('qué pasa cada día', () => {
  test('día fijo, día libre y día cancelado', () => {
    expect(dayState(base, '2026-11-16')).toMatchObject({ kind: 'class', time: '18:00', fixed: true });
    expect(dayState(base, '2026-11-17')).toEqual({ kind: 'free' });
    expect(dayState({ ...base, skip: ['2026-11-16'] }, '2026-11-16')).toEqual({ kind: 'cancelled', time: '18:00', movedTo: null });
  });
});

describe('cambiar la hora', () => {
  test('sólo ese día: las otras semanas quedan igual y la clase se cuenta una vez', () => {
    const s = setTime(base, '2026-11-16', '10:30');
    expect(week(s)).toEqual(['2026-11-16 10:30', '2026-11-18 18:00']);
    expect(occurrences(s, '2026-11-23', '2026-11-23')[0]!.time).toBe('18:00');
    expect(count(s)).toBe(count(base));
    expect(dayState(s, '2026-11-16')).toMatchObject({ kind: 'class', time: '10:30', fixed: true, usual: '18:00', movedFrom: null });
  });

  test('volver a la hora de siempre deshace el cambio', () => {
    expect(setTime(setTime(base, '2026-11-16', '10:30'), '2026-11-16', '18:00')).toEqual(base);
  });

  test('cambiarla dos veces no duplica la clase', () => {
    const s = setTime(setTime(base, '2026-11-16', '10:30'), '2026-11-16', '11:00');
    expect(week(s)).toEqual(['2026-11-16 11:00', '2026-11-18 18:00']);
    expect(s.once).toHaveLength(1);
  });

  test('todas las semanas: cambia el día fijo y saca el cambio puntual', () => {
    const s = setFixedTime(setTime(base, '2026-11-16', '10:30'), '2026-11-16', '19:00');
    expect(s).toEqual({ weekly: [{ weekday: 1, time: '19:00' }, { weekday: 3, time: '18:00' }], once: [], skip: [] });
  });
});

describe('pasar una clase a otro día', () => {
  test('sale del día original y aparece en el nuevo, una sola vez', () => {
    const s = moveClass(base, '2026-11-16', '2026-11-17', '09:00');
    expect(week(s)).toEqual(['2026-11-17 09:00', '2026-11-18 18:00']);
    expect(count(s)).toBe(count(base));
    expect(dayState(s, '2026-11-17')).toMatchObject({ kind: 'class', movedFrom: '2026-11-16', fixed: false });
    expect(dayState(s, '2026-11-16')).toEqual({ kind: 'cancelled', time: '18:00', movedTo: '2026-11-17' });
    expect(s.once[0]).toMatchObject({ note: 'Pasada del 16 nov', from: '2026-11-16' });
  });

  test('pasarla de nuevo conserva el día original', () => {
    const s = moveClass(moveClass(base, '2026-11-16', '2026-11-17', '09:00'), '2026-11-17', '2026-11-19', '09:00');
    expect(week(s)).toEqual(['2026-11-18 18:00', '2026-11-19 09:00']);
    expect(s.once).toEqual([{ date: '2026-11-19', time: '09:00', note: 'Pasada del 16 nov', from: '2026-11-16' }]);
    expect(s.skip).toEqual(['2026-11-16']);
  });

  test('devolverla a su día deshace el cambio', () => {
    const s = moveClass(moveClass(base, '2026-11-16', '2026-11-17', '09:00'), '2026-11-17', '2026-11-16', '18:00');
    expect(s).toEqual(base);
  });

  test('una clase con la hora cambiada también se puede pasar', () => {
    const s = moveClass(setTime(base, '2026-11-16', '10:30'), '2026-11-16', '2026-11-20', '10:30');
    expect(week(s)).toEqual(['2026-11-18 18:00', '2026-11-20 10:30']);
    expect(dayState(s, '2026-11-16')).toMatchObject({ kind: 'cancelled', movedTo: '2026-11-20' });
  });

  test('una clase extra sólo cambia de fecha', () => {
    const s = moveClass(addClass(base, '2026-11-17', '08:00', 'Recupera'), '2026-11-17', '2026-11-19', '08:00');
    expect(s.once).toEqual([{ date: '2026-11-19', time: '08:00', note: 'Recupera' }]);
    expect(s.skip).toEqual([]);
  });
});

describe('cancelar y volver a agendar', () => {
  test('cancelar un día fijo y volver a agendarlo', () => {
    const s = cancelClass(base, '2026-11-16');
    expect(week(s)).toEqual(['2026-11-18 18:00']);
    expect(restoreClass(s, '2026-11-16')).toEqual(base);
  });

  test('cancelar una clase pasada de día: no vuelve al día original', () => {
    const s = cancelClass(moveClass(base, '2026-11-16', '2026-11-17', '09:00'), '2026-11-17');
    expect(week(s)).toEqual(['2026-11-18 18:00']);
    expect(dayState(s, '2026-11-16')).toEqual({ kind: 'cancelled', time: '18:00', movedTo: null });
  });

  test('volver a agendar el día original trae de vuelta la clase pasada', () => {
    const s = restoreClass(moveClass(base, '2026-11-16', '2026-11-17', '09:00'), '2026-11-16');
    expect(s).toEqual(base);
  });

  test('cancelar una clase extra la saca', () => {
    expect(cancelClass(addClass(base, '2026-11-17', '08:00'), '2026-11-17')).toEqual(base);
  });
});

describe('días fijos y clases extra', () => {
  test('agregar un día fijo toma la hora de los otros; sacarlo lo quita', () => {
    const s = toggleFixed(base, 5);
    expect(s.weekly).toEqual([{ weekday: 1, time: '18:00' }, { weekday: 3, time: '18:00' }, { weekday: 5, time: '18:00' }]);
    expect(toggleFixed(s, 5)).toEqual(base);
  });

  test('no se suma una clase extra donde ya hay clase', () => {
    expect(addClass(base, '2026-11-16', '08:00')).toBe(base);
  });

  test('al guardar se ordena y se limpian las cancelaciones viejas', () => {
    const s = tidy({ ...base, skip: ['2026-11-16', '2026-01-05', '2026-11-16'], once: [{ date: '2026-12-01', time: null }, { date: '2026-11-20', time: '09:00' }] }, '2026-09-01');
    expect(s.skip).toEqual(['2026-11-16']);
    expect(s.once.map((o) => o.date)).toEqual(['2026-11-20', '2026-12-01']);
  });
});
