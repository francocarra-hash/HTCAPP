/**
 * Lo realizado, separado de lo indicado. Cada ejercicio de una sesión puede tener
 * un registro con lo que el alumno hizo serie por serie (repeticiones, carga,
 * tiempo, distancia, esfuerzo, dolor…). Los datos que faltan quedan en null:
 * nunca se completan con cero ni con lo que decía la rutina.
 *
 * Las comparaciones en el tiempo sólo se hacen entre registros comparables
 * (mismo ejercicio, misma variante, mismo equipamiento, con o sin carga externa,
 * mismo lado y misma unidad). Si falta saber alguna condición, la comparación se
 * marca como limitada. No se interpreta un cambio de rendimiento como cambio de
 * fuerza, de capacidad del tejido ni de estado clínico.
 */
import { z } from 'zod';
import { CapacityId } from './capacities';
import { doseOf, fold } from './parser';
import { itemText, RoutineItem } from './routine';

export const TRACKINGS = ['dinamica', 'isometrica', 'movilidad', 'pliometria', 'aerobica', 'control_motor'] as const;
export type Tracking = (typeof TRACKINGS)[number];
export const LOAD_CONFIGS = [
  'barra', 'mancuerna', 'dos_mancuernas', 'kettlebell', 'maquina', 'polea', 'banda', 'lastre', 'peso_corporal', 'asistida', 'otro',
] as const;
export type LoadConfig = (typeof LOAD_CONFIGS)[number];

export const TRACKING_LABEL: Record<Tracking, string> = {
  dinamica: 'Fuerza dinámica', isometrica: 'Fuerza isométrica', movilidad: 'Movilidad', pliometria: 'Pliometría / reactividad',
  aerobica: 'Aeróbico', control_motor: 'Control motor',
};
export const CONFIG_LABEL: Record<LoadConfig, string> = {
  barra: 'barra', mancuerna: 'una mancuerna', dos_mancuernas: 'dos mancuernas', kettlebell: 'kettlebell', maquina: 'máquina',
  polea: 'polea', banda: 'banda', lastre: 'lastre', peso_corporal: 'peso corporal', asistida: 'con asistencia', otro: 'otro equipamiento',
};

const nul = (min: number, max: number) => z.number().min(min).max(max).nullable().default(null);
const int = (min: number, max: number) => z.number().int().min(min).max(max).nullable().default(null);

export const SetSchema = z.object({
  n: z.number().int().min(1).max(50),
  /** Lado en ejercicios unilaterales (null = ambos / no aplica). */
  side: z.enum(['L', 'R']).nullable().default(null),
  reps: int(0, 1000),
  load: nul(0, 1000),
  unit: z.enum(['kg', 'lb']).default('kg'),
  secs: nul(0, 36_000),
  dist_m: nul(0, 100_000),
  height_cm: nul(0, 300),
  velocity: nul(0, 20),
  power: nul(0, 5000),
  hr: int(30, 240),
  rpe: nul(0, 10),
  rir: nul(0, 10),
  rest_s: nul(0, 3600),
  rom: z.string().trim().max(40).nullable().default(null),
  tempo: z.string().trim().max(20).nullable().default(null),
  pain: int(0, 10),
  done: z.enum(['completa', 'parcial', 'no']).default('completa'),
  note: z.string().trim().max(200).nullable().default(null),
});
export type ExecSet = z.infer<typeof SetSchema>;

export const ExecutionInput = z.object({
  item_id: z.string().min(1).max(80),
  tracking: z.enum(TRACKINGS),
  variant: z.string().trim().max(80).nullable().default(null),
  load_config: z.enum(LOAD_CONFIGS).nullable().default(null),
  assistance: z.string().trim().max(80).nullable().default(null),
  body_mass_kg: nul(20, 300),
  sets: z.array(SetSchema).max(50).default([]),
  notes: z.string().trim().max(500).nullable().default(null),
});
export type ExecutionDraft = z.infer<typeof ExecutionInput>;

export const ResponseInput = z.object({
  /** Esfuerzo de toda la sesión, escala CR-10 (0 reposo · 10 máximo). */
  srpe: int(0, 10),
  duration_min: int(1, 600),
  status: z.enum(['completa', 'parcial', 'modificada']).nullable().default(null),
  fatigue: int(0, 10),
  soreness: int(0, 10),
  pain: int(0, 10),
  pain_area: z.string().trim().max(120).nullable().default(null),
  recovery: int(0, 10),
  note: z.string().trim().max(500).nullable().default(null),
});
export type ResponseDraft = z.infer<typeof ResponseInput>;

export const RecordInput = z.object({
  executions: z.array(ExecutionInput).max(80).default([]),
  response: ResponseInput.nullable().optional(),
  /** Motivo de la corrección, si se está cambiando algo ya registrado. */
  reason: z.string().trim().max(300).nullable().optional(),
});

/** Foto de lo indicado al momento de registrar (no cambia si después se edita la rutina). */
export interface Prescribed {
  text: string;
  name: string;
  dose: string;
  block: string;
  rounds: number | null;
  /** Series indicadas (dosis × vueltas), si se pueden leer de la dosis. */
  sets: number | null;
}

export type Source = 'coach' | 'client';
export type DataQuality = 'completo' | 'incompleto';

export interface Execution {
  id: string;
  session_id: string;
  student_id: string;
  item_id: string;
  day: string;
  exercise_key: string;
  exercise_name: string;
  variant: string | null;
  tracking: Tracking;
  load_config: LoadConfig | null;
  assistance: string | null;
  body_mass_kg: number | null;
  prescribed: Prescribed;
  sets: ExecSet[];
  notes: string | null;
  source: Source;
  data_quality: DataQuality;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface SessionResponse extends ResponseDraft {
  session_id: string;
  student_id: string;
  source: Source;
  version: number;
  created_at: string;
  updated_at: string;
}

// ── por registro ────────────────────────────────────────────────────────────

/** Tipo de registro sugerido por la capacidad y la dosis (el coach lo puede cambiar). */
export function inferTracking(capacity: CapacityId | null, dose: string): Tracking {
  if (capacity === 'resistencia') return 'aerobica';
  if (capacity === 'reactividad') return 'pliometria';
  if (capacity === 'movilidad') return 'movilidad';
  if (capacity === 'control_motor') return 'control_motor';
  const d = doseOf(dose);
  return d.seconds.length && !d.reps.length ? 'isometrica' : 'dinamica';
}

/** Series de una dosis ("3x10" → 3, "10r x3" → 3); null si no se puede leer. */
export function setsInDose(text: string): number | null {
  const t = text.replace(/\(.*?\)/g, ' ');
  const lead = /(?:^|\s)(\d{1,2})\s*[x×]\s*\d/.exec(t);
  if (lead) return Number(lead[1]);
  const trail = /\d\s*\w*\s*[x×]\s*(\d{1,2})\b/.exec(t);
  return trail ? Number(trail[1]) : null;
}

export function prescribedOf(it: RoutineItem, block: { title: string; rounds: number | null }): Prescribed {
  // Series escritas en la dosis ("4x6") mandan; si no, una por vuelta del bloque.
  const explicit = setsInDose(it.dose || itemText(it));
  return {
    text: itemText(it), name: it.name, dose: it.dose, block: block.title, rounds: block.rounds,
    sets: explicit ?? (it.dose || block.rounds ? block.rounds ?? 1 : null),
  };
}

const counted = (sets: ExecSet[]): ExecSet[] => sets.filter((s) => s.done !== 'no');
const BODYWEIGHT: Array<LoadConfig | null> = ['peso_corporal', 'asistida', 'banda'];

/** Completo = cada serie hecha tiene la medida principal de su tipo de registro. */
export function dataQuality(tracking: Tracking, loadConfig: LoadConfig | null, sets: ExecSet[]): DataQuality {
  const done = counted(sets);
  if (!done.length) return 'incompleto';
  const ok = (s: ExecSet): boolean => {
    switch (tracking) {
      case 'dinamica': return s.reps != null && (s.load != null || BODYWEIGHT.includes(loadConfig));
      case 'isometrica': return s.secs != null;
      case 'movilidad': return s.reps != null || s.secs != null || Boolean(s.rom);
      case 'pliometria': return s.reps != null || s.height_cm != null || s.dist_m != null;
      case 'aerobica': return s.secs != null || s.dist_m != null;
      case 'control_motor': return true;
      default: return false;
    }
  };
  return done.every(ok) ? 'completo' : 'incompleto';
}

export interface VolumeLoad {
  /** Σ carga × repeticiones de las series hechas. null = no se puede calcular. */
  value: number | null;
  unit: 'kg' | 'lb' | null;
  /** Unilateral: por lado, nunca sumado entre lados. */
  per_side: { L: number | null; R: number | null } | null;
  reason: string | null;
}

/** Volumen de carga calculado con lo realizado, no con lo indicado. Faltan datos → null, no cero. */
export function volumeLoad(sets: ExecSet[]): VolumeLoad {
  const done = counted(sets);
  if (!done.length) return { value: null, unit: null, per_side: null, reason: 'Sin series registradas.' };
  if (done.every((s) => s.load == null)) return { value: null, unit: null, per_side: null, reason: 'Sin carga externa registrada.' };
  const units = new Set(done.filter((s) => s.load != null).map((s) => s.unit));
  if (units.size > 1) return { value: null, unit: null, per_side: null, reason: 'Unidades de carga mezcladas.' };
  const unit = [...units][0] as 'kg' | 'lb';
  const sum = (list: ExecSet[]): number | null =>
    list.some((s) => s.load == null || s.reps == null) ? null : Math.round(list.reduce((a, s) => a + s.load! * s.reps!, 0) * 10) / 10;
  const sided = done.some((s) => s.side);
  if (sided) {
    const L = done.filter((s) => s.side === 'L');
    const R = done.filter((s) => s.side === 'R');
    const per = { L: L.length ? sum(L) : null, R: R.length ? sum(R) : null };
    const missing = (L.length && per.L == null) || (R.length && per.R == null);
    return { value: null, unit, per_side: per, reason: missing ? 'Hay series sin carga o sin repeticiones.' : null };
  }
  const v = sum(done);
  return { value: v, unit, per_side: null, reason: v == null ? 'Hay series sin carga o sin repeticiones.' : null };
}

// ── comparaciones en el tiempo ──────────────────────────────────────────────

export type MetricId = 'load' | 'reps_set' | 'reps_total' | 'volume' | 'hold' | 'secs_total' | 'contacts' | 'height' | 'distance'
  | 'duration' | 'pace' | 'hr';
interface MetricDef { label: string; unit: string; /** null = que suba no es "mejor" por sí solo. */ higherIsMore: boolean | null }
export const METRICS: Record<MetricId, MetricDef> = {
  load: { label: 'Carga externa máxima', unit: 'kg', higherIsMore: true },
  reps_set: { label: 'Repeticiones en la mejor serie', unit: 'reps', higherIsMore: true },
  reps_total: { label: 'Repeticiones totales', unit: 'reps', higherIsMore: true },
  volume: { label: 'Volumen de carga', unit: 'kg·rep', higherIsMore: null },
  hold: { label: 'Duración del sostén', unit: 's', higherIsMore: true },
  secs_total: { label: 'Tiempo total', unit: 's', higherIsMore: null },
  contacts: { label: 'Contactos', unit: 'contactos', higherIsMore: null },
  height: { label: 'Altura máxima', unit: 'cm', higherIsMore: true },
  distance: { label: 'Distancia', unit: 'm', higherIsMore: true },
  duration: { label: 'Duración', unit: 's', higherIsMore: null },
  pace: { label: 'Ritmo', unit: 's/km', higherIsMore: null },
  hr: { label: 'Frecuencia cardíaca media', unit: 'lpm', higherIsMore: null },
};

const METRICS_BY_TRACKING: Record<Tracking, MetricId[]> = {
  dinamica: ['load', 'reps_set', 'reps_total', 'volume'],
  isometrica: ['hold', 'load', 'secs_total'],
  movilidad: ['reps_set', 'hold'],
  pliometria: ['contacts', 'height', 'distance'],
  aerobica: ['duration', 'distance', 'pace', 'hr'],
  control_motor: [],
};

const max = (xs: Array<number | null>): number | null => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? Math.max(...v) : null;
};
const total = (xs: Array<number | null>): number | null =>
  xs.some((x) => x == null) || !xs.length ? null : Math.round(xs.reduce((a: number, x) => a + x!, 0) * 10) / 10;

function metricValue(id: MetricId, sets: ExecSet[]): number | null {
  const s = counted(sets);
  if (!s.length) return null;
  switch (id) {
    case 'load': return max(s.map((x) => x.load));
    case 'reps_set': return max(s.map((x) => x.reps));
    case 'reps_total': return total(s.map((x) => x.reps));
    case 'volume': return volumeLoad(s).value;
    case 'hold': return max(s.map((x) => x.secs));
    case 'secs_total': return total(s.map((x) => x.secs));
    case 'contacts': return total(s.map((x) => x.reps));
    case 'height': return max(s.map((x) => x.height_cm));
    case 'distance': return total(s.map((x) => x.dist_m));
    case 'duration': return total(s.map((x) => x.secs));
    case 'pace': {
      const d = total(s.map((x) => x.dist_m));
      const t = total(s.map((x) => x.secs));
      return d && t ? Math.round(t / (d / 1000)) : null;
    }
    case 'hr': {
      const v = s.map((x) => x.hr).filter((x): x is number => x != null);
      return v.length === s.length ? Math.round(v.reduce((a, x) => a + x, 0) / v.length) : null;
    }
    default: return null;
  }
}

export interface GroupRecord {
  execution_id: string;
  session_id: string;
  day: string;
  source: Source;
  data_quality: DataQuality;
  values: Partial<Record<MetricId, number | null>>;
  /** Esfuerzo de la serie más pesada / más larga (para interpretar, no para medir progreso). */
  rpe: number | null;
  rir: number | null;
  pain: number | null;
  rom: string | null;
  sets: number;
  summary: string;
}

export interface MetricChange {
  id: MetricId;
  label: string;
  unit: string;
  baseline: { value: number; day: string } | null;
  current: { value: number; day: string } | null;
  abs: number | null;
  /** Sólo con línea de base válida y distinta de cero. */
  pct: number | null;
}

export interface CompareGroup {
  key: string;
  label: string;
  tracking: Tracking;
  conditions: string[];
  records: GroupRecord[];
  changes: MetricChange[];
  limited: boolean;
  reasons: string[];
  interpretation: string[];
}

export interface ExerciseComparison {
  key: string;
  name: string;
  tracking: Tracking;
  groups: CompareGroup[];
  /** Cambios de variante, equipamiento o carga: no se comparan directo. */
  transitions: Array<{ day: string; from: string; to: string }>;
}

const sideLabel = (s: string): string => (s === 'L' ? 'lado izquierdo' : s === 'R' ? 'lado derecho' : '');

function groupLabel(tracking: Tracking, variant: string | null, cfg: LoadConfig | null, ext: boolean, side: string, unit: string): string {
  const parts = [
    variant || null,
    cfg ? CONFIG_LABEL[cfg] : null,
    tracking === 'dinamica' || tracking === 'isometrica' ? (ext ? `con carga externa (${unit})` : 'sin carga externa') : null,
    sideLabel(side) || null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Registro';
}

const effortOf = (sets: ExecSet[]): { rpe: number | null; rir: number | null } => {
  const s = counted(sets);
  const top = [...s].sort((a, b) => (b.load ?? 0) - (a.load ?? 0) || (b.secs ?? 0) - (a.secs ?? 0) || (b.reps ?? 0) - (a.reps ?? 0))[0];
  return { rpe: top?.rpe ?? null, rir: top?.rir ?? null };
};

const fmt = (v: number, unit: string): string => `${Math.round(v * 10) / 10} ${unit}`;

function summarize(sets: ExecSet[]): string {
  return counted(sets).map((s) => {
    const bits = [
      s.reps != null ? `${s.reps}` : null,
      s.secs != null ? `${s.secs}s` : null,
      s.load != null ? `${s.load}${s.unit}` : null,
      s.dist_m != null ? `${s.dist_m}m` : null,
      s.height_cm != null ? `${s.height_cm}cm` : null,
    ].filter(Boolean).join(' × ');
    return `${bits || '—'}${s.done === 'parcial' ? ' (parcial)' : ''}`;
  }).join(' · ');
}

/** Agrupa los registros de un ejercicio por condiciones comparables y calcula los cambios. */
export function compareExercise(execs: Execution[]): ExerciseComparison | null {
  if (!execs.length) return null;
  const sorted = [...execs].sort((a, b) => a.day.localeCompare(b.day) || a.created_at.localeCompare(b.created_at));
  const last = sorted[sorted.length - 1]!;
  const groups = new Map<string, { label: string; tracking: Tracking; rows: Array<{ e: Execution; sets: ExecSet[] }> }>();
  const signatureOf: Array<{ day: string; label: string; base: string }> = [];

  for (const e of sorted) {
    const done = counted(e.sets);
    const sides = [...new Set(done.map((s) => s.side ?? '-'))];
    const ext = done.some((s) => s.load != null);
    const unit = done.find((s) => s.load != null)?.unit ?? 'kg';
    const base = [e.tracking, fold(e.variant ?? ''), e.load_config ?? '?', ext ? `ext:${unit}` : 'noext'].join('|');
    signatureOf.push({ day: e.day, base, label: groupLabel(e.tracking, e.variant, e.load_config, ext, '-', unit) });
    for (const side of sides.length ? sides : ['-']) {
      const key = `${base}|${side}`;
      const g = groups.get(key) ?? { label: groupLabel(e.tracking, e.variant, e.load_config, ext, side, unit), tracking: e.tracking, rows: [] };
      g.rows.push({ e, sets: done.filter((s) => (s.side ?? '-') === side) });
      groups.set(key, g);
    }
  }

  // Transiciones: cambió la variante, el equipamiento o pasó de sin carga a con carga.
  const transitions: ExerciseComparison['transitions'] = [];
  for (let i = 1; i < signatureOf.length; i++) {
    const a = signatureOf[i - 1]!;
    const b = signatureOf[i]!;
    if (a.base !== b.base) transitions.push({ day: b.day, from: a.label, to: b.label });
  }

  const out: CompareGroup[] = [];
  for (const [key, g] of groups) {
    const ids = METRICS_BY_TRACKING[g.tracking];
    const records: GroupRecord[] = g.rows.map(({ e, sets }) => {
      const values: GroupRecord['values'] = {};
      for (const id of ids) values[id] = metricValue(id, sets);
      const eff = effortOf(sets);
      const pains = sets.map((s) => s.pain).filter((x): x is number => x != null);
      const roms = [...new Set(sets.map((s) => s.rom).filter((x): x is string => Boolean(x)))];
      return {
        execution_id: e.id, session_id: e.session_id, day: e.day, source: e.source, data_quality: e.data_quality, values,
        rpe: eff.rpe, rir: eff.rir, pain: pains.length ? Math.max(...pains) : null, rom: roms.join(', ') || null,
        sets: sets.length, summary: summarize(sets),
      };
    });
    const first = records[0]!;
    const cur = records[records.length - 1]!;
    const changes: MetricChange[] = ids.map((id) => {
      const firstWith = records.find((r) => r.values[id] != null);
      const lastWith = [...records].reverse().find((r) => r.values[id] != null);
      const baseline = firstWith ? { value: firstWith.values[id]!, day: firstWith.day } : null;
      const current = lastWith && lastWith !== firstWith ? { value: lastWith.values[id]!, day: lastWith.day } : null;
      const abs = baseline && current ? Math.round((current.value - baseline.value) * 10) / 10 : null;
      const pct = baseline && current && baseline.value > 0 ? Math.round(((current.value - baseline.value) / baseline.value) * 1000) / 10 : null;
      const def = METRICS[id];
      const unit = id === 'load' || id === 'volume'
        ? g.rows.flatMap((r) => r.sets).find((s) => s.load != null)?.unit === 'lb' ? (id === 'load' ? 'lb' : 'lb·rep') : def.unit
        : def.unit;
      return { id, label: def.label, unit, baseline, current, abs, pct };
    }).filter((c) => c.baseline);

    const reasons: string[] = [];
    const conditions: string[] = ['Mismo ejercicio', `Tipo de registro: ${TRACKING_LABEL[g.tracking].toLowerCase()}`];
    const cfgs = new Set(g.rows.map((r) => r.e.load_config));
    if (cfgs.has(null)) reasons.push('No se registró el equipamiento en todos los registros.');
    else conditions.push(`Mismo equipamiento: ${CONFIG_LABEL[[...cfgs][0]!]}`);
    if (g.rows[0]!.e.variant) conditions.push(`Misma variante: ${g.rows[0]!.e.variant}`);
    if (key.endsWith('|L') || key.endsWith('|R')) conditions.push(`Mismo lado: ${sideLabel(key.slice(-1))}`);
    if (records.length > 1) {
      if (first.data_quality === 'incompleto' || cur.data_quality === 'incompleto') reasons.push('La primera o la última vez tienen datos incompletos.');
      if (first.rom && cur.rom && fold(first.rom) !== fold(cur.rom)) reasons.push(`Cambió el rango de movimiento (${first.rom} → ${cur.rom}).`);
      else if (first.rom && cur.rom) conditions.push(`Mismo rango de movimiento: ${cur.rom}`);
      else if (g.tracking === 'dinamica' || g.tracking === 'isometrica' || g.tracking === 'movilidad') conditions.push('Rango de movimiento: no registrado');
      const partial = g.rows.some((r) => r.sets.some((s) => s.done === 'parcial'));
      if (partial) reasons.push('Hay series hechas en forma parcial.');
    }

    const interpretation: string[] = [];
    if (records.length < 2) {
      interpretation.push('Un solo registro en estas condiciones: todavía no hay con qué comparar.');
    } else if (g.tracking === 'control_motor') {
      interpretation.push('Seguimiento cualitativo: se comparan la tarea, la complejidad y la asistencia, no un número.');
    } else {
      const moved = changes.filter((c) => c.abs != null && c.abs !== 0);
      for (const c of moved) {
        // Si sólo hay una serie por registro, la mejor serie y el total dicen lo mismo.
        if (c.id === 'reps_total' && moved.some((x) => x.id === 'reps_set' && x.abs === c.abs)) continue;
        interpretation.push(`${c.label}: de ${fmt(c.baseline!.value, c.unit)} a ${fmt(c.current!.value, c.unit)}${c.pct != null ? ` (${c.pct > 0 ? '+' : ''}${c.pct}%)` : ''}.`);
      }
      if (!moved.length) interpretation.push('Mismo rendimiento en los números registrados.');
      const effA = first.rir != null && cur.rir != null ? `RIR ${first.rir} → ${cur.rir}` : first.rpe != null && cur.rpe != null ? `RPE ${first.rpe} → ${cur.rpe}` : null;
      const effChanged = (first.rir != null && cur.rir != null && first.rir !== cur.rir) || (first.rpe != null && cur.rpe != null && first.rpe !== cur.rpe);
      if (effA && effChanged) {
        interpretation.push(`El esfuerzo informado cambió (${effA}). Un cambio de esfuerzo por sí solo no indica que mejoró o empeoró el rendimiento.`);
      }
      if (first.pain != null && cur.pain != null) interpretation.push(`Dolor informado: ${first.pain} → ${cur.pain} (escala 0–10).`);
      if (g.tracking === 'isometrica' && moved.some((c) => c.id === 'hold')) interpretation.push('Más tiempo de sostén no equivale a un porcentaje igual de fuerza.');
      if (moved.some((c) => c.id === 'volume')) interpretation.push('El volumen de carga describe el trabajo hecho; no mide el estímulo fisiológico.');
    }
    out.push({
      key, label: g.label, tracking: g.tracking, conditions, records, changes,
      limited: reasons.length > 0, reasons, interpretation,
    });
  }
  out.sort((a, b) => b.records[b.records.length - 1]!.day.localeCompare(a.records[a.records.length - 1]!.day) || b.records.length - a.records.length);
  return { key: last.exercise_key, name: last.exercise_name, tracking: last.tracking, groups: out, transitions };
}
