/**
 * La carga sale de la planificación: cuando el profe guarda una sesión como
 * hecha, lo que escribió es lo que se hizo. No hay que reconfirmar ejercicio
 * por ejercicio; el registro manual queda sólo para corregir.
 */
import { doseText, planExecutions, setsFromPlan } from '../training/derive';
import { Execution, SetSchema } from '../training/execution';
import { buildMonitoring, MonitoringSession } from '../training/monitoring';
import { Routine, RoutineItem } from '../training/routine';

const it = (id: string, name: string, dose = ''): RoutineItem => ({ id, name, dose } as RoutineItem);
const routine = (rounds: number | null, ...items: RoutineItem[]): Routine => ({
  blocks: [{ id: 'b0', kind: 'circuit', title: 'Circuito 1', rounds, groups: items.map((x, i) => ({ id: `g${i}`, items: [x] })) }],
} as unknown as Routine);
const brief = (dose: string, rounds: number | null = null) => setsFromPlan(dose, rounds).map((s) => [s.reps, s.secs, s.load]);
const info = (k: string) => ({ capacity: k.includes('wall') || k.includes('squat') ? 'fuerza' as const : k.includes('car') ? 'movilidad' as const : null });

describe('leer la dosis como la escribe el profe', () => {
  test('un número son repeticiones, una serie por vuelta del bloque', () => {
    expect(brief('12', 3)).toEqual([[12, null, null], [12, null, null], [12, null, null]]);
    expect(brief('12')).toEqual([[12, null, null]]);
  });
  test('"10 - 10 - 12" y "20/25/30": una serie por cada valor', () => {
    expect(brief('10 - 10 - 12', 3)).toEqual([[10, null, null], [10, null, null], [12, null, null]]);
    expect(brief('20/25/30')).toEqual([[20, null, null], [25, null, null], [30, null, null]]);
    expect(brief('30s - 40s - 45s', 3)).toEqual([[null, 30, null], [null, 40, null], [null, 45, null]]);
  });
  test('tiempos: segundos, minutos y "1:30m"', () => {
    expect(brief('45s', 2)).toEqual([[null, 45, null], [null, 45, null]]);
    expect(brief('2min')).toEqual([[null, 120, null]]);
    expect(brief('1:30m')).toEqual([[null, 90, null]]);
    expect(brief('1min - 1min - 1m')).toEqual([[null, 60, null], [null, 60, null], [null, 60, null]]);
  });
  test('sostén más repeticiones: "30s+10r" guarda las dos cosas', () => {
    expect(brief('30s+10r', 2)).toEqual([[10, 30, null], [10, 30, null]]);
    expect(brief('10r+10s')).toEqual([[10, 10, null]]);
  });
  test('kilos: "20kg 8r", "+5kg 10r +10s" y "3x8 20kg"', () => {
    expect(brief('20kg 8r', 3)).toEqual([[8, null, 20], [8, null, 20], [8, null, 20]]);
    expect(brief('+5kg 10r +10s')).toEqual([[10, 10, 5]]);
    expect(brief('3x8 20kg')).toEqual([[8, null, 20], [8, null, 20], [8, null, 20]]);
    // Los kilos escritos una vez valen para todas las series.
    expect(brief('8kg 6/6/6')).toEqual([[6, null, 8], [6, null, 8], [6, null, 8]]);
    // Cambia la carga entre series.
    expect(brief('10r+10s +5kg/ +12kg 8r+10s', 2)).toEqual([[10, 10, 5], [8, 10, 12]]);
  });
  test('menos valores que vueltas: la última repite el último valor', () => {
    expect(brief('8/10', 3)).toEqual([[8, null, null], [10, null, null], [10, null, null]]);
  });
  test('"3x8" manda sobre las vueltas del bloque', () => {
    expect(brief('3x8', 2)).toHaveLength(3);
    expect(brief('10r x2', 4)).toEqual([[10, null, null], [10, null, null]]);
  });
  test('sin dosis: cuenta la serie, sin números', () => {
    expect(brief('', 2)).toEqual([[null, null, null], [null, null, null]]);
  });
  test('la dosis escrita dentro del nombre', () => {
    expect(doseText(it('a', 'Swimmers 10 - 10 - 10'))).toBe('10 - 10 - 10');
    expect(doseText(it('a', 'Wall Sit 1:15m'))).toBe('1:15m');
    expect(doseText(it('a', '25 jump squat'))).toBe('25');
    expect(doseText(it('a', '90/90 Lean'))).toBe('');
    expect(doseText(it('a', '90/90 Lean', '10r+10s'))).toBe('10r+10s');
    expect(doseText(it('a', 'Partial pistol 12 → mejorar control'))).toBe('12');
    expect(doseText(it('a', 'Hip CARs'))).toBe('');
  });
});

describe('lo realizado sale de la planificación', () => {
  const r = routine(3, it('i1', 'Goblet squat', '20kg 8r'), it('i2', 'Wall sit', '45s'), it('i3', 'Hip CARs'));
  const session = (id: string, date: string, over: Partial<MonitoringSession> = {}): MonitoringSession =>
    ({ id, date, status: 'done', routine: r, checks: null, completed_at: null, ...over });

  test('sesión guardada como hecha por el profe: toda la rutina, sin confirmar nada', () => {
    const ex = planExecutions({ sessions: [session('s1', '2026-11-02')], studentId: 'st', studentName: 'Ana', info, stored: [] });
    expect(ex.map((e) => [e.exercise_name, e.tracking, e.sets.length, e.origin, e.source])).toEqual([
      ['Goblet squat', 'dinamica', 3, 'plan', 'coach'],
      ['Wall sit', 'isometrica', 3, 'plan', 'coach'],
      ['Hip CARs', 'movilidad', 3, 'plan', 'coach'],
    ]);
    expect(ex[0]!.sets[0]).toMatchObject({ reps: 8, load: 20 });
    expect(ex[0]!.data_quality).toBe('completo');
  });

  test('rutina asignada sin terminar: no cuenta; terminada por el alumno: lo que marcó', () => {
    const base = { studentId: 'st', studentName: 'Ana', info, stored: [] as Execution[] };
    expect(planExecutions({ ...base, sessions: [session('s1', '2026-11-02', { status: 'planned' })] })).toEqual([]);
    const some = planExecutions({ ...base, sessions: [session('s1', '2026-11-02', { status: 'planned', completed_at: '2026-11-02T20:00:00Z', checks: ['i1', 'i3'] })] });
    expect(some.map((e) => e.item_id)).toEqual(['i1', 'i3']);
    expect(some[0]!.source).toBe('client');
    const all = planExecutions({ ...base, sessions: [session('s1', '2026-11-02', { status: 'planned', completed_at: '2026-11-02T20:00:00Z', checks: [] })] });
    expect(all).toHaveLength(3);
  });

  test('una corrección manual reemplaza a la planificación sólo en ese ejercicio', () => {
    const manual: Execution = {
      id: 'e1', session_id: 's1', student_id: 'st', item_id: 'i1', day: '2026-11-02', exercise_key: 'goblet squat', exercise_name: 'Goblet squat',
      variant: null, tracking: 'dinamica', load_config: 'kettlebell', assistance: null, body_mass_kg: null,
      prescribed: { text: '', name: '', dose: '', block: '', rounds: 3, sets: 3 }, sets: [SetSchema.parse({ n: 1, reps: 6, load: 20 }), SetSchema.parse({ n: 2, reps: 5, load: 20 })],
      notes: null, source: 'coach', data_quality: 'completo', version: 1, created_at: '', updated_at: '',
    };
    const m = buildMonitoring({
      today: '2026-11-05', studentName: 'Ana', studentId: 'st', sessions: [session('s1', '2026-11-02')], executions: [manual],
      responses: [], attendance: [], changes: [], info,
    });
    const w = m.windows.find((x) => x.key === '7d')!;
    // 2 series corregidas + 3 de wall sit + 3 de movilidad.
    expect(w.work.sets).toBe(8);
    expect(w.work.volume_kg).toBe(220);
    expect(m.coverage).toMatchObject({ with_records: 1, from_plan: 1 });
  });

  test('carga por semana y por mes, sin pedir datos que el profe no carga', () => {
    const m = buildMonitoring({
      today: '2026-11-12', studentName: 'Ana', studentId: 'st',
      sessions: [session('s0', '2026-10-27'), session('s1', '2026-11-03'), session('s2', '2026-11-05'), session('s3', '2026-11-10')],
      executions: [], responses: [], attendance: [], changes: [], info,
    });
    // Por sesión: 9 series, 24 repeticiones, 135 s de sostén y 480 kg (20 kg × 8 × 3).
    const week = m.weeks.find((x) => x.week_start === '2026-11-02')!;
    expect(week.sessions).toBe(2);
    expect(week.work).toEqual({ sets: 18, reps: 48, hold_s: 270, aerobic_s: 0, volume_kg: 960 });
    expect(m.months.map((x) => [x.month, x.sessions, x.work.sets, x.work.volume_kg])).toEqual([['2026-10', 1, 9, 480], ['2026-11', 3, 27, 1440]]);
    expect(m.months[1]!.sets_by_capacity).toEqual({ fuerza: 18, movilidad: 9 });
    const w = m.windows.find((x) => x.key === '28d')!;
    expect(w.prescription).toEqual({ done: 12, total: 12, sessions: 4 });
    expect(w.exposure.find((e) => e.capacity === 'fuerza')).toMatchObject({ entries: 8, sets: 24 });
    // Nada de "faltan datos": no se le pide al profe esfuerzo ni confirmación.
    expect(m.review.some((x) => x.kind === 'datos')).toBe(false);
    expect(m.coverage).toMatchObject({ realized: 4, with_records: 0, from_plan: 4 });
  });

  test('progreso por ejercicio con lo planificado: comparable, no "limitada"', () => {
    const at = (id: string, date: string, dose: string) => session(id, date, { routine: routine(3, it('i1', 'Goblet squat', dose)) });
    const m = buildMonitoring({
      today: '2026-11-12', studentName: 'Ana', studentId: 'st',
      sessions: [at('s1', '2026-10-06', '16kg 8r'), at('s2', '2026-10-20', '20kg 8r'), at('s3', '2026-11-03', '24kg 8r')],
      executions: [], responses: [], attendance: [], changes: [], info,
    });
    expect(m.exercises).toHaveLength(1);
    const g = m.exercises[0]!.groups[0]!;
    expect(g.limited).toBe(false);
    expect(g.conditions).toContain('Según la planificación');
    expect(g.records.every((x) => x.from_plan)).toBe(true);
    expect(g.changes.find((c) => c.id === 'load')).toMatchObject({ baseline: { value: 16 }, current: { value: 24 }, abs: 8, pct: 50 });
    expect(g.changes.find((c) => c.id === 'volume')).toMatchObject({ baseline: { value: 384 }, current: { value: 576 } });
  });
});
