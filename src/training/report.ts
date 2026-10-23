/**
 * Informe de 4 semanas para el alumno. Los ciclos se cuentan desde su primera
 * sesión (ciclo 1 = semanas 1–4 del proceso). Sólo usa lo registrado: sesiones,
 * asistencia y las cantidades que escribió el coach; no estima ni interpreta.
 */
import { CAPACITIES, CapacityId } from './capacities';
import { exerciseName, firstName } from './parser';
import { buildProgress, ExerciseInfo, exerciseKey, ownItems, SessionForProgress, Unit } from './progress';
import { itemText } from './routine';
import { Attendance, Completion } from './repository';
import { occurrences, Schedule } from './schedule';

export const CYCLE_DAYS = 28;

const addDays = (iso: string, n: number): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (a: string, b: string): number =>
  Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);

export interface Cycle { n: number; start: string; end: string }

/** Ciclo de 4 semanas que contiene `date`, contado desde la primera sesión. */
export function cycleOf(firstDate: string, date: string): Cycle {
  const n = Math.max(1, Math.floor(daysBetween(firstDate, date) / CYCLE_DAYS) + 1);
  const start = addDays(firstDate, (n - 1) * CYCLE_DAYS);
  return { n, start, end: addDays(start, CYCLE_DAYS - 1) };
}

export interface ReportData {
  student_name: string;
  cycle: number;
  start: string;
  end: string;
  /** Semanas del proceso que cubre (p. ej. 5–8). */
  week_from: number;
  week_to: number;
  sessions: { count: number; dates: string[]; per_week: number[]; previous: number; total_to_date: number };
  /** Clases agendadas en el período (null si no tiene agenda). */
  planned: number | null;
  attendance: { p: number; a: number; e: number };
  capacities: Array<{ id: CapacityId; label: string; share: number; previous_share: number }>;
  improvements: Array<{ name: string; capacity: CapacityId | null; unit: Unit; from: number; to: number; from_date: string; to_date: string }>;
  new_exercises: Array<{ name: string; capacity: CapacityId | null }>;
  feeling: { average: number; count: number } | null;
  comments: Array<{ date: string; text: string }>;
}

export interface ReportInput {
  studentName: string;
  /** Sesiones realizadas por el alumno (todas, para comparar con lo anterior). */
  sessions: SessionForProgress[];
  /** Fecha de cada sesión terminada por el alumno, con su sensación y comentario. */
  completions: Array<Completion & { date: string }>;
  attendance: Attendance[];
  schedule: Schedule | null;
  info: ExerciseInfo;
}

function shareByCapacity(sessions: SessionForProgress[], who: string, info: ExerciseInfo): Map<CapacityId, number> {
  const count = new Map<CapacityId, number>();
  for (const s of sessions) {
    for (const it of ownItems(s.routine, who)) {
      const name = exerciseName(itemText(it));
      if (!name) continue;
      const cap = info(exerciseKey(name), it.name).capacity;
      if (cap) count.set(cap, (count.get(cap) ?? 0) + 1);
    }
  }
  const total = [...count.values()].reduce((a, b) => a + b, 0);
  return new Map([...count].map(([k, v]) => [k, total ? Math.round((v / total) * 1000) / 1000 : 0]));
}

export function buildReport(input: ReportInput, cycle: Cycle, firstDate: string): ReportData {
  const { start, end } = cycle;
  const who = firstName(input.studentName);
  const sorted = [...input.sessions].sort((a, b) => a.date.localeCompare(b.date));
  const inPeriod = sorted.filter((s) => s.date >= start && s.date <= end);
  const prevStart = addDays(start, -CYCLE_DAYS);
  const previous = sorted.filter((s) => s.date >= prevStart && s.date < start);
  const upToEnd = sorted.filter((s) => s.date <= end);

  const perWeek = [0, 0, 0, 0];
  for (const s of inPeriod) perWeek[Math.min(3, Math.floor(daysBetween(start, s.date) / 7))]! += 1;

  const marks = input.attendance.filter((a) => a.day >= start && a.day <= end);
  const planned = input.schedule && (input.schedule.weekly.length || input.schedule.once.length)
    ? occurrences(input.schedule, start, end).length : null;

  // Capacidades: parte del trabajo de este ciclo y del anterior.
  const now = shareByCapacity(inPeriod, who, input.info);
  const before = shareByCapacity(previous, who, input.info);
  const capacities = CAPACITIES.filter((c) => now.has(c.id))
    .map((c) => ({ id: c.id, label: c.label, share: now.get(c.id) ?? 0, previous_share: before.get(c.id) ?? 0 }))
    .sort((a, b) => b.share - a.share);

  // Mejoras: último valor del ciclo contra el último anterior al ciclo (o el primero del ciclo).
  const progress = buildProgress(input.studentName, upToEnd, input.info, new Date(`${end}T12:00:00`));
  const improvements = progress.exercises.flatMap((e) => {
    const inside = e.points.filter((p) => p.date >= start && p.date <= end);
    if (!inside.length) return [];
    const earlier = e.points.filter((p) => p.date < start);
    const base = earlier.length ? earlier[earlier.length - 1]! : inside.length > 1 ? inside[0]! : null;
    const last = inside[inside.length - 1]!;
    if (!base || base === last || base.value <= 0 || last.value <= base.value) return [];
    return [{
      name: e.name, capacity: e.capacity, unit: e.unit, from: base.value, to: last.value,
      from_date: base.date, to_date: last.date, gain: (last.value - base.value) / base.value,
    }];
  })
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 6)
    .map(({ gain: _g, ...rest }) => rest);

  // Ejercicios nuevos: aparecen por primera vez en este ciclo.
  const firstSeen = new Map<string, { date: string; name: string; raw: string }>();
  for (const s of upToEnd) {
    for (const it of ownItems(s.routine, who)) {
      const name = exerciseName(itemText(it));
      if (!name) continue;
      const key = exerciseKey(name);
      if (key && !firstSeen.has(key)) firstSeen.set(key, { date: s.date, name: it.name, raw: name });
    }
  }
  const new_exercises = [...firstSeen.entries()]
    .filter(([, v]) => v.date >= start)
    .map(([key, v]) => {
      const meta = input.info(key, v.name);
      return { name: meta.name ?? v.name, capacity: meta.capacity };
    })
    .slice(0, 8);

  const done = input.completions.filter((c) => c.completed_at && c.date >= start && c.date <= end);
  const felt = done.map((c) => c.feeling).filter((f): f is number => typeof f === 'number');
  const firstWeek = (d: string) => Math.floor(daysBetween(firstDate, d) / 7) + 1;

  return {
    student_name: input.studentName,
    cycle: cycle.n,
    start,
    end,
    week_from: firstWeek(start),
    week_to: firstWeek(end),
    sessions: {
      count: inPeriod.length,
      dates: inPeriod.map((s) => s.date),
      per_week: perWeek,
      previous: previous.length,
      total_to_date: upToEnd.length,
    },
    planned,
    attendance: {
      p: marks.filter((m) => m.mark === 'p').length,
      a: marks.filter((m) => m.mark === 'a').length,
      e: marks.filter((m) => m.mark === 'e').length,
    },
    capacities,
    improvements,
    new_exercises,
    feeling: felt.length ? { average: Math.round((felt.reduce((a, b) => a + b, 0) / felt.length) * 10) / 10, count: felt.length } : null,
    comments: done.filter((c) => c.comment).map((c) => ({ date: c.date, text: c.comment! })).slice(0, 6),
  };
}
