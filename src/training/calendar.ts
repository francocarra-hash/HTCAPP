/**
 * Calendario para suscribirse (formato iCalendar): las clases de la agenda de
 * los alumnos, para verlas en el calendario del teléfono o la computadora.
 *
 * Es de un solo sentido: lo que cambia en la app aparece en el calendario la
 * próxima vez que éste se actualiza. Las clases a la misma hora (compartidas)
 * van en un solo evento con los nombres de todos.
 */
import { Occurrence, occurrences, Schedule } from './schedule';

export interface CalendarStudent {
  id: string;
  name: string;
  schedule: Schedule | null;
  billing: unknown;
}

export interface CalendarEvent {
  date: string;
  /** null: sin hora cargada (evento de todo el día). */
  time: string | null;
  students: Array<{ name: string; note: string | null }>;
}

const addDays = (iso: string, n: number): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Tiene clases con horario: activo (o sin estado cargado) y no es de programación a distancia. */
function inCalendar(s: CalendarStudent): boolean {
  const b = (s.billing ?? {}) as { estado?: string | null; modalidad?: string | null };
  return b.estado !== 'pausa' && b.estado !== 'baja' && b.modalidad !== 'virtual_asinc';
}

/** Clases entre dos fechas, agrupadas por día y hora. */
export function calendarEvents(students: CalendarStudent[], from: string, to: string): CalendarEvent[] {
  const slots = new Map<string, CalendarEvent>();
  for (const s of students) {
    if (!inCalendar(s)) continue;
    const seen = new Set<string>();
    for (const o of occurrences(s.schedule, from, to) as Occurrence[]) {
      const key = `${o.date} ${o.time ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const ev = slots.get(key) ?? { date: o.date, time: o.time, students: [] };
      // "Cambio de hora" es una marca interna de la agenda: la hora ya es la del evento.
      ev.students.push({ name: s.name, note: o.note && o.note !== 'Cambio de hora' ? o.note : null });
      slots.set(key, ev);
    }
  }
  return [...slots.values()]
    .map((e) => ({ ...e, students: e.students.sort((a, b) => a.name.localeCompare(b.name, 'es')) }))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''));
}

// ── texto iCalendar ─────────────────────────────────────────────────────────

const esc = (t: string): string => t.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Las líneas van de a 75 bytes como máximo; lo que sigue continúa con un espacio adelante. */
function fold(line: string): string {
  const out: string[] = [];
  let cur = '';
  let size = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch);
    if (size + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = '';
      size = 0;
    }
    cur += ch;
    size += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

/** Minutos que la zona le lleva a UTC en ese instante (Buenos Aires: -180). */
function offsetMin(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at);
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return (Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - at.getTime()) / 60000;
}

/** Fecha y hora locales de la zona → instante. */
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const guess = new Date(`${date}T${time}:00Z`);
  return new Date(guess.getTime() - offsetMin(tz, guess) * 60000);
}

const stamp = (d: Date): string => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const firstName = (n: string): string => n.trim().split(/\s+/)[0] ?? n;

export function eventTitle(e: CalendarEvent): string {
  if (e.students.length === 1) return e.students[0]!.name;
  return e.students.map((s) => firstName(s.name)).join(', ');
}

export interface IcsOptions {
  name: string;
  tz: string;
  /** Duración de cada clase, en minutos. */
  minutes: number;
  now?: Date;
}

export function toIcs(events: CalendarEvent[], opts: IcsOptions): string {
  const now = stamp(opts.now ?? new Date());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HTC//Agenda//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(opts.name)}`,
    `X-WR-TIMEZONE:${opts.tz}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT15M',
    'X-PUBLISHED-TTL:PT15M',
  ];
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:htc-${e.date}-${e.time ? e.time.replace(':', '') : 'dia'}@htc`, `DTSTAMP:${now}`);
    if (e.time) {
      const start = zonedToUtc(e.date, e.time, opts.tz);
      lines.push(`DTSTART:${stamp(start)}`, `DTEND:${stamp(new Date(start.getTime() + opts.minutes * 60000))}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${e.date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${addDays(e.date, 1).replace(/-/g, '')}`);
    }
    lines.push(`SUMMARY:${esc(eventTitle(e))}`);
    const detail = e.students.map((s) => (s.note ? `${s.name} (${s.note})` : s.name));
    if (e.students.length > 1 || e.students[0]?.note) lines.push(`DESCRIPTION:${esc(detail.join('\n'))}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

/** Minutos de cada clase en el calendario (HTC_CLASS_MIN; una hora si no está). */
export function classMinutes(): number {
  const n = Number(process.env.HTC_CLASS_MIN);
  return Number.isFinite(n) && n >= 15 && n <= 480 ? Math.round(n) : 60;
}
