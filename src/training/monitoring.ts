/**
 * Monitoreo de carga y respuesta de un alumno. Mantiene separadas las cinco
 * dimensiones: lo indicado (la rutina), lo realizado (registros por serie), la
 * respuesta interna (sRPE, fatiga, dolor…), los cambios de rendimiento en
 * condiciones comparables y la adherencia.
 *
 * No hay umbrales ni alertas numéricas: "Para revisar" sólo describe patrones
 * (bajó en registros seguidos, más esfuerzo con la misma carga, síntomas
 * informados, datos que faltan) con los registros que los respaldan. Las
 * decisiones son del profe. No se calcula ACWR ni riesgo de lesión.
 */
import { CAPACITIES, CapacityId } from './capacities';
import { compareExercise, ExecSet, ExerciseComparison, Execution, SessionResponse } from './execution';
import { planExecutions } from './derive';
import { firstName } from './parser';
import { ExerciseInfo, itemKey, ownItems } from './progress';
import { Routine, RoutineItem } from './routine';

export interface MonitoringSession {
  id: string;
  date: string;
  status: 'planned' | 'done';
  routine: Routine;
  /** Lo que hizo el alumno con la sesión asignada (checks y cierre). */
  checks: string[] | null;
  completed_at: string | null;
}

export interface ChangeEntry {
  id: string;
  entity: 'execution' | 'response' | 'session' | 'charge' | 'payment';
  entity_id: string;
  student_id: string | null;
  session_id: string | null;
  action: 'create' | 'update' | 'delete';
  actor: string;
  category: 'progresar' | 'mantener' | 'reducir' | 'cambiar_ejercicios' | 'adaptar' | null;
  reason: string | null;
  before: unknown;
  after: unknown;
  at: string;
}

/** Trabajo hecho, sumado: series, repeticiones, tiempo de sostén, tiempo aeróbico y kilos movidos. */
export interface WorkTotals {
  sets: number;
  reps: number;
  /** Segundos de sostén (isométricos, movilidad, control). */
  hold_s: number;
  /** Segundos de trabajo aeróbico. */
  aerobic_s: number;
  /** Σ kilos × repeticiones de las series con carga externa. */
  volume_kg: number;
}

export interface MonitoringInput {
  today: string;
  studentName: string;
  /** Para armar lo realizado a partir de la planificación. */
  studentId?: string;
  sessions: MonitoringSession[];
  executions: Execution[];
  responses: SessionResponse[];
  attendance: Array<{ day: string; mark: 'p' | 'a' | 'e' }>;
  changes: ChangeEntry[];
  info: ExerciseInfo;
}

export interface WindowSummary {
  key: '7d' | '28d' | 'todo';
  from: string;
  to: string;
  /** Sesiones realizadas (hechas por el profe o terminadas por el alumno). */
  realized: number;
  /** Clases con registro: días con marca de asistencia, sesión realizada o rutina asignada vencida. */
  scheduled: number;
  present: number;
  absent: number;
  /** Faltó y se le mandaron los ejercicios. */
  sent: number;
  partial: number;
  modified: number;
  /** Rutinas asignadas con fecha pasada que no terminó. */
  assigned_not_done: number;
  /** Adherencia a lo indicado: ejercicios hechos sobre indicados, sólo en sesiones con registro. */
  prescription: { done: number; total: number; sessions: number };
  per_week: number | null;
  minutes: number | null;
  minutes_sessions: number;
  /** Carga interna: Σ duración (min) × sRPE, en unidades arbitrarias. */
  srpe_load: number | null;
  srpe_sessions: number;
  missing_srpe: number;
  exposure: Array<{ capacity: CapacityId; label: string; entries: number; sets: number }>;
  entries_total: number;
  unclassified: number;
  sets: { prescribed: number; performed: number; records: number };
  work: WorkTotals;
}

export interface WeekRow {
  week_start: string;
  sessions: number;
  days: string[];
  minutes: number | null;
  srpe_load: number | null;
  srpe_sessions: number;
  missing_srpe: number;
  exposure: Partial<Record<CapacityId, number>>;
  sets_prescribed: number;
  sets_performed: number;
  work: WorkTotals;
}

export interface MonthRow {
  month: string;
  sessions: number;
  work: WorkTotals;
  /** Series por capacidad. */
  sets_by_capacity: Partial<Record<CapacityId, number>>;
  srpe_load: number | null;
}

export interface ResponseRow {
  session_id: string;
  day: string;
  srpe: number | null;
  duration_min: number | null;
  load: number | null;
  status: string | null;
  fatigue: number | null;
  soreness: number | null;
  pain: number | null;
  pain_area: string | null;
  recovery: number | null;
  note: string | null;
  source: string;
}

export interface ReviewItem {
  kind: 'descenso' | 'esfuerzo' | 'sintomas' | 'datos' | 'parciales' | 'asistencia';
  title: string;
  detail: string;
  evidence: Array<{ day: string; text: string }>;
}

export interface ChangeRow {
  at: string;
  session_id: string | null;
  session_day: string | null;
  category: ChangeEntry['category'];
  reason: string | null;
  lines: string[];
  /** Datos de monitoreo disponibles al momento del cambio. */
  context: string | null;
}

export interface Monitoring {
  today: string;
  windows: WindowSummary[];
  weeks: WeekRow[];
  months: MonthRow[];
  responses: ResponseRow[];
  exercises: Array<ExerciseComparison & { capacity: CapacityId | null; records: number; last_day: string }>;
  review: ReviewItem[];
  changes: ChangeRow[];
  /** with_records: sesiones con algún registro manual. from_plan: sesiones tomadas de la planificación. */
  coverage: { realized: number; with_srpe: number; with_duration: number; with_records: number; from_plan: number };
}

const NO_WORK: WorkTotals = { sets: 0, reps: 0, hold_s: 0, aerobic_s: 0, volume_kg: 0 };
const addWork = (a: WorkTotals, b: WorkTotals): WorkTotals => ({
  sets: a.sets + b.sets, reps: a.reps + b.reps, hold_s: a.hold_s + b.hold_s, aerobic_s: a.aerobic_s + b.aerobic_s,
  volume_kg: Math.round((a.volume_kg + b.volume_kg) * 10) / 10,
});
const doneSets = (e: Execution): ExecSet[] => e.sets.filter((x) => x.done !== 'no');
/** Una serie unilateral (izquierda y derecha) cuenta una vez, como en lo indicado. */
const setCount = (e: Execution): number => new Set(doneSets(e).map((x) => x.n)).size;
function workOf(e: Execution): WorkTotals {
  const sets = doneSets(e);
  const secs = sets.reduce((a, x) => a + (x.secs ?? 0), 0);
  return {
    sets: setCount(e),
    reps: sets.reduce((a, x) => a + (x.reps ?? 0), 0),
    hold_s: e.tracking === 'aerobica' ? 0 : secs,
    aerobic_s: e.tracking === 'aerobica' ? secs : 0,
    volume_kg: Math.round(sets.reduce((a, x) => a + (x.load != null && x.reps != null ? x.load * (x.unit === 'lb' ? 0.4536 : 1) * x.reps : 0), 0) * 10) / 10,
  };
}

const DAY = 86_400_000;
const addDays = (d: string, n: number): string => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const weekStart = (d: string): string => {
  const t = new Date(`${d}T12:00:00Z`);
  return addDays(d, -((t.getUTCDay() + 6) % 7));
};
const daysBetween = (a: string, b: string): number => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY);
const short = (d: string): string => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`;

export const CATEGORY_LABEL: Record<NonNullable<ChangeEntry['category']>, string> = {
  progresar: 'Progresar la demanda', mantener: 'Mantener el estímulo', reducir: 'Reducir la demanda',
  cambiar_ejercicios: 'Cambiar ejercicios', adaptar: 'Adaptar a síntomas o contexto',
};

export function buildMonitoring(input: MonitoringInput): Monitoring {
  const { today } = input;
  const who = firstName(input.studentName);
  const sessions = [...input.sessions].sort((a, b) => a.date.localeCompare(b.date));
  const respBy = new Map(input.responses.map((r) => [r.session_id, r]));
  // Lo realizado: los registros manuales y, para el resto, lo que dice la planificación de las
  // sesiones hechas (el profe la cargó porque la hizo con el alumno: no se vuelve a confirmar).
  const manual = input.executions.filter((e) => e.origin !== 'plan');
  const executions = [
    ...manual,
    ...planExecutions({ sessions, studentId: input.studentId ?? manual[0]?.student_id ?? '', studentName: input.studentName, info: input.info, stored: manual }),
  ];
  const execBySession = new Map<string, Execution[]>();
  for (const e of executions) execBySession.set(e.session_id, [...(execBySession.get(e.session_id) ?? []), e]);
  // Realizada: la marcó el profe, la terminó el alumno o hay series hechas registradas.
  const performed = (id: string) => (execBySession.get(id) ?? []).some((e) => e.sets.some((x) => x.done !== 'no'));
  const realized = sessions.filter((s) => s.status === 'done' || s.completed_at || performed(s.id));
  const marks = new Map(input.attendance.map((a) => [a.day, a.mark]));
  const capOf = new Map<string, CapacityId | null>();
  const capFor = (it: RoutineItem): CapacityId | null => {
    const key = itemKey(it);
    if (!capOf.has(key)) capOf.set(key, input.info(key, it.name).capacity);
    return capOf.get(key) ?? null;
  };

  // Por sesión realizada: ejercicios propios, capacidad, series indicadas y hechas, cierre.
  const perSession = realized.map((s) => {
    const items = ownItems(s.routine, who);
    const execs = execBySession.get(s.id) ?? [];
    const resp = respBy.get(s.id) ?? null;
    const caps = items.map(capFor);
    const done = new Set<string>([
      ...(s.checks ?? []),
      ...execs.filter((e) => e.sets.some((x) => x.done !== 'no')).map((e) => e.item_id),
    ]);
    const withRecord = Boolean(s.completed_at) || execs.length > 0;
    const capOfItem = new Map(items.map((it, i) => [it.id, caps[i] ?? null]));
    const setsByCap: Partial<Record<CapacityId, number>> = {};
    for (const e of execs) {
      const c = capOfItem.get(e.item_id);
      if (c) setsByCap[c] = (setsByCap[c] ?? 0) + setCount(e);
    }
    // Terminada por el alumno: cuenta toda la rutina. Sólo con registros del profe: cuentan los ejercicios registrados
    // (que no esté registrado no quiere decir que no lo hizo).
    const counted = s.completed_at ? items : items.filter((it) => execs.some((e) => e.item_id === it.id));
    const partialByChecks = Boolean(s.completed_at) && s.checks != null && items.filter((it) => s.checks!.includes(it.id)).length < items.length;
    return {
      s, items, execs, resp, caps,
      itemsDone: counted.filter((it) => done.has(it.id)).length,
      itemsTotal: counted.length,
      withRecord,
      partial: resp?.status === 'parcial' || (resp?.status == null && partialByChecks),
      modified: resp?.status === 'modificada',
      load: resp?.srpe != null && resp?.duration_min != null ? resp.srpe * resp.duration_min : null,
      setsPrescribed: execs.reduce((a, e) => a + (e.prescribed.sets ?? 0), 0),
      setsPerformed: execs.reduce((a, e) => a + setCount(e), 0),
      work: execs.reduce((a, e) => addWork(a, workOf(e)), NO_WORK),
      setsByCap,
      manualRecords: execs.filter((e) => e.origin !== 'plan').length,
      fromPlan: execs.some((e) => e.origin === 'plan'),
    };
  });

  const first = realized[0]?.date ?? today;
  const windowOf = (key: WindowSummary['key']): WindowSummary => {
    const from = key === '7d' ? addDays(today, -6) : key === '28d' ? addDays(today, -27) : first;
    const inW = (d: string) => d >= from && d <= today;
    const ps = perSession.filter((p) => inW(p.s.date));
    const realizedDays = new Set(ps.map((p) => p.s.date));
    const overdue = sessions.filter((s) => s.status === 'planned' && !s.completed_at && !performed(s.id) && inW(s.date) && s.date < today);
    const days = new Set<string>([...realizedDays, ...overdue.map((s) => s.date)]);
    for (const [d] of marks) if (inW(d)) days.add(d);
    let present = 0; let absent = 0; let sent = 0;
    for (const d of days) {
      const m = marks.get(d) ?? (realizedDays.has(d) ? 'p' : null);
      if (m === 'p') present++;
      else if (m === 'a') absent++;
      else if (m === 'e') sent++;
    }
    const withMin = ps.filter((p) => p.resp?.duration_min != null);
    const withLoad = ps.filter((p) => p.load != null);
    const exposure = new Map<CapacityId, number>();
    const capSets = new Map<CapacityId, number>();
    let entries = 0; let unclassified = 0;
    for (const p of ps) {
      for (const c of p.caps) {
        entries++;
        if (c) exposure.set(c, (exposure.get(c) ?? 0) + 1);
        else unclassified++;
      }
      for (const [c, n] of Object.entries(p.setsByCap) as Array<[CapacityId, number]>) capSets.set(c, (capSets.get(c) ?? 0) + n);
    }
    const recorded = ps.filter((p) => p.withRecord);
    return {
      key, from, to: today,
      realized: ps.length,
      scheduled: days.size,
      present, absent, sent,
      partial: ps.filter((p) => p.partial).length,
      modified: ps.filter((p) => p.modified).length,
      assigned_not_done: overdue.length,
      prescription: {
        done: recorded.reduce((a, p) => a + p.itemsDone, 0),
        total: recorded.reduce((a, p) => a + p.itemsTotal, 0),
        sessions: recorded.length,
      },
      per_week: ps.length ? Math.round((ps.length / Math.max(1, (daysBetween(from, today) + 1) / 7)) * 10) / 10 : null,
      minutes: withMin.length ? withMin.reduce((a, p) => a + p.resp!.duration_min!, 0) : null,
      minutes_sessions: withMin.length,
      srpe_load: withLoad.length ? withLoad.reduce((a, p) => a + p.load!, 0) : null,
      srpe_sessions: withLoad.length,
      missing_srpe: ps.length - withLoad.length,
      exposure: CAPACITIES.filter((c) => exposure.has(c.id)).map((c) => ({ capacity: c.id, label: c.label, entries: exposure.get(c.id)!, sets: capSets.get(c.id) ?? 0 })),
      entries_total: entries,
      unclassified,
      sets: {
        prescribed: ps.reduce((a, p) => a + p.setsPrescribed, 0),
        performed: ps.reduce((a, p) => a + p.setsPerformed, 0),
        records: ps.reduce((a, p) => a + p.manualRecords, 0),
      },
      work: ps.reduce((a, p) => addWork(a, p.work), NO_WORK),
    };
  };

  // Semanas (lunes a domingo), desde la primera sesión o las últimas 26.
  const weeks: WeekRow[] = [];
  if (realized.length) {
    let w = weekStart(first > addDays(today, -26 * 7) ? first : addDays(today, -26 * 7));
    const end = weekStart(today);
    for (let guard = 0; w <= end && guard < 60; guard++, w = addDays(w, 7)) {
      const to = addDays(w, 6);
      const ps = perSession.filter((p) => p.s.date >= w && p.s.date <= to);
      const exposure: WeekRow['exposure'] = {};
      for (const p of ps) for (const c of p.caps) if (c) exposure[c] = (exposure[c] ?? 0) + 1;
      const withMin = ps.filter((p) => p.resp?.duration_min != null);
      const withLoad = ps.filter((p) => p.load != null);
      weeks.push({
        week_start: w,
        sessions: ps.length,
        days: [...new Set(ps.map((p) => p.s.date))],
        minutes: withMin.length ? withMin.reduce((a, p) => a + p.resp!.duration_min!, 0) : null,
        srpe_load: withLoad.length ? withLoad.reduce((a, p) => a + p.load!, 0) : null,
        srpe_sessions: withLoad.length,
        missing_srpe: ps.length - withLoad.length,
        exposure,
        sets_prescribed: ps.reduce((a, p) => a + p.setsPrescribed, 0),
        sets_performed: ps.reduce((a, p) => a + p.setsPerformed, 0),
        work: ps.reduce((a, p) => addWork(a, p.work), NO_WORK),
      });
    }
  }

  // Meses calendario (los últimos 12 con sesiones).
  const byMonth = new Map<string, typeof perSession>();
  for (const p of perSession) byMonth.set(p.s.date.slice(0, 7), [...(byMonth.get(p.s.date.slice(0, 7)) ?? []), p]);
  const months: MonthRow[] = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-12).map(([month, ps]) => {
    const sets_by_capacity: MonthRow['sets_by_capacity'] = {};
    for (const p of ps) for (const [c, n] of Object.entries(p.setsByCap) as Array<[CapacityId, number]>) sets_by_capacity[c] = (sets_by_capacity[c] ?? 0) + n;
    const withLoad = ps.filter((p) => p.load != null);
    return {
      month, sessions: ps.length, work: ps.reduce((a, p) => addWork(a, p.work), NO_WORK), sets_by_capacity,
      srpe_load: withLoad.length ? withLoad.reduce((a, p) => a + p.load!, 0) : null,
    };
  });

  const dayOf = new Map(sessions.map((s) => [s.id, s.date]));
  const responses: ResponseRow[] = input.responses
    .filter((r) => dayOf.has(r.session_id))
    .map((r) => ({
      session_id: r.session_id, day: dayOf.get(r.session_id)!, srpe: r.srpe, duration_min: r.duration_min,
      load: r.srpe != null && r.duration_min != null ? r.srpe * r.duration_min : null, status: r.status,
      fatigue: r.fatigue, soreness: r.soreness, pain: r.pain, pain_area: r.pain_area, recovery: r.recovery, note: r.note, source: r.source,
    }))
    .sort((a, b) => a.day.localeCompare(b.day));

  // Progreso por ejercicio con lo realizado.
  const byKey = new Map<string, Execution[]>();
  for (const e of executions) byKey.set(e.exercise_key, [...(byKey.get(e.exercise_key) ?? []), e]);
  const exercises = [...byKey.entries()].flatMap(([key, list]) => {
    const cmp = compareExercise(list);
    if (!cmp) return [];
    const lastDay = list.map((e) => e.day).sort().pop()!;
    return [{ ...cmp, capacity: input.info(key, cmp.name).capacity, records: list.length, last_day: lastDay }];
  });
  // Primero los que hizo en las últimas 4 semanas; dentro de eso, los más repetidos.
  const recentFrom = addDays(today, -27);
  const isRecent = (d: string): number => Number(d >= recentFrom);
  exercises.sort((a, b) => isRecent(b.last_day) - isRecent(a.last_day) || b.records - a.records || b.last_day.localeCompare(a.last_day));

  // ── para revisar (sin umbrales: patrones descriptivos con su respaldo) ──
  const review: ReviewItem[] = [];
  const since = addDays(today, -27);
  for (const ex of exercises) {
    for (const g of ex.groups) {
      const recs = g.records;
      if (recs.length >= 3 && recs[recs.length - 1]!.day >= since) {
        const main = g.changes[0]?.id;
        if (main) {
          const vals = recs.slice(-3).map((r) => r.values[main]);
          if (vals.every((v) => v != null) && vals[1]! < vals[0]! && vals[2]! < vals[1]!) {
            review.push({
              kind: 'descenso', title: `${ex.name}: bajó en dos registros seguidos`,
              detail: `${g.changes[0]!.label}, en las mismas condiciones (${g.label}).`,
              evidence: recs.slice(-3).map((r) => ({ day: r.day, text: `${r.values[main]} ${g.changes[0]!.unit}${r.rpe != null ? ` · RPE ${r.rpe}` : ''}${r.rir != null ? ` · RIR ${r.rir}` : ''}` })),
            });
          }
        }
      }
      // Más esfuerzo con la misma carga de trabajo (mismos valores, más RPE o menos RIR).
      if (recs.length >= 2 && recs[recs.length - 1]!.day >= since) {
        const cur = recs[recs.length - 1]!;
        const ids = Object.keys(cur.values) as Array<keyof typeof cur.values>;
        const prev = [...recs.slice(0, -1)].reverse().find((r) => ids.filter((k) => k !== 'volume').every((k) => r.values[k] === cur.values[k]) && ids.some((k) => cur.values[k] != null));
        if (prev) {
          const harder = (prev.rpe != null && cur.rpe != null && cur.rpe > prev.rpe) || (prev.rir != null && cur.rir != null && cur.rir < prev.rir);
          if (harder) {
            review.push({
              kind: 'esfuerzo', title: `${ex.name}: más esfuerzo con el mismo trabajo`,
              detail: `Mismos números (${cur.summary}) y el esfuerzo informado fue mayor.`,
              evidence: [prev, cur].map((r) => ({ day: r.day, text: `${r.summary}${r.rpe != null ? ` · RPE ${r.rpe}` : ''}${r.rir != null ? ` · RIR ${r.rir}` : ''}` })),
            });
          }
        }
      }
    }
  }
  // Síntomas informados (sesión o series) en las últimas 4 semanas.
  const symptoms: Array<{ day: string; text: string; pain: number | null }> = [];
  for (const r of responses) {
    if (r.day < since) continue;
    if ((r.pain != null && r.pain > 0) || r.pain_area) symptoms.push({ day: r.day, pain: r.pain, text: `Dolor ${r.pain ?? '—'}/10${r.pain_area ? ` · ${r.pain_area}` : ''}` });
  }
  for (const e of manual) {
    if (e.day < since) continue;
    const p = Math.max(-1, ...e.sets.map((s) => s.pain ?? -1));
    if (p > 0) symptoms.push({ day: e.day, pain: p, text: `${e.exercise_name}: dolor ${p}/10 en alguna serie` });
  }
  if (symptoms.length) {
    symptoms.sort((a, b) => a.day.localeCompare(b.day));
    const sessionPains = responses.filter((r) => r.day >= since && r.pain != null);
    const trend = sessionPains.length >= 2 && sessionPains[sessionPains.length - 1]!.pain! > sessionPains[sessionPains.length - 2]!.pain!
      ? ' El último valor de dolor de la sesión es mayor que el anterior.' : '';
    const consecutive = new Set(symptoms.map((x) => x.day)).size >= 2 ? ' Se informó en más de una sesión.' : '';
    review.push({ kind: 'sintomas', title: 'Síntomas informados', detail: `En las últimas 4 semanas.${consecutive}${trend}`, evidence: symptoms.map(({ day, text }) => ({ day, text })) });
  }
  const recent = perSession.filter((p) => p.s.date >= since);
  // El esfuerzo de la sesión se le pregunta al alumno cuando termina su rutina: sólo ahí puede faltar.
  // En las sesiones que carga el profe no se pide nada más.
  const asked = recent.filter((p) => p.s.completed_at || p.resp);
  const noLoad = asked.filter((p) => p.load == null);
  const incomplete = manual.filter((e) => e.day >= since && e.data_quality === 'incompleto');
  if (noLoad.length || incomplete.length) {
    review.push({
      kind: 'datos', title: 'Faltan datos de monitoreo',
      detail: [
        noLoad.length ? `${noLoad.length} de ${asked.length} sesiones terminadas por el alumno sin esfuerzo (sRPE) o duración.` : '',
        incomplete.length ? `${incomplete.length} registros de ejercicios con datos incompletos.` : '',
      ].filter(Boolean).join(' '),
      evidence: [
        ...noLoad.map((p) => ({ day: p.s.date, text: p.resp ? 'Falta sRPE o duración' : 'Sin respuesta a la sesión' })),
        ...incomplete.map((e) => ({ day: e.day, text: `${e.exercise_name}: registro incompleto` })),
      ].sort((a, b) => a.day.localeCompare(b.day)),
    });
  }
  const partials = recent.filter((p) => p.partial);
  if (partials.length >= 2) {
    review.push({
      kind: 'parciales', title: 'Sesiones incompletas repetidas', detail: `${partials.length} sesiones parciales en las últimas 4 semanas.`,
      evidence: partials.map((p) => ({ day: p.s.date, text: `Hizo ${p.itemsDone} de ${p.itemsTotal} ejercicios` })),
    });
  }
  const absences = [...marks.entries()].filter(([d, m]) => d >= since && d <= today && (m === 'a' || m === 'e'));
  const overdue = sessions.filter((s) => s.status === 'planned' && !s.completed_at && !performed(s.id) && s.date >= since && s.date < today);
  if (absences.length || overdue.length) {
    review.push({
      kind: 'asistencia', title: 'Asistencia y rutinas sin hacer',
      detail: [
        absences.length ? `${absences.length} ${absences.length === 1 ? 'ausencia' : 'ausencias'}` : '',
        overdue.length ? `${overdue.length} ${overdue.length === 1 ? 'rutina asignada sin terminar' : 'rutinas asignadas sin terminar'}` : '',
      ].filter(Boolean).join(' y ') + ' en las últimas 4 semanas.',
      evidence: [
        ...absences.map(([d, m]) => ({ day: d, text: m === 'a' ? 'Ausente' : 'Faltó, se le mandaron los ejercicios' })),
        ...overdue.map((s) => ({ day: s.date, text: 'Rutina asignada sin terminar' })),
      ].sort((a, b) => a.day.localeCompare(b.day)),
    });
  }

  // Cambios en la programación (con el motivo que dejó el profe).
  const changes: ChangeRow[] = input.changes
    .filter((c) => c.entity === 'session')
    .sort((a, b) => b.at.localeCompare(a.at))
    .map((c) => {
      const after = (c.after ?? {}) as { lines?: string[]; date?: string; context?: string | null };
      const before = (c.before ?? {}) as { date?: string };
      return {
        at: c.at, session_id: c.session_id, session_day: after.date ?? before.date ?? null,
        category: c.category, reason: c.reason,
        lines: c.action === 'delete' ? ['Sesión borrada'] : after.lines ?? [],
        context: after.context ?? null,
      };
    });

  return {
    today,
    windows: [windowOf('7d'), windowOf('28d'), windowOf('todo')],
    weeks,
    months,
    responses,
    exercises,
    review,
    changes,
    coverage: {
      realized: perSession.length,
      with_srpe: perSession.filter((p) => p.resp?.srpe != null).length,
      with_duration: perSession.filter((p) => p.resp?.duration_min != null).length,
      with_records: perSession.filter((p) => p.manualRecords > 0).length,
      from_plan: perSession.filter((p) => p.fromPlan).length,
    },
  };
}

// ── diferencias entre dos versiones de una rutina ───────────────────────────

const flat = (r: Routine | null | undefined): Map<string, { text: string; block: string; rounds: number | null }> => {
  const m = new Map<string, { text: string; block: string; rounds: number | null }>();
  for (const b of r?.blocks ?? []) {
    for (const g of b.groups) for (const it of g.items) m.set(it.id, { text: `${it.who ? `${it.who}: ` : ''}${it.name} ${it.dose}`.trim(), block: b.title, rounds: b.rounds });
  }
  return m;
};

/** Qué cambió en la programación: ejercicios agregados, quitados o con otra dosis. */
export function routineDiff(before: Routine | null | undefined, after: Routine | null | undefined): string[] {
  const a = flat(before);
  const b = flat(after);
  const lines: string[] = [];
  for (const [id, x] of b) {
    const old = a.get(id);
    if (!old) lines.push(`Agregó: ${x.text}`);
    else if (old.text !== x.text) lines.push(`Cambió: ${old.text} → ${x.text}`);
    else if (old.rounds !== x.rounds) lines.push(`Vueltas de ${x.block || 'un bloque'}: ${old.rounds ?? 1} → ${x.rounds ?? 1}`);
  }
  for (const [id, x] of a) if (!b.has(id)) lines.push(`Quitó: ${x.text}`);
  const seenBlocks = new Set<string>();
  return lines.filter((l) => (l.startsWith('Vueltas') ? !seenBlocks.has(l) && Boolean(seenBlocks.add(l)) : true));
}

export const responseContext = (r: SessionResponse | undefined, day: string | undefined): string | null => {
  if (!r) return null;
  const bits = [
    r.srpe != null ? `sRPE ${r.srpe}` : null,
    r.duration_min != null ? `${r.duration_min} min` : null,
    r.pain != null ? `dolor ${r.pain}/10${r.pain_area ? ` (${r.pain_area})` : ''}` : null,
    r.fatigue != null ? `fatiga ${r.fatigue}/10` : null,
  ].filter(Boolean);
  return bits.length ? `Última respuesta${day ? ` (${short(day)})` : ''}: ${bits.join(' · ')}` : null;
};
