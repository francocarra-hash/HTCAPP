import { useMemo, useState } from 'react';
import { ApiError } from '../api';
import {
  addDays, coachApi, emptySchedule, MONTH_NAMES, occurrences, parse, Schedule, Session, Student, todayIso, WEEKDAYS,
  WEEKDAYS_LONG, whenLabel, cap,
} from './data';
import { Icon } from './ui';

const pad = (n: number) => String(n).padStart(2, '0');

export function AgendaEditor({ student, sessions, toast, onSaved }: {
  student: Student; sessions: Session[]; toast: (m: string) => void; onSaved: (s: Student) => void;
}) {
  const [sched, setSched] = useState<Schedule>(student.schedule ?? emptySchedule());
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const today = todayIso();
  const [month, setMonth] = useState(today.slice(0, 7));

  const edit = (fn: (s: Schedule) => Schedule) => { setSched((s) => fn(s)); setDirty(true); };
  const weekly = (wd: number) => sched.weekly.find((w) => w.weekday === wd);
  const toggleDay = (wd: number) => edit((s) => ({
    ...s,
    weekly: weekly(wd) ? s.weekly.filter((w) => w.weekday !== wd) : [...s.weekly, { weekday: wd, time: s.weekly[0]?.time ?? '18:00' }].sort((a, b) => a.weekday - b.weekday),
  }));

  const next = useMemo(() => occurrences(sched, today, addDays(today, 90)).slice(0, 3), [sched, today]);

  // Calendario del mes (semanas de lunes a domingo).
  const [y, m] = month.split('-').map(Number) as [number, number];
  const first = `${month}-01`;
  const startOffset = (parse(first).getDay() + 6) % 7;
  const gridStart = addDays(first, -startOffset);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const occ = new Set(occurrences(sched, days[0]!, days[41]!).map((o) => o.date));
  const skip = new Set(sched.skip);
  const byDate = new Map<string, Session[]>();
  for (const s of sessions) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);
  const isDone = (s: Session) => s.status === 'done' || s.completions.some((c) => c.student_id === student.id && c.completed_at);

  const tapDay = (d: string) => {
    const wd = parse(d).getDay();
    if (weekly(wd) && d >= today) {
      const cancelled = skip.has(d);
      if (window.confirm(cancelled ? `¿Volver a agendar el ${WEEKDAYS_LONG[wd]} ${parse(d).getDate()}?` : `¿Cancelar la sesión del ${WEEKDAYS_LONG[wd]} ${parse(d).getDate()}?`)) {
        edit((s) => ({ ...s, skip: cancelled ? s.skip.filter((x) => x !== d) : [...s.skip, d] }));
      }
    } else if (d >= today && !sched.once.some((o) => o.date === d)) {
      if (window.confirm(`¿Agregar una sesión puntual el ${WEEKDAYS_LONG[wd]} ${parse(d).getDate()}?`)) {
        edit((s) => ({ ...s, once: [...s.once, { date: d, time: s.weekly[0]?.time ?? null, note: null }] }));
      }
    }
  };

  const save = async () => {
    setBusy(true); setErr('');
    try {
      const clean: Schedule = {
        weekly: sched.weekly,
        once: sched.once.filter((o) => o.date).sort((a, b) => a.date.localeCompare(b.date)),
        skip: sched.skip.filter((d) => d >= addDays(today, -60)),
      };
      const r = await coachApi.updateStudent(student.id, { schedule: clean });
      setDirty(false);
      onSaved(r.student);
      toast('Agenda guardada');
    } catch (e) { setErr((e as ApiError).message); } finally { setBusy(false); }
  };

  const shiftMonth = (n: number) => {
    const d = new Date(y, m - 1 + n, 1);
    setMonth(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  };

  return (
    <>
      <section className="card">
        <h2>Días fijos</h2>
        <div className="hint">Los días que entrena todas las semanas.</div>
        <div className="wdays" role="group" aria-label="Días de la semana">
          {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
            <button key={wd} type="button" aria-pressed={Boolean(weekly(wd))} onClick={() => toggleDay(wd)}>{WEEKDAYS[wd]}</button>
          ))}
        </div>
        {sched.weekly.length > 0 && (
          <div style={{ marginTop: 10 }}>
            {[...sched.weekly].sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7)).map((w) => (
              <div className="slot" key={w.weekday}>
                <b>{cap(WEEKDAYS_LONG[w.weekday]!)}</b>
                <input type="time" value={w.time ?? ''} aria-label={`Hora del ${WEEKDAYS_LONG[w.weekday]}`}
                  onChange={(e) => edit((s) => ({ ...s, weekly: s.weekly.map((x) => (x.weekday === w.weekday ? { ...x, time: e.target.value || null } : x)) }))} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-h">
          <h2>Fechas puntuales</h2>
          <button className="btn sm" onClick={() => edit((s) => ({ ...s, once: [...s.once, { date: today, time: s.weekly[0]?.time ?? null, note: null }] }))}>
            {Icon.plus} Agregar
          </button>
        </div>
        <div className="hint">Recuperatorios, cambios de día, sesiones extra.</div>
        {sched.once.length > 0 && (
          <div style={{ marginTop: 8 }}>
            {sched.once.map((o, i) => (
              <div className="slot" key={i} style={{ flexWrap: 'wrap' }}>
                <input type="date" value={o.date} aria-label="Fecha"
                  onChange={(e) => edit((s) => ({ ...s, once: s.once.map((x, k) => (k === i ? { ...x, date: e.target.value } : x)) }))} />
                <input type="time" value={o.time ?? ''} aria-label="Hora"
                  onChange={(e) => edit((s) => ({ ...s, once: s.once.map((x, k) => (k === i ? { ...x, time: e.target.value || null } : x)) }))} />
                <input className="grow" value={o.note ?? ''} placeholder="Nota (opcional)" aria-label="Nota"
                  onChange={(e) => edit((s) => ({ ...s, once: s.once.map((x, k) => (k === i ? { ...x, note: e.target.value || null } : x)) }))} />
                <button className="xbtn" aria-label="Quitar fecha" onClick={() => edit((s) => ({ ...s, once: s.once.filter((_, k) => k !== i) }))}>{Icon.x}</button>
              </div>
            ))}
          </div>
        )}
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
            const sk = skip.has(d) && Boolean(weekly(parse(d).getDay()));
            const cls = [
              'cday', d.slice(0, 7) !== month ? 'out' : '', d === today ? 'today' : '',
              done ? 'done' : occ.has(d) ? 'sched' : '', planned ? 'planned' : '', sk ? 'skip' : '',
            ].filter(Boolean).join(' ');
            return (
              <button key={d} className={cls} onClick={() => tapDay(d)}
                aria-label={`${d}${done ? ', entrenó' : ''}${occ.has(d) ? ', agendado' : ''}${planned ? ', rutina asignada' : ''}${sk ? ', cancelado' : ''}`}>
                {parse(d).getDate()}
              </button>
            );
          })}
        </div>
        <div className="cal-legend">
          <span><i style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent)' }} />Agendado</span>
          <span><i style={{ background: 'var(--good-fill)' }} />Entrenó</span>
          <span><i style={{ background: 'var(--accent)', borderRadius: '50%', width: 8, height: 8 }} />Rutina asignada</span>
        </div>
        <p className="hint">Tocá un día fijo para cancelarlo, o un día libre para sumar una sesión puntual.</p>
      </section>

      {next.length > 0 && (
        <section className="card">
          <div className="label">Próximas</div>
          <div className="chips-row" style={{ marginTop: 8 }}>
            {next.map((o) => <span className="mini" key={`${o.date}${o.time}`}>{cap(whenLabel(o))}</span>)}
          </div>
        </section>
      )}

      {err && <p className="err">{err}</p>}
      {dirty && (
        <div className="savebar">
          <button className="btn primary wide" disabled={busy} onClick={save}>{busy ? 'Guardando…' : 'Guardar agenda'}</button>
        </div>
      )}
    </>
  );
}
