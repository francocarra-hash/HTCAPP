import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '../api';
import {
  addDays, cap, coachApi, emptySchedule, firstName, longDate, MONTH_NAMES, parse, Schedule, Session, shortDate, Student, todayIso,
  WEEKDAYS, WEEKDAYS_LONG,
} from './data';
import {
  addClass, cancelClass, DayState, dayState, moveClass, restoreClass, setFixedTime, setTime, tidy, toggleFixed,
} from './agendaOps';
import { DateInput, Icon, Seg, Sheet } from './ui';

const pad = (n: number) => String(n).padStart(2, '0');
const PLURAL = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];
const same = (a: Schedule, b: Schedule) => JSON.stringify(a) === JSON.stringify(b);
const keep = (today: string) => addDays(today, -60);
const weekStart = (d: string) => addDays(d, -((parse(d).getDay() + 6) % 7));

/** Qué clase es, en pocas palabras (para la lista y la hoja). */
function classNote(st: DayState): string {
  if (st.kind !== 'class') return '';
  if (st.movedFrom) return `Pasada del ${shortDate(st.movedFrom)}`;
  if (st.usual) return `Sólo este día (siempre ${st.usual})`;
  if (!st.fixed) return st.note ? `Clase extra · ${st.note}` : 'Clase extra';
  return '';
}

type Mode = 'hora' | 'dia' | 'cancelar';

/**
 * Todo lo que se puede hacer con la clase de un día, en un solo lugar: cambiar
 * la hora, pasarla a otro día, cancelarla, volver a agendarla o sumar una. Cada
 * acción se guarda en el momento.
 */
export function ClassSheet({ student, date: date0, mode, pick, onClose, onSaved }: {
  student: { id: string; name: string; schedule: Schedule | null };
  date: string; mode?: Mode;
  /** Deja elegir el día arriba (para sumar una clase sin pasar por el calendario). */
  pick?: boolean;
  onClose: () => void; onSaved: (msg: string, student: Student) => void;
}) {
  const today = todayIso();
  const sched = student.schedule ?? emptySchedule();
  const [date, setDate] = useState(date0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const apply = async (next: Schedule, msg: string) => {
    if (same(next, sched)) { onClose(); return; }
    setBusy(true); setErr('');
    try {
      const r = await coachApi.updateStudent(student.id, { schedule: tidy(next, keep(today)) });
      onSaved(msg, r.student);
    } catch (e) { setErr((e as ApiError).message); setBusy(false); }
  };

  return (
    <Sheet title={pick ? `Sumar una clase · ${firstName(student.name)}` : `${cap(longDate(date))} · ${firstName(student.name)}`} onClose={onClose}>
      {pick && (
        <div className="fields" style={{ marginTop: 0 }}>
          <div className="field full"><label htmlFor="cs-dia">Día</label><DateInput id="cs-dia" value={date} min={today} onChange={(e) => e.target.value && setDate(e.target.value)} /></div>
        </div>
      )}
      <ClassBody key={date} sched={sched} date={date} today={today} mode={mode} busy={busy} apply={apply} />
      {err && <p className="err">{err}</p>}
    </Sheet>
  );
}

function ClassBody({ sched, date, today, mode: mode0, busy, apply }: {
  sched: Schedule; date: string; today: string; mode?: Mode; busy: boolean; apply: (next: Schedule, msg: string) => void;
}) {
  const st = dayState(sched, date);
  const wd = parse(date).getDay();
  const [mode, setMode] = useState<Mode>(mode0 ?? 'hora');
  const [time, setTimeV] = useState(st.kind === 'free' ? sched.weekly[0]?.time ?? '' : st.time ?? '');
  const [scope, setScope] = useState<'uno' | 'todos'>('uno');
  const [to, setTo] = useState(addDays(date, 1));
  const [note, setNote] = useState('');
  const dayTxt = `${WEEKDAYS_LONG[wd]} ${parse(date).getDate()}`;

  if (date < today) return <p className="hint">Este día ya pasó. La asistencia se marca en Hoy.</p>;

  if (st.kind === 'free') {
    return (
      <>
        <p className="hint" style={{ margin: 0 }}>No tiene clase este día. Podés sumarle una (recuperatorio, clase extra).</p>
        <div className="fields" style={{ marginTop: 0 }}>
          <div className="field"><label htmlFor="cs-h">Hora</label><input id="cs-h" type="time" value={time} onChange={(e) => setTimeV(e.target.value)} /></div>
          <div className="field"><label htmlFor="cs-n">Nota (opcional)</label><input id="cs-n" value={note} maxLength={120} placeholder="Recuperatorio" onChange={(e) => setNote(e.target.value)} /></div>
        </div>
        <button className="btn primary wide" disabled={busy} onClick={() => apply(addClass(sched, date, time || null, note), `Clase sumada el ${shortDate(date)}`)}>
          {busy ? 'Guardando…' : 'Sumar clase'}
        </button>
      </>
    );
  }

  if (st.kind === 'cancelled') {
    return (
      <>
        <p className="cls-now">{st.movedTo
          ? <>Esta clase se pasó al <b>{longDate(st.movedTo)}</b>.</>
          : <>La clase del {dayTxt} está <b>cancelada</b>.</>}</p>
        <button className="btn primary wide" disabled={busy} onClick={() => apply(restoreClass(sched, date), st.movedTo ? `La clase volvió al ${shortDate(date)}` : 'Clase agendada de nuevo')}>
          {busy ? 'Guardando…' : st.movedTo ? `Volver la clase al ${dayTxt}` : `Volver a agendar${st.time ? ` a las ${st.time}` : ''}`}
        </button>
      </>
    );
  }

  const info = classNote(st);
  const timeNext = scope === 'todos' && st.fixed ? setFixedTime(sched, date, time || null) : setTime(sched, date, time || null);
  const taken = to !== date && dayState(sched, to).kind === 'class';
  const otherWeek = weekStart(to) !== weekStart(st.movedFrom ?? date);
  return (
    <>
      <p className="cls-now"><b>{st.time ?? 'Sin hora'}</b>{st.fixed && !st.usual ? ` · Clase de todos los ${PLURAL[wd]}` : info ? ` · ${info}` : ''}</p>
      <Seg small value={mode} onChange={setMode} options={[['hora', 'Cambiar hora'], ['dia', 'Pasar de día'], ['cancelar', 'Cancelar']]} />

      {mode === 'hora' && (
        <>
          <div className="fields" style={{ marginTop: 0 }}>
            <div className="field full"><label htmlFor="cs-h">Hora nueva</label><input id="cs-h" type="time" value={time} onChange={(e) => setTimeV(e.target.value)} /></div>
          </div>
          {st.fixed && (
            <Seg small value={scope} onChange={setScope} options={[['uno', 'Sólo este día'], ['todos', `Todos los ${PLURAL[wd]}`]]} />
          )}
          <p className="hint" style={{ margin: 0 }}>
            {scope === 'todos' && st.fixed
              ? `Cambia el horario fijo de los ${PLURAL[wd]}, de acá en adelante.`
              : st.fixed ? 'Las demás semanas siguen con su horario de siempre.' : 'Sólo cambia la hora de esta clase.'}
          </p>
          <button className="btn primary wide" disabled={busy || same(timeNext, sched)}
            onClick={() => apply(timeNext, scope === 'todos' && st.fixed ? `Los ${PLURAL[wd]}, ${time || 'sin hora'}` : `Clase del ${shortDate(date)}: ${time || 'sin hora'}`)}>
            {busy ? 'Guardando…' : 'Guardar la hora'}
          </button>
        </>
      )}

      {mode === 'dia' && (
        <>
          <div className="fields" style={{ marginTop: 0 }}>
            <div className="field"><label htmlFor="cs-a">Nuevo día</label><DateInput id="cs-a" value={to} min={today} onChange={(e) => e.target.value && setTo(e.target.value)} /></div>
            <div className="field"><label htmlFor="cs-ah">Hora</label><input id="cs-ah" type="time" value={time} onChange={(e) => setTimeV(e.target.value)} /></div>
          </div>
          <p className={taken ? 'err' : 'hint'} style={{ margin: 0 }}>
            {taken ? `El ${longDate(to)} ya tiene clase. Elegí otro día.`
              : to === date ? 'Elegí un día distinto.'
              : otherWeek ? `Pasa al ${longDate(to)}. Ojo: es de otra semana.`
              : `Pasa al ${longDate(to)}. Se cuenta una sola vez: sale del ${dayTxt} y aparece en el día nuevo.`}
          </p>
          <button className="btn primary wide" disabled={busy || taken || to === date || to < today}
            onClick={() => apply(moveClass(sched, date, to, time || null), `Clase pasada al ${shortDate(to)}`)}>
            {busy ? 'Guardando…' : 'Pasar la clase'}
          </button>
        </>
      )}

      {mode === 'cancelar' && (
        <>
          <p className="hint" style={{ margin: 0 }}>
            Se cancela la clase del {dayTxt} y no se pasa a otro día.
            {st.fixed ? ' Las demás semanas quedan igual. Después podés volver a agendarla tocando el día.' : ''}
            {st.movedFrom ? ` Tampoco vuelve al ${shortDate(st.movedFrom)}.` : ''}
          </p>
          <button className="btn danger wide" disabled={busy} onClick={() => apply(cancelClass(sched, date), `Clase del ${shortDate(date)} cancelada`)}>
            {busy ? 'Guardando…' : 'Cancelar esta clase'}
          </button>
        </>
      )}
    </>
  );
}

/** Hora de un día fijo: se guarda al salir del campo (no en cada vuelta de la ruedita del teléfono). */
function TimeField({ value, label, onCommit }: { value: string | null; label: string; onCommit: (t: string | null) => void }) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => setV(value ?? ''), [value]);
  return (
    <input type="time" value={v} aria-label={label} onChange={(e) => setV(e.target.value)}
      onBlur={() => { if ((v || null) !== value) onCommit(v || null); }} />
  );
}

export function AgendaEditor({ student, sessions, toast, onSaved }: {
  student: Student; sessions: Session[]; toast: (m: string) => void; onSaved: (s: Student) => void;
}) {
  const [sched, setSched] = useState<Schedule>(student.schedule ?? emptySchedule());
  const [err, setErr] = useState('');
  const [open, setOpen] = useState<{ date: string; pick?: boolean } | null>(null);
  const today = todayIso();
  const [month, setMonth] = useState(today.slice(0, 7));

  // Los días fijos se guardan solos, de a uno y en orden.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef(0);
  useEffect(() => { if (!pending.current) setSched(student.schedule ?? emptySchedule()); }, [student.schedule]);
  const persist = (next: Schedule, msg: string) => {
    setSched(next); setErr('');
    pending.current++;
    queue.current = queue.current.then(async () => {
      try {
        const r = await coachApi.updateStudent(student.id, { schedule: tidy(next, keep(today)) });
        pending.current--;
        onSaved(r.student);
        if (!pending.current) toast(msg);
      } catch (e) {
        pending.current--;
        setErr(`No se pudo guardar: ${(e as ApiError).message}`);
        setSched(student.schedule ?? emptySchedule());
      }
    });
  };

  const fixed = (wd: number) => sched.weekly.find((w) => w.weekday === wd);

  // Lo que viene: las próximas clases y los días fijos cancelados entre medio.
  const upcoming = useMemo(() => {
    const out: Array<{ date: string; st: DayState }> = [];
    let classes = 0;
    for (let d = today, i = 0; i < 90 && classes < 6; d = addDays(d, 1), i++) {
      const st = dayState(sched, d);
      if (st.kind === 'class') { out.push({ date: d, st }); classes++; }
      else if (st.kind === 'cancelled' && !st.movedTo) out.push({ date: d, st });
    }
    while (out.length && out[out.length - 1]!.st.kind !== 'class') out.pop();
    return out;
  }, [sched, today]);

  // Calendario del mes (semanas de lunes a domingo).
  const [y, m] = month.split('-').map(Number) as [number, number];
  const first = `${month}-01`;
  const gridStart = addDays(first, -((parse(first).getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const byDate = new Map<string, Session[]>();
  for (const s of sessions) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);
  const isDone = (s: Session) => s.status === 'done' || s.completions.some((c) => c.student_id === student.id && c.completed_at);
  const shiftMonth = (n: number) => {
    const d = new Date(y, m - 1 + n, 1);
    setMonth(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  };
  const firstFree = () => {
    for (let d = addDays(today, 1), i = 0; i < 30; d = addDays(d, 1), i++) if (dayState(sched, d).kind === 'free') return d;
    return addDays(today, 1);
  };

  return (
    <>
      <section className="card">
        <h2>Horario fijo</h2>
        <div className="hint">Los días que entrena todas las semanas. Tocá un día para sumarlo o sacarlo; se guarda solo.</div>
        <div className="wdays" role="group" aria-label="Días de la semana">
          {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
            <button key={wd} type="button" aria-pressed={Boolean(fixed(wd))}
              onClick={() => persist(toggleFixed(sched, wd), fixed(wd) ? `${cap(PLURAL[wd]!)}: fuera del horario` : `${cap(PLURAL[wd]!)}: sumado al horario`)}>
              {WEEKDAYS[wd]}
            </button>
          ))}
        </div>
        {sched.weekly.length > 0 && (
          <div style={{ marginTop: 10 }}>
            {[...sched.weekly].sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7)).map((w) => (
              <div className="slot" key={w.weekday}>
                <b>{cap(WEEKDAYS_LONG[w.weekday]!)}</b>
                <TimeField value={w.time} label={`Hora de los ${PLURAL[w.weekday]}`}
                  onCommit={(t) => persist({ ...sched, weekly: sched.weekly.map((x) => (x.weekday === w.weekday ? { ...x, time: t } : x)) }, `${cap(PLURAL[w.weekday]!)}, ${t ?? 'sin hora'}`)} />
              </div>
            ))}
          </div>
        )}
        {err && <p className="err">{err}</p>}
      </section>

      <section className="card">
        <div className="card-h">
          <h2>Próximas clases</h2>
          <button className="btn sm" onClick={() => setOpen({ date: firstFree(), pick: true })}>{Icon.plus} Sumar clase</button>
        </div>
        <div className="hint">Tocá una clase para cambiarle la hora, pasarla a otro día o cancelarla.</div>
        {upcoming.length ? (
          <div className="rows">
            {upcoming.map(({ date, st }) => (
              <button key={date} className={`frow clsrow${st.kind === 'cancelled' ? ' off' : ''}`} onClick={() => setOpen({ date })}>
                <span className="fw">
                  <b>{date === today ? 'Hoy' : date === addDays(today, 1) ? 'Mañana' : cap(longDate(date))}</b>
                  {(st.kind === 'cancelled' || classNote(st)) && <small>{st.kind === 'cancelled' ? 'Cancelada' : classNote(st)}</small>}
                </span>
                <span className="cls-t">{st.kind === 'class' ? st.time ?? 'Sin hora' : '—'}</span>
                <span className="cls-go" aria-hidden="true">›</span>
              </button>
            ))}
          </div>
        ) : <p className="hint">Sin clases por delante. Marcá sus días fijos arriba o sumale una clase.</p>}
      </section>

      <section className="card">
        <div className="cal-h">
          <button className="iconbtn" aria-label="Mes anterior" onClick={() => shiftMonth(-1)}>{Icon.back}</button>
          <b>{MONTH_NAMES[m - 1]} {y}</b>
          <button className="iconbtn" aria-label="Mes siguiente" onClick={() => shiftMonth(1)} style={{ transform: 'scaleX(-1)' }}>{Icon.back}</button>
        </div>
        <div className="cal-g">
          {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => <span className="wd" key={i}>{d}</span>)}
          {days.map((d) => {
            const sess = byDate.get(d) ?? [];
            const done = sess.some(isDone);
            const planned = sess.some((s) => !isDone(s));
            const st = dayState(sched, d);
            const cls = [
              'cday', d.slice(0, 7) !== month ? 'out' : '', d === today ? 'today' : '',
              done ? 'done' : st.kind === 'class' ? 'sched' : '', planned ? 'planned' : '', st.kind === 'cancelled' ? 'skip' : '',
            ].filter(Boolean).join(' ');
            return (
              <button key={d} className={cls} onClick={() => d >= today && setOpen({ date: d })}
                aria-label={`${longDate(d)}${done ? ', entrenó' : ''}${st.kind === 'class' ? `, clase${st.time ? ` a las ${st.time}` : ''}` : ''}${planned ? ', rutina asignada' : ''}${st.kind === 'cancelled' ? ', cancelada' : ''}`}>
                {parse(d).getDate()}
              </button>
            );
          })}
        </div>
        <div className="cal-legend">
          <span><i style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent)' }} />Clase</span>
          <span><i style={{ background: 'var(--good-fill)' }} />Entrenó</span>
          <span><i style={{ background: 'var(--accent)', borderRadius: '50%', width: 8, height: 8 }} />Rutina asignada</span>
          <span><s>12</s>&nbsp;Cancelada</span>
        </div>
        <p className="hint">Tocá cualquier día de hoy en adelante: si tiene clase la cambiás, y si está libre le sumás una.</p>
      </section>

      {open && (
        <ClassSheet student={{ id: student.id, name: student.name, schedule: sched }} date={open.date} pick={open.pick}
          onClose={() => setOpen(null)}
          onSaved={(msg, st) => { setOpen(null); setSched(st.schedule ?? emptySchedule()); onSaved(st); toast(msg); }} />
      )}
    </>
  );
}

/** Suscripción del calendario del teléfono o la computadora a las clases de la agenda. */
export function CalendarSheet({ onClose, toast }: { onClose: () => void; toast: (m: string) => void }) {
  const [link, setLink] = useState<{ path: string; minutes: number } | null>(null);
  const [err, setErr] = useState('');
  const [renew, setRenew] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { coachApi.calendarLink().then(setLink).catch((e: ApiError) => setErr(e.message)); }, []);

  const url = link ? `${window.location.origin}${link.path}` : '';
  const webcal = url.replace(/^https?:/, 'webcal:');
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast('Enlace copiado'); } catch { toast('No se pudo copiar: mantené apretado el enlace'); }
  };
  const reset = async () => {
    setBusy(true);
    try { setLink(await coachApi.resetCalendarLink()); setRenew(false); toast('Enlace nuevo listo'); } catch (e) { setErr((e as ApiError).message); } finally { setBusy(false); }
  };
  const dur = link ? (link.minutes === 60 ? '1 hora' : link.minutes % 60 ? `${link.minutes} minutos` : `${link.minutes / 60} horas`) : '';

  return (
    <Sheet title="Las clases en tu calendario" onClose={onClose}>
      <p className="hint" style={{ margin: 0 }}>
        Sumá la agenda de HTC al calendario de tu iPhone o tu Mac: vas a ver las clases de todos los alumnos con su día y hora, y se actualiza sola cuando cambiás algo en la app.
      </p>
      {err && <p className="err">{err}</p>}
      {link && (
        <>
          <div className="actions" style={{ marginTop: 0 }}>
            <a className="btn primary" href={webcal}>{Icon.calendar} Agregar a mi calendario</a>
            <button className="btn" onClick={copy}>{Icon.copy} Copiar enlace</button>
          </div>
          <ul className="callist">
            <li>Abrí esta pantalla <b>desde el iPhone o la Mac</b> donde querés ver las clases y tocá "Agregar a mi calendario".</li>
            <li>Los cambios se hacen en la app: el calendario sólo los muestra. Puede tardar de unos minutos a unas horas en reflejarlos.</li>
            <li>Cada clase figura con {dur} de duración. Las clases compartidas van juntas, con el nombre de todos.</li>
            <li>En Google Calendar: "Otros calendarios → Desde URL" y pegá el enlace copiado.</li>
            <li>Quien tenga el enlace puede ver tus clases: no lo compartas.</li>
          </ul>
          {renew ? (
            <div className="phase warn" style={{ marginTop: 0 }}>
              <span className="ph-tag">Ojo</span>
              <div>
                El enlace de ahora deja de funcionar y vas a tener que agregar el nuevo a tu calendario.
                <div className="actions" style={{ marginTop: 8 }}>
                  <button className="btn sm" disabled={busy} onClick={reset}>{busy ? 'Generando…' : 'Generar enlace nuevo'}</button>
                  <button className="btn sm ghost" onClick={() => setRenew(false)}>No, dejarlo</button>
                </div>
              </div>
            </div>
          ) : (
            <button className="linkbtn" style={{ justifySelf: 'start', fontSize: 13 }} onClick={() => setRenew(true)}>¿Lo compartiste sin querer? Generar un enlace nuevo</button>
          )}
        </>
      )}
      {!link && !err && <p className="hint">Preparando el enlace…</p>}
    </Sheet>
  );
}
