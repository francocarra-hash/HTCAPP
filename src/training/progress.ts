/**
 * Progreso de un alumno a partir de sus sesiones. Sólo usa las cantidades que el
 * coach escribió: no estima, no extrapola. Un ejercicio entra en el progreso
 * cuando aparece con dosis comparable en al menos 3 sesiones. Todo se agrupa
 * además por capacidad física (fuerza, movilidad, reactividad…).
 */
import { CAPACITIES, CapacityId } from './capacities';
import { doseOf, exerciseName, firstName, fold } from './parser';
import { exerciseGroups, itemText, Routine, RoutineItem } from './routine';

export type Unit = 's' | 'reps' | 'kg';

export interface ProgressPoint {
  date: string;
  value: number;
  /** Texto original del ítem en esa sesión. */
  text: string;
}

export interface ExerciseSeries {
  key: string;
  name: string;
  capacity: CapacityId | null;
  unit: Unit;
  points: ProgressPoint[];
  first: number;
  last: number;
  best: number;
}

export interface ProgressStats {
  sessions: number;
  first_date: string | null;
  last_date: string | null;
  weeks_active: number;
  /** Semanas desde la primera sesión (incluida la actual): "semana N de tu proceso". */
  process_week: number;
  per_week: number | null;
  this_month: number;
  streak_weeks: number;
}

export interface Highlight {
  key: string; name: string; capacity: CapacityId | null; unit: Unit;
  from: number; to: number; first_date: string; last_date: string;
}

export interface CapacitySummary {
  id: CapacityId;
  label: string;
  /** Sesiones en las que se trabajó. */
  sessions: number;
  /** Ejercicios con seguimiento (≥3 sesiones) y cuántos mejoraron. */
  tracked: number;
  improved: number;
  top: Highlight | null;
  /** Parte del trabajo de las últimas 4 semanas (0–1), entre ejercicios clasificados. */
  recent_share: number;
}

/**
 * Ejercicio que el alumno sostiene en el tiempo. Ahí el progreso suele estar en la
 * calidad (cómo organiza el cuerpo, transfiere el peso, siente el movimiento),
 * aunque los números no cambien.
 */
export interface Practice {
  key: string; name: string; capacity: CapacityId | null;
  sessions: number; weeks: number; first_date: string; last_date: string;
  /** Sesiones en las últimas 8 semanas. */
  recent: number;
}

export interface Progress {
  stats: ProgressStats;
  practice: Practice[];
  months: Array<{ month: string; count: number }>;
  exercises: ExerciseSeries[];
  highlights: Highlight[];
  capacities: CapacitySummary[];
}

export interface SessionForProgress {
  date: string;
  routine: Routine;
}

/** Metadatos de la biblioteca: nombre elegido por el coach y capacidad. */
export type ExerciseInfo = (key: string, name: string) => { name?: string; capacity: CapacityId | null; video?: string | null };

const ALIASES: Record<string, string> = {
  yiwto: 'iywto',
  flexione: 'push up',
};

const singular = (w: string): string => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);

/** Clave de agrupación: sin acentos, singular, palabras ordenadas ("SA Tabletop" = "Tabletop SA"). */
export function exerciseKey(name: string): string {
  const words = fold(name)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(singular);
  const joined = words.join(' ');
  const aliased = ALIASES[joined] ?? joined;
  return aliased.split(' ').sort().join(' ');
}

/** Clave de un ítem de rutina (nombre + dosis tal como se escribió). */
export const itemKey = (it: RoutineItem): string => exerciseKey(exerciseName(itemText(it)));

/** Ítems "propios" del alumno: sin variantes de otros y sin la base que su variante reemplaza. */
export function ownItems(routine: Routine, who: string): RoutineItem[] {
  const me = fold(who);
  const out: RoutineItem[] = [];
  for (const g of exerciseGroups(routine)) {
    g.forEach((it, i) => {
      if (it.who) return; // variantes: se muestran, pero no se grafican
      const next = g[i + 1];
      if (next?.who && fold(next.who) === me) return;
      out.push(it);
    });
  }
  return out;
}

function isoWeek(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
const weekStart = (date: string): number => {
  const d = new Date(`${date}T00:00:00Z`);
  return d.getTime() - ((d.getUTCDay() + 6) % 7) * 86400000;
};
const isoDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const NO_INFO: ExerciseInfo = () => ({ capacity: null });

export function buildProgress(
  studentName: string,
  sessions: SessionForProgress[],
  info: ExerciseInfo = NO_INFO,
  today = new Date(),
): Progress {
  const sorted = [...sessions].filter((s) => s.date).sort((a, b) => a.date.localeCompare(b.date));
  const who = firstName(studentName);
  const todayIso = isoDate(today);

  // ── estadísticas ──
  const weeks = new Set(sorted.map((s) => isoWeek(s.date)));
  const first = sorted[0]?.date ?? null;
  const last = sorted[sorted.length - 1]?.date ?? null;
  let perWeek: number | null = null;
  if (first && last) {
    const span = Math.max(1, Math.round((weekStart(last) - weekStart(first)) / (7 * 86400000)) + 1);
    perWeek = Math.round((sorted.length / span) * 10) / 10;
  }
  const processWeek = first ? Math.max(1, Math.floor((weekStart(todayIso) - weekStart(first)) / (7 * 86400000)) + 1) : 0;
  const monthKey = todayIso.slice(0, 7);
  let streak = 0;
  if (last) {
    let w = weekStart(last);
    const starts = new Set(sorted.map((s) => weekStart(s.date)));
    while (starts.has(w)) {
      streak++;
      w -= 7 * 86400000;
    }
  }

  // ── sesiones por mes (meses vacíos incluidos) ──
  const months: Array<{ month: string; count: number }> = [];
  if (first && last) {
    const counts = new Map<string, number>();
    for (const s of sorted) counts.set(s.date.slice(0, 7), (counts.get(s.date.slice(0, 7)) ?? 0) + 1);
    let [y, m] = first.slice(0, 7).split('-').map(Number) as [number, number];
    const end = last.slice(0, 7);
    for (let guard = 0; guard < 120; guard++) {
      const key = `${y}-${String(m).padStart(2, '0')}`;
      months.push({ month: key, count: counts.get(key) ?? 0 });
      if (key === end) break;
      m++;
      if (m > 12) { m = 1; y++; }
    }
  }

  // ── series por ejercicio + trabajo por capacidad ──
  interface Raw { date: string; s: number[]; reps: number[]; kg: number[]; text: string; name: string }
  const byKey = new Map<string, Raw[]>();
  const capOf = new Map<string, CapacityId | null>();
  const nameOf = new Map<string, string | undefined>();
  const capSessions = new Map<CapacityId, Set<string>>();
  const recentFrom = last ? isoDate(new Date(new Date(`${last}T12:00:00`).getTime() - 27 * 86400000)) : '';
  const recent = new Map<CapacityId, number>();
  const practiced = new Map<string, { dates: Set<string>; names: Map<string, number> }>();

  sorted.forEach((s, si) => {
    const seen = new Map<string, Raw>();
    for (const it of ownItems(s.routine, who)) {
      const display = exerciseName(itemText(it));
      if (!display) continue;
      const key = exerciseKey(display);
      if (!key) continue;
      if (!capOf.has(key)) {
        const meta = info(key, it.name);
        capOf.set(key, meta.capacity);
        nameOf.set(key, meta.name);
      }
      const pr = practiced.get(key) ?? { dates: new Set<string>(), names: new Map<string, number>() };
      pr.dates.add(s.date);
      pr.names.set(it.name, (pr.names.get(it.name) ?? 0) + 1);
      practiced.set(key, pr);
      const cap = capOf.get(key) ?? null;
      if (cap) {
        capSessions.set(cap, (capSessions.get(cap) ?? new Set()).add(`${si}`));
        if (s.date >= recentFrom) recent.set(cap, (recent.get(cap) ?? 0) + 1);
      }
      const d = doseOf(itemText(it));
      if (!d.seconds.length && !d.reps.length && !d.kg.length) continue;
      const prev = seen.get(key);
      if (prev) {
        // Mismo ejercicio dos veces en la sesión: se juntan las cantidades.
        prev.s.push(...d.seconds); prev.reps.push(...d.reps); prev.kg.push(...d.kg);
        prev.text += ` · ${itemText(it)}`;
        continue;
      }
      const raw: Raw = { date: s.date, s: d.seconds, reps: d.reps, kg: d.kg, text: itemText(it), name: it.name };
      seen.set(key, raw);
      byKey.set(key, [...(byKey.get(key) ?? []), raw]);
    }
  });

  const exercises: ExerciseSeries[] = [];
  for (const [key, rows] of byKey) {
    if (rows.length < 3) continue;
    const units: Array<[Unit, (r: Raw) => number[]]> = [['kg', (r) => r.kg], ['s', (r) => r.s], ['reps', (r) => r.reps]];
    let pick: { unit: Unit; pts: ProgressPoint[]; spread: number } | null = null;
    for (const [unit, get] of units) {
      const pts = rows
        .filter((r) => get(r).length)
        .map((r) => ({ date: r.date, value: Math.max(...get(r)), text: r.text }));
      if (pts.length < 3 || pts.length < rows.length * 0.6) continue;
      const vals = pts.map((p) => p.value);
      const max = Math.max(...vals);
      const spread = max > 0 ? (max - Math.min(...vals)) / max : 0;
      if (!pick || spread > pick.spread) pick = { unit, pts, spread };
    }
    if (!pick) continue;
    // Nombre visible: el que eligió el coach, o la forma más frecuente con la que lo escribió.
    const freq = new Map<string, number>();
    for (const r of rows) freq.set(r.name, (freq.get(r.name) ?? 0) + 1);
    const top = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    const name = nameOf.get(key) ?? top.charAt(0).toUpperCase() + top.slice(1);
    const vals = pick.pts.map((p) => p.value);
    exercises.push({
      key, name, capacity: capOf.get(key) ?? null, unit: pick.unit, points: pick.pts,
      first: vals[0]!, last: vals[vals.length - 1]!, best: Math.max(...vals),
    });
  }
  exercises.sort((a, b) => b.points.length - a.points.length || a.name.localeCompare(b.name));

  const gain = (e: { first: number; last: number }) => (e.last - e.first) / e.first;
  const toHighlight = (e: ExerciseSeries): Highlight => ({
    key: e.key, name: e.name, capacity: e.capacity, unit: e.unit, from: e.first, to: e.last,
    first_date: e.points[0]!.date, last_date: e.points[e.points.length - 1]!.date,
  });
  const improved = exercises.filter((e) => e.last > e.first && e.first > 0).sort((a, b) => gain(b) - gain(a));
  const highlights = improved.slice(0, 6).map(toHighlight);

  const recentTotal = [...recent.values()].reduce((a, b) => a + b, 0);
  const capacities: CapacitySummary[] = CAPACITIES.filter((c) => capSessions.has(c.id)).map((c) => {
    const mine = exercises.filter((e) => e.capacity === c.id);
    const best = improved.find((e) => e.capacity === c.id);
    return {
      id: c.id,
      label: c.label,
      sessions: capSessions.get(c.id)?.size ?? 0,
      tracked: mine.length,
      improved: mine.filter((e) => e.last > e.first && e.first > 0).length,
      top: best ? toHighlight(best) : null,
      recent_share: recentTotal ? Math.round(((recent.get(c.id) ?? 0) / recentTotal) * 1000) / 1000 : 0,
    };
  });

  // Práctica sostenida: 6+ sesiones a lo largo de 8+ semanas y vigente en las últimas 8.
  const day = 86400000;
  const recentPractice = last ? isoDate(new Date(new Date(`${last}T12:00:00`).getTime() - 55 * day)) : '';
  const practice: Practice[] = [...practiced.entries()].flatMap(([key, p]) => {
    const dates = [...p.dates].sort();
    const firstD = dates[0]!;
    const lastD = dates[dates.length - 1]!;
    const weeks = Math.round((Date.parse(`${lastD}T12:00:00Z`) - Date.parse(`${firstD}T12:00:00Z`)) / (7 * day)) + 1;
    const recentN = dates.filter((d) => d >= recentPractice).length;
    if (dates.length < 6 || weeks < 8 || recentN < 2) return [];
    const top = [...p.names.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    return [{
      key, name: nameOf.get(key) ?? top.charAt(0).toUpperCase() + top.slice(1), capacity: capOf.get(key) ?? null,
      sessions: dates.length, weeks, first_date: firstD, last_date: lastD, recent: recentN,
    }];
  }).sort((a, b) => b.recent - a.recent || b.weeks - a.weeks).slice(0, 8);

  return {
    practice,
    stats: {
      sessions: sorted.length,
      first_date: first,
      last_date: last,
      weeks_active: weeks.size,
      process_week: processWeek,
      per_week: perWeek,
      this_month: sorted.filter((s) => s.date.startsWith(monthKey)).length,
      streak_weeks: streak,
    },
    months,
    exercises,
    highlights,
    capacities,
  };
}
