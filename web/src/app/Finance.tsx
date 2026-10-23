import { ReactNode, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api';
import {
  addDays, Billing, cap, coachApi, emptyBilling, Estado, FinanceStudent, longDate, Mark, parse, Schedule, shortDate,
  WEEKDAYS, firstName, emptySchedule, Modalidad,
} from './data';
import {
  ESTADO_LABEL, Fin, MARKS, MOD_LABEL, money, monthName, queCubre, shiftYM, StudentReport, urgente, weekOf, ym,
  fmtLong, PayState,
} from './billing';
import { Enter, Icon, Seg, Sheet, Skeleton, TopHeader } from './ui';
import { Avatar } from './social';

export type OpenStudent = (id: string, tab?: 'rutina' | 'pagos' | 'informes' | 'agenda') => void;
type Toast = (m: string) => void;

const Pill = ({ c }: { c: { t: string; cls: string } }) => <span className={`pill ${c.cls}`}>{c.t}</span>;

// ── Hoy: agenda del día (sin plata: la app puede estar abierta en clase) ───

const mins = (t: string): number => { const [h, m] = t.split(':').map(Number); return (h ?? 0) * 60 + (m ?? 0); };
const enCuanto = (n: number): string => (n < 60 ? `${n} min` : n % 60 ? `${Math.floor(n / 60)} h ${n % 60} min` : `${n / 60} h`);

export function HoyView({ fin, right, onOpen, onAttendance, reload, toast }: {
  fin: Fin | null; right: ReactNode; onOpen: OpenStudent; reload: () => void; toast: Toast;
  onAttendance: (ids: string[], day: string, mark: Mark | null) => void;
}) {
  const [day, setDay] = useState<string | null>(null);
  const [moving, setMoving] = useState<{ id: string; de?: string } | null>(null);
  const today = fin?.today ?? '';
  const f = day ?? today;

  if (!fin) {
    return (
      <>
        <TopHeader title="Hoy" right={right} />
        <Skeleton />
      </>
    );
  }
  const hoy = fin.programados(today);
  const presentes = hoy.filter((x) => fin.marca(x.s.id, today) === 'p').length;
  const informes = fin.activos().map((s) => ({ s, r: fin.informePendiente(s) })).filter((x) => x.r);
  const cerca = fin.activos().filter((s) => !fin.isAsinc(s)).map((s) => ({ s, n: fin.racha(s) })).filter((x) => x.n >= 2).sort((a, b) => b.n - a.n);
  const asinc = fin.activos().filter(fin.isAsinc).map((s) => ({ s, p: fin.estadoProg(s) }));

  const progHoy = async (s: FinanceStudent) => {
    try {
      await coachApi.updateStudent(s.id, { billing: { ...fin.billing(s), prog_enviada: today, prog_pendiente: false } });
      toast('Programación registrada');
      reload();
    } catch (e) { toast((e as ApiError).message); }
  };

  const sub = hoy.length
    ? <><span>{cap(longDate(today))}</span><span>{hoy.length === 1 ? '1 alumno' : `${hoy.length} alumnos`} hoy{presentes ? ` · ${presentes} presentes` : ''}</span></>
    : <span>{cap(longDate(today))}</span>;

  return (
    <>
      <TopHeader title="Hoy en HTC" sub={sub} right={right} />
      <Enter>
        <Ahora fin={fin} onOpen={onOpen} onAttendance={onAttendance} />

        <Attendance fin={fin} day={f} setDay={setDay} onOpen={onOpen} onAttendance={onAttendance} onMove={(id, de) => setMoving({ id, de })} reload={reload} toast={toast} />

        {informes.length > 0 && (
          <section className="card">
            <div className="card-h"><h2>Informes para entregar</h2><span className="mini">cada 4 semanas</span></div>
            <div className="rows">
              {informes.map(({ s, r }) => (
                <button key={s.id} className="frow" onClick={() => onOpen(s.id, 'informes')}>
                  <span className="fw"><b>{s.name}</b><small>Ciclo {r!.n} · {shortDate(r!.start)} al {shortDate(r!.end)}</small></span>
                  <span className="pill low">Preparar</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {cerca.length > 0 && (
          <section className="card">
            <div className="card-h"><h2>Para seguir de cerca</h2></div>
            <div className="rows">
              {cerca.map(({ s, n }) => (
                <button key={s.id} className="frow" onClick={() => onOpen(s.id, 'agenda')}>
                  <span className="fw"><b>{s.name}</b><small>{fin.billing(s).enfoque || MOD_LABEL[fin.billing(s).modalidad]}</small></span>
                  <span className="pill bad">Faltó las últimas {n}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {asinc.length > 0 && (
          <section className="card">
            <div className="card-h"><h2>Programaciones</h2><span className="mini">cada 4 semanas</span></div>
            <div className="rows">
              {asinc.map(({ s, p }) => (
                <div key={s.id} className="frow">
                  <button className="fw" onClick={() => onOpen(s.id, 'rutina')}>
                    <b>{s.name}</b>
                    <small>{fin.billing(s).prog_pendiente ? 'Falta armarla y mandarla' : fin.billing(s).prog_enviada ? `Última enviada el ${shortDate(fin.billing(s).prog_enviada!)}` : 'Sin envío registrado'}</small>
                  </button>
                  <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Pill c={p} /><button className="btn sm" onClick={() => progHoy(s)}>Enviada hoy</button></span>
                </div>
              ))}
            </div>
          </section>
        )}
        <p className="hint" style={{ textAlign: 'center', marginTop: 16 }}>Los horarios salen de la Agenda de cada alumno. Pagos y cobros, en Finanzas.</p>
      </Enter>
      {moving && <MoveSheet fin={fin} studentId={moving.id} de={moving.de} onClose={() => setMoving(null)} onSaved={(msg) => { setMoving(null); reload(); toast(msg); }} />}
    </>
  );
}

/** La clase que está pasando (o la próxima de hoy): acceso directo a la rutina de cada uno. */
function Ahora({ fin, onOpen, onAttendance }: {
  fin: Fin; onOpen: OpenStudent; onAttendance: (ids: string[], day: string, mark: Mark | null) => void;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  const today = fin.today;
  const rows = fin.programados(today).filter((r) => r.time);
  const times = [...new Set(rows.map((r) => r.time))].sort();
  const cur = now.getHours() * 60 + now.getMinutes();
  // En curso: empezó hace menos de una hora (o empieza en 10 minutos).
  const curT = [...times].reverse().find((t) => mins(t) - 10 <= cur && cur < mins(t) + 60);
  const nextT = times.find((t) => mins(t) > cur);
  const t = curT ?? nextT;
  if (!t) return null;
  const group = rows.filter((r) => r.time === t).sort((a, b) => a.s.name.localeCompare(b.s.name));
  const sinMarcar = group.filter((r) => !fin.marca(r.s.id, today)).map((r) => r.s.id);
  const live = Boolean(curT);
  return (
    <section className={`card now-card${live ? ' live' : ''}`}>
      <div className="now-h">
        <span className="now-tag">{live ? 'Ahora' : 'Próxima clase'}</span>
        <b>{t}</b>
        {!live && <small>en {enCuanto(mins(t) - cur)}</small>}
      </div>
      <div className="rows">
        {group.map((r) => {
          const mk = fin.marca(r.s.id, today);
          return (
            <button key={r.s.id} className="frow now-row" onClick={() => onOpen(r.s.id, 'rutina')}>
              <Avatar id={r.s.id} name={r.s.name} size={40} />
              <span className="fw">
                <b>{r.s.name}{fin.billing(r.s).rehab && <span className="tag rehab">Rehab</span>}</b>
                <small>{[r.planned ? 'Rutina asignada' : 'Ver rutina', fin.billing(r.s).enfoque, mk ? MARKS[mk].label : null].filter(Boolean).join(' · ')}</small>
              </span>
              <span className="chev" aria-hidden="true">›</span>
            </button>
          );
        })}
      </div>
      {live && sinMarcar.length > 0 && (
        <button className="btn wide" style={{ marginTop: 8 }} onClick={() => onAttendance(sinMarcar, today, 'p')}>
          {sinMarcar.length === group.length ? (group.length === 1 ? 'Marcar presente' : 'Marcar a todos presentes') : `Marcar presentes a los ${sinMarcar.length} que faltan`}
        </button>
      )}
    </section>
  );
}

function PayRow({ fin, s, c, onClick }: { fin: Fin; s: FinanceStudent; c: PayState; onClick: () => void }) {
  return (
    <button className="frow" onClick={onClick}>
      <span className="fw">
        <b>{s.name}{fin.billing(s).rehab && <span className="tag rehab">Rehab</span>}</b>
        <small>{MOD_LABEL[fin.billing(s).modalidad]} · {fin.modoTxt(s)}</small>
      </span>
      <span className="fr-r"><span className="amt">{money(c.monto)}</span><Pill c={c} /></span>
    </button>
  );
}

function Attendance({ fin, day, setDay, onOpen, onAttendance, onMove, reload, toast }: {
  fin: Fin; day: string; setDay: (d: string) => void; onOpen: OpenStudent; reload: () => void; toast: Toast;
  onAttendance: (ids: string[], day: string, mark: Mark | null) => void; onMove: (id: string, de: string) => void;
}) {
  const [extra, setExtra] = useState('');
  const week = weekOf(day);
  const list = fin.programados(day);
  const extras = fin.students.filter((s) => fin.marcaExplicita(s.id, day) && !list.some((x) => x.s.id === s.id))
    .map((s) => ({ s, time: '', from: null, planned: false, extra: true }));
  const rows = [...list.map((x) => ({ ...x, extra: false })), ...extras]
    .sort((a, b) => (a.time || '99').localeCompare(b.time || '99') || a.s.name.localeCompare(b.s.name));
  const byTime = new Map<string, number>();
  for (const r of rows) if (r.time) byTime.set(r.time, (byTime.get(r.time) ?? 0) + 1);
  const moved = fin.movidosDesde(day);
  const others = fin.students.filter((s) => fin.estado(s).estado !== 'baja' && !fin.isAsinc(s) && !rows.some((r) => r.s.id === s.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  const undo = async (s: FinanceStudent) => {
    const sc = s.schedule ?? emptySchedule();
    try {
      await coachApi.updateStudent(s.id, { schedule: { ...sc, skip: sc.skip.filter((x) => x !== day), once: sc.once.filter((o) => o.from !== day) } });
      toast('Cambio deshecho');
      reload();
    } catch (e) { toast((e as ApiError).message); }
  };

  let lastTime: string | null = null;
  return (
    <section className="card">
      <div className="card-h">
        <h2>Agenda</h2>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn sm" aria-label="Semana anterior" onClick={() => setDay(addDays(day, -7))}>‹</button>
          <button className="btn sm" onClick={() => setDay(fin.today)}>Hoy</button>
          <button className="btn sm" aria-label="Semana siguiente" onClick={() => setDay(addDays(day, 7))}>›</button>
        </div>
      </div>
      <div className="wk-strip">
        {week.map((w) => {
          const n = fin.programados(w).length;
          return (
            <button key={w} className={`wk-day${w === fin.today ? ' today' : ''}`} aria-pressed={w === day} onClick={() => setDay(w)}>
              <small>{WEEKDAYS[parse(w).getDay()]}</small><b>{parse(w).getDate()}</b><i>{n ? `${n} al.` : '—'}</i>
            </button>
          );
        })}
      </div>
      <div className="hint" style={{ margin: '10px 0 2px', fontWeight: 600, color: 'var(--ink-2)' }}>{cap(longDate(day))}</div>
      {!rows.length && <p className="hint">Nadie tiene clase este día. Los horarios se cargan en la Agenda de cada alumno; mientras tanto, sumalos abajo.</p>}
      <div className="rows">
        {rows.map((r) => {
          const head = r.time && r.time !== lastTime && (byTime.get(r.time) ?? 0) > 1 ? r.time : null;
          lastTime = r.time || lastTime;
          const mk = fin.marca(r.s.id, day);
          const exp = fin.marcaExplicita(r.s.id, day);
          return (
            <div key={r.s.id}>
              {head && (
                <div className="grp-h">
                  <span>{head} · clase compartida ({byTime.get(head)})</span>
                  <button className="btn sm" onClick={() => {
                    const ids = rows.filter((x) => x.time === head && fin.marca(x.s.id, day) !== 'p').map((x) => x.s.id);
                    if (ids.length) onAttendance(ids, day, 'p');
                  }}>Todos presentes</button>
                </div>
              )}
              <div className="att">
                <span className="hr">{r.time || (r.extra ? 'Extra' : '—')}</span>
                <button className="fw" onClick={() => onOpen(r.s.id, 'rutina')}>
                  <b>{r.s.name}{fin.billing(r.s).rehab && <span className="tag rehab">Rehab</span>}</b>
                  <small>
                    {[
                      r.planned ? 'Rutina asignada' : null,
                      r.extra ? 'Fuera de horario' : null,
                      r.from ? `Pasó su clase del ${shortDate(r.from)}` : null,
                      mk && !exp ? 'Sesión cargada' : null,
                    ].filter(Boolean).join(' · ') || fin.billing(r.s).enfoque || 'Ver rutina'}
                  </small>
                </button>
                <div className="marks" role="group" aria-label={`Asistencia de ${r.s.name}`}>
                  {(['p', 'a', 'e'] as Mark[]).map((k) => (
                    <button key={k} className={k} aria-pressed={mk === k} title={k === 'e' ? 'Faltó y le mandaste los ejercicios' : MARKS[k].label}
                      onClick={() => onAttendance([r.s.id], day, exp === k ? null : k)}>{MARKS[k].label}</button>
                  ))}
                </div>
                {!mk && !r.extra && day >= fin.today && <button className="linkbtn mover" onClick={() => onMove(r.s.id, day)}>Pasar a otro día</button>}
              </div>
            </div>
          );
        })}
        {moved.map(({ s, to, time }) => (
          <div key={`m${s.id}`} className="att moved">
            <span className="hr">—</span>
            <span className="fw"><b>{s.name}</b><small>Pasó esta clase al {longDate(to)}{time ? ` · ${time}` : ''}</small></span>
            <button className="btn sm" onClick={() => undo(s)}>Deshacer</button>
          </div>
        ))}
      </div>
      {others.length > 0 && (
        <div className="addrow" style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <select className="search" style={{ marginTop: 0, flex: 1, minWidth: 0 }} value={extra} onChange={(e) => setExtra(e.target.value)} aria-label="Alumno para sumar a este día">
            <option value="">Sumar a alguien a este día…</option>
            {others.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button className="btn sm" disabled={!extra} onClick={() => { onAttendance([extra], day, 'p'); setExtra(''); }}>Sumar</button>
        </div>
      )}
      <p className="hint" style={{ fontSize: 12 }}>Ejercicios: faltó y le mandaste los ejercicios para que entrene solo; no cuenta como presente. Una sesión cargada ese día cuenta como presente.</p>
    </section>
  );
}

// ── Finanzas: pagos + reportes ──────────────────────────────────────────────

const RANGOS: Array<[string, string, number | null]> = [['1m', 'Último mes', 30], ['3m', '3 meses', 91], ['6m', '6 meses', 182], ['todo', 'Todo', null]];

export function FinanzasView({ fin, right, onOpen, reload, toast }: { fin: Fin | null; right: ReactNode; onOpen: OpenStudent; reload: () => void; toast: Toast }) {
  const [view, setView] = useState<'pagos' | 'reportes'>('pagos');
  const [paying, setPaying] = useState<string | 'new' | null>(null);
  const [reminding, setReminding] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [rango, setRango] = useState('3m');
  if (!fin) return <><TopHeader title="Finanzas" right={right} /><Skeleton /></>;
  const m = ym(fin.today);

  const order: Record<string, number> = { debe: 0, pagar: 1, pronto: 2, sinfecha: 3, aldia: 4 };
  const st = fin.activos().map((s) => ({ s, c: fin.estadoPago(s) }))
    .sort((a, b) => order[a.c.k]! - order[b.c.k]! || String(a.c.due ?? '9').localeCompare(String(b.c.due ?? '9')));
  const meses = Array.from({ length: 6 }, (_, i) => shiftYM(m, i - 5));
  const vals = meses.map(fin.cobradoEn);
  const mx = Math.max(1, ...vals);
  const p30 = fin.proximos30().sort((a, b) => String(a.c.due ?? '').localeCompare(String(b.c.due ?? '')));
  const total30 = p30.reduce((a, x) => a + x.c.monto, 0);
  const ps = [...fin.payments].sort((a, b) => b.paid_on.localeCompare(a.paid_on) || b.created_at.localeCompare(a.created_at));
  const name = (id: string) => fin.students.find((s) => s.id === id)?.name ?? 'Alumno eliminado';
  const cobrar = st.filter((x) => urgente(x.c) || x.c.k === 'pronto');
  const sinf = st.filter((x) => x.c.k === 'sinfecha' && fin.billing(x.s).cuota == null);

  const del = async (id: string) => {
    try { await coachApi.deletePayment(id); setConfirm(null); toast('Pago borrado'); reload(); } catch (e) { toast((e as ApiError).message); }
  };

  return (
    <>
      <TopHeader title="Finanzas" right={right}
        sub={<><span>Cobrado en {monthName(m)}: <b>{money(fin.cobradoEn(m))}</b></span><span>próximos 30 días: <b>{money(total30)}</b></span></>} />
      <Seg small value={view} onChange={setView} options={[['pagos', 'Pagos'], ['reportes', 'Reportes']]} />
      <Enter k={view}>
        {view === 'pagos' ? (
          <>
            <div className="actions" style={{ marginTop: 12 }}>
              <button className="btn primary wide" onClick={() => setPaying('new')}>{Icon.plus} Registrar pago</button>
            </div>
            <section className="card">
              <div className="card-h"><h2>Para cobrar</h2>{cobrar.length > 0 && <span className="mini">{cobrar.length}</span>}</div>
              {cobrar.length ? (
                <div className="rows">
                  {cobrar.map(({ s, c }) => <PayRow key={s.id} fin={fin} s={s} c={c} onClick={() => setPaying(s.id)} />)}
                </div>
              ) : <p className="hint">Nadie tiene que pagar esta semana.</p>}
            </section>
            {sinf.length > 0 && (
              <div className="phase warn" style={{ marginTop: 12 }}>
                <span className="ph-tag">Pagos</span>
                <div>
                  {sinf.length === 1 ? '1 alumno activo no tiene' : `${sinf.length} alumnos activos no tienen`} honorarios cargados.
                  Cargalos en su pestaña Pagos: {sinf.map((x, i) => (
                    <span key={x.s.id}>{i ? ', ' : ''}<button className="linkbtn" onClick={() => onOpen(x.s.id, 'pagos')}>{firstName(x.s.name)}</button></span>
                  ))}.
                </div>
              </div>
            )}
            <div className="fin-cols">
              <section className="card">
                <div className="card-h"><h2>Cobrado por mes</h2></div>
                <div className="hbars">
                  {meses.map((mm, i) => (
                    <div key={mm} className="hbar">
                      <span>{cap(monthName(mm))}{mm === m ? ' (este mes)' : ''}</span>
                      <span className="amt">{money(vals[i]!)}</span>
                      <div className="track"><i style={{ width: `${(vals[i]! / mx) * 100}%` }} /></div>
                    </div>
                  ))}
                </div>
              </section>
              <section className="card">
                <div className="card-h"><h2>Próximos 30 días</h2><span className="amt">{money(total30)}</span></div>
                {p30.length ? (
                  <div className="rows">
                    {p30.map(({ s, c }) => (
                      <button key={s.id} className="frow" onClick={() => setPaying(s.id)}>
                        <span className="fw"><b>{s.name}</b><small>{c.due ? `${urgente(c) ? 'Tiene que pagar · ' : 'Paga el '}${shortDate(c.due)}` : 'Tiene que pagar'}</small></span>
                        <span className="amt">{money(c.monto)}</span>
                      </button>
                    ))}
                  </div>
                ) : <p className="hint">Nadie paga en los próximos 30 días. Los alumnos sin datos de pago no se cuentan.</p>}
              </section>
            </div>

            <section className="card">
              <div className="card-h"><h2>Estado de cada alumno</h2><span className="mini">{st.length} activos</span></div>
              {!st.length ? <p className="hint">No hay alumnos activos.</p> : (
                <div className="rows">
                  {st.map(({ s, c }) => (
                    <div key={s.id} className="frow">
                      <button className="fw" onClick={() => onOpen(s.id, 'pagos')}>
                        <b>{s.name}{fin.billing(s).rehab && <span className="tag rehab">Rehab</span>}</b>
                        <small>{fin.billing(s).cuota != null ? `${money(c.monto)} · ` : ''}{fin.modoTxt(s)}</small>
                      </button>
                      <span className="fr-r">
                        <Pill c={c} />
                        <span style={{ display: 'flex', gap: 4 }}>
                          {(urgente(c) || c.k === 'pronto') && <button className="btn sm" onClick={() => setReminding(s.id)}>Recordar</button>}
                          <button className="btn sm" onClick={() => setPaying(s.id)}>Registrar</button>
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="card">
              <div className="card-h"><h2>Últimos pagos</h2><span className="mini">{ps.length} registrados</span></div>
              {!ps.length ? <p className="hint">Todavía no hay pagos registrados.</p> : (
                <div className="rows">
                  {ps.slice(0, 50).map((p) => (
                    <div key={p.id} className="frow">
                      <span className="fw"><b>{name(p.student_id)}</b><small>{shortDate(p.paid_on)} · {queCubre(p)}{p.note ? ` · ${p.note}` : ''}</small></span>
                      <span className="fr-r">
                        <span className="amt">{money(p.amount)}</span>
                        {confirm === p.id
                          ? <span style={{ display: 'flex', gap: 4 }}><button className="btn sm danger" onClick={() => del(p.id)}>Borrar</button><button className="btn sm" onClick={() => setConfirm(null)}>No</button></span>
                          : <button className="btn sm ghost" aria-label="Borrar pago" onClick={() => setConfirm(p.id)}>{Icon.trash}</button>}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : (
          <Reportes fin={fin} rango={rango} setRango={setRango} onOpen={onOpen} />
        )}
      </Enter>
      {paying && <PaymentSheet fin={fin} studentId={paying === 'new' ? null : paying} onClose={() => setPaying(null)}
        onSaved={() => { setPaying(null); reload(); toast('Pago registrado'); }} toast={toast} />}
      {reminding && <ReminderSheet fin={fin} studentId={reminding} onClose={() => setReminding(null)} toast={toast} />}
    </>
  );
}

function Reportes({ fin, rango, setRango, onOpen }: { fin: Fin; rango: string; setRango: (r: string) => void; onOpen: OpenStudent }) {
  const R = RANGOS.find((r) => r[0] === rango) ?? RANGOS[1]!;
  const ini = R[2] ? addDays(fin.today, -R[2]) : '0000-01-01';
  const rows: StudentReport[] = fin.students.filter((s) => fin.estado(s).estado !== 'baja' && !fin.isAsinc(s)).map((s) => fin.reporte(s, ini))
    .filter((r) => r.clases || r.pagos || r.flags.length);
  const tot = rows.reduce((a, r) => ({ cl: a.cl + r.clases, p: a.p + r.k.p, mov: a.mov + r.mov, pg: a.pg + r.pagos, at: a.at + r.aTermino, tarde: a.tarde + r.tarde, dias: a.dias + r.prom * r.tarde }),
    { cl: 0, p: 0, mov: 0, pg: 0, at: 0, tarde: 0, dias: 0 });
  rows.sort((x, y) => y.flags.length - x.flags.length || (x.pct ?? 101) - (y.pct ?? 101) || x.s.name.localeCompare(y.s.name));
  return (
    <>
      <div className="filters" role="group" aria-label="Período" style={{ marginTop: 12 }}>
        {RANGOS.map(([k, l]) => <button key={k} className="tog" aria-pressed={rango === k} onClick={() => setRango(k)}>{l}</button>)}
      </div>
      <div className="kpis">
        <div className="kpi"><span className="l">Asistencia</span><b className="v">{tot.cl ? `${Math.round((tot.p / tot.cl) * 100)}%` : '—'}</b><span className="s">{tot.p} presentes de {tot.cl} clases</span></div>
        <div className="kpi"><span className="l">Clases pasadas de día</span><b className="v">{tot.mov}</b><span className="s">{tot.cl ? `${Math.round((tot.mov / tot.cl) * 100)}% de las clases` : 'Sin clases'}</span></div>
        <div className={`kpi${tot.tarde ? ' warn' : ''}`}><span className="l">Pagos a término</span><b className="v">{tot.pg ? `${Math.round((tot.at / tot.pg) * 100)}%` : '—'}</b><span className="s">{tot.at} de {tot.pg} pagos</span></div>
        <div className="kpi"><span className="l">Atraso promedio</span><b className="v">{tot.tarde ? `${Math.round(tot.dias / tot.tarde)} d` : '—'}</b><span className="s">en los pagos tarde</span></div>
      </div>
      <section className="card">
        <div className="card-h"><h2>Por alumno</h2><span className="mini">primero los que necesitan atención</span></div>
        {!rows.length ? <p className="hint">Todavía no hay datos en este período.</p> : (
          <div className="tbl-wrap">
            <table className="tbl ftbl">
              <thead><tr><th>Alumno</th><th className="r">Clases</th><th className="r">Asist.</th><th className="r">Aus.</th><th className="r">Ejerc.</th><th className="r">Cambios</th><th className="r">A término</th><th className="r">Atraso</th><th>Alertas</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.s.id} onClick={() => onOpen(r.s.id, 'pagos')} style={{ cursor: 'pointer' }}>
                    <td><b>{r.s.name}</b>{fin.estado(r.s).estado === 'pausa' && <small className="hint"> en pausa</small>}</td>
                    <td className="r amt">{r.clases}</td><td className="r amt">{r.pct === null ? '—' : `${r.pct}%`}</td>
                    <td className="r amt">{r.k.a}</td><td className="r amt">{r.k.e}</td><td className="r amt">{r.mov}</td>
                    <td className="r amt">{r.pagos ? `${r.aTermino}/${r.pagos}` : '—'}</td><td className="r amt">{r.tarde ? `${r.prom} d` : '—'}</td>
                    <td>{r.flags.length ? r.flags.map(([t, c]) => <span key={t} className={`pill ${c}`} style={{ margin: '2px 4px 2px 0' }}>{t}</span>) : <span className="hint">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="hint" style={{ fontSize: 12 }}>
        Asistencia = presentes sobre clases tomadas (ausentes y ejercicios cuentan como clase tomada; una sesión cargada cuenta como presente).
        Un pago por paquete es a término si se hizo antes o el mismo día de la primera clase del paquete; los mensuales, hasta el día 5.
        Alertas: “Falta seguido” con asistencia menor al 75% (desde 4 clases), “Pasa muchas clases” con 2 o más cambios y al menos 1 de cada 4 clases movida,
        “Paga tarde” con 2 pagos atrasados o más de 3 días de atraso promedio.
      </p>
    </>
  );
}

// ── hojas ───────────────────────────────────────────────────────────────────

export function PaymentSheet({ fin, studentId, onClose, onSaved, toast }: {
  fin: Fin; studentId: string | null; onClose: () => void; onSaved: () => void; toast: Toast;
}) {
  const options = fin.students.filter((s) => fin.estado(s).estado !== 'baja' || s.id === studentId).sort((a, b) => a.name.localeCompare(b.name));
  const [sid, setSid] = useState(studentId ?? options[0]?.id ?? '');
  const s = fin.students.find((x) => x.id === sid);
  const [fecha, setFecha] = useState(fin.today);
  const [monto, setMonto] = useState('');
  const [clases, setClases] = useState('');
  const [periodo, setPeriodo] = useState('');
  const [nota, setNota] = useState('');
  const [progPend, setProgPend] = useState(true);
  const [busy, setBusy] = useState(false);
  const m = s ? fin.modo(s) : 'clases';
  useEffect(() => {
    if (!s) return;
    setMonto(String(fin.cuotaEn(s, fin.today) || ''));
    setClases(String(fin.clasesPaquete(s) || 4));
    const c = fin.estadoPago(s);
    setPeriodo((c.due ?? fin.today).slice(0, 7));
  }, [sid]); // eslint-disable-line react-hooks/exhaustive-deps
  const sd = s ? fin.saldo(s) : null;

  const save = async () => {
    if (!s) return;
    setBusy(true);
    try {
      const b = fin.billing(s);
      if (m === 'clases' && !b.cuenta_desde) await coachApi.updateStudent(s.id, { billing: { ...b, cuenta_desde: fecha, saldo_inicial: 0 } });
      await coachApi.addPayment({
        student_id: s.id, paid_on: fecha, amount: Number(monto) || 0,
        classes: m === 'clases' ? Math.max(1, Number(clases) || 1) : null,
        period: m === 'mensual' ? periodo : null, note: nota.trim() || null,
      });
      if (m === 'prog' && progPend !== b.prog_pendiente) await coachApi.updateStudent(s.id, { billing: { ...b, prog_pendiente: progPend } });
      onSaved();
    } catch (e) { toast((e as ApiError).message); } finally { setBusy(false); }
  };

  return (
    <Sheet title="Registrar pago" onClose={onClose}>
      <div className="fields" style={{ marginTop: 0 }}>
        <div className="field full">
          <label htmlFor="pg-al">Alumno</label>
          <select id="pg-al" value={sid} onChange={(e) => setSid(e.target.value)}>
            {options.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </div>
        <div className="field"><label htmlFor="pg-f">Fecha de pago</label><input id="pg-f" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
        <div className="field"><label htmlFor="pg-m">Monto (US$)</label><input id="pg-m" type="number" inputMode="decimal" min={0} step="any" value={monto} onChange={(e) => setMonto(e.target.value)} /></div>
        {m === 'clases' && <div className="field"><label htmlFor="pg-c">Clases que paga</label><input id="pg-c" type="number" inputMode="numeric" min={1} value={clases} onChange={(e) => setClases(e.target.value)} /></div>}
        {m === 'mensual' && <div className="field"><label htmlFor="pg-p">Mes que paga</label><input id="pg-p" type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} /></div>}
        {m === 'prog' && (
          <label className="field full checkline"><input type="checkbox" checked={progPend} onChange={(e) => setProgPend(e.target.checked)} /> Falta mandarle la programación nueva</label>
        )}
        <div className="field full"><label htmlFor="pg-n">Nota</label><input id="pg-n" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Opcional (transferencia, efectivo…)" /></div>
      </div>
      <p className="hint" style={{ margin: 0 }}>
        {m === 'clases' ? (sd ? `Antes de este pago ${sd.restan < 0 ? `debe ${-sd.restan} ${sd.restan === -1 ? 'clase' : 'clases'}` : sd.restan === 1 ? 'le queda 1 clase' : `le quedan ${sd.restan} clases`}.` : 'Con este pago arranca la cuenta de su paquete.')
          : m === 'prog' ? 'La próxima programación queda para dentro de 4 semanas desde hoy.' : ''}
      </p>
      <button className="btn primary wide" disabled={busy || !s || !fecha || monto === ''} onClick={save}>{busy ? 'Guardando…' : 'Guardar pago'}</button>
    </Sheet>
  );
}

export function ReminderSheet({ fin, studentId, onClose, toast }: { fin: Fin; studentId: string; onClose: () => void; toast: Toast }) {
  const s = fin.students.find((x) => x.id === studentId)!;
  const [txt, setTxt] = useState(() => fin.recordatorio(s));
  const tel = (fin.billing(s).telefono ?? '').replace(/\D/g, '');
  const copy = async () => {
    try { await navigator.clipboard.writeText(txt); toast('Mensaje copiado'); } catch { toast('No se pudo copiar: seleccionalo a mano'); }
  };
  return (
    <Sheet title={`Recordar pago · ${firstName(s.name)}`} onClose={onClose}>
      <div className="field" style={{ marginTop: 0 }}><label htmlFor="rc">Mensaje</label><textarea id="rc" rows={5} value={txt} onChange={(e) => setTxt(e.target.value)} /></div>
      <div className="actions" style={{ marginTop: 0 }}>
        <button className="btn primary" onClick={copy}>{Icon.copy} Copiar</button>
        {tel && <a className="btn" href={`https://wa.me/${tel}?text=${encodeURIComponent(txt)}`} target="_blank" rel="noopener noreferrer">Abrir en WhatsApp</a>}
      </div>
      <p className="hint" style={{ margin: 0 }}>{tel ? <>WhatsApp: <b>{fin.billing(s).telefono}</b></> : 'Cargá su WhatsApp en la pestaña Pagos para abrir el chat directo.'}</p>
    </Sheet>
  );
}

export function MoveSheet({ fin, studentId, de, onClose, onSaved }: {
  fin: Fin; studentId: string; de?: string; onClose: () => void; onSaved: (msg: string) => void;
}) {
  const s = fin.students.find((x) => x.id === studentId)!;
  const prox = fin.proximasClases(s, 6);
  const opts = [...new Set([...(de ? [de] : []), ...prox])];
  const [from, setFrom] = useState(opts[0] ?? '');
  const [to, setTo] = useState(opts[0] ? addDays(opts[0], 1) : fin.today);
  const timeOf = (f: string) => (s.schedule ? (fin.programados(f).find((x) => x.s.id === s.id)?.time ?? '') : '');
  const [time, setTime] = useState(timeOf(opts[0] ?? ''));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const otherWeek = from && to && !weekOf(from).includes(to);

  if (!opts.length) {
    return <Sheet title="Pasar una clase" onClose={onClose}><p className="hint">{firstName(s.name)} no tiene clases próximas en su agenda.</p></Sheet>;
  }
  const save = async () => {
    if (to === from) { setErr('Elegí un día distinto'); return; }
    setBusy(true);
    try {
      const sc: Schedule = s.schedule ?? emptySchedule();
      const fromOnce = sc.once.find((o) => o.date === from);
      const entry = { date: to, time: time || null, note: `Pasada del ${shortDate(from)}`, from };
      const next: Schedule = fromOnce
        ? { ...sc, once: sc.once.map((o) => (o === fromOnce ? entry : o)) }
        : { ...sc, skip: [...new Set([...sc.skip, from])], once: [...sc.once.filter((o) => o.from !== from), entry] };
      await coachApi.updateStudent(s.id, { schedule: next });
      onSaved(`Clase pasada al ${shortDate(to)}`);
    } catch (e) { setErr((e as ApiError).message); } finally { setBusy(false); }
  };
  return (
    <Sheet title={`Pasar una clase · ${firstName(s.name)}`} onClose={onClose}>
      <div className="fields" style={{ marginTop: 0 }}>
        <div className="field full">
          <label htmlFor="mv-de">Clase que se pasa</label>
          <select id="mv-de" value={from} onChange={(e) => { setFrom(e.target.value); setTime(timeOf(e.target.value)); }}>
            {opts.map((f) => <option key={f} value={f}>{cap(longDate(f))}{timeOf(f) ? ` · ${timeOf(f)}` : ''}</option>)}
          </select>
        </div>
        <div className="field"><label htmlFor="mv-a">Nuevo día</label><input id="mv-a" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div className="field"><label htmlFor="mv-h">Hora</label><input id="mv-h" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
      </div>
      <p className="hint" style={{ margin: 0 }}>{otherWeek ? 'Ojo: el nuevo día es de otra semana.' : 'La clase se cuenta una sola vez: sale del día original y aparece en el nuevo para tomar asistencia.'}</p>
      {err && <p className="err">{err}</p>}
      <button className="btn primary wide" disabled={busy || !to} onClick={save}>{busy ? 'Guardando…' : 'Pasar clase'}</button>
    </Sheet>
  );
}

// ── pestaña Pagos del alumno ────────────────────────────────────────────────

export function StudentPayments({ fin, studentId, reload, toast, onAgenda }: {
  fin: Fin | null; studentId: string; reload: () => void; toast: Toast; onAgenda: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [moving, setMoving] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  if (!fin) return <Skeleton />;
  const s = fin.students.find((x) => x.id === studentId);
  if (!s) return <Skeleton />;
  const b = fin.billing(s);
  const est = fin.estado(s);
  const c = est.estado === 'activo' ? fin.estadoPago(s) : null;
  const sd = fin.saldo(s);
  const ps = [...fin.pagosDe(s.id)].reverse();
  const total = ps.reduce((a, p) => a + p.amount, 0);
  const ini = sd ? sd.desde : `${ym(fin.today)}-01`;
  const dias = fin.marcasDe(s.id).filter(([f]) => f >= ini && f <= fin.today);
  const k = { p: 0, a: 0, e: 0 } as Record<Mark, number>;
  for (const [, v] of dias) k[v]++;
  const prog = fin.isAsinc(s) ? fin.estadoProg(s) : null;
  const rc = fin.isAsinc(s) ? 0 : fin.racha(s);
  const hc = [...b.historial_cuota].sort((x, y) => y.desde.localeCompare(x.desde));
  const horario = s.schedule?.weekly.length
    ? s.schedule.weekly.map((w) => `${WEEKDAYS[w.weekday]}${w.time ? ` ${w.time}` : ''}`).join(' · ')
    : 'Sin días fijos';
  const moves = (s.schedule?.once ?? []).filter((o) => o.from && (o.date >= fin.today || o.from >= fin.today));

  const del = async (id: string) => {
    try { await coachApi.deletePayment(id); setConfirm(null); toast('Pago borrado'); reload(); } catch (e) { toast((e as ApiError).message); }
  };

  if (editing) {
    return <BillingForm fin={fin} s={s} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); toast('Honorarios guardados'); }} toast={toast} />;
  }

  return (
    <>
      <section className="card">
        <div className="chips-row" style={{ marginTop: 0 }}>
          <span className={`pill ${est.estado === 'activo' ? 'ok' : est.estado === 'pausa' ? 'low' : ''}`}>{ESTADO_LABEL[est.estado]}{est.auto ? ' (automático)' : ''}</span>
          {b.rehab && <span className="pill low">Rehabilitación</span>}
          {c && <Pill c={c} />}
          {rc >= 2 && <span className="pill bad">Faltó las últimas {rc} clases</span>}
        </div>
        <dl className="dl">
          <dt>Modalidad</dt><dd>{MOD_LABEL[b.modalidad]}{fin.isAsinc(s) ? '' : ` · ${fin.clasesSem(s)} ${fin.clasesSem(s) === 1 ? 'clase' : 'clases'} por semana`}</dd>
          {!fin.isAsinc(s) && <><dt>Horario</dt><dd>{horario} <button className="linkbtn" onClick={onAgenda}>Agenda</button></dd></>}
          {prog && <><dt>Programación</dt><dd>{b.prog_pendiente ? 'Ya pagó, falta mandarle la próxima' : b.prog_enviada ? `Última el ${fmtLong(b.prog_enviada)} · próxima el ${fmtLong(prog.prox)}` : 'Sin envío registrado'}</dd></>}
          <dt>Honorarios</dt><dd>{b.cuota != null ? <><span className="amt">{money(fin.cuotaEn(s, fin.today))}</span> · {fin.modoTxt(s)}</> : <span className="hint">Sin cargar</span>}</dd>
          {sd && <><dt>Paquete</dt><dd>{sd.restan > 0 ? `Le ${sd.restan === 1 ? 'queda 1 clase' : `quedan ${sd.restan} clases`}` : sd.restan === 0 ? 'Terminó el paquete' : `Debe ${-sd.restan} ${-sd.restan === 1 ? 'clase' : 'clases'}`}{c?.due && sd.restan >= 0 ? ` · paga el ${fmtLong(c.due)}` : ''}</dd></>}
          {!sd && c?.due && <><dt>Vence</dt><dd>{fmtLong(c.due)}</dd></>}
          <dt>Enfoque</dt><dd>{b.enfoque || '—'}</dd>
          <dt>WhatsApp</dt><dd>{b.telefono || '—'}</dd>
        </dl>
        <div className="actions">
          <button className="btn primary" onClick={() => setPaying(true)}>{Icon.plus} Registrar pago</button>
          {c && (urgente(c) || c.k === 'pronto') && <button className="btn" onClick={() => setReminding(true)}>Recordar pago</button>}
          {!fin.isAsinc(s) && est.estado === 'activo' && <button className="btn" onClick={() => setMoving(true)}>Pasar una clase</button>}
          <button className="btn" onClick={() => setEditing(true)}>{Icon.edit} Honorarios y datos</button>
        </div>
        {moves.length > 0 && (
          <div className="phase" style={{ marginTop: 12 }}><span className="ph-tag">Cambios</span>
            <div>{moves.map((o) => <div key={o.from!}>Clase del {shortDate(o.from!)} pasada al {shortDate(o.date)}{o.time ? ` · ${o.time}` : ''}</div>)}</div>
          </div>
        )}
      </section>

      {!fin.isAsinc(s) && (
        <section className="card">
          <div className="card-h">
            <h2>Clases {sd ? `desde el ${shortDate(ini)}` : `de ${monthName(ym(fin.today))}`}</h2>
            <span className="mini">{k.p} presentes{k.e ? ` · ${k.e} con ejercicios` : ''}{k.a ? ` · ${k.a} ausentes` : ''}</span>
          </div>
          {dias.length ? (
            <div className="dates">
              {dias.map(([f, v]) => <span key={f} className={`pill ${MARKS[v].cls}`} title={MARKS[v].label}>{shortDate(f)} {MARKS[v].short}</span>)}
            </div>
          ) : <p className="hint">Sin clases en este período.</p>}
        </section>
      )}

      <section className="card">
        <div className="card-h"><h2>Pagos</h2><span className="mini">Total {money(total)}</span></div>
        {ps.length ? (
          <div className="rows">
            {ps.map((p) => (
              <div key={p.id} className="frow">
                <span className="fw"><b>{queCubre(p)}</b><small>Pagó el {shortDate(p.paid_on)}{p.note ? ` · ${p.note}` : ''}</small></span>
                <span className="fr-r">
                  <span className="amt">{money(p.amount)}</span>
                  {confirm === p.id
                    ? <span style={{ display: 'flex', gap: 4 }}><button className="btn sm danger" onClick={() => del(p.id)}>Borrar</button><button className="btn sm" onClick={() => setConfirm(null)}>No</button></span>
                    : <button className="btn sm ghost" aria-label="Borrar pago" onClick={() => setConfirm(p.id)}>{Icon.trash}</button>}
                </span>
              </div>
            ))}
          </div>
        ) : <p className="hint">Sin pagos registrados.</p>}
      </section>

      {hc.length > 0 && (
        <section className="card">
          <h2>Historial de honorarios</h2>
          <div className="rows">
            {hc.map((x, i) => {
              const prev = hc[i + 1];
              const pct = prev && prev.monto ? Math.round(((x.monto - prev.monto) / prev.monto) * 100) : null;
              return (
                <div key={x.desde} className="frow">
                  <span className="fw"><b>{x.desde < '1900' ? 'Monto anterior' : `Desde el ${fmtLong(x.desde)}`}</b>
                    <small>{prev ? (pct !== null ? `${pct > 0 ? '+' : ''}${pct}% sobre ${money(prev.monto)}` : 'Cambio') : 'Antes del primer cambio registrado'}</small></span>
                  <span className="amt">{money(x.monto)}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {paying && <PaymentSheet fin={fin} studentId={s.id} onClose={() => setPaying(false)} onSaved={() => { setPaying(false); reload(); toast('Pago registrado'); }} toast={toast} />}
      {reminding && <ReminderSheet fin={fin} studentId={s.id} onClose={() => setReminding(false)} toast={toast} />}
      {moving && <MoveSheet fin={fin} studentId={s.id} onClose={() => setMoving(false)} onSaved={(m) => { setMoving(false); reload(); toast(m); }} />}
    </>
  );
}

function BillingForm({ fin, s, onCancel, onSaved, toast }: { fin: Fin; s: FinanceStudent; onCancel: () => void; onSaved: () => void; toast: Toast }) {
  const b0 = fin.billing(s);
  const cuotaActual = b0.cuota != null ? fin.cuotaEn(s, fin.today) : null;
  const sd = fin.saldo(s);
  const [b, setB] = useState<Billing>(b0);
  const [cuota, setCuota] = useState(cuotaActual != null ? String(cuotaActual) : '');
  const [desde, setDesde] = useState(fin.today);
  const [restan, setRestan] = useState(sd ? String(sd.restan) : '');
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<Billing>) => setB((x) => ({ ...x, ...p }));
  const asinc = b.modalidad === 'virtual_asinc';
  const mensual = b.pago_modo === 'mensual';
  const changedCuota = cuotaActual != null && cuota !== '' && Number(cuota) !== cuotaActual;
  const paq = (b.clases_sem ?? s.schedule?.weekly.length ?? 0) * (b.ciclo_sem || 4);

  const save = async () => {
    setBusy(true);
    try {
      const n = cuota === '' ? null : Number(cuota);
      let hist = [...b.historial_cuota];
      if (changedCuota && n != null) {
        if (!hist.length) hist = [{ desde: '0000-01-01', monto: cuotaActual! }];
        hist = hist.filter((x) => x.desde !== desde);
        hist.push({ desde, monto: n });
        hist.sort((x, y) => x.desde.localeCompare(y.desde));
      }
      let { cuenta_desde, saldo_inicial } = b;
      const marcasHoy = fin.marca(s.id, fin.today) ? 1 : 0;
      if (!asinc && !mensual) {
        if (b0.estado && b0.estado !== 'activo' && b.estado === 'activo') { cuenta_desde = fin.today; saldo_inicial = marcasHoy; }
        else if (restan !== '' && String(Number(restan)) !== (sd ? String(sd.restan) : '')) { cuenta_desde = fin.today; saldo_inicial = Number(restan) + marcasHoy; }
      }
      const next: Billing = {
        ...b, cuota: n, historial_cuota: hist, cuenta_desde, saldo_inicial,
        telefono: b.telefono?.trim() || null, enfoque: b.enfoque?.trim() || null,
        prog_enviada: asinc ? b.prog_enviada : null, prog_pendiente: asinc && b.prog_pendiente,
      };
      await coachApi.updateStudent(s.id, { billing: next });
      onSaved();
    } catch (e) { toast((e as ApiError).message); } finally { setBusy(false); }
  };

  return (
    <section className="card">
      <div className="card-h"><h2>Honorarios y datos</h2><button className="btn sm ghost" onClick={onCancel}>Cancelar</button></div>
      <div className="fields">
        <div className="field">
          <label htmlFor="b-est">Estado</label>
          <select id="b-est" value={b.estado ?? ''} onChange={(e) => set({ estado: (e.target.value || null) as Estado | null })}>
            <option value="">Automático (hoy: {ESTADO_LABEL[fin.estado({ ...s, billing: { ...b, estado: null } }).estado]})</option>
            <option value="activo">Activo</option><option value="pausa">En pausa</option><option value="baja">Baja</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="b-mod">Modalidad</label>
          <select id="b-mod" value={b.modalidad} onChange={(e) => set({ modalidad: e.target.value as Modalidad })}>
            {Object.entries(MOD_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        {!asinc && (
          <>
            <div className="field">
              <label htmlFor="b-cs">Clases por semana</label>
              <input id="b-cs" type="number" inputMode="numeric" min={0} value={b.clases_sem ?? ''} placeholder={String(s.schedule?.weekly.length ?? '')}
                onChange={(e) => set({ clases_sem: e.target.value === '' ? null : Number(e.target.value) })} />
              <small>Vacío = los días fijos de su Agenda.</small>
            </div>
            <div className="field">
              <label htmlFor="b-pm">Forma de pago</label>
              <select id="b-pm" value={b.pago_modo} onChange={(e) => set({ pago_modo: e.target.value as Billing['pago_modo'] })}>
                <option value="clases">Por paquete de clases</option><option value="mensual">Mensual, a principio de mes</option>
              </select>
            </div>
          </>
        )}
        <div className="field">
          <label htmlFor="b-cuota">Honorarios (US$)</label>
          <input id="b-cuota" type="number" inputMode="decimal" min={0} step="any" value={cuota} onChange={(e) => setCuota(e.target.value)} />
        </div>
        {changedCuota && (
          <div className="field">
            <label htmlFor="b-desde">El cambio rige desde</label>
            <input id="b-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            <small>Queda en el historial; los pagos anteriores conservan el monto viejo.</small>
          </div>
        )}
        {!asinc && !mensual && (
          <>
            <div className="field">
              <label htmlFor="b-ciclo">Semanas por paquete</label>
              <input id="b-ciclo" type="number" inputMode="numeric" min={1} value={b.ciclo_sem} onChange={(e) => set({ ciclo_sem: Math.max(1, Number(e.target.value) || 1) })} />
              {paq > 0 && <small>Paquete de {paq} clases.</small>}
            </div>
            <div className="field">
              <label htmlFor="b-restan">Clases que le quedan hoy</label>
              <input id="b-restan" type="number" inputMode="numeric" value={restan} onChange={(e) => setRestan(e.target.value)} />
              <small>Las ausencias y los ejercicios enviados también descuentan.</small>
            </div>
          </>
        )}
        {!asinc && mensual && (
          <div className="field">
            <label htmlFor="b-vence">Próximo vencimiento</label>
            <input id="b-vence" type="date" value={b.vence ?? ''} onChange={(e) => set({ vence: e.target.value || null })} />
            <small>Sólo si todavía no tiene pagos cargados.</small>
          </div>
        )}
        {asinc && (
          <div className="field full">
            <label htmlFor="b-prog">Última programación enviada</label>
            <input id="b-prog" type="date" value={b.prog_enviada ?? ''} onChange={(e) => set({ prog_enviada: e.target.value || null })} />
            <label className="checkline"><input type="checkbox" checked={b.prog_pendiente} onChange={(e) => set({ prog_pendiente: e.target.checked })} /> Ya pagó y falta mandarle la próxima</label>
          </div>
        )}
        <div className="field">
          <label htmlFor="b-tel">WhatsApp</label>
          <input id="b-tel" inputMode="tel" value={b.telefono ?? ''} onChange={(e) => set({ telefono: e.target.value })} placeholder="5491112345678" />
          <small>Con código de país, sin 0 ni 15.</small>
        </div>
        <div className="field full">
          <label htmlFor="b-enf">Enfoque del entrenamiento</label>
          <input id="b-enf" value={b.enfoque ?? ''} onChange={(e) => set({ enfoque: e.target.value })} />
        </div>
        <label className="field full checkline"><input type="checkbox" checked={b.rehab} onChange={(e) => set({ rehab: e.target.checked })} /> Está rehabilitando una lesión</label>
      </div>
      <p className="hint">Los días y horarios se cargan en la Agenda del alumno.</p>
      <button className="btn primary wide" disabled={busy} onClick={save}>{busy ? 'Guardando…' : 'Guardar'}</button>
    </section>
  );
}

/** Pastilla de estado de pago para la lista de alumnos. */
export function usePayPill(fin: Fin | null) {
  return useMemo(() => (id: string) => {
    if (!fin) return null;
    const s = fin.students.find((x) => x.id === id);
    if (!s || fin.estado(s).estado !== 'activo' || fin.billing(s).cuota == null) return null;
    const c = fin.estadoPago(s);
    return c.k === 'aldia' || c.k === 'sinfecha' ? null : c;
  }, [fin]);
}

