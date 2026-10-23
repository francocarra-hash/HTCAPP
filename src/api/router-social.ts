/**
 * Lo que comparten profe y alumnos: fotos de perfil, el perfil del profe y la
 * comunidad (un canal para todos: los mensajes del profe llegan a todos y los
 * alumnos pueden escribirse entre ellos).
 *   /api/social/*  → profe o alumno (cada uno sólo edita lo suyo; el profe, todo)
 */
import { Request, Response, Router } from 'express';
import { z, ZodError } from 'zod';
import { anyUserMiddleware } from './auth';
import { TrainingRepository } from '../training/repository';

const COACH = 'coach';
const MAX_AVATAR_BYTES = 400 * 1024;
const fail = (res: Response, status: number, error: string, message: string): void => {
  res.status(status).json({ error, message });
};
function handle(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response): void => {
    fn(req, res).catch((err: unknown) => {
      if (err instanceof ZodError) {
        fail(res, 400, 'INVALID_INPUT', err.issues.map((i) => i.message).join('; '));
        return;
      }
      console.error('[social]', err);
      fail(res, 500, 'SYSTEM_ERROR', err instanceof Error ? err.message : 'unknown');
    });
  };
}

export interface CoachProfile { name: string }
export const coachProfile = async (repo: TrainingRepository): Promise<CoachProfile> =>
  (await repo.getSetting<CoachProfile>('coach_profile')) ?? { name: 'Nico' };

const AvatarInput = z.object({ data: z.string().regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, 'Imagen inválida.') });
const MessageInput = z.object({ body: z.string().trim().min(1, 'El mensaje está vacío.').max(2000) });

export function createSocialRouter(repo: TrainingRepository): Router {
  const router = Router();
  router.use(anyUserMiddleware);

  const me = (res: Response): string => (res.locals.role === 'student' ? (res.locals.studentId as string) : COACH);
  /** El profe edita cualquier foto; el alumno, sólo la suya. */
  const canEdit = (res: Response, owner: string): boolean => res.locals.role === 'coach' || owner === res.locals.studentId;

  // ── personas (nombres y versión de la foto) ──
  router.get('/people', handle(async (_req, res) => {
    const [students, versions, coach] = await Promise.all([repo.listStudents(), repo.listAvatarVersions(), coachProfile(repo)]);
    res.json({
      me: me(res),
      people: [
        { id: COACH, name: coach.name, coach: true, avatar: versions.get(COACH) ?? null },
        ...students.map((s) => ({ id: s.id, name: s.name, coach: false, avatar: versions.get(s.id) ?? null })),
      ],
    });
  }));

  router.put('/coach', handle(async (req, res) => {
    if (res.locals.role !== 'coach') {
      fail(res, 403, 'FORBIDDEN', 'Sólo el profe.');
      return;
    }
    const { name } = z.object({ name: z.string().trim().min(1).max(60) }).parse(req.body);
    await repo.setSetting('coach_profile', { name });
    res.json({ name });
  }));

  // ── fotos ──
  router.get('/avatars/:owner', handle(async (req, res) => {
    const a = await repo.getAvatar(req.params.owner!);
    if (!a) {
      fail(res, 404, 'NOT_FOUND', 'Sin foto.');
      return;
    }
    res.setHeader('Content-Type', a.mime);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(a.data);
  }));

  router.put('/avatars/:owner', handle(async (req, res) => {
    const owner = req.params.owner!;
    if (!canEdit(res, owner)) {
      fail(res, 403, 'FORBIDDEN', 'Sólo podés cambiar tu foto.');
      return;
    }
    if (owner !== COACH && !(await repo.getStudent(owner))) {
      fail(res, 404, 'NOT_FOUND', 'Alumno inexistente.');
      return;
    }
    const { data } = AvatarInput.parse(req.body);
    const [head, b64] = data.split(',');
    const buf = Buffer.from(b64!, 'base64');
    if (buf.length > MAX_AVATAR_BYTES) {
      fail(res, 413, 'TOO_LARGE', 'La foto es muy pesada.');
      return;
    }
    const version = await repo.setAvatar(owner, head!.slice(5, head!.indexOf(';')), buf);
    res.json({ avatar: version });
  }));

  router.delete('/avatars/:owner', handle(async (req, res) => {
    if (!canEdit(res, req.params.owner!)) {
      fail(res, 403, 'FORBIDDEN', 'Sólo podés cambiar tu foto.');
      return;
    }
    await repo.deleteAvatar(req.params.owner!);
    res.json({ ok: true });
  }));

  // ── comunidad ──
  router.get('/community', handle(async (req, res) => {
    const limit = Math.min(300, Math.max(20, Number(req.query.limit) || 150));
    const who = me(res);
    const [messages, lastRead] = await Promise.all([repo.listMessages(limit), repo.getLastRead(who)]);
    const mine = (authorId: string | null) => (who === COACH ? authorId === null : authorId === who);
    res.json({
      me: who,
      last_read: lastRead,
      unread: messages.filter((m) => !mine(m.author_id) && (!lastRead || m.created_at > lastRead)).length,
      messages: messages.map((m) => ({ ...m, author: m.author_id ?? COACH, mine: mine(m.author_id) })),
    });
  }));

  router.get('/community/unread', handle(async (_req, res) => {
    const who = me(res);
    const [messages, lastRead] = await Promise.all([repo.listMessages(300), repo.getLastRead(who)]);
    const mine = (authorId: string | null) => (who === COACH ? authorId === null : authorId === who);
    res.json({ unread: messages.filter((m) => !mine(m.author_id) && (!lastRead || m.created_at > lastRead)).length });
  }));

  router.post('/community', handle(async (req, res) => {
    const { body } = MessageInput.parse(req.body);
    const who = me(res);
    const m = await repo.createMessage(who === COACH ? null : who, body);
    await repo.setLastRead(who, m.created_at);
    res.status(201).json({ message: { ...m, author: m.author_id ?? COACH, mine: true } });
  }));

  router.post('/community/read', handle(async (req, res) => {
    const { at } = z.object({ at: z.string().datetime({ offset: true }) }).parse(req.body);
    await repo.setLastRead(me(res), at);
    res.json({ ok: true });
  }));

  router.delete('/community/:id', handle(async (req, res) => {
    const m = await repo.getMessage(req.params.id!);
    if (!m) {
      fail(res, 404, 'NOT_FOUND', 'Mensaje inexistente.');
      return;
    }
    const who = me(res);
    if (who !== COACH && m.author_id !== who) {
      fail(res, 403, 'FORBIDDEN', 'Sólo podés borrar tus mensajes.');
      return;
    }
    await repo.deleteMessage(m.id);
    res.json({ ok: true });
  }));

  return router;
}
