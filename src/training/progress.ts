/**
 * Progreso de un alumno a partir de sus sesiones. Sólo usa las cantidades que el
 * coach escribió: no estima, no extrapola. Un ejercicio entra en el progreso
 * cuando aparece con dosis comparable en al menos 3 sesiones.
 */
import { doseOf, firstName, fold, ParsedItem, ParsedSessionBody } from './parser';

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
  per_week: number | null;
  this_month: number;
  streak_weeks: number;
}

export interface Progress {
  stats: ProgressStats;
  months: Array<{ month: string; count: number }>;
  exercises: ExerciseSeries[];
  highlights: Array<{ key: string; name: string; unit: Unit; from: number; to: number; first_date: string; last_date: string }>;
}

export interface SessionForProgress {
  date: string;
  parsed: ParsedSessionBody;
}

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

/** Ítems "propios" del alumno: sin variantes de otros y sin la base que su variante reemplaza. */
function ownItems(parsed: ParsedSessionBody, who: string): ParsedItem[] {
  const groups: ParsedItem[][] = [
    ...parsed.circuits.flatMap((c) => c.stations),
    ...(parsed.strength?.lines.map((l) => l.items) ?? []),
  ];
  const me = fold(who);
  const out: ParsedItem[] = [];
  for (const g of groups) {
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

export function buildProgress(studentName: string, sessions: SessionForProgress[], today = new Date()): Progress {
  const sorted = [...sessions].filter((s) => s.date).sort((a, b) => a.date.localeCompare(b.date));
  const who = firstName(studentName);

  // ── estadísticas ──
  const weeks = new Set(sorted.map((s) => isoWeek(s.date)));
  const first = sorted[0]?.date ?? null;
  const last = sorted[sorted.length - 1]?.date ?? null;
  let perWeek: number | null = null;
  if (first && last) {
    const span = Math.max(1, Math.round((weekStart(last) - weekStart(first)) / (7 * 86400000)) + 1);
    perWeek = Math.round((sorted.length / span) * 10) / 10;
  }
  const monthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
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

  // ── series por ejercicio ──
  interface Raw { date: string; s: number[]; reps: number[]; kg: number[]; text: string; name: string }
  const byKey = new Map<string, Raw[]>();
  for (const s of sorted) {
    const seen = new Map<string, Raw>();
    for (const it of ownItems(s.parsed, who)) {
      if (!it.name) continue;
      const key = exerciseKey(it.name);
      if (!key) continue;
      const d = doseOf(it.text);
      if (!d.seconds.length && !d.reps.length && !d.kg.length) continue;
      const prev = seen.get(key);
      if (prev) {
        // Mismo ejercicio dos veces en la sesión: se juntan las cantidades.
        prev.s.push(...d.seconds); prev.reps.push(...d.reps); prev.kg.push(...d.kg);
        prev.text += ` · ${it.text}`;
        continue;
      }
      const raw: Raw = { date: s.date, s: d.seconds, reps: d.reps, kg: d.kg, text: it.text, name: it.name };
      seen.set(key, raw);
      byKey.set(key, [...(byKey.get(key) ?? []), raw]);
    }
  }

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
    // Nombre visible: la forma más frecuente con la que lo escribió el coach.
    const freq = new Map<string, number>();
    for (const r of rows) freq.set(r.name, (freq.get(r.name) ?? 0) + 1);
    const top = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    const name = top.charAt(0).toUpperCase() + top.slice(1);
    const vals = pick.pts.map((p) => p.value);
    exercises.push({
      key, name, unit: pick.unit, points: pick.pts,
      first: vals[0]!, last: vals[vals.length - 1]!, best: Math.max(...vals),
    });
  }
  exercises.sort((a, b) => b.points.length - a.points.length || a.name.localeCompare(b.name));

  const highlights = exercises
    .filter((e) => e.last > e.first && e.first > 0)
    .sort((a, b) => (b.last - b.first) / b.first - (a.last - a.first) / a.first)
    .slice(0, 6)
    .map((e) => ({
      key: e.key, name: e.name, unit: e.unit, from: e.first, to: e.last,
      first_date: e.points[0]!.date, last_date: e.points[e.points.length - 1]!.date,
    }));

  return {
    stats: {
      sessions: sorted.length,
      first_date: first,
      last_date: last,
      weeks_active: weeks.size,
      per_week: perWeek,
      this_month: sorted.filter((s) => s.date.startsWith(monthKey)).length,
      streak_weeks: streak,
    },
    months,
    exercises,
    highlights,
  };
}
