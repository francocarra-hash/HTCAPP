/**
 * Cambios sobre la agenda de un alumno, uno por acción: cambiar la hora de una
 * clase, pasarla a otro día, cancelarla, volver a agendarla o sumar una extra.
 * Son funciones puras (devuelven la agenda nueva) y no dependen del resto de
 * la app, para poder probarlas solas.
 *
 * Cómo se guarda cada cosa:
 *  - Día fijo cancelado: la fecha queda en `skip`.
 *  - Clase pasada de día: la fecha original en `skip` y una fecha puntual en el
 *    día nuevo con `from` = día original.
 *  - Hora cambiada sólo un día: la fecha en `skip` y una fecha puntual ese
 *    mismo día con la hora nueva.
 *  - Clase extra: una fecha puntual sin `from`.
 */
export interface Sched {
  weekly: Array<{ weekday: number; time: string | null }>;
  once: Array<{ date: string; time: string | null; note?: string | null; from?: string | null }>;
  skip: string[];
}

export type DayState =
  | {
    kind: 'class'; time: string | null; fixed: boolean;
    /** Día del que se pasó esta clase. */
    movedFrom: string | null;
    /** Hora de siempre, cuando la de este día es distinta. */
    usual: string | null;
    note: string | null;
  }
  | { kind: 'cancelled'; time: string | null; movedTo: string | null }
  | { kind: 'free' };

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const parts = (iso: string): [number, number, number] => iso.split('-').map(Number) as [number, number, number];
export const weekdayOf = (iso: string): number => { const [y, m, d] = parts(iso); return new Date(y, m - 1, d).getDay(); };
const short = (iso: string): string => { const [, m, d] = parts(iso); return `${d} ${MONTHS[m - 1]}`; };
const RETIME = 'Cambio de hora';

const fixedOn = (s: Sched, date: string) => s.weekly.find((w) => w.weekday === weekdayOf(date));

/** Qué pasa ese día: hay clase, está cancelada (o pasada a otro día) o está libre. */
export function dayState(s: Sched, date: string): DayState {
  const w = fixedOn(s, date);
  const skipped = s.skip.includes(date);
  if (w && !skipped) return { kind: 'class', time: w.time, fixed: true, movedFrom: null, usual: null, note: null };
  const o = s.once.find((x) => x.date === date);
  if (o) {
    const movedFrom = o.from && o.from !== date ? o.from : null;
    const retimed = Boolean(w) && !movedFrom;
    return {
      kind: 'class', time: o.time, fixed: retimed, movedFrom,
      usual: retimed && w!.time !== o.time ? w!.time : null,
      note: retimed || movedFrom ? null : o.note ?? null,
    };
  }
  if (w) return { kind: 'cancelled', time: w.time, movedTo: s.once.find((x) => x.from === date)?.date ?? null };
  return { kind: 'free' };
}

const uniq = (xs: string[]): string[] => [...new Set(xs)];

/** Cambia la hora de la clase de ese día, sin tocar las demás semanas. */
export function setTime(s: Sched, date: string, time: string | null): Sched {
  const st = dayState(s, date);
  if (st.kind !== 'class' || st.time === time) return s;
  const w = fixedOn(s, date);
  const here = s.once.find((x) => x.date === date);
  if (!here) return { ...s, skip: uniq([...s.skip, date]), once: [...s.once, { date, time, note: RETIME, from: null }] };
  // Volvió a la hora de siempre: se saca el cambio de ese día.
  if (w && !st.movedFrom && w.time === time) return { ...s, skip: s.skip.filter((x) => x !== date), once: s.once.filter((x) => x !== here) };
  return { ...s, once: s.once.map((x) => (x === here ? { ...x, time } : x)) };
}

/** Cambia la hora de un día fijo para todas las semanas (y saca el cambio puntual de ese día, si lo había). */
export function setFixedTime(s: Sched, date: string, time: string | null): Sched {
  const wd = weekdayOf(date);
  const here = s.once.find((x) => x.date === date && !(x.from && x.from !== date));
  const base = here && s.skip.includes(date)
    ? { ...s, skip: s.skip.filter((x) => x !== date), once: s.once.filter((x) => x !== here) }
    : s;
  return { ...base, weekly: base.weekly.map((w) => (w.weekday === wd ? { ...w, time } : w)) };
}

/** Pasa la clase de un día a otro. La clase se cuenta una sola vez. */
export function moveClass(s: Sched, from: string, to: string, time: string | null): Sched {
  if (from === to) return setTime(s, from, time);
  const st = dayState(s, from);
  if (st.kind !== 'class') return s;
  const here = s.once.find((x) => x.date === from);
  if (!here || (fixedOn(s, from) && !s.skip.includes(from))) {
    // Clase de un día fijo.
    return {
      ...s, skip: uniq([...s.skip, from]),
      once: [...s.once.filter((x) => x.from !== from), { date: to, time, note: `Pasada del ${short(from)}`, from }],
    };
  }
  const origin = st.movedFrom ?? (st.fixed ? from : null);
  const rest = s.once.filter((x) => x !== here);
  // Clase extra: sólo cambia de fecha.
  if (!origin) return { ...s, once: [...rest, { ...here, date: to, time }] };
  // Vuelve a su día original: se deshace el cambio.
  if (to === origin) {
    const back = { ...s, skip: s.skip.filter((x) => x !== origin), once: rest };
    return dayState(back, origin).kind === 'class' ? setTime(back, origin, time) : addClass(back, origin, time);
  }
  return { ...s, skip: uniq([...s.skip, origin]), once: [...rest, { date: to, time, note: `Pasada del ${short(origin)}`, from: origin }] };
}

/** Cancela la clase de ese día (no se pasa a otro). */
export function cancelClass(s: Sched, date: string): Sched {
  const st = dayState(s, date);
  if (st.kind !== 'class') return s;
  const here = s.once.find((x) => x.date === date);
  if (here && (!fixedOn(s, date) || s.skip.includes(date))) return { ...s, once: s.once.filter((x) => x !== here) };
  return { ...s, skip: uniq([...s.skip, date]) };
}

/** Vuelve a agendar un día fijo cancelado; si la clase se había pasado a otro día, vuelve a éste. */
export function restoreClass(s: Sched, date: string): Sched {
  return { ...s, skip: s.skip.filter((x) => x !== date), once: s.once.filter((x) => x.from !== date) };
}

/** Suma una clase extra un día libre. */
export function addClass(s: Sched, date: string, time: string | null, note?: string | null): Sched {
  if (dayState(s, date).kind === 'class') return s;
  return { ...s, once: [...s.once, { date, time, note: note?.trim() || null }] };
}

/** Agrega o saca un día fijo. Al agregar, toma la hora de los otros días. */
export function toggleFixed(s: Sched, weekday: number): Sched {
  if (s.weekly.some((w) => w.weekday === weekday)) return { ...s, weekly: s.weekly.filter((w) => w.weekday !== weekday) };
  return { ...s, weekly: [...s.weekly, { weekday, time: s.weekly[0]?.time ?? '18:00' }].sort((a, b) => a.weekday - b.weekday) };
}

/** Ordena y limpia antes de guardar: saca los días cancelados de hace más de dos meses. */
export function tidy(s: Sched, oldest: string): Sched {
  return {
    weekly: s.weekly,
    once: s.once.filter((o) => o.date).sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '')),
    skip: uniq(s.skip).filter((d) => d >= oldest).sort(),
  };
}
