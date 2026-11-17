/**
 * Calendario para suscribirse desde el teléfono o la computadora.
 *   /api/calendar/<clave>.ics → las clases de la agenda (sin login: el
 *   calendario del teléfono no puede iniciar sesión, así que la clave larga y
 *   al azar del enlace es la que da acceso; se puede cambiar por otra).
 */
import { randomBytes } from 'crypto';
import { Router } from 'express';
import { calendarEvents, classMinutes, toIcs } from '../training/calendar';
import { localNow } from '../training/schedule';
import { TrainingRepository } from '../training/repository';

interface Feed { token: string; created_at: string }
const KEY = 'calendar_feed';

/** Enlace del calendario del profe; se crea la primera vez (o uno nuevo, que anula el anterior). */
export async function calendarFeed(repo: TrainingRepository, renew = false): Promise<{ path: string; created_at: string }> {
  let feed = await repo.getSetting<Feed>(KEY);
  if (!feed?.token || renew) {
    feed = { token: randomBytes(24).toString('base64url'), created_at: new Date().toISOString() };
    await repo.setSetting(KEY, feed);
  }
  return { path: `/api/calendar/${feed.token}.ics`, created_at: feed.created_at };
}

const addDays = (iso: string, n: number): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function createCalendarRouter(repo: TrainingRepository): Router {
  const router = Router();

  router.get('/:file', async (req, res) => {
    try {
      const m = /^([A-Za-z0-9_-]{24,64})\.ics$/.exec(req.params.file ?? '');
      const feed = m ? await repo.getSetting<Feed>(KEY) : undefined;
      if (!m || !feed?.token || feed.token !== m[1]) {
        res.status(404).type('text/plain').send('Calendario inexistente.');
        return;
      }
      const today = localNow().date;
      const events = calendarEvents(await repo.listStudents(), addDays(today, -30), addDays(today, 180));
      res.set('Cache-Control', 'no-store');
      res.type('text/calendar; charset=utf-8').send(toIcs(events, {
        name: 'HTC · Clases', tz: process.env.HTC_TZ ?? 'America/Argentina/Buenos_Aires', minutes: classMinutes(),
      }));
    } catch (e) {
      console.error('[calendar]', e);
      res.status(500).type('text/plain').send('No se pudo armar el calendario.');
    }
  });

  return router;
}
