/**
 * Persistencia de alumnos y sesiones. Misma política que v2/v3: PostgreSQL si hay
 * DATABASE_URL, memoria si no (tests / desarrollo local).
 */
import { randomUUID } from 'crypto';
import { Pool } from 'pg';

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

export type StudentPatch = Partial<Pick<Student, 'name' | 'username' | 'age' | 'sex' | 'goal' | 'notes'>>;

export interface NewSession {
  date: string;
  date_raw: string | null;
  date_note: string | null;
  title: string | null;
  body: string;
  seq: number;
  participant_ids: string[];
}

export interface StoredSession extends NewSession {
  id: string;
  created_at: string;
}

export interface TrainingRepository {
  listStudents(): Promise<Student[]>;
  getStudent(id: string): Promise<Student | undefined>;
  findByUsername(username: string): Promise<{ id: string; password_hash: string } | undefined>;
  getPasswordHash(id: string): Promise<string | undefined>;
  createStudent(s: Omit<Student, 'id' | 'created_at'> & { password_hash: string }): Promise<Student>;
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
}

const bySessionOrder = (a: StoredSession, b: StoredSession): number =>
  a.date.localeCompare(b.date) || a.seq - b.seq || a.created_at.localeCompare(b.created_at);

// ── memoria ─────────────────────────────────────────────────────────────────

export class InMemoryTrainingRepository implements TrainingRepository {
  private students = new Map<string, Student & { password_hash: string }>();
  private sessions = new Map<string, StoredSession>();
  private links = new Map<string, Set<string>>();

  private pub(s: Student & { password_hash: string }): Student {
    const { password_hash: _h, ...rest } = s;
    return { ...rest };
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
  async createStudent(s: Omit<Student, 'id' | 'created_at'> & { password_hash: string }): Promise<Student> {
    if ([...this.students.values()].some((x) => x.username === s.username)) throw new Error('USERNAME_TAKEN');
    const full = { ...s, id: randomUUID(), created_at: new Date().toISOString() };
    this.students.set(full.id, full);
    return this.pub(full);
  }
  async updateStudent(id: string, patch: StudentPatch): Promise<Student | undefined> {
    const s = this.students.get(id);
    if (!s) return undefined;
    if (patch.username && [...this.students.values()].some((x) => x.id !== id && x.username === patch.username)) {
      throw new Error('USERNAME_TAKEN');
    }
    Object.assign(s, patch);
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
    for (const [sid, sess] of this.sessions) {
      sess.participant_ids = sess.participant_ids.filter((p) => p !== id);
      if (!sess.participant_ids.length) this.sessions.delete(sid);
    }
    return true;
  }

  async listSessions(studentId?: string): Promise<StoredSession[]> {
    return [...this.sessions.values()]
      .filter((s) => !studentId || s.participant_ids.includes(studentId))
      .map((s) => ({ ...s, participant_ids: [...s.participant_ids] }))
      .sort(bySessionOrder);
  }
  async getSession(id: string): Promise<StoredSession | undefined> {
    const s = this.sessions.get(id);
    return s && { ...s, participant_ids: [...s.participant_ids] };
  }
  async createSessions(list: NewSession[]): Promise<StoredSession[]> {
    const now = new Date().toISOString();
    const out = list.map((n) => ({ ...n, participant_ids: [...n.participant_ids], id: randomUUID(), created_at: now }));
    for (const s of out) this.sessions.set(s.id, s);
    return out.map((s) => ({ ...s, participant_ids: [...s.participant_ids] }));
  }
  async updateSession(id: string, patch: Partial<NewSession>): Promise<StoredSession | undefined> {
    const s = this.sessions.get(id);
    if (!s) return undefined;
    Object.assign(s, patch, patch.participant_ids ? { participant_ids: [...patch.participant_ids] } : {});
    return { ...s, participant_ids: [...s.participant_ids] };
  }
  async deleteSession(id: string): Promise<boolean> {
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
}

// ── PostgreSQL ──────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
const toStudent = (r: any): Student => ({
  id: r.id,
  name: r.name,
  username: r.username,
  age: r.age ?? null,
  sex: r.sex ?? null,
  goal: r.goal ?? null,
  notes: r.notes ?? null,
  created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
});

const toSession = (r: any): StoredSession => ({
  id: r.id,
  date: r.date,
  date_raw: r.date_raw ?? null,
  date_note: r.date_note ?? null,
  title: r.title ?? null,
  body: r.body,
  seq: r.seq,
  created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  participant_ids: (r.participant_ids ?? []) as string[],
});

const STUDENT_COLS = 'id, name, username, age, sex, goal, notes, created_at';
const SESSION_SELECT = `
  SELECT s.id, to_char(s.session_date, 'YYYY-MM-DD') AS date, s.date_raw, s.date_note, s.title, s.body, s.seq,
         s.created_at,
         COALESCE(array_agg(p.student_id::text) FILTER (WHERE p.student_id IS NOT NULL), '{}') AS participant_ids
    FROM training_sessions s
    LEFT JOIN training_session_participants p ON p.session_id = s.id`;

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
  async createStudent(s: Omit<Student, 'id' | 'created_at'> & { password_hash: string }): Promise<Student> {
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
    const cols = (['name', 'username', 'age', 'sex', 'goal', 'notes'] as const).filter((k) => k in patch);
    if (!cols.length) return this.getStudent(id);
    try {
      const r = await this.pool.query(
        `UPDATE training_students SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')}
          WHERE id = $1 RETURNING ${STUDENT_COLS}`,
        [id, ...cols.map((c) => patch[c] ?? null)],
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
          `INSERT INTO training_sessions (id, session_date, date_raw, date_note, title, body, seq)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [id, n.date, n.date_raw, n.date_note, n.title, n.body, n.seq],
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
    };
    const keys = Object.keys(map).filter((k) => k in patch) as Array<keyof NewSession>;
    const found = await this.tx(async (q) => {
      if (keys.length) {
        const r = await q(
          `UPDATE training_sessions SET ${keys.map((k, i) => `${map[k]} = $${i + 2}`).join(', ')}
            WHERE id = $1 RETURNING id`,
          [id, ...keys.map((k) => patch[k] ?? null)],
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
}
