/**
 * Agenda de un alumno: días fijos por semana, fechas puntuales y días
 * cancelados. La próxima sesión se calcula en la hora local del piloto.
 */
import { z } from 'zod';

const TIME = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const ScheduleSchema = z.object({
  weekly: z.array(z.object({ weekday: z.number().int().min(0).max(6), time: TIME.nullable() })).max(14).default([]),
  // `from`: la clase se pasó de ese día a este (el día original queda en `skip`).
  once: z.array(z.object({
    date: DATE, time: TIME.nullable(), note: z.string().trim().max(120).nullable().optional(), from: DATE.nullable().optional(),
  })).max(200).default([]),
  skip: z.array(DATE).max(200).default([]),
});
export type Schedule = z.infer<typeof ScheduleSchema>;

export interface Occurrence { date: string; time: string | null; note?: string | null }

const TZ = () => process.env.HTC_TZ ?? 'America/Argentina/Buenos_Aires';

/** Fecha (YYYY-MM-DD) y hora (HH:MM) actuales en la zona del piloto. */
export function localNow(at = new Date()): { date: string; time: string } {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: TZ() }).format(at);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: TZ(), hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at);
  return { date, time };
}

const addDays = (iso: string, n: number): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekday = (iso: string): number => new Date(`${iso}T12:00:00Z`).getUTCDay();

/** Ocurrencias entre dos fechas (inclusive), ordenadas. */
export function occurrences(s: Schedule | null, from: string, to: string): Occurrence[] {
  if (!s) return [];
  const skip = new Set(s.skip);
  const out: Occurrence[] = [];
  for (let d = from, guard = 0; d <= to && guard < 800; d = addDays(d, 1), guard++) {
    const wd = weekday(d);
    if (!skip.has(d)) for (const w of s.weekly) if (w.weekday === wd) out.push({ date: d, time: w.time });
    for (const o of s.once) if (o.date === d) out.push({ date: d, time: o.time, note: o.note ?? null });
  }
  const seen = new Set<string>();
  return out
    .filter((o) => {
      const k = `${o.date} ${o.time ?? ''}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''));
}

/** Próximas sesiones desde ahora (una de hoy cuenta si todavía no pasó su hora). */
export function nextSessions(s: Schedule | null, count = 1, now = localNow()): Occurrence[] {
  return occurrences(s, now.date, addDays(now.date, 120))
    .filter((o) => o.date > now.date || !o.time || o.time >= now.time)
    .slice(0, count);
}
