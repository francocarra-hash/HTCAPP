/**
 * Alumnos, rutinas y progreso.
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
import { CAPACITIES, CapacityId, isCapacity, suggestCapacity } from '../training/capacities';
import { exerciseName, firstName, fold, parseBody, splitSessions } from '../training/parser';
import { ProcessSchema } from '../training/process';
import { buildProgress, ExerciseInfo, exerciseKey, itemKey } from '../training/progress';
import { exerciseGroups, itemText, Routine, routineFromParsed, RoutineItem, RoutineSchema } from '../training/routine';
import { localNow, nextSessions, ScheduleSchema } from '../training/schedule';
import { Completion, NewSession, StoredSession, Student, TrainingRepository } from '../training/repository';
import { AttendanceInput, BillingSchema, PaymentInput } from '../training/billing';
import { buildReport, cycleOf, CYCLE_DAYS, ReportInput } from '../training/report';

export interface RoutineItemView extends RoutineItem { capacity: CapacityId | null; video: string | null }
export interface SessionView extends Omit<StoredSession, 'routine'> {
  routine: Routine;
  /** Lo que hicieron los alumnos con la sesión (el alumno sólo ve lo suyo). */
  completions: Completion[];
}

const USERNAME = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,30}$/, 'El usuario lleva 3 a 30 caracteres: letras, números, punto, guion o guion bajo.');
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Sex = z.enum(['MALE', 'FEMALE']);
const Status = z.enum(['planned', 'done']);
const opt = <T extends z.ZodTypeAny>(t: T) => t.nullable().optional();
/** Texto de una sesión comparable entre pegados (espacios, guiones y mayúsculas no cuentan). */
const bodyKey = (b: string): string =>
  b.replace(/[–—]/g, '-').replace(/->/g, '→').replace(/\s+/g, ' ').trim().toLowerCase();

const StudentInput = z.object({
  name: z.string().trim().min(1).max(80),
  username: USERNAME.optional(),
  password: z.string().min(6).max(100).optional(),
  age: opt(z.number().int().min(5).max(110)),
  sex: opt(Sex),
  goal: opt(z.string().trim().max(500)),
  notes: opt(z.string().trim().max(10_000)),
});
const StudentPatchInput = StudentInput.omit({ password: true }).partial().extend({
  schedule: ScheduleSchema.nullable().optional(),
  process: ProcessSchema.nullable().optional(),
  billing: BillingSchema.nullable().optional(),
});
export const QUALITY_ASPECTS = ['organizacion', 'transferencia', 'sensibilidad', 'control', 'respiracion'] as const;
const QualityInput = z.object({
  exercise_name: z.string().trim().min(1).max(140),
  day: DATE,
  score: z.number().int().min(1).max(5),
  aspects: z.array(z.enum(QUALITY_ASPECTS)).max(5).default([]),
  note: z.string().trim().max(500).nullable().optional(),
});
const ReportPublishInput = z.object({
  start: DATE,
  message: z.string().trim().max(2000).nullable().optional(),
  next_goal: z.string().trim().max(1000).nullable().optional(),
});
const ImportInput = z.object({
  text: z.string().min(1).max(200_000),
  student_ids: z.array(z.string().uuid()).min(1),
  default_date: DATE.optional(),
});
const RoutineSessionInput = z.object({
  date: DATE,
  title: z.string().trim().max(200).nullable().optional(),
  status: Status.default('planned'),
  participant_ids: z.array(z.string().uuid()).min(1),
  routine: RoutineSchema,
});
const SessionPatchInput = z.object({
  date: DATE.optional(),
  title: z.string().trim().max(200).nullable().optional(),
  body: z.string().max(20_000).optional(),
  status: Status.optional(),
  routine: RoutineSchema.optional(),
  participant_ids: z.array(z.string().uuid()).min(1).optional(),
});
const VideoUrl = z.string().trim().max(500).regex(/^https?:\/\/\S+$/, 'El video tiene que ser un link que empiece con http.');
const ExerciseInput = z.object({
  name: z.string().trim().min(1).max(140),
  video_url: VideoUrl.nullable().optional().or(z.literal('').transform(() => null)),
  capacity: z.string().nullable().optional().refine((v) => v == null || isCapacity(v), 'Capacidad inválida'),
  description: z.string().trim().max(1000).nullable().optional(),
});
const ProgressInput = z.object({
  checks: z.array(z.string().max(60)).max(400).optional(),
  notes: z.record(z.string().max(60), z.string().max(600)).optional(),
});
const CompleteInput = ProgressInput.extend({
  feeling: z.number().int().min(1).max(5).nullable().optional(),
  comment: z.string().trim().max(1000).nullable().optional(),
});

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

// ── biblioteca / capacidades ────────────────────────────────────────────────

async function exerciseInfo(repo: TrainingRepository): Promise<ExerciseInfo> {
  const meta = new Map((await repo.listExerciseMeta()).map((m) => [m.key, m]));
  return (key, name) => {
    const m = meta.get(key);
    return { name: m?.name, capacity: m?.capacity ?? suggestCapacity(m?.name ?? name), video: m?.video_url ?? null };
  };
}

/** Rutina guardada o, si la sesión se cargó como texto, derivada del texto. */
function routineOf(s: StoredSession, students: Map<string, Student>): Routine {
  if (s.routine) return s.routine;
  const participants = s.participant_ids
    .map((id) => students.get(id))
    .filter((x): x is Student => Boolean(x))
    .map((x) => ({ id: x.id, name: x.name, username: x.username }));
  return routineFromParsed(parseBody(s.body, participants));
}

/** Agrega la capacidad de cada ejercicio (para los colores y los beneficios). */
function withCapacities(r: Routine, info: ExerciseInfo): Routine {
  return {
    ...r,
    blocks: r.blocks.map((b) => ({
      ...b,
      groups: b.groups.map((g) => ({
        ...g,
        items: g.items.map((it): RoutineItemView => {
          const meta = b.kind === 'notes' ? null : info(itemKey(it), it.name);
          return { ...it, capacity: it.who ? null : meta?.capacity ?? null, video: meta?.video ?? null };
        }),
      })),
    })),
  };
}

async function sessionViews(repo: TrainingRepository, list: StoredSession[], onlyStudent?: string): Promise<SessionView[]> {
  const students = new Map((await repo.listStudents()).map((s) => [s.id, s]));
  const info = await exerciseInfo(repo);
  const completions = await repo.listCompletions({ sessionIds: list.map((s) => s.id), ...(onlyStudent ? { studentId: onlyStudent } : {}) });
  return list.map((s) => ({
    ...s,
    routine: withCapacities(routineOf(s, students), info),
    completions: completions.filter((c) => c.session_id === s.id),
  }));
}

async function studentProfile(repo: TrainingRepository, student: Student, onlyOwnCompletions: boolean) {
  const sessions = await sessionViews(repo, await repo.listSessions(student.id), onlyOwnCompletions ? student.id : undefined);
  // El progreso cuenta lo realizado: sesiones hechas o asignadas que el alumno terminó.
  const done = sessions.filter((s) => s.status === 'done' || s.completions.some((c) => c.student_id === student.id && c.completed_at));
  const progress = buildProgress(student.name, done, await exerciseInfo(repo));
  const all = new Map((await repo.listStudents()).map((s) => [s.id, s]));
  const partnerCount = new Map<string, number>();
  for (const s of sessions) {
    for (const p of s.participant_ids) if (p !== student.id) partnerCount.set(p, (partnerCount.get(p) ?? 0) + 1);
  }
  const partners = [...partnerCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, shared]) => ({ id, name: all.get(id)?.name ?? '—', shared }));
  return {
    student, sessions, progress, partners, next_sessions: nextSessions(student.schedule, 3),
    quality: await repo.listQuality(student.id),
  };
}

// ── informes de 4 semanas ───────────────────────────────────────────────────

const isRealized = (s: SessionView, studentId: string): boolean =>
  s.status === 'done' || s.completions.some((c) => c.student_id === studentId && c.completed_at);

async function reportInput(repo: TrainingRepository, student: Student): Promise<ReportInput & { firstDate: string | null }> {
  const sessions = await sessionViews(repo, await repo.listSessions(student.id), student.id);
  const done = sessions.filter((s) => isRealized(s, student.id));
  return {
    studentName: student.name,
    sessions: done,
    completions: sessions.flatMap((s) => s.completions.filter((c) => c.student_id === student.id).map((c) => ({ ...c, date: s.date }))),
    attendance: await repo.listAttendance(student.id),
    schedule: student.schedule,
    info: await exerciseInfo(repo),
    quality: await repo.listQuality(student.id),
    firstDate: done[0]?.date ?? null,
  };
}

/** Ciclo en curso y el último terminado (el que toca entregar). */
function cyclesFor(firstDate: string | null) {
  if (!firstDate) return { current: null, last_complete: null };
  const today = localNow().date;
  const current = cycleOf(firstDate, today);
  const prevEnd = new Date(`${current.start}T12:00:00Z`);
  prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
  const last = current.n > 1 ? cycleOf(firstDate, prevEnd.toISOString().slice(0, 10)) : null;
  return { current, last_complete: last };
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
    const [students, sessions, completions] = await Promise.all([
      repo.listStudents(), repo.listSessions(), repo.listCompletions({}),
    ]);
    const names = new Map(students.map((s) => [s.id, s.name]));
    const today = localNow().date;
    res.json({
      students: students.map((s) => {
        const mine = sessions.filter((x) => x.participant_ids.includes(s.id));
        const own = completions.filter((c) => c.student_id === s.id);
        const doneIds = new Set(own.filter((c) => c.completed_at).map((c) => c.session_id));
        const realized = mine.filter((x) => x.status === 'done' || doneIds.has(x.id));
        const lastCompleted = own.map((c) => c.completed_at).filter(Boolean).sort().pop() ?? null;
        const partners = new Set(mine.flatMap((x) => x.participant_ids).filter((p) => p !== s.id));
        return {
          ...s,
          sessions_count: realized.length,
          first_date: realized[0]?.date ?? null,
          last_date: realized[realized.length - 1]?.date ?? null,
          pending_count: mine.filter((x) => x.status === 'planned' && !doneIds.has(x.id) && x.date >= today).length,
          last_completed_at: lastCompleted,
          next_session: nextSessions(s.schedule, 1)[0] ?? null,
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
    const profile = await studentProfile(repo, student, false);
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
    res.json({ student, next_sessions: nextSessions(student.schedule, 3) });
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

  // ── biblioteca de ejercicios ──
  router.get('/exercises', handle(async (_req, res) => {
    const [sessions, students, meta] = await Promise.all([repo.listSessions(), repo.listStudents(), repo.listExerciseMeta()]);
    const byId = new Map(students.map((s) => [s.id, s]));
    interface Agg { names: Map<string, number>; uses: number; students: Set<string>; last_date: string; last_text: string }
    const agg = new Map<string, Agg>();
    for (const s of sessions) {
      for (const g of exerciseGroups(routineOf(s, byId))) {
        for (const it of g) {
          if (it.who) continue;
          const display = exerciseName(itemText(it));
          if (!display) continue;
          const key = itemKey(it);
          const a = agg.get(key) ?? { names: new Map(), uses: 0, students: new Set(), last_date: '', last_text: '' };
          a.names.set(it.name, (a.names.get(it.name) ?? 0) + 1);
          a.uses++;
          s.participant_ids.forEach((p) => a.students.add(p));
          if (s.date >= a.last_date) { a.last_date = s.date; a.last_text = itemText(it); }
          agg.set(key, a);
        }
      }
    }
    const metaBy = new Map(meta.map((m) => [m.key, m]));
    const keys = new Set([...agg.keys(), ...metaBy.keys()]);
    const exercises = [...keys].map((key) => {
      const a = agg.get(key);
      const m = metaBy.get(key);
      const top = a ? [...a.names.entries()].sort((x, y) => y[1] - x[1])[0]![0] : '';
      const name = m?.name ?? top.charAt(0).toUpperCase() + top.slice(1);
      const auto = suggestCapacity(name);
      return {
        key, name,
        capacity: m?.capacity ?? auto,
        capacity_source: m?.capacity ? 'coach' : auto ? 'auto' : null,
        description: m?.description ?? null,
        video_url: m?.video_url ?? null,
        custom: m?.custom ?? false,
        uses: a?.uses ?? 0,
        students: a ? [...a.students].map((id) => byId.get(id)?.name ?? '—') : [],
        last_date: a?.last_date || null,
        last_text: a?.last_text || null,
      };
    }).sort((x, y) => y.uses - x.uses || x.name.localeCompare(y.name));
    res.json({ exercises, capacities: CAPACITIES });
  }));

  router.post('/exercises', handle(async (req, res) => {
    const input = ExerciseInput.parse(req.body);
    const key = exerciseKey(exerciseName(input.name) || input.name);
    const saved = await repo.upsertExerciseMeta({
      key, name: input.name, capacity: (input.capacity as CapacityId | null | undefined) ?? null,
      description: input.description ?? null, video_url: input.video_url ?? null, custom: true,
    });
    res.status(201).json({ exercise: saved });
  }));

  router.put('/exercises/:key', handle(async (req, res) => {
    const input = ExerciseInput.parse(req.body);
    const prev = (await repo.listExerciseMeta()).find((m) => m.key === req.params.key);
    const saved = await repo.upsertExerciseMeta({
      key: req.params.key!, name: input.name, capacity: (input.capacity as CapacityId | null | undefined) ?? null,
      description: input.description ?? prev?.description ?? null,
      video_url: input.video_url !== undefined ? input.video_url : prev?.video_url ?? null,
      custom: prev?.custom ?? false,
    });
    res.json({ exercise: saved });
  }));

  router.delete('/exercises/:key', handle(async (req, res) => {
    await repo.deleteExerciseMeta(req.params.key!);
    res.json({ ok: true });
  }));

  // ── sesiones ──
  const buildImport = async (body: unknown) => {
    const input = ImportInput.parse(body);
    const students = await Promise.all(input.student_ids.map((id) => repo.getStudent(id)));
    const missing = input.student_ids.filter((_id, i) => !students[i]);
    if (missing.length) return { error: `Alumnos inexistentes: ${missing.join(', ')}` } as const;
    const participants = (students as Student[]).map((s) => ({ id: s.id, name: s.name, username: s.username }));
    const { sessions, warnings } = splitSessions(input.text, participants, input.default_date ?? localNow().date);
    // Sesiones que ya están cargadas (mismo texto y misma fecha, corregida o como se escribió):
    // así se puede volver a pegar la nota entera y sólo entran las nuevas.
    const loaded = new Set<string>();
    for (const p of participants) {
      for (const s of await repo.listSessions(p.id)) {
        if (!s.body) continue;
        loaded.add(`${s.date}|${bodyKey(s.body)}`);
        if (s.date_raw) loaded.add(`${s.date_raw}|${bodyKey(s.body)}`);
      }
    }
    const drafts: NewSession[] = [];
    const existing: boolean[] = [];
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
        status: 'done', routine: null,
        participant_ids: s.onlyFor ? [s.onlyFor] : participants.map((p) => p.id),
      });
      const k = bodyKey(s.body);
      existing.push(loaded.has(`${s.date}|${k}`) || Boolean(s.dateRaw && loaded.has(`${s.dateRaw}|${k}`)));
    });
    return { drafts, existing, warnings, participants } as const;
  };

  router.post('/sessions/preview', handle(async (req, res) => {
    const r = await buildImport(req.body);
    if ('error' in r) {
      fail(res, 400, 'INVALID_INPUT', r.error!);
      return;
    }
    const info = await exerciseInfo(repo);
    res.json({
      sessions: r.drafts.map((d, i) => ({
        ...d,
        existing: r.existing[i],
        routine: withCapacities(
          routineFromParsed(parseBody(d.body, r.participants.filter((p) => d.participant_ids.includes(p.id)))), info),
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
    const fresh = r.drafts.filter((_d, i) => !r.existing[i]);
    const skipped = r.drafts.length - fresh.length;
    if (!fresh.length) {
      fail(res, 400, 'NOTHING_TO_SAVE', `Las ${skipped} sesiones ya estaban cargadas.`);
      return;
    }
    const saved = await repo.createSessions(fresh);
    res.status(201).json({ sessions: await sessionViews(repo, saved), skipped, warnings: r.warnings });
  }));

  /** Sesión armada en el editor de bloques. */
  router.post('/sessions/routine', handle(async (req, res) => {
    const input = RoutineSessionInput.parse(req.body);
    const found = await Promise.all(input.participant_ids.map((id) => repo.getStudent(id)));
    if (found.some((s) => !s)) {
      fail(res, 400, 'INVALID_INPUT', 'Hay alumnos inexistentes en la sesión.');
      return;
    }
    const [saved] = await repo.createSessions([{
      date: input.date, date_raw: null, date_note: null, title: input.title ?? null, body: '', seq: 0,
      status: input.status, routine: input.routine as Routine, participant_ids: input.participant_ids,
    }]);
    res.status(201).json({ session: (await sessionViews(repo, [saved!]))[0] });
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
    const update = { ...patch, routine: patch.routine as Routine | undefined, ...(patch.date ? { date_note: null } : {}) };
    if (update.routine === undefined) delete update.routine;
    const session = await repo.updateSession(req.params.id!, update);
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

  // ── actividad: sesiones terminadas por los alumnos ──
  router.get('/activity', handle(async (req, res) => {
    const limit = Math.min(100, Number(req.query.limit ?? 30) || 30);
    const items = await repo.listActivity(limit);
    const students = new Map((await repo.listStudents()).map((s) => [s.id, s]));
    const sessions = new Map<string, StoredSession>();
    for (const id of new Set(items.map((i) => i.session_id))) {
      const s = await repo.getSession(id);
      if (s) sessions.set(id, s);
    }
    res.json({
      unseen: items.filter((i) => !i.coach_seen_at).length,
      items: items.map((c) => {
        const s = sessions.get(c.session_id);
        const routine = s ? routineOf(s, students) : { blocks: [] };
        const byItem = new Map(routine.blocks.flatMap((b) => b.groups.flatMap((g) => g.items)).map((it) => [it.id, it]));
        return {
          session_id: c.session_id,
          student_id: c.student_id,
          student_name: students.get(c.student_id)?.name ?? '—',
          session_date: s?.date ?? null,
          session_title: s?.title ?? null,
          completed_at: c.completed_at,
          feeling: c.feeling,
          comment: c.comment,
          checks: c.checks.length,
          total: s ? exerciseGroups(routine).reduce((a, g) => a + g.filter((i) => !i.who).length, 0) : 0,
          notes: Object.entries(c.notes).filter(([, v]) => v.trim()).map(([id, note]) => ({
            item: byItem.get(id) ? itemText(byItem.get(id)!) : 'Ejercicio', note,
          })),
          seen: Boolean(c.coach_seen_at),
        };
      }),
    });
  }));

  // ── finanzas y asistencia ──
  /** Todo lo que necesita el panel de pagos y asistencia, en una sola llamada. */
  router.get('/finance', handle(async (_req, res) => {
    const [students, sessions, completions, payments, attendance, reports] = await Promise.all([
      repo.listStudents(), repo.listSessions(), repo.listCompletions({}), repo.listPayments(), repo.listAttendance(), repo.listReports(),
    ]);
    const completedBy = new Map<string, Set<string>>();
    for (const c of completions) if (c.completed_at) completedBy.set(c.session_id, (completedBy.get(c.session_id) ?? new Set()).add(c.student_id));
    res.json({
      today: localNow().date,
      students: students.map((st) => {
        const mine = sessions.filter((x) => x.participant_ids.includes(st.id));
        const realized = mine.filter((x) => x.status === 'done' || completedBy.get(x.id)?.has(st.id));
        return {
          id: st.id, name: st.name, username: st.username, billing: st.billing, schedule: st.schedule, created_at: st.created_at,
          first_date: realized[0]?.date ?? null,
          last_date: realized[realized.length - 1]?.date ?? null,
          /** Días con sesión realizada: cuentan como presente si no hay otra marca. */
          session_days: [...new Set(realized.map((x) => x.date))],
          planned_days: [...new Set(mine.filter((x) => x.status === 'planned' && !completedBy.get(x.id)?.has(st.id)).map((x) => x.date))],
          last_report_start: reports.find((r) => r.student_id === st.id)?.period_start ?? null,
        };
      }),
      payments,
      attendance,
    });
  }));

  router.post('/payments', handle(async (req, res) => {
    const p = PaymentInput.parse(req.body);
    if (!(await repo.getStudent(p.student_id))) {
      fail(res, 404, 'NOT_FOUND', 'Alumno inexistente.');
      return;
    }
    const payment = await repo.createPayment({
      student_id: p.student_id, paid_on: p.paid_on, amount: p.amount,
      classes: p.classes ?? null, period: p.period ?? null, note: p.note || null,
    });
    res.status(201).json({ payment });
  }));

  router.delete('/payments/:id', handle(async (req, res) => {
    if (!(await repo.deletePayment(req.params.id!))) {
      fail(res, 404, 'NOT_FOUND', 'Pago inexistente.');
      return;
    }
    res.json({ ok: true });
  }));

  router.put('/attendance', handle(async (req, res) => {
    const a = AttendanceInput.parse(req.body);
    await repo.setAttendance(a.student_ids, a.day, a.mark);
    res.json({ ok: true });
  }));

  // ── informes de 4 semanas ──
  router.get('/students/:id/reports', handle(async (req, res) => {
    const student = await repo.getStudent(req.params.id!);
    if (!student) {
      fail(res, 404, 'NOT_FOUND', 'Alumno inexistente.');
      return;
    }
    const input = await reportInput(repo, student);
    res.json({ first_date: input.firstDate, cycle_days: CYCLE_DAYS, ...cyclesFor(input.firstDate), reports: await repo.listReports(student.id) });
  }));

  router.get('/students/:id/reports/preview', handle(async (req, res) => {
    const start = DATE.parse(req.query.start);
    const student = await repo.getStudent(req.params.id!);
    if (!student) {
      fail(res, 404, 'NOT_FOUND', 'Alumno inexistente.');
      return;
    }
    const input = await reportInput(repo, student);
    if (!input.firstDate) {
      fail(res, 400, 'NO_SESSIONS', 'Todavía no tiene sesiones para armar un informe.');
      return;
    }
    res.json({ report: buildReport(input, cycleOf(input.firstDate, start), input.firstDate) });
  }));

  router.post('/students/:id/reports', handle(async (req, res) => {
    const body = ReportPublishInput.parse(req.body);
    const student = await repo.getStudent(req.params.id!);
    if (!student) {
      fail(res, 404, 'NOT_FOUND', 'Alumno inexistente.');
      return;
    }
    const input = await reportInput(repo, student);
    if (!input.firstDate) {
      fail(res, 400, 'NO_SESSIONS', 'Todavía no tiene sesiones para armar un informe.');
      return;
    }
    const cycle = cycleOf(input.firstDate, body.start);
    const report = await repo.saveReport({
      student_id: student.id, period_start: cycle.start, period_end: cycle.end,
      data: buildReport(input, cycle, input.firstDate), message: body.message || null, next_goal: body.next_goal || null,
    });
    res.status(201).json({ report });
  }));

  // ── calidad del movimiento ──
  router.post('/students/:id/quality', handle(async (req, res) => {
    const q = QualityInput.parse(req.body);
    if (!(await repo.getStudent(req.params.id!))) {
      fail(res, 404, 'NOT_FOUND', 'Alumno inexistente.');
      return;
    }
    const entry = await repo.createQuality({
      student_id: req.params.id!, exercise_key: exerciseKey(exerciseName(q.exercise_name) || q.exercise_name),
      exercise_name: q.exercise_name, day: q.day, score: q.score, aspects: q.aspects, note: q.note || null,
    });
    res.status(201).json({ entry });
  }));

  router.delete('/quality/:id', handle(async (req, res) => {
    if (!(await repo.deleteQuality(req.params.id!))) {
      fail(res, 404, 'NOT_FOUND', 'Registro inexistente.');
      return;
    }
    res.json({ ok: true });
  }));

  router.delete('/reports/:id', handle(async (req, res) => {
    if (!(await repo.deleteReport(req.params.id!))) {
      fail(res, 404, 'NOT_FOUND', 'Informe inexistente.');
      return;
    }
    res.json({ ok: true });
  }));

  router.post('/activity/seen', handle(async (_req, res) => {
    await repo.markActivitySeen();
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

  const me = async (res: Response): Promise<Student | undefined> => {
    const student = await repo.getStudent(res.locals.studentId as string);
    if (!student) fail(res, 401, 'UNAUTHORIZED', 'El alumno ya no existe.');
    return student;
  };

  router.get('/', handle(async (_req, res) => {
    const student = await me(res);
    if (!student) return;
    // Las notas y los honorarios son del coach: el alumno ve su objetivo y sus informes.
    const profile = await studentProfile(repo, { ...student, notes: null, billing: null }, true);
    // Su WhatsApp sí lo ve (lo puede editar); el resto de los honorarios, no.
    res.json({ ...profile, reports: await repo.listReports(student.id), phone: student.billing?.telefono ?? null });
  }));

  /** El alumno edita sus datos: nombre, edad, WhatsApp y lo que quiere que su profe sepa. */
  router.patch('/', handle(async (req, res) => {
    const input = z.object({
      name: z.string().trim().min(1).max(80).optional(),
      age: z.number().int().min(5).max(110).nullable().optional(),
      phone: z.string().trim().max(30).nullable().optional(),
      about: z.string().trim().max(1000).nullable().optional(),
    }).parse(req.body);
    const student = await me(res);
    if (!student) return;
    const patch: Parameters<TrainingRepository['updateStudent']>[1] = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.age !== undefined) patch.age = input.age;
    if (input.about !== undefined) patch.about = input.about || null;
    if (input.phone !== undefined) patch.billing = BillingSchema.parse({ ...(student.billing ?? {}), telefono: input.phone || null });
    const updated = await repo.updateStudent(student.id, patch);
    res.json({ student: { ...updated!, notes: null, billing: null }, phone: updated?.billing?.telefono ?? null });
  }));

  router.post('/reports/:id/seen', handle(async (req, res) => {
    await repo.markReportSeen(req.params.id!, res.locals.studentId as string);
    res.json({ ok: true });
  }));

  /** Sesión del alumno (sólo si participa). */
  const ownSession = async (req: Request, res: Response): Promise<StoredSession | undefined> => {
    const s = await repo.getSession(req.params.id!);
    if (!s || !s.participant_ids.includes(res.locals.studentId as string)) {
      fail(res, 404, 'NOT_FOUND', 'Sesión inexistente.');
      return undefined;
    }
    return s;
  };

  /** Guardado automático de checks y notas mientras hace la rutina. */
  router.put('/sessions/:id/progress', handle(async (req, res) => {
    const input = ProgressInput.parse(req.body);
    if (!(await ownSession(req, res))) return;
    const c = await repo.saveCompletion({ session_id: req.params.id!, student_id: res.locals.studentId as string, ...input });
    res.json({ completion: c });
  }));

  /** Terminar la sesión (y, en una segunda llamada, cómo se sintió). */
  router.post('/sessions/:id/complete', handle(async (req, res) => {
    const input = CompleteInput.parse(req.body ?? {});
    if (!(await ownSession(req, res))) return;
    const c = await repo.saveCompletion({
      session_id: req.params.id!, student_id: res.locals.studentId as string, complete: true, ...input,
    });
    res.json({ completion: c });
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
