/**
 * Alumnos y sesiones de entrenamiento.
 *   /api/login, /api/session  → login con rol (coach o alumno)
 *   /api/training/*           → panel del coach (mismo guard que el resto de la API)
 *   /api/me/*                 → vista del alumno (sólo su propio perfil)
 *
 * No toca el motor de evaluación: las evaluaciones sólo se vinculan por id.
 */
import { Request, Response, Router } from 'express';
import { z, ZodError } from 'zod';
import {
  authEnabled, authMiddleware, bearer, checkPassword, clearLoginFailures, coachUsername, generatePassword,
  hashPassword, issueStudentToken, issueToken, loginBlocked, readToken, recordLoginFailure, studentMiddleware,
  verifyPassword,
} from './auth';
import { firstName, fold, parseBody, ParsedSessionBody, splitSessions } from '../training/parser';
import { buildProgress } from '../training/progress';
import { NewSession, StoredSession, Student, TrainingRepository } from '../training/repository';

export interface SessionView extends StoredSession {
  parsed: ParsedSessionBody;
}

const USERNAME = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,30}$/, 'El usuario lleva 3 a 30 caracteres: letras, números, punto, guion o guion bajo.');
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Sex = z.enum(['MALE', 'FEMALE']);
const opt = <T extends z.ZodTypeAny>(t: T) => t.nullable().optional();

const StudentInput = z.object({
  name: z.string().trim().min(1).max(80),
  username: USERNAME.optional(),
  password: z.string().min(6).max(100).optional(),
  age: opt(z.number().int().min(5).max(110)),
  sex: opt(Sex),
  goal: opt(z.string().trim().max(500)),
  notes: opt(z.string().trim().max(2000)),
});
const StudentPatchInput = StudentInput.omit({ password: true }).partial();
const ImportInput = z.object({
  text: z.string().min(1).max(200_000),
  student_ids: z.array(z.string().uuid()).min(1),
  default_date: DATE.optional(),
});
const SessionPatchInput = z.object({
  date: DATE.optional(),
  title: z.string().trim().max(200).nullable().optional(),
  body: z.string().min(1).max(20_000).optional(),
  participant_ids: z.array(z.string().uuid()).min(1).optional(),
});

/** Fecha de hoy en Argentina (el piloto corre allá), no en UTC. */
function localToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: process.env.HTC_TZ ?? 'America/Argentina/Buenos_Aires' }).format(
    new Date(),
  );
}

function slugUsername(name: string): string {
  return fold(firstName(name)).replace(/[^a-z0-9]/g, '').slice(0, 20) || 'alumno';
}

const fail = (res: Response, status: number, error: string, message: string): void => {
  res.status(status).json({ error, message });
};

function handle(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response): void => {
    fn(req, res).catch((err: unknown) => {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'INVALID_INPUT', message: err.issues.map((i) => i.message).join('; '), issues: err.issues });
        return;
      }
      if (err instanceof Error && err.message === 'USERNAME_TAKEN') {
        fail(res, 409, 'USERNAME_TAKEN', 'Ese usuario ya existe.');
        return;
      }
      console.error('[training]', err);
      fail(res, 500, 'SYSTEM_ERROR', err instanceof Error ? err.message : 'unknown');
    });
  };
}

// ── vistas compartidas ──────────────────────────────────────────────────────

async function sessionViews(repo: TrainingRepository, list: StoredSession[]): Promise<SessionView[]> {
  const students = new Map((await repo.listStudents()).map((s) => [s.id, s]));
  return list.map((s) => {
    const participants = s.participant_ids
      .map((id) => students.get(id))
      .filter((x): x is Student => Boolean(x))
      .map((x) => ({ id: x.id, name: x.name, username: x.username }));
    return { ...s, parsed: parseBody(s.body, participants) };
  });
}

async function studentProfile(repo: TrainingRepository, student: Student) {
  const sessions = await sessionViews(repo, await repo.listSessions(student.id));
  const progress = buildProgress(student.name, sessions);
  const all = new Map((await repo.listStudents()).map((s) => [s.id, s]));
  const partnerCount = new Map<string, number>();
  for (const s of sessions) {
    for (const p of s.participant_ids) if (p !== student.id) partnerCount.set(p, (partnerCount.get(p) ?? 0) + 1);
  }
  const partners = [...partnerCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, shared]) => ({ id, name: all.get(id)?.name ?? '—', shared }));
  return { student, sessions, progress, partners };
}

// ── login ───────────────────────────────────────────────────────────────────

export function createAuthRouter(repo: TrainingRepository): Router {
  const router = Router();

  router.post('/login', handle(async (req, res) => {
    const { username, password } = (req.body ?? {}) as { username?: string; password?: string };
    const user = (username ?? '').trim().toLowerCase();
    const key = `${req.ip}:${user}`;
    if (loginBlocked(key)) {
      fail(res, 429, 'TOO_MANY_ATTEMPTS', 'Demasiados intentos. Esperá 15 minutos.');
      return;
    }
    if (!user || user === coachUsername()) {
      if (!authEnabled()) {
        res.json({ token: null, auth_enabled: false, role: 'coach' });
        return;
      }
      if (!password || !verifyPassword(password)) {
        recordLoginFailure(key);
        fail(res, 401, 'INVALID_CREDENTIALS', 'Usuario o contraseña incorrectos.');
        return;
      }
      clearLoginFailures(key);
      res.json({ token: issueToken(), auth_enabled: true, role: 'coach' });
      return;
    }
    const found = await repo.findByUsername(user);
    if (!found || !password || !checkPassword(password, found.password_hash)) {
      recordLoginFailure(key);
      fail(res, 401, 'INVALID_CREDENTIALS', 'Usuario o contraseña incorrectos.');
      return;
    }
    clearLoginFailures(key);
    const student = await repo.getStudent(found.id);
    res.json({ token: issueStudentToken(found.id), auth_enabled: authEnabled(), role: 'student', name: student?.name });
  }));

  /** Quién es el dueño del token (para que el front arranque en la vista correcta). */
  router.get('/session', handle(async (req, res) => {
    const p = readToken(bearer(req));
    if (p?.sub === 'student' && p.sid) {
      const s = await repo.getStudent(p.sid);
      if (!s) {
        fail(res, 401, 'UNAUTHORIZED', 'El alumno ya no existe.');
        return;
      }
      res.json({ role: 'student', auth_enabled: authEnabled(), student: { id: s.id, name: s.name } });
      return;
    }
    if (p?.sub === 'coach' || !authEnabled()) {
      res.json({ role: 'coach', auth_enabled: authEnabled(), coach_user: coachUsername() });
      return;
    }
    fail(res, 401, 'UNAUTHORIZED', 'Login required.');
  }));

  return router;
}

// ── panel del coach ─────────────────────────────────────────────────────────

export function createTrainingRouter(repo: TrainingRepository): Router {
  const router = Router();
  router.use(authMiddleware);

  router.get('/students', handle(async (_req, res) => {
    const [students, sessions] = await Promise.all([repo.listStudents(), repo.listSessions()]);
    const names = new Map(students.map((s) => [s.id, s.name]));
    res.json({
      students: students.map((s) => {
        const mine = sessions.filter((x) => x.participant_ids.includes(s.id));
        const partners = new Set(mine.flatMap((x) => x.participant_ids).filter((p) => p !== s.id));
        return {
          ...s,
          sessions_count: mine.length,
          first_date: mine[0]?.date ?? null,
          last_date: mine[mine.length - 1]?.date ?? null,
          partners: [...partners].map((p) => names.get(p) ?? '—'),
        };
      }),
    });
  }));

  router.post('/students', handle(async (req, res) => {
    const input = StudentInput.parse(req.body);
    let username = input.username ?? slugUsername(input.name);
    if (username === coachUsername()) {
      fail(res, 409, 'USERNAME_TAKEN', 'Ese usuario está reservado para el profe.');
      return;
    }
    if (!input.username) {
      // Usuario automático: nombre, y si ya existe, nombre2, nombre3…
      const base = username;
      for (let n = 2; await repo.findByUsername(username); n++) username = `${base}${n}`;
    }
    const password = input.password ?? generatePassword(firstName(input.name));
    const student = await repo.createStudent({
      name: input.name, username, password_hash: hashPassword(password),
      age: input.age ?? null, sex: input.sex ?? null, goal: input.goal ?? null, notes: input.notes ?? null,
    });
    res.status(201).json({ student, password });
  }));

  router.get('/students/:id', handle(async (req, res) => {
    const student = await repo.getStudent(req.params.id!);
    if (!student) {
      fail(res, 404, 'NOT_FOUND', 'Alumno inexistente.');
      return;
    }
    const profile = await studentProfile(repo, student);
    res.json({ ...profile, assessment_ids: await repo.listAssessmentLinks(student.id) });
  }));

  router.patch('/students/:id', handle(async (req, res) => {
    const patch = StudentPatchInput.parse(req.body);
    if (patch.username === coachUsername()) {
      fail(res, 409, 'USERNAME_TAKEN', 'Ese usuario está reservado para el profe.');
      return;
    }
    const student = await repo.updateStudent(req.params.id!, patch);
    if (!student) {
      fail(res, 404, 'NOT_FOUND', 'Alumno inexistente.');
      return;
    }
    res.json({ student });
  }));

  router.post('/students/:id/password', handle(async (req, res) => {
    const { password: given } = z.object({ password: z.string().min(6).max(100).optional() }).parse(req.body ?? {});
    const student = await repo.getStudent(req.params.id!);
    if (!student) {
      fail(res, 404, 'NOT_FOUND', 'Alumno inexistente.');
      return;
    }
    const password = given ?? generatePassword(firstName(student.name));
    await repo.setPasswordHash(student.id, hashPassword(password));
    res.json({ username: student.username, password });
  }));

  router.delete('/students/:id', handle(async (req, res) => {
    const ok = await repo.deleteStudent(req.params.id!);
    if (!ok) {
      fail(res, 404, 'NOT_FOUND', 'Alumno inexistente.');
      return;
    }
    res.json({ ok: true });
  }));

  // Sesiones: el coach pega una o varias en su formato habitual.
  const buildImport = async (body: unknown) => {
    const input = ImportInput.parse(body);
    const students = await Promise.all(input.student_ids.map((id) => repo.getStudent(id)));
    const missing = input.student_ids.filter((_id, i) => !students[i]);
    if (missing.length) return { error: `Alumnos inexistentes: ${missing.join(', ')}` } as const;
    const participants = (students as Student[]).map((s) => ({ id: s.id, name: s.name, username: s.username }));
    const { sessions, warnings } = splitSessions(input.text, participants, input.default_date ?? localToday());
    const drafts: NewSession[] = [];
    sessions.forEach((s, i) => {
      if (!s.date) {
        warnings.push(`Sesión ${i + 1} sin fecha válida (${s.dateRaw ?? '—'}): no se carga.`);
        return;
      }
      if (!s.body) {
        warnings.push(`La sesión del ${s.dateRaw ?? s.date} está vacía: no se carga.`);
        return;
      }
      drafts.push({
        date: s.date, date_raw: s.dateRaw, date_note: s.dateNote, title: s.title, body: s.body, seq: i,
        participant_ids: s.onlyFor ? [s.onlyFor] : participants.map((p) => p.id),
      });
    });
    return { drafts, warnings, participants } as const;
  };

  router.post('/sessions/preview', handle(async (req, res) => {
    const r = await buildImport(req.body);
    if ('error' in r) {
      fail(res, 400, 'INVALID_INPUT', r.error!);
      return;
    }
    res.json({
      sessions: r.drafts.map((d) => ({
        ...d,
        parsed: parseBody(d.body, r.participants.filter((p) => d.participant_ids.includes(p.id))),
      })),
      warnings: r.warnings,
    });
  }));

  router.post('/sessions', handle(async (req, res) => {
    const r = await buildImport(req.body);
    if ('error' in r) {
      fail(res, 400, 'INVALID_INPUT', r.error!);
      return;
    }
    if (!r.drafts.length) {
      fail(res, 400, 'NOTHING_TO_SAVE', r.warnings.join(' ') || 'No se encontró ninguna sesión en el texto.');
      return;
    }
    const saved = await repo.createSessions(r.drafts);
    res.status(201).json({ sessions: await sessionViews(repo, saved), warnings: r.warnings });
  }));

  router.patch('/sessions/:id', handle(async (req, res) => {
    const patch = SessionPatchInput.parse(req.body);
    if (patch.participant_ids) {
      const found = await Promise.all(patch.participant_ids.map((id) => repo.getStudent(id)));
      if (found.some((s) => !s)) {
        fail(res, 400, 'INVALID_INPUT', 'Hay alumnos inexistentes en la sesión.');
        return;
      }
    }
    // Si el coach corrige la fecha, la nota de "fecha fuera de orden" ya no aplica.
    const session = await repo.updateSession(req.params.id!, patch.date ? { ...patch, date_note: null } : patch);
    if (!session) {
      fail(res, 404, 'NOT_FOUND', 'Sesión inexistente.');
      return;
    }
    res.json({ session: (await sessionViews(repo, [session]))[0] });
  }));

  router.delete('/sessions/:id', handle(async (req, res) => {
    const ok = await repo.deleteSession(req.params.id!);
    if (!ok) {
      fail(res, 404, 'NOT_FOUND', 'Sesión inexistente.');
      return;
    }
    res.json({ ok: true });
  }));

  router.post('/students/:id/assessments', handle(async (req, res) => {
    const { assessment_id } = z.object({ assessment_id: z.string().uuid() }).parse(req.body);
    if (!(await repo.getStudent(req.params.id!))) {
      fail(res, 404, 'NOT_FOUND', 'Alumno inexistente.');
      return;
    }
    await repo.linkAssessment(req.params.id!, assessment_id);
    res.status(201).json({ assessment_ids: await repo.listAssessmentLinks(req.params.id!) });
  }));

  router.delete('/students/:id/assessments/:aid', handle(async (req, res) => {
    await repo.unlinkAssessment(req.params.id!, req.params.aid!);
    res.json({ assessment_ids: await repo.listAssessmentLinks(req.params.id!) });
  }));

  return router;
}

// ── vista del alumno ────────────────────────────────────────────────────────

export function createStudentRouter(repo: TrainingRepository): Router {
  const router = Router();
  router.use(studentMiddleware);

  router.get('/', handle(async (_req, res) => {
    const student = await repo.getStudent(res.locals.studentId as string);
    if (!student) {
      fail(res, 401, 'UNAUTHORIZED', 'El alumno ya no existe.');
      return;
    }
    // Las notas son privadas del coach: el alumno ve su objetivo, no las notas.
    res.json(await studentProfile(repo, { ...student, notes: null }));
  }));

  router.post('/password', handle(async (req, res) => {
    const { current, next } = z
      .object({ current: z.string().min(1), next: z.string().min(6, 'La contraseña nueva lleva al menos 6 caracteres.').max(100) })
      .parse(req.body);
    const id = res.locals.studentId as string;
    const hash = await repo.getPasswordHash(id);
    if (!hash || !checkPassword(current, hash)) {
      // 400 y no 401: el front cierra la sesión ante un 401.
      fail(res, 400, 'INVALID_CREDENTIALS', 'La contraseña actual no es correcta.');
      return;
    }
    await repo.setPasswordHash(id, hashPassword(next));
    res.json({ ok: true });
  }));

  return router;
}
