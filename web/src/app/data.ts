import { req } from '../api';

// Espejo de src/training/* (backend).
export interface ParsedItem { text: string; name: string; who?: string }
export interface ParsedCircuit { rounds: number | null; stations: ParsedItem[][] }
export interface ParsedStrength { rounds: number | null; lines: Array<{ label: string; items: ParsedItem[] }> }
export interface ParsedSessionBody {
  warmup: string[];
  circuits: ParsedCircuit[];
  strength: ParsedStrength | null;
  extras: string[];
  note: string | null;
}

export type Sex = 'MALE' | 'FEMALE';

export interface Student {
  id: string;
  name: string;
  username: string;
  age: number | null;
  sex: Sex | null;
  goal: string | null;
  notes: string | null;
  created_at: string;
}

export interface StudentListItem extends Student {
  sessions_count: number;
  first_date: string | null;
  last_date: string | null;
  partners: string[];
}

export interface Session {
  id: string;
  date: string;
  date_raw: string | null;
  date_note: string | null;
  title: string | null;
  body: string;
  seq: number;
  participant_ids: string[];
  parsed: ParsedSessionBody;
}

export type Unit = 's' | 'reps' | 'kg';

export interface Progress {
  stats: {
    sessions: number;
    first_date: string | null;
    last_date: string | null;
    weeks_active: number;
    per_week: number | null;
    this_month: number;
    streak_weeks: number;
  };
  months: Array<{ month: string; count: number }>;
  exercises: Array<{
    key: string; name: string; unit: Unit;
    points: Array<{ date: string; value: number; text: string }>;
    first: number; last: number; best: number;
  }>;
  highlights: Array<{ key: string; name: string; unit: Unit; from: number; to: number; first_date: string; last_date: string }>;
}

export interface Profile {
  student: Student;
  sessions: Session[];
  progress: Progress;
  partners: Array<{ id: string; name: string; shared: number }>;
  assessment_ids?: string[];
}

export type PreviewSession = Omit<Session, 'id'>;

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
    req<{ student: Student }>(`/training/students/${id}`, json('PATCH', body)),
  resetPassword: (id: string) =>
    req<{ username: string; password: string }>(`/training/students/${id}/password`, json('POST', {})),
  deleteStudent: (id: string) => req<{ ok: true }>(`/training/students/${id}`, json('DELETE')),
  preview: (text: string, student_ids: string[], default_date: string) =>
    req<{ sessions: PreviewSession[]; warnings: string[] }>('/training/sessions/preview', json('POST', { text, student_ids, default_date })),
  saveSessions: (text: string, student_ids: string[], default_date: string) =>
    req<{ sessions: Session[]; warnings: string[] }>('/training/sessions', json('POST', { text, student_ids, default_date })),
  updateSession: (id: string, body: { date?: string; title?: string | null; body?: string; participant_ids?: string[] }) =>
    req<{ session: Session }>(`/training/sessions/${id}`, json('PATCH', body)),
  deleteSession: (id: string) => req<{ ok: true }>(`/training/sessions/${id}`, json('DELETE')),
  linkAssessment: (id: string, assessment_id: string) =>
    req<{ assessment_ids: string[] }>(`/training/students/${id}/assessments`, json('POST', { assessment_id })),
  unlinkAssessment: (id: string, assessment_id: string) =>
    req<{ assessment_ids: string[] }>(`/training/students/${id}/assessments/${assessment_id}`, json('DELETE')),
};

export const studentApi = {
  me: () => req<Profile>('/me'),
  changePassword: (current: string, next: string) => req<{ ok: true }>('/me/password', json('POST', { current, next })),
};

// ── formato ─────────────────────────────────────────────────────────────────

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const parse = (d: string): Date => {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, day ?? 1);
};

export const todayIso = (): string => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
};

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

export function relDays(d: string | null): string {
  if (!d) return 'sin sesiones';
  const diff = Math.round((parse(todayIso()).getTime() - parse(d).getTime()) / 86400000);
  if (diff <= 0) return 'hoy';
  if (diff === 1) return 'ayer';
  if (diff < 14) return `hace ${diff} días`;
  if (diff < 60) return `hace ${Math.round(diff / 7)} semanas`;
  return `hace ${Math.round(diff / 30)} meses`;
}
export const daysSince = (d: string | null): number | null =>
  d ? Math.round((parse(todayIso()).getTime() - parse(d).getTime()) / 86400000) : null;

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

export const initials = (name: string): string =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
export const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? name;
export const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export const SEX_LABEL: Record<Sex, string> = { MALE: 'Masculino', FEMALE: 'Femenino' };

/** "Copenhagen 30s+10r" → ["Copenhagen", "30s+10r"]; si el texto no arranca con el nombre, todo es nombre. */
export function splitDose(item: ParsedItem): [string, string] {
  const t = item.text.trim();
  if (item.name && fold(t).startsWith(fold(item.name))) {
    const rest = t.slice(item.name.length).replace(/^[\s:,-]+/, '').trim();
    return [t.slice(0, item.name.length), rest];
  }
  // "Rotational Plank + Side dive 1min": la dosis es lo que arranca con el primer número tras el nombre.
  const m = /^(.*?[A-Za-zÀ-ÿ)])\s+(\d.*)$/.exec(t);
  return m ? [m[1]!, m[2]!] : [t, ''];
}

export function sessionSummary(p: ParsedSessionBody): string {
  if (p.note) return p.note;
  const parts: string[] = [];
  if (p.warmup.length) parts.push(`${p.warmup.length} de movilidad`);
  p.circuits.forEach((c) => parts.push(`circuito ${c.stations.length} est.${c.rounds ? ` ×${c.rounds}` : ''}`));
  if (p.strength) parts.push(`${p.strength.lines.map((l) => l.label).join('·')}${p.strength.rounds ? ` ×${p.strength.rounds}` : ''}`);
  return parts.join(' · ');
}
