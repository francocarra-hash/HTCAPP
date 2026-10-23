import { req } from '../api';

// ── capacidades (mismo orden y colores en toda la app) ──────────────────────

export type CapacityId = 'fuerza' | 'reactividad' | 'movilidad' | 'estabilidad' | 'control_motor' | 'resistencia';
export const CAPACITIES: Array<{ id: CapacityId; label: string; short: string }> = [
  { id: 'fuerza', label: 'Fuerza', short: 'Fuerza' },
  { id: 'reactividad', label: 'Reactividad', short: 'Reactiv.' },
  { id: 'movilidad', label: 'Movilidad', short: 'Movilidad' },
  { id: 'estabilidad', label: 'Estabilidad', short: 'Estabil.' },
  { id: 'control_motor', label: 'Control motor', short: 'Control' },
  { id: 'resistencia', label: 'Resistencia', short: 'Resist.' },
];
export const CAP_LABEL = Object.fromEntries(CAPACITIES.map((c) => [c.id, c.label])) as Record<CapacityId, string>;
export const capColor = (c: CapacityId) => `var(--cap-${c})`;

// ── rutina en bloques (espejo de src/training/routine.ts) ───────────────────

export type BlockKind = 'list' | 'circuit' | 'superset' | 'notes';
export interface RoutineItem { id: string; name: string; dose: string; who?: string; capacity?: CapacityId | null }
export interface RoutineGroup { id: string; items: RoutineItem[] }
export interface RoutineBlock { id: string; kind: BlockKind; title: string; rounds: number | null; groups: RoutineGroup[] }
export interface Routine { blocks: RoutineBlock[]; note?: string | null }

export const KIND_LABEL: Record<BlockKind, string> = {
  list: 'Lista', circuit: 'Circuito', superset: 'Superseries', notes: 'Notas',
};

export type Sex = 'MALE' | 'FEMALE';

export interface Schedule {
  weekly: Array<{ weekday: number; time: string | null }>;
  /** `from`: la clase se pasó de ese día a este. */
  once: Array<{ date: string; time: string | null; note?: string | null; from?: string | null }>;
  skip: string[];
}
export interface Occurrence { date: string; time: string | null; note?: string | null }
export interface ProcessPhase { id: string; title: string; description?: string | null; status: 'done' | 'current' | 'next' }

export interface Student {
  id: string;
  name: string;
  username: string;
  age: number | null;
  sex: Sex | null;
  goal: string | null;
  notes: string | null;
  schedule: Schedule | null;
  process: ProcessPhase[] | null;
  billing: Billing | null;
  created_at: string;
}

export interface StudentListItem extends Student {
  sessions_count: number;
  first_date: string | null;
  last_date: string | null;
  pending_count: number;
  last_completed_at: string | null;
  next_session: Occurrence | null;
  partners: string[];
}

export interface Completion {
  session_id: string;
  student_id: string;
  checks: string[];
  notes: Record<string, string>;
  completed_at: string | null;
  feeling: number | null;
  comment: string | null;
}

export interface Session {
  id: string;
  date: string;
  date_raw: string | null;
  date_note: string | null;
  title: string | null;
  body: string;
  seq: number;
  status: 'planned' | 'done';
  participant_ids: string[];
  routine: Routine;
  completions: Completion[];
}

export type Unit = 's' | 'reps' | 'kg';

export interface Highlight {
  key: string; name: string; capacity: CapacityId | null; unit: Unit;
  from: number; to: number; first_date: string; last_date: string;
}

export interface Progress {
  stats: {
    sessions: number;
    first_date: string | null;
    last_date: string | null;
    weeks_active: number;
    process_week: number;
    per_week: number | null;
    this_month: number;
    streak_weeks: number;
  };
  months: Array<{ month: string; count: number }>;
  exercises: Array<{
    key: string; name: string; capacity: CapacityId | null; unit: Unit;
    points: Array<{ date: string; value: number; text: string }>;
    first: number; last: number; best: number;
  }>;
  highlights: Highlight[];
  capacities: Array<{
    id: CapacityId; label: string; sessions: number; tracked: number; improved: number;
    top: Highlight | null; recent_share: number;
  }>;
}

export interface Profile {
  student: Student;
  sessions: Session[];
  progress: Progress;
  partners: Array<{ id: string; name: string; shared: number }>;
  next_sessions: Occurrence[];
  assessment_ids?: string[];
  /** Sólo en la vista del alumno: sus informes publicados. */
  reports?: StoredReport[];
}

// ── finanzas ────────────────────────────────────────────────────────────────

export type Estado = 'activo' | 'pausa' | 'baja';
export type Modalidad = 'presencial' | 'virtual_sinc' | 'virtual_asinc';
export interface Billing {
  estado: Estado | null;
  modalidad: Modalidad;
  clases_sem: number | null;
  ciclo_sem: number;
  pago_modo: 'clases' | 'mensual';
  cuota: number | null;
  historial_cuota: Array<{ desde: string; monto: number }>;
  cuenta_desde: string | null;
  saldo_inicial: number;
  vence: string | null;
  telefono: string | null;
  enfoque: string | null;
  rehab: boolean;
  prog_enviada: string | null;
  prog_pendiente: boolean;
}
export const emptyBilling = (): Billing => ({
  estado: null, modalidad: 'presencial', clases_sem: null, ciclo_sem: 4, pago_modo: 'clases', cuota: null,
  historial_cuota: [], cuenta_desde: null, saldo_inicial: 0, vence: null, telefono: null, enfoque: null,
  rehab: false, prog_enviada: null, prog_pendiente: false,
});
export interface Payment {
  id: string; student_id: string; paid_on: string; amount: number;
  classes: number | null; period: string | null; note: string | null; created_at: string;
}
export type Mark = 'p' | 'a' | 'e';
export interface AttendanceRow { student_id: string; day: string; mark: Mark }
export interface FinanceStudent {
  id: string; name: string; username: string; billing: Billing | null; schedule: Schedule | null; created_at: string;
  first_date: string | null; last_date: string | null;
  session_days: string[]; planned_days: string[]; last_report_start: string | null;
}
export interface FinanceData { today: string; students: FinanceStudent[]; payments: Payment[]; attendance: AttendanceRow[] }

// ── informe de 4 semanas ────────────────────────────────────────────────────

export interface ReportData {
  student_name: string; cycle: number; start: string; end: string; week_from: number; week_to: number;
  sessions: { count: number; dates: string[]; per_week: number[]; previous: number; total_to_date: number };
  planned: number | null;
  attendance: { p: number; a: number; e: number };
  capacities: Array<{ id: CapacityId; label: string; share: number; previous_share: number }>;
  improvements: Array<{ name: string; capacity: CapacityId | null; unit: Unit; from: number; to: number; from_date: string; to_date: string }>;
  new_exercises: Array<{ name: string; capacity: CapacityId | null }>;
  feeling: { average: number; count: number } | null;
  comments: Array<{ date: string; text: string }>;
}
export interface StoredReport {
  id: string; student_id: string; period_start: string; period_end: string; data: ReportData;
  message: string | null; next_goal: string | null; published_at: string; seen_at: string | null;
}
export interface Cycle { n: number; start: string; end: string }

export interface ExerciseEntry {
  key: string; name: string; capacity: CapacityId | null; capacity_source: 'coach' | 'auto' | null;
  description: string | null; custom: boolean; uses: number; students: string[];
  last_date: string | null; last_text: string | null;
}

export interface ActivityItem {
  session_id: string; student_id: string; student_name: string;
  session_date: string | null; session_title: string | null; completed_at: string;
  feeling: number | null; comment: string | null; checks: number; total: number;
  notes: Array<{ item: string; note: string }>; seen: boolean;
}

/** `existing`: ya estaba cargada (mismo texto y fecha); al importar no se repite. */
export type PreviewSession = Omit<Session, 'id' | 'completions'> & { existing: boolean };

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

export const coachApi = {
  students: () => req<{ students: StudentListItem[] }>('/training/students'),
  student: (id: string) => req<Profile>(`/training/students/${id}`),
  createStudent: (body: Partial<Student> & { name: string }) =>
    req<{ student: Student; password: string }>('/training/students', json('POST', body)),
  updateStudent: (id: string, body: Partial<Student>) =>
    req<{ student: Student; next_sessions: Occurrence[] }>(`/training/students/${id}`, json('PATCH', body)),
  resetPassword: (id: string) =>
    req<{ username: string; password: string }>(`/training/students/${id}/password`, json('POST', {})),
  deleteStudent: (id: string) => req<{ ok: true }>(`/training/students/${id}`, json('DELETE')),
  preview: (text: string, student_ids: string[], default_date: string) =>
    req<{ sessions: PreviewSession[]; warnings: string[] }>('/training/sessions/preview', json('POST', { text, student_ids, default_date })),
  saveSessions: (text: string, student_ids: string[], default_date: string) =>
    req<{ sessions: Session[]; skipped: number; warnings: string[] }>('/training/sessions', json('POST', { text, student_ids, default_date })),
  createRoutine: (body: { date: string; title: string | null; status: 'planned' | 'done'; participant_ids: string[]; routine: Routine }) =>
    req<{ session: Session }>('/training/sessions/routine', json('POST', body)),
  updateSession: (id: string, body: { date?: string; title?: string | null; status?: 'planned' | 'done'; participant_ids?: string[]; routine?: Routine }) =>
    req<{ session: Session }>(`/training/sessions/${id}`, json('PATCH', body)),
  deleteSession: (id: string) => req<{ ok: true }>(`/training/sessions/${id}`, json('DELETE')),
  exercises: () => req<{ exercises: ExerciseEntry[] }>('/training/exercises'),
  createExercise: (body: { name: string; capacity: CapacityId | null; description?: string | null }) =>
    req<{ exercise: unknown }>('/training/exercises', json('POST', body)),
  saveExercise: (key: string, body: { name: string; capacity: CapacityId | null; description?: string | null }) =>
    req<{ exercise: unknown }>(`/training/exercises/${encodeURIComponent(key)}`, json('PUT', body)),
  activity: () => req<{ items: ActivityItem[]; unseen: number }>('/training/activity'),
  activitySeen: () => req<{ ok: true }>('/training/activity/seen', json('POST', {})),
  linkAssessment: (id: string, assessment_id: string) =>
    req<{ assessment_ids: string[] }>(`/training/students/${id}/assessments`, json('POST', { assessment_id })),
  unlinkAssessment: (id: string, assessment_id: string) =>
    req<{ assessment_ids: string[] }>(`/training/students/${id}/assessments/${assessment_id}`, json('DELETE')),
  finance: () => req<FinanceData>('/training/finance'),
  addPayment: (body: { student_id: string; paid_on: string; amount: number; classes?: number | null; period?: string | null; note?: string | null }) =>
    req<{ payment: Payment }>('/training/payments', json('POST', body)),
  deletePayment: (id: string) => req<{ ok: true }>(`/training/payments/${id}`, json('DELETE')),
  setAttendance: (student_ids: string[], day: string, mark: Mark | null) =>
    req<{ ok: true }>('/training/attendance', json('PUT', { student_ids, day, mark })),
  reports: (id: string) =>
    req<{ first_date: string | null; current: Cycle | null; last_complete: Cycle | null; reports: StoredReport[] }>(`/training/students/${id}/reports`),
  reportPreview: (id: string, start: string) => req<{ report: ReportData }>(`/training/students/${id}/reports/preview?start=${start}`),
  publishReport: (id: string, body: { start: string; message: string | null; next_goal: string | null }) =>
    req<{ report: StoredReport }>(`/training/students/${id}/reports`, json('POST', body)),
  deleteReport: (id: string) => req<{ ok: true }>(`/training/reports/${id}`, json('DELETE')),
};

export const studentApi = {
  me: () => req<Profile>('/me'),
  progress: (sessionId: string, body: { checks?: string[]; notes?: Record<string, string> }) =>
    req<{ completion: Completion }>(`/me/sessions/${sessionId}/progress`, json('PUT', body)),
  complete: (sessionId: string, body: { checks?: string[]; notes?: Record<string, string>; feeling?: number | null; comment?: string | null }) =>
    req<{ completion: Completion }>(`/me/sessions/${sessionId}/complete`, json('POST', body)),
  changePassword: (current: string, next: string) => req<{ ok: true }>('/me/password', json('POST', { current, next })),
  reportSeen: (id: string) => req<{ ok: true }>(`/me/reports/${id}/seen`, json('POST', {})),
};

// ── rutina: utilidades ──────────────────────────────────────────────────────

export const uid = (): string => Math.random().toString(36).slice(2, 10);

/** Ejercicios contables (sin notas ni variantes personales). */
export const exerciseItems = (r: Routine): RoutineItem[] =>
  r.blocks.filter((b) => b.kind !== 'notes').flatMap((b) => b.groups.flatMap((g) => g.items)).filter((i) => !i.who);

/** Ítems que el alumno marca: los propios, contando su variante en lugar de la base. */
export function checkableItems(r: Routine, viewer: string | undefined): RoutineItem[] {
  const out: RoutineItem[] = [];
  for (const b of r.blocks) {
    if (b.kind === 'notes') continue;
    for (const g of b.groups) {
      g.items.forEach((it, i) => {
        if (it.who) {
          if (viewer && fold(it.who) === fold(viewer)) out.push(it);
          return;
        }
        const next = g.items[i + 1];
        if (viewer && next?.who && fold(next.who) === fold(viewer)) return;
        out.push(it);
      });
    }
  }
  return out;
}

/** Cuántos ejercicios de cada capacidad tiene la rutina (orden fijo). */
export function capacityMix(r: Routine): Array<{ id: CapacityId; count: number }> {
  const m = new Map<CapacityId, number>();
  for (const it of exerciseItems(r)) if (it.capacity) m.set(it.capacity, (m.get(it.capacity) ?? 0) + 1);
  return CAPACITIES.filter((c) => m.has(c.id)).map((c) => ({ id: c.id, count: m.get(c.id)! }));
}

/** Etiqueta de cada grupo: 1, 2… en circuitos; A1, A2… (B1…) en superseries. */
export function groupLabels(r: Routine): Map<string, string> {
  const labels = new Map<string, string>();
  let letter = 0;
  for (const b of r.blocks) {
    if (b.kind === 'superset') {
      const L = String.fromCharCode(65 + letter++);
      b.groups.forEach((g, i) => labels.set(g.id, `${L}${i + 1}`));
    } else b.groups.forEach((g, i) => labels.set(g.id, String(i + 1)));
  }
  return labels;
}

export const itemText = (it: RoutineItem): string => `${it.name} ${it.dose}`.trim();

export function routineSummary(r: Routine): string {
  if (!r.blocks.length) return r.note ?? 'Sin bloques';
  return r.blocks
    .filter((b) => b.kind !== 'notes')
    .map((b) => `${b.title || KIND_LABEL[b.kind]}${b.rounds ? ` ×${b.rounds}` : ''}`)
    .join(' · ') || (r.note ?? '');
}

/** Copia profunda con ids nuevos (para usar una sesión como base de otra). */
export function cloneRoutine(r: Routine): Routine {
  return {
    note: r.note ?? null,
    blocks: r.blocks.map((b) => ({
      ...b, id: uid(),
      groups: b.groups.map((g) => ({ id: uid(), items: g.items.map(({ capacity: _c, ...it }) => ({ ...it, id: uid() })) })),
    })),
  };
}

export const completionOf = (s: Session, studentId: string): Completion | undefined =>
  s.completions.find((c) => c.student_id === studentId);

// ── agenda ──────────────────────────────────────────────────────────────────

export const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export const WEEKDAYS_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const addDays = (iso: string, n: number): string => {
  const [y, m, d] = iso.split('-').map(Number);
  const x = new Date(y!, m! - 1, d! + n);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
export { addDays };

export function occurrences(s: Schedule | null, from: string, to: string): Occurrence[] {
  if (!s) return [];
  const skip = new Set(s.skip);
  const out: Occurrence[] = [];
  for (let d = from, g = 0; d <= to && g < 800; d = addDays(d, 1), g++) {
    const wd = parse(d).getDay();
    if (!skip.has(d)) for (const w of s.weekly) if (w.weekday === wd) out.push({ date: d, time: w.time });
    for (const o of s.once) if (o.date === d) out.push({ date: d, time: o.time, note: o.note ?? null });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''));
}

export const emptySchedule = (): Schedule => ({ weekly: [], once: [], skip: [] });

// ── formato ─────────────────────────────────────────────────────────────────

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const MONTH_NAMES = MONTHS;

export const parse = (d: string): Date => {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, day ?? 1);
};

/** Fecha local (YYYY-MM-DD) de un instante; por defecto, ahora. */
export const localDateOf = (at: Date | string = new Date()): string => {
  const n = typeof at === 'string' ? new Date(at) : at;
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
};
export const todayIso = (): string => localDateOf();

/** "lunes 12 de octubre" (+ año si no es el actual). */
export function longDate(d: string): string {
  const x = parse(d);
  const y = x.getFullYear() !== new Date().getFullYear() ? ` de ${x.getFullYear()}` : '';
  return `${DAYS[x.getDay()]} ${x.getDate()} de ${MONTHS[x.getMonth()]}${y}`;
}
/** "12 oct" */
export const shortDate = (d: string): string => {
  const x = parse(d);
  return `${x.getDate()} ${MONTHS[x.getMonth()]!.slice(0, 3)}`;
};
/** "lun 12" */
export const dayLabel = (d: string): string => {
  const x = parse(d);
  return `${DAYS[x.getDay()]!.slice(0, 3)} ${x.getDate()}`;
};
export const monthShort = (ym: string): string => MONTHS[Number(ym.slice(5, 7)) - 1]!.slice(0, 3);

/** "Hoy 18:00", "Mañana", "jue 22 · 18:00". */
export function whenLabel(o: Occurrence | null | undefined): string {
  if (!o) return 'Sin agenda';
  const t = todayIso();
  const day = o.date === t ? 'Hoy' : o.date === addDays(t, 1) ? 'Mañana' : dayLabel(o.date);
  return o.time ? `${day} · ${o.time}` : day;
}

export function relDays(d: string | null): string {
  if (!d) return 'sin sesiones';
  const diff = Math.round((parse(todayIso()).getTime() - parse(d).getTime()) / 86400000);
  if (diff < 0) return diff === -1 ? 'mañana' : `en ${-diff} días`;
  if (diff === 0) return 'hoy';
  if (diff === 1) return 'ayer';
  if (diff < 14) return `hace ${diff} días`;
  if (diff < 60) return `hace ${Math.round(diff / 7)} semanas`;
  return `hace ${Math.round(diff / 30)} meses`;
}
export const daysSince = (d: string | null): number | null =>
  d ? Math.round((parse(todayIso()).getTime() - parse(d).getTime()) / 86400000) : null;

export function timeAgo(isoTs: string): string {
  const min = Math.round((Date.now() - new Date(isoTs).getTime()) / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return relDays(localDateOf(isoTs));
}

export function fmtValue(v: number, unit: Unit): string {
  if (unit === 's') {
    if (v >= 60) {
      const m = Math.floor(v / 60);
      const s = Math.round(v % 60);
      return s ? `${m}:${String(s).padStart(2, '0')} min` : `${m} min`;
    }
    return `${v} s`;
  }
  if (unit === 'kg') return `${v} kg`;
  return `${v}`;
}
export const unitLabel = (u: Unit): string => (u === 's' ? 'tiempo' : u === 'kg' ? 'kilos' : 'repeticiones');
export const pctGain = (from: number, to: number): number => (from > 0 ? Math.round(((to - from) / from) * 100) : 0);

export const initials = (name: string): string =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
export const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? name;
export const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export const SEX_LABEL: Record<Sex, string> = { MALE: 'Masculino', FEMALE: 'Femenino' };
export const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
