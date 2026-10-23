/**
 * Persistencia de alumnos, sesiones, biblioteca de ejercicios y sesiones
 * completadas. Misma política que v2/v3: PostgreSQL si hay DATABASE_URL,
 * memoria si no (tests / desarrollo local).
 */
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { CapacityId } from './capacities';
import { ProcessPhase } from './process';
import { Routine } from './routine';
import { Schedule } from './schedule';
import { Billing } from './billing';

export type Sex = 'MALE' | 'FEMALE';
export type SessionStatus = 'planned' | 'done';

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
  /** Lo que el alumno quiere que su profe sepa (lo escribe él). */
  about: string | null;
  created_at: string;
}

export type StudentPatch = Partial<Pick<Student, 'name' | 'username' | 'age' | 'sex' | 'goal' | 'notes' | 'schedule' | 'process' | 'billing' | 'about'>>;
type NewStudent = Omit<Student, 'id' | 'created_at' | 'schedule' | 'process' | 'billing' | 'about'> & { password_hash: string };

export interface NewSession {
  date: string;
  date_raw: string | null;
  date_note: string | null;
  title: string | null;
  body: string;
  seq: number;
  status: SessionStatus;
  /** null = se deriva del texto. */
  routine: Routine | null;
  participant_ids: string[];
}

export interface StoredSession extends NewSession {
  id: string;
  created_at: string;
}

export interface ExerciseMeta {
  key: string;
  name: string;
  capacity: CapacityId | null;
  description: string | null;
  /** Link a un video demostrativo. */
  video_url: string | null;
  custom: boolean;
  updated_at: string;
}

export interface Completion {
  session_id: string;
  student_id: string;
  checks: string[];
  notes: Record<string, string>;
  completed_at: string | null;
  feeling: number | null;
  comment: string | null;
  coach_seen_at: string | null;
  updated_at: string;
}

export interface Payment {
  id: string;
  student_id: string;
  paid_on: string;
  amount: number;
  classes: number | null;
  /** Mes que paga (pago mensual), "YYYY-MM". */
  period: string | null;
  note: string | null;
  created_at: string;
}
export type NewPayment = Omit<Payment, 'id' | 'created_at'>;

export type AttendanceMark = 'p' | 'a' | 'e';
export interface Attendance { student_id: string; day: string; mark: AttendanceMark }

export interface StoredReport {
  id: string;
  student_id: string;
  period_start: string;
  period_end: string;
  data: unknown;
  message: string | null;
  next_goal: string | null;
  published_at: string;
  seen_at: string | null;
}
export type NewReport = Omit<StoredReport, 'id' | 'published_at' | 'seen_at'>;

export interface Avatar { mime: string; data: Buffer; updated_at: string }

export interface Message {
  id: string;
  /** null = el profe. */
  author_id: string | null;
  body: string;
  created_at: string;
}

export interface QualityEntry {
  id: string;
  student_id: string;
  exercise_key: string;
  exercise_name: string;
  day: string;
  score: number;
  aspects: string[];
  note: string | null;
  created_at: string;
}
export type NewQuality = Omit<QualityEntry, 'id' | 'created_at'>;

export interface CompletionUpdate {
  session_id: string;
  student_id: string;
  checks?: string[];
  notes?: Record<string, string>;
  /** true = marca como terminada ahora (si ya lo estaba, conserva la fecha original). */
  complete?: boolean;
  feeling?: number | null;
  comment?: string | null;
}

export interface TrainingRepository {
  listStudents(): Promise<Student[]>;
  getStudent(id: string): Promise<Student | undefined>;
  findByUsername(username: string): Promise<{ id: string; password_hash: string } | undefined>;
  getPasswordHash(id: string): Promise<string | undefined>;
  createStudent(s: NewStudent): Promise<Student>;
  updateStudent(id: string, patch: StudentPatch): Promise<Student | undefined>;
  setPasswordHash(id: string, hash: string): Promise<boolean>;
  /** Borra al alumno y las sesiones que quedan sin participantes. */
  deleteStudent(id: string): Promise<boolean>;

  listSessions(studentId?: string): Promise<StoredSession[]>;
  getSession(id: string): Promise<StoredSession | undefined>;
  createSessions(list: NewSession[]): Promise<StoredSession[]>;
  updateSession(id: string, patch: Partial<NewSession>): Promise<StoredSession | undefined>;
  deleteSession(id: string): Promise<boolean>;

  listAssessmentLinks(studentId: string): Promise<string[]>;
  linkAssessment(studentId: string, assessmentId: string): Promise<void>;
  unlinkAssessment(studentId: string, assessmentId: string): Promise<void>;

  listExerciseMeta(): Promise<ExerciseMeta[]>;
  upsertExerciseMeta(m: Omit<ExerciseMeta, 'updated_at'>): Promise<ExerciseMeta>;
  deleteExerciseMeta(key: string): Promise<boolean>;

  listCompletions(filter: { studentId?: string; sessionIds?: string[] }): Promise<Completion[]>;
  saveCompletion(u: CompletionUpdate): Promise<Completion>;
  /** Sesiones terminadas por alumnos, más recientes primero. */
  listActivity(limit: number): Promise<Completion[]>;
  markActivitySeen(): Promise<void>;

  listPayments(studentId?: string): Promise<Payment[]>;
  createPayment(p: NewPayment): Promise<Payment>;
  deletePayment(id: string): Promise<boolean>;

  listAttendance(studentId?: string): Promise<Attendance[]>;
  /** mark null = borra la marca de ese día. */
  setAttendance(studentIds: string[], day: string, mark: AttendanceMark | null): Promise<void>;

  listReports(studentId?: string): Promise<StoredReport[]>;
  /** Publica (o vuelve a publicar) el informe de ese período. */
  saveReport(r: NewReport): Promise<StoredReport>;
  deleteReport(id: string): Promise<boolean>;
  markReportSeen(id: string, studentId: string): Promise<void>;

  /** Versión (fecha) de cada foto, para refrescar la caché del navegador. */
  listAvatarVersions(): Promise<Map<string, string>>;
  getAvatar(owner: string): Promise<Avatar | undefined>;
  setAvatar(owner: string, mime: string, data: Buffer): Promise<string>;
  deleteAvatar(owner: string): Promise<void>;

  getSetting<T>(key: string): Promise<T | undefined>;
  setSetting(key: string, value: unknown): Promise<void>;

  listMessages(limit: number): Promise<Message[]>;
  createMessage(authorId: string | null, body: string): Promise<Message>;
  getMessage(id: string): Promise<Message | undefined>;
  deleteMessage(id: string): Promise<boolean>;
  getLastRead(reader: string): Promise<string | null>;
  setLastRead(reader: string, at: string): Promise<void>;

  listQuality(studentId: string): Promise<QualityEntry[]>;
  createQuality(q: NewQuality): Promise<QualityEntry>;
  deleteQuality(id: string): Promise<boolean>;
}

const bySessionOrder = (a: StoredSession, b: StoredSession): number =>
  a.date.localeCompare(b.date) || a.seq - b.seq || a.created_at.localeCompare(b.created_at);

const clone = <T>(v: T): T => (v == null ? v : (JSON.parse(JSON.stringify(v)) as T));

// ── memoria ─────────────────────────────────────────────────────────────────

export class InMemoryTrainingRepository implements TrainingRepository {
  private students = new Map<string, Student & { password_hash: string }>();
  private sessions = new Map<string, StoredSession>();
  private links = new Map<string, Set<string>>();
  private exercises = new Map<string, ExerciseMeta>();
  private completions = new Map<string, Completion>();
  private payments = new Map<string, Payment>();
  private attendance = new Map<string, Attendance>();
  private reports = new Map<string, StoredReport>();
  private avatars = new Map<string, Avatar>();
  private settings = new Map<string, unknown>();
  private messages: Array<Message & { deleted: boolean }> = [];
  private reads = new Map<string, string>();
  private quality = new Map<string, QualityEntry>();

  private pub(s: Student & { password_hash: string }): Student {
    const { password_hash: _h, ...rest } = s;
    return clone(rest);
  }

  async listStudents(): Promise<Student[]> {
    return [...this.students.values()].map((s) => this.pub(s)).sort((a, b) => a.name.localeCompare(b.name));
  }
  async getStudent(id: string): Promise<Student | undefined> {
    const s = this.students.get(id);
    return s && this.pub(s);
  }
  async findByUsername(username: string): Promise<{ id: string; password_hash: string } | undefined> {
    const s = [...this.students.values()].find((x) => x.username === username);
    return s && { id: s.id, password_hash: s.password_hash };
  }
  async getPasswordHash(id: string): Promise<string | undefined> {
    return this.students.get(id)?.password_hash;
  }
  async createStudent(s: NewStudent): Promise<Student> {
    if ([...this.students.values()].some((x) => x.username === s.username)) throw new Error('USERNAME_TAKEN');
    const full = { ...s, schedule: null, process: null, billing: null, about: null, id: randomUUID(), created_at: new Date().toISOString() };
    this.students.set(full.id, full);
    return this.pub(full);
  }
  async updateStudent(id: string, patch: StudentPatch): Promise<Student | undefined> {
    const s = this.students.get(id);
    if (!s) return undefined;
    if (patch.username && [...this.students.values()].some((x) => x.id !== id && x.username === patch.username)) {
      throw new Error('USERNAME_TAKEN');
    }
    Object.assign(s, clone(patch));
    return this.pub(s);
  }
  async setPasswordHash(id: string, hash: string): Promise<boolean> {
    const s = this.students.get(id);
    if (!s) return false;
    s.password_hash = hash;
    return true;
  }
  async deleteStudent(id: string): Promise<boolean> {
    if (!this.students.delete(id)) return false;
    this.links.delete(id);
    for (const [k, c] of this.completions) if (c.student_id === id) this.completions.delete(k);
    for (const [k, p] of this.payments) if (p.student_id === id) this.payments.delete(k);
    for (const [k, a] of this.attendance) if (a.student_id === id) this.attendance.delete(k);
    for (const [k, r] of this.reports) if (r.student_id === id) this.reports.delete(k);
    for (const [k, q] of this.quality) if (q.student_id === id) this.quality.delete(k);
    this.messages = this.messages.filter((m) => m.author_id !== id);
    this.avatars.delete(id);
    for (const [sid, sess] of this.sessions) {
      sess.participant_ids = sess.participant_ids.filter((p) => p !== id);
      if (!sess.participant_ids.length) this.sessions.delete(sid);
    }
    return true;
  }

  async listSessions(studentId?: string): Promise<StoredSession[]> {
    return [...this.sessions.values()]
      .filter((s) => !studentId || s.participant_ids.includes(studentId))
      .map((s) => clone(s))
      .sort(bySessionOrder);
  }
  async getSession(id: string): Promise<StoredSession | undefined> {
    return clone(this.sessions.get(id));
  }
  async createSessions(list: NewSession[]): Promise<StoredSession[]> {
    const now = new Date().toISOString();
    const out = list.map((n) => ({ ...clone(n), id: randomUUID(), created_at: now }));
    for (const s of out) this.sessions.set(s.id, s);
    return out.map((s) => clone(s));
  }
  async updateSession(id: string, patch: Partial<NewSession>): Promise<StoredSession | undefined> {
    const s = this.sessions.get(id);
    if (!s) return undefined;
    Object.assign(s, clone(patch));
    return clone(s);
  }
  async deleteSession(id: string): Promise<boolean> {
    for (const [k, c] of this.completions) if (c.session_id === id) this.completions.delete(k);
    return this.sessions.delete(id);
  }

  async listAssessmentLinks(studentId: string): Promise<string[]> {
    return [...(this.links.get(studentId) ?? [])];
  }
  async linkAssessment(studentId: string, assessmentId: string): Promise<void> {
    const set = this.links.get(studentId) ?? new Set<string>();
    set.add(assessmentId);
    this.links.set(studentId, set);
  }
  async unlinkAssessment(studentId: string, assessmentId: string): Promise<void> {
    this.links.get(studentId)?.delete(assessmentId);
  }

  async listExerciseMeta(): Promise<ExerciseMeta[]> {
    return [...this.exercises.values()].map((e) => clone(e));
  }
  async upsertExerciseMeta(m: Omit<ExerciseMeta, 'updated_at'>): Promise<ExerciseMeta> {
    const full = { ...m, updated_at: new Date().toISOString() };
    this.exercises.set(m.key, full);
    return clone(full);
  }
  async deleteExerciseMeta(key: string): Promise<boolean> {
    return this.exercises.delete(key);
  }

  async listCompletions(filter: { studentId?: string; sessionIds?: string[] }): Promise<Completion[]> {
    return [...this.completions.values()]
      .filter((c) => (!filter.studentId || c.student_id === filter.studentId)
        && (!filter.sessionIds || filter.sessionIds.includes(c.session_id)))
      .map((c) => clone(c));
  }
  async saveCompletion(u: CompletionUpdate): Promise<Completion> {
    const k = `${u.session_id}:${u.student_id}`;
    const now = new Date().toISOString();
    const prev = this.completions.get(k) ?? {
      session_id: u.session_id, student_id: u.student_id, checks: [], notes: {}, completed_at: null,
      feeling: null, comment: null, coach_seen_at: null, updated_at: now,
    };
    const next: Completion = {
      ...prev,
      ...(u.checks ? { checks: [...u.checks] } : {}),
      ...(u.notes ? { notes: { ...u.notes } } : {}),
      ...(u.feeling !== undefined ? { feeling: u.feeling } : {}),
      ...(u.comment !== undefined ? { comment: u.comment } : {}),
      completed_at: u.complete ? prev.completed_at ?? now : prev.completed_at,
      coach_seen_at: u.complete && !prev.completed_at ? null : prev.coach_seen_at,
      updated_at: now,
    };
    this.completions.set(k, next);
    return clone(next);
  }
  async listActivity(limit: number): Promise<Completion[]> {
    return [...this.completions.values()]
      .filter((c) => c.completed_at)
      .sort((a, b) => b.completed_at!.localeCompare(a.completed_at!))
      .slice(0, limit)
      .map((c) => clone(c));
  }
  async markActivitySeen(): Promise<void> {
    const now = new Date().toISOString();
    for (const c of this.completions.values()) if (c.completed_at && !c.coach_seen_at) c.coach_seen_at = now;
  }

  async listPayments(studentId?: string): Promise<Payment[]> {
    return [...this.payments.values()]
      .filter((p) => !studentId || p.student_id === studentId)
      .sort((a, b) => a.paid_on.localeCompare(b.paid_on) || a.created_at.localeCompare(b.created_at))
      .map((p) => clone(p));
  }
  async createPayment(p: NewPayment): Promise<Payment> {
    const full = { ...clone(p), id: randomUUID(), created_at: new Date().toISOString() };
    this.payments.set(full.id, full);
    return clone(full);
  }
  async deletePayment(id: string): Promise<boolean> {
    return this.payments.delete(id);
  }

  async listAttendance(studentId?: string): Promise<Attendance[]> {
    return [...this.attendance.values()]
      .filter((a) => !studentId || a.student_id === studentId)
      .sort((a, b) => a.day.localeCompare(b.day))
      .map((a) => clone(a));
  }
  async setAttendance(studentIds: string[], day: string, mark: AttendanceMark | null): Promise<void> {
    for (const id of studentIds) {
      if (mark) this.attendance.set(`${id}:${day}`, { student_id: id, day, mark });
      else this.attendance.delete(`${id}:${day}`);
    }
  }

  async listReports(studentId?: string): Promise<StoredReport[]> {
    return [...this.reports.values()]
      .filter((r) => !studentId || r.student_id === studentId)
      .sort((a, b) => b.period_start.localeCompare(a.period_start))
      .map((r) => clone(r));
  }
  async saveReport(r: NewReport): Promise<StoredReport> {
    const prev = [...this.reports.values()].find((x) => x.student_id === r.student_id && x.period_start === r.period_start);
    const full: StoredReport = { ...clone(r), id: prev?.id ?? randomUUID(), published_at: new Date().toISOString(), seen_at: null };
    this.reports.set(full.id, full);
    return clone(full);
  }
  async deleteReport(id: string): Promise<boolean> {
    return this.reports.delete(id);
  }
  async markReportSeen(id: string, studentId: string): Promise<void> {
    const r = this.reports.get(id);
    if (r && r.student_id === studentId && !r.seen_at) r.seen_at = new Date().toISOString();
  }

  async listAvatarVersions(): Promise<Map<string, string>> {
    return new Map([...this.avatars].map(([k, v]) => [k, v.updated_at]));
  }
  async getAvatar(owner: string): Promise<Avatar | undefined> {
    return this.avatars.get(owner);
  }
  async setAvatar(owner: string, mime: string, data: Buffer): Promise<string> {
    const updated_at = new Date().toISOString();
    this.avatars.set(owner, { mime, data, updated_at });
    return updated_at;
  }
  async deleteAvatar(owner: string): Promise<void> {
    this.avatars.delete(owner);
  }

  async getSetting<T>(key: string): Promise<T | undefined> {
    return clone(this.settings.get(key) as T | undefined);
  }
  async setSetting(key: string, value: unknown): Promise<void> {
    this.settings.set(key, clone(value));
  }

  async listMessages(limit: number): Promise<Message[]> {
    return this.messages.filter((m) => !m.deleted).slice(-limit).map(({ deleted: _d, ...m }) => clone(m));
  }
  async createMessage(authorId: string | null, body: string): Promise<Message> {
    // Fecha estrictamente creciente: dos mensajes en el mismo milisegundo no se pisan al marcar leídos.
    const last = this.messages[this.messages.length - 1]?.created_at;
    let at = new Date().toISOString();
    if (last && at <= last) at = new Date(Date.parse(last) + 1).toISOString();
    const m = { id: randomUUID(), author_id: authorId, body, created_at: at, deleted: false };
    this.messages.push(m);
    const { deleted: _d, ...out } = m;
    return clone(out);
  }
  async getMessage(id: string): Promise<Message | undefined> {
    const m = this.messages.find((x) => x.id === id && !x.deleted);
    if (!m) return undefined;
    const { deleted: _d, ...out } = m;
    return clone(out);
  }
  async deleteMessage(id: string): Promise<boolean> {
    const m = this.messages.find((x) => x.id === id && !x.deleted);
    if (!m) return false;
    m.deleted = true;
    return true;
  }
  async getLastRead(reader: string): Promise<string | null> {
    return this.reads.get(reader) ?? null;
  }
  async setLastRead(reader: string, at: string): Promise<void> {
    const prev = this.reads.get(reader);
    if (!prev || at > prev) this.reads.set(reader, at);
  }

  async listQuality(studentId: string): Promise<QualityEntry[]> {
    return [...this.quality.values()].filter((q) => q.student_id === studentId)
      .sort((a, b) => a.day.localeCompare(b.day) || a.created_at.localeCompare(b.created_at)).map((q) => clone(q));
  }
  async createQuality(q: NewQuality): Promise<QualityEntry> {
    const full = { ...clone(q), id: randomUUID(), created_at: new Date().toISOString() };
    this.quality.set(full.id, full);
    return clone(full);
  }
  async deleteQuality(id: string): Promise<boolean> {
    return this.quality.delete(id);
  }
}

// ── PostgreSQL ──────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
const ts = (v: any): string | null => (v == null ? null : v instanceof Date ? v.toISOString() : String(v));

const toStudent = (r: any): Student => ({
  id: r.id,
  name: r.name,
  username: r.username,
  age: r.age ?? null,
  sex: r.sex ?? null,
  goal: r.goal ?? null,
  notes: r.notes ?? null,
  schedule: r.schedule ?? null,
  process: r.process ?? null,
  billing: r.billing ?? null,
  about: r.about ?? null,
  created_at: ts(r.created_at)!,
});

const toQuality = (r: any): QualityEntry => ({
  id: r.id,
  student_id: r.student_id,
  exercise_key: r.exercise_key,
  exercise_name: r.exercise_name,
  day: r.day,
  score: r.score,
  aspects: r.aspects ?? [],
  note: r.note ?? null,
  created_at: ts(r.created_at)!,
});

const toPayment = (r: any): Payment => ({
  id: r.id,
  student_id: r.student_id,
  paid_on: r.paid_on,
  amount: Number(r.amount),
  classes: r.classes ?? null,
  period: r.period ?? null,
  note: r.note ?? null,
  created_at: ts(r.created_at)!,
});

const toReport = (r: any): StoredReport => ({
  id: r.id,
  student_id: r.student_id,
  period_start: r.period_start,
  period_end: r.period_end,
  data: r.data,
  message: r.message ?? null,
  next_goal: r.next_goal ?? null,
  published_at: ts(r.published_at)!,
  seen_at: ts(r.seen_at),
});

const toSession = (r: any): StoredSession => ({
  id: r.id,
  date: r.date,
  date_raw: r.date_raw ?? null,
  date_note: r.date_note ?? null,
  title: r.title ?? null,
  body: r.body ?? '',
  seq: r.seq,
  status: r.status ?? 'done',
  routine: r.routine ?? null,
  created_at: ts(r.created_at)!,
  participant_ids: (r.participant_ids ?? []) as string[],
});

const toCompletion = (r: any): Completion => ({
  session_id: r.session_id,
  student_id: r.student_id,
  checks: r.checks ?? [],
  notes: r.notes ?? {},
  completed_at: ts(r.completed_at),
  feeling: r.feeling ?? null,
  comment: r.comment ?? null,
  coach_seen_at: ts(r.coach_seen_at),
  updated_at: ts(r.updated_at)!,
});

const STUDENT_COLS = 'id, name, username, age, sex, goal, notes, schedule, process, billing, about, created_at';
const QUALITY_COLS = `id::text AS id, student_id::text AS student_id, exercise_key, exercise_name,
  to_char(day, 'YYYY-MM-DD') AS day, score, aspects, note, created_at`;
const PAYMENT_COLS = `id::text AS id, student_id::text AS student_id, to_char(paid_on, 'YYYY-MM-DD') AS paid_on,
  amount, classes, period, note, created_at`;
const REPORT_COLS = `id::text AS id, student_id::text AS student_id, to_char(period_start, 'YYYY-MM-DD') AS period_start,
  to_char(period_end, 'YYYY-MM-DD') AS period_end, data, message, next_goal, published_at, seen_at`;
const SESSION_SELECT = `
  SELECT s.id, to_char(s.session_date, 'YYYY-MM-DD') AS date, s.date_raw, s.date_note, s.title, s.body, s.seq,
         s.status, s.routine, s.created_at,
         COALESCE(array_agg(p.student_id::text) FILTER (WHERE p.student_id IS NOT NULL), '{}') AS participant_ids
    FROM training_sessions s
    LEFT JOIN training_session_participants p ON p.session_id = s.id`;
const COMPLETION_COLS =
  'session_id::text AS session_id, student_id::text AS student_id, checks, notes, completed_at, feeling, comment, coach_seen_at, updated_at';
const json = (v: unknown): string | null => (v == null ? null : JSON.stringify(v));

export class PgTrainingRepository implements TrainingRepository {
  constructor(private pool: Pool) {}

  private async tx<T>(fn: (q: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const out = await fn((sql, params) => client.query(sql, params as any[]));
      await client.query('COMMIT');
      return out;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async listStudents(): Promise<Student[]> {
    const r = await this.pool.query(`SELECT ${STUDENT_COLS} FROM training_students ORDER BY name`);
    return r.rows.map(toStudent);
  }
  async getStudent(id: string): Promise<Student | undefined> {
    const r = await this.pool.query(`SELECT ${STUDENT_COLS} FROM training_students WHERE id = $1`, [id]);
    return r.rows[0] ? toStudent(r.rows[0]) : undefined;
  }
  async findByUsername(username: string): Promise<{ id: string; password_hash: string } | undefined> {
    const r = await this.pool.query('SELECT id, password_hash FROM training_students WHERE username = $1', [username]);
    return r.rows[0];
  }
  async getPasswordHash(id: string): Promise<string | undefined> {
    const r = await this.pool.query('SELECT password_hash FROM training_students WHERE id = $1', [id]);
    return r.rows[0]?.password_hash;
  }
  async createStudent(s: NewStudent): Promise<Student> {
    try {
      const r = await this.pool.query(
        `INSERT INTO training_students (id, name, username, password_hash, age, sex, goal, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${STUDENT_COLS}`,
        [randomUUID(), s.name, s.username, s.password_hash, s.age, s.sex, s.goal, s.notes],
      );
      return toStudent(r.rows[0]);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw new Error('USERNAME_TAKEN');
      throw err;
    }
  }
  async updateStudent(id: string, patch: StudentPatch): Promise<Student | undefined> {
    const cols = (['name', 'username', 'age', 'sex', 'goal', 'notes', 'schedule', 'process', 'billing', 'about'] as const).filter((k) => k in patch);
    if (!cols.length) return this.getStudent(id);
    const value = (c: (typeof cols)[number]) =>
      (c === 'schedule' || c === 'process' || c === 'billing' ? json(patch[c]) : patch[c] ?? null);
    try {
      const r = await this.pool.query(
        `UPDATE training_students SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')}
          WHERE id = $1 RETURNING ${STUDENT_COLS}`,
        [id, ...cols.map(value)],
      );
      return r.rows[0] ? toStudent(r.rows[0]) : undefined;
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw new Error('USERNAME_TAKEN');
      throw err;
    }
  }
  async setPasswordHash(id: string, hash: string): Promise<boolean> {
    const r = await this.pool.query('UPDATE training_students SET password_hash = $2 WHERE id = $1 RETURNING id', [id, hash]);
    return r.rows.length > 0;
  }
  async deleteStudent(id: string): Promise<boolean> {
    return this.tx(async (q) => {
      const r = await q('DELETE FROM training_students WHERE id = $1 RETURNING id', [id]);
      await q(`DELETE FROM training_sessions s
                WHERE NOT EXISTS (SELECT 1 FROM training_session_participants p WHERE p.session_id = s.id)`);
      return r.rows.length > 0;
    });
  }

  async listSessions(studentId?: string): Promise<StoredSession[]> {
    const where = studentId
      ? 'WHERE s.id IN (SELECT session_id FROM training_session_participants WHERE student_id = $1)'
      : '';
    const r = await this.pool.query(
      `${SESSION_SELECT} ${where} GROUP BY s.id ORDER BY s.session_date, s.seq, s.created_at`,
      studentId ? [studentId] : [],
    );
    return r.rows.map(toSession);
  }
  async getSession(id: string): Promise<StoredSession | undefined> {
    const r = await this.pool.query(`${SESSION_SELECT} WHERE s.id = $1 GROUP BY s.id`, [id]);
    return r.rows[0] ? toSession(r.rows[0]) : undefined;
  }
  async createSessions(list: NewSession[]): Promise<StoredSession[]> {
    const ids = await this.tx(async (q) => {
      const out: string[] = [];
      for (const n of list) {
        const id = randomUUID();
        await q(
          `INSERT INTO training_sessions (id, session_date, date_raw, date_note, title, body, seq, status, routine)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [id, n.date, n.date_raw, n.date_note, n.title, n.body, n.seq, n.status, json(n.routine)],
        );
        for (const sid of n.participant_ids) {
          await q('INSERT INTO training_session_participants (session_id, student_id) VALUES ($1,$2)', [id, sid]);
        }
        out.push(id);
      }
      return out;
    });
    const all = await Promise.all(ids.map((id) => this.getSession(id)));
    return all.filter((s): s is StoredSession => Boolean(s));
  }
  async updateSession(id: string, patch: Partial<NewSession>): Promise<StoredSession | undefined> {
    const map: Record<string, string> = {
      date: 'session_date', date_raw: 'date_raw', date_note: 'date_note', title: 'title', body: 'body', seq: 'seq',
      status: 'status', routine: 'routine',
    };
    const keys = Object.keys(map).filter((k) => k in patch) as Array<keyof NewSession>;
    const value = (k: keyof NewSession) => (k === 'routine' ? json(patch.routine) : patch[k] ?? null);
    const found = await this.tx(async (q) => {
      if (keys.length) {
        const r = await q(
          `UPDATE training_sessions SET ${keys.map((k, i) => `${map[k]} = $${i + 2}`).join(', ')}
            WHERE id = $1 RETURNING id`,
          [id, ...keys.map(value)],
        );
        if (!r.rows.length) return false;
      } else {
        const r = await q('SELECT id FROM training_sessions WHERE id = $1', [id]);
        if (!r.rows.length) return false;
      }
      if (patch.participant_ids) {
        await q('DELETE FROM training_session_participants WHERE session_id = $1', [id]);
        for (const sid of patch.participant_ids) {
          await q('INSERT INTO training_session_participants (session_id, student_id) VALUES ($1,$2)', [id, sid]);
        }
      }
      return true;
    });
    return found ? this.getSession(id) : undefined;
  }
  async deleteSession(id: string): Promise<boolean> {
    const r = await this.pool.query('DELETE FROM training_sessions WHERE id = $1 RETURNING id', [id]);
    return r.rows.length > 0;
  }

  async listAssessmentLinks(studentId: string): Promise<string[]> {
    const r = await this.pool.query(
      'SELECT assessment_id::text AS id FROM training_student_assessments WHERE student_id = $1 ORDER BY linked_at',
      [studentId],
    );
    return r.rows.map((x) => x.id as string);
  }
  async linkAssessment(studentId: string, assessmentId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO training_student_assessments (student_id, assessment_id) VALUES ($1,$2)
       ON CONFLICT DO NOTHING`,
      [studentId, assessmentId],
    );
  }
  async unlinkAssessment(studentId: string, assessmentId: string): Promise<void> {
    await this.pool.query('DELETE FROM training_student_assessments WHERE student_id = $1 AND assessment_id = $2', [
      studentId, assessmentId,
    ]);
  }

  async listExerciseMeta(): Promise<ExerciseMeta[]> {
    const r = await this.pool.query('SELECT key, name, capacity, description, video_url, custom, updated_at FROM training_exercises');
    return r.rows.map((x) => ({ ...x, updated_at: ts(x.updated_at)! }));
  }
  async upsertExerciseMeta(m: Omit<ExerciseMeta, 'updated_at'>): Promise<ExerciseMeta> {
    const r = await this.pool.query(
      `INSERT INTO training_exercises (key, name, capacity, description, video_url, custom, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6, now())
       ON CONFLICT (key) DO UPDATE SET name = $2, capacity = $3, description = $4, video_url = $5, custom = $6, updated_at = now()
       RETURNING key, name, capacity, description, video_url, custom, updated_at`,
      [m.key, m.name, m.capacity, m.description, m.video_url, m.custom],
    );
    return { ...r.rows[0], updated_at: ts(r.rows[0].updated_at)! };
  }
  async deleteExerciseMeta(key: string): Promise<boolean> {
    const r = await this.pool.query('DELETE FROM training_exercises WHERE key = $1 RETURNING key', [key]);
    return r.rows.length > 0;
  }

  async listCompletions(filter: { studentId?: string; sessionIds?: string[] }): Promise<Completion[]> {
    const cond: string[] = [];
    const params: unknown[] = [];
    if (filter.studentId) { params.push(filter.studentId); cond.push(`student_id = $${params.length}`); }
    if (filter.sessionIds) {
      if (!filter.sessionIds.length) return [];
      params.push(filter.sessionIds); cond.push(`session_id = ANY($${params.length}::uuid[])`);
    }
    const r = await this.pool.query(
      `SELECT ${COMPLETION_COLS} FROM training_completions ${cond.length ? `WHERE ${cond.join(' AND ')}` : ''}`,
      params as any[],
    );
    return r.rows.map(toCompletion);
  }
  async saveCompletion(u: CompletionUpdate): Promise<Completion> {
    const r = await this.pool.query(
      `INSERT INTO training_completions (session_id, student_id, checks, notes, completed_at, feeling, comment, updated_at)
       VALUES ($1, $2, COALESCE($3::jsonb, '[]'), COALESCE($4::jsonb, '{}'), CASE WHEN $5 THEN now() END, $6, $7, now())
       ON CONFLICT (session_id, student_id) DO UPDATE SET
         checks       = COALESCE($3::jsonb, training_completions.checks),
         notes        = COALESCE($4::jsonb, training_completions.notes),
         completed_at = CASE WHEN $5 THEN COALESCE(training_completions.completed_at, now()) ELSE training_completions.completed_at END,
         coach_seen_at = CASE WHEN $5 AND training_completions.completed_at IS NULL THEN NULL ELSE training_completions.coach_seen_at END,
         feeling      = CASE WHEN $8 THEN $6 ELSE training_completions.feeling END,
         comment      = CASE WHEN $9 THEN $7 ELSE training_completions.comment END,
         updated_at   = now()
       RETURNING ${COMPLETION_COLS}`,
      [
        u.session_id, u.student_id, json(u.checks ?? null), json(u.notes ?? null), Boolean(u.complete),
        u.feeling ?? null, u.comment ?? null, u.feeling !== undefined, u.comment !== undefined,
      ],
    );
    return toCompletion(r.rows[0]);
  }
  async listActivity(limit: number): Promise<Completion[]> {
    const r = await this.pool.query(
      `SELECT ${COMPLETION_COLS} FROM training_completions WHERE completed_at IS NOT NULL
        ORDER BY completed_at DESC LIMIT $1`,
      [limit],
    );
    return r.rows.map(toCompletion);
  }
  async markActivitySeen(): Promise<void> {
    await this.pool.query(
      'UPDATE training_completions SET coach_seen_at = now() WHERE completed_at IS NOT NULL AND coach_seen_at IS NULL',
    );
  }
  async listPayments(studentId?: string): Promise<Payment[]> {
    const r = await this.pool.query(
      `SELECT ${PAYMENT_COLS} FROM training_payments ${studentId ? 'WHERE student_id = $1' : ''} ORDER BY paid_on, created_at`,
      studentId ? [studentId] : [],
    );
    return r.rows.map(toPayment);
  }
  async createPayment(p: NewPayment): Promise<Payment> {
    const r = await this.pool.query(
      `INSERT INTO training_payments (id, student_id, paid_on, amount, classes, period, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${PAYMENT_COLS}`,
      [randomUUID(), p.student_id, p.paid_on, p.amount, p.classes, p.period, p.note],
    );
    return toPayment(r.rows[0]);
  }
  async deletePayment(id: string): Promise<boolean> {
    const r = await this.pool.query('DELETE FROM training_payments WHERE id = $1 RETURNING id', [id]);
    return r.rows.length > 0;
  }

  async listAttendance(studentId?: string): Promise<Attendance[]> {
    const r = await this.pool.query(
      `SELECT student_id::text AS student_id, to_char(day, 'YYYY-MM-DD') AS day, mark FROM training_attendance
        ${studentId ? 'WHERE student_id = $1' : ''} ORDER BY day`,
      studentId ? [studentId] : [],
    );
    return r.rows as Attendance[];
  }
  async setAttendance(studentIds: string[], day: string, mark: AttendanceMark | null): Promise<void> {
    if (!mark) {
      await this.pool.query('DELETE FROM training_attendance WHERE day = $1 AND student_id = ANY($2::uuid[])', [day, studentIds]);
      return;
    }
    await this.pool.query(
      `INSERT INTO training_attendance (student_id, day, mark)
       SELECT unnest($1::uuid[]), $2::date, $3
       ON CONFLICT (student_id, day) DO UPDATE SET mark = EXCLUDED.mark, updated_at = now()`,
      [studentIds, day, mark],
    );
  }

  async listReports(studentId?: string): Promise<StoredReport[]> {
    const r = await this.pool.query(
      `SELECT ${REPORT_COLS} FROM training_reports ${studentId ? 'WHERE student_id = $1' : ''} ORDER BY period_start DESC`,
      studentId ? [studentId] : [],
    );
    return r.rows.map(toReport);
  }
  async saveReport(n: NewReport): Promise<StoredReport> {
    const r = await this.pool.query(
      `INSERT INTO training_reports (id, student_id, period_start, period_end, data, message, next_goal)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (student_id, period_start) DO UPDATE SET period_end = EXCLUDED.period_end, data = EXCLUDED.data,
         message = EXCLUDED.message, next_goal = EXCLUDED.next_goal, published_at = now(), seen_at = NULL
       RETURNING ${REPORT_COLS}`,
      [randomUUID(), n.student_id, n.period_start, n.period_end, json(n.data), n.message, n.next_goal],
    );
    return toReport(r.rows[0]);
  }
  async deleteReport(id: string): Promise<boolean> {
    const r = await this.pool.query('DELETE FROM training_reports WHERE id = $1 RETURNING id', [id]);
    return r.rows.length > 0;
  }
  async markReportSeen(id: string, studentId: string): Promise<void> {
    await this.pool.query(
      'UPDATE training_reports SET seen_at = now() WHERE id = $1 AND student_id = $2 AND seen_at IS NULL', [id, studentId]);
  }
  async listAvatarVersions(): Promise<Map<string, string>> {
    const r = await this.pool.query('SELECT owner, updated_at FROM training_avatars');
    return new Map(r.rows.map((x: any) => [x.owner, ts(x.updated_at)!]));
  }
  async getAvatar(owner: string): Promise<Avatar | undefined> {
    const r = await this.pool.query('SELECT mime, data, updated_at FROM training_avatars WHERE owner = $1', [owner]);
    return r.rows[0] ? { mime: r.rows[0].mime, data: r.rows[0].data, updated_at: ts(r.rows[0].updated_at)! } : undefined;
  }
  async setAvatar(owner: string, mime: string, data: Buffer): Promise<string> {
    const r = await this.pool.query(
      `INSERT INTO training_avatars (owner, mime, data, updated_at) VALUES ($1,$2,$3, now())
       ON CONFLICT (owner) DO UPDATE SET mime = $2, data = $3, updated_at = now() RETURNING updated_at`,
      [owner, mime, data],
    );
    return ts(r.rows[0].updated_at)!;
  }
  async deleteAvatar(owner: string): Promise<void> {
    await this.pool.query('DELETE FROM training_avatars WHERE owner = $1', [owner]);
  }

  async getSetting<T>(key: string): Promise<T | undefined> {
    const r = await this.pool.query('SELECT value FROM training_settings WHERE key = $1', [key]);
    return r.rows[0]?.value as T | undefined;
  }
  async setSetting(key: string, value: unknown): Promise<void> {
    await this.pool.query(
      `INSERT INTO training_settings (key, value, updated_at) VALUES ($1,$2, now())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`, [key, json(value)]);
  }

  async listMessages(limit: number): Promise<Message[]> {
    const r = await this.pool.query(
      `SELECT * FROM (SELECT id::text AS id, author_id::text AS author_id, body, created_at FROM training_messages
         WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT $1) m ORDER BY created_at`, [limit]);
    return r.rows.map((x: any) => ({ ...x, created_at: ts(x.created_at)! }));
  }
  async createMessage(authorId: string | null, body: string): Promise<Message> {
    const r = await this.pool.query(
      `INSERT INTO training_messages (id, author_id, body) VALUES ($1,$2,$3)
       RETURNING id::text AS id, author_id::text AS author_id, body, created_at`, [randomUUID(), authorId, body]);
    return { ...r.rows[0], created_at: ts(r.rows[0].created_at)! };
  }
  async getMessage(id: string): Promise<Message | undefined> {
    const r = await this.pool.query(
      `SELECT id::text AS id, author_id::text AS author_id, body, created_at FROM training_messages
        WHERE id = $1 AND deleted_at IS NULL`, [id]);
    return r.rows[0] ? { ...r.rows[0], created_at: ts(r.rows[0].created_at)! } : undefined;
  }
  async deleteMessage(id: string): Promise<boolean> {
    const r = await this.pool.query('UPDATE training_messages SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id', [id]);
    return r.rows.length > 0;
  }
  async getLastRead(reader: string): Promise<string | null> {
    const r = await this.pool.query('SELECT last_read_at FROM training_message_reads WHERE reader = $1', [reader]);
    return r.rows[0] ? ts(r.rows[0].last_read_at) : null;
  }
  async setLastRead(reader: string, at: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO training_message_reads (reader, last_read_at) VALUES ($1,$2)
       ON CONFLICT (reader) DO UPDATE SET last_read_at = GREATEST(training_message_reads.last_read_at, EXCLUDED.last_read_at)`,
      [reader, at]);
  }

  async listQuality(studentId: string): Promise<QualityEntry[]> {
    const r = await this.pool.query(`SELECT ${QUALITY_COLS} FROM training_quality WHERE student_id = $1 ORDER BY day, created_at`, [studentId]);
    return r.rows.map(toQuality);
  }
  async createQuality(q: NewQuality): Promise<QualityEntry> {
    const r = await this.pool.query(
      `INSERT INTO training_quality (id, student_id, exercise_key, exercise_name, day, score, aspects, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${QUALITY_COLS}`,
      [randomUUID(), q.student_id, q.exercise_key, q.exercise_name, q.day, q.score, json(q.aspects), q.note]);
    return toQuality(r.rows[0]);
  }
  async deleteQuality(id: string): Promise<boolean> {
    const r = await this.pool.query('DELETE FROM training_quality WHERE id = $1 RETURNING id', [id]);
    return r.rows.length > 0;
  }


}
