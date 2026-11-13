import { ReactNode, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api';
import {
  addDays, Billing, cap, Charge, ChargeReviewItem, coachApi, emptyBilling, Estado, FinanceStudent, localDateOf, longDate, Mark, parse, Schedule, shortDate,
  WEEKDAYS, firstName, emptySchedule, Modalidad, Payment, Moneda, PayLink, isMercadoPago,
} from './data';
import {
  ESTADO_LABEL, Fin, MARKS, MOD_LABEL, money, monthName, shiftYM, StudentReport, urgente, weekOf, ym,
  fmtLong, PayState,
} from './billing';
import { DateInput, Enter, Icon, Seg, Sheet, Skeleton, TopHeader } from './ui';
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
              <span className="chev" aria-hidden="true" />
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
      <span className="fr-r"><span className="amt">{money(c.monto, c.moneda)}</span><Pill c={c} /></span>
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

export function FinanzasView({ fin, right, onOpen, reload, toast, onBack }: { fin: Fin | null; right: ReactNode; onOpen: OpenStudent; reload: () => void; toast: Toast; onBack?: () => void }) {
  const [view, setView] = useState<'pagos' | 'reportes'>('pagos');
  const [paying, setPaying] = useState<string | 'new' | null>(null);
  const [reminding, setReminding] = useState<string | null>(null);
  const [rango, setRango] = useState('3m');
  if (!fin) return <><TopHeader title="Finanzas" right={right} onBack={onBack} /><Skeleton /></>;
  const m = ym(fin.today);

  const order: Record<string, number> = { debe: 0, pagar: 1, pronto: 2, sinfecha: 3, aldia: 4 };
  const st = fin.activos().map((s) => ({ s, c: fin.estadoPago(s) }))
    .sort((a, b) => order[a.c.k]! - order[b.c.k]! || String(a.c.due ?? '9').localeCompare(String(b.c.due ?? '9')));
  const meses = Array.from({ length: 6 }, (_, i) => shiftYM(m, i - 5));
  const vals = meses.map(fin.cobradoEn);
  const mx = Math.max(1, ...vals);
  const p30 = fin.proximos30().sort((a, b) => String(a.c.due ?? '').localeCompare(String(b.c.due ?? '')));
  const total30 = p30.reduce((a, x) => a + x.c.monto, 0);
  const cobrar = st.filter((x) => urgente(x.c) || x.c.k === 'pronto');
  const sinf = st.filter((x) => x.c.k === 'sinfecha' && fin.billing(x.s).cuota == null);

  return (
    <>
      <TopHeader title="Finanzas" right={right} onBack={onBack} />
      <Seg small value={view} onChange={setView} options={[['pagos', 'Pagos'], ['reportes', 'Reportes']]} />
      <Enter k={view}>
        {view === 'pagos' ? (
          <>
            <div className="actions" style={{ marginTop: 12 }}>
              <button className="btn primary wide" onClick={() => setPaying('new')}>{Icon.plus} Registrar pago</button>
            </div>

            <RevisionPeriodos fin={fin} onOpen={onOpen} reload={reload} toast={toast} />

            <Facturado fin={fin} onPay={setPaying} onRemind={setReminding} onOpen={onOpen} reload={reload} toast={toast} />

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
                      <span className="amt">{fin.totalTxt(fin.payments.filter((p) => p.paid_on.startsWith(mm)))}</span>
                      <div className="track"><i style={{ width: `${(vals[i]! / mx) * 100}%` }} /></div>
                    </div>
                  ))}
                </div>
              </section>
              <section className="card">
                <div className="card-h"><h2>Próximos 30 días</h2><span className="amt">{fin.totalTxt(p30.map(({ s, c }) => ({ student_id: s.id, amount: c.monto })))}</span></div>
                {p30.length ? (
                  <div className="rows">
                    {p30.map(({ s, c }) => (
                      <button key={s.id} className="frow" onClick={() => setPaying(s.id)}>
                        <span className="fw"><b>{s.name}</b><small>{c.due ? `${urgente(c) ? 'Tiene que pagar, ' : 'Paga el '}${shortDate(c.due)}` : 'Tiene que pagar'}</small></span>
                        <span className="amt">{money(c.monto, c.moneda)}</span>
                      </button>
                    ))}
                  </div>
                ) : <p className="hint">Nadie paga en los próximos 30 días. Los alumnos sin datos de pago no se cuentan.</p>}
              </section>
            </div>
          </>
        ) : (
          <Reportes fin={fin} rango={rango} setRango={setRango} onOpen={onOpen} />
        )}
      </Enter>
      {paying && <PaymentSheet fin={fin} studentId={paying === 'new' ? null : paying} onClose={() => setPaying(null)}
        onSaved={() => { setPaying(null); reload(); toast('Pago registrado'); }} onChanged={reload} toast={toast} />}
      {reminding && <ReminderSheet fin={fin} studentId={reminding} onClose={() => setReminding(null)} toast={toast} />}
    </>
  );
}

// ── Facturado: total del período y lo que pagó cada alumno ──────────────────

type Periodo = 'mes' | 'anio' | 'todo';

function Facturado({ fin, onPay, onRemind, onOpen, reload, toast }: {
  fin: Fin; onPay: (id: string) => void; onRemind: (id: string) => void; onOpen: OpenStudent; reload: () => void; toast: Toast;
}) {
  const cur = ym(fin.today);
  const [per, setPer] = useState<Periodo>('mes');
  const [cm, setCm] = useState(cur);
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  const year = cm.slice(0, 4);
  const inPer = (f: string) => per === 'todo' || f.startsWith(per === 'mes' ? cm : year);
  const pays = fin.payments.filter((p) => inPer(p.paid_on));
  const total = pays.reduce((a, p) => a + p.amount, 0);
  const byStu = new Map<string, Payment[]>();
  for (const p of pays) byStu.set(p.student_id, [...(byStu.get(p.student_id) ?? []), p]);
  // Los activos aparecen aunque no hayan pagado: así se ve quién falta.
  const ids = new Set([...byStu.keys(), ...fin.activos().map((x) => x.id)]);
  const nameOf = (id: string) => fin.students.find((x) => x.id === id)?.name ?? 'Alumno eliminado';
  const rows = [...ids].map((id) => {
    const ps = byStu.get(id) ?? [];
    return {
      id, name: nameOf(id), n: ps.length, sum: ps.reduce((a, p) => a + p.amount, 0), last: ps.map((p) => p.paid_on).sort().pop() ?? null,
      ever: ps.length > 0 || fin.payments.some((p) => p.student_id === id),
    };
  }).sort((x, y) => x.name.localeCompare(y.name));
  const pagaron = rows.filter((r) => r.n);
  const sinPago = rows.filter((r) => !r.n);

  const step = (k: number) => {
    const next = per === 'mes' ? shiftYM(cm, k) : `${Number(year) + k}${cm.slice(4)}`;
    setCm(next > cur ? cur : next);
  };
  const atEnd = per === 'mes' ? cm >= cur : year >= cur.slice(0, 4);
  const label = per === 'mes' ? `${cap(monthName(cm))} ${year}` : year;
  const sinPagos = per === 'mes' ? `Sin pagos en ${monthName(cm)}` : per === 'anio' ? `Sin pagos en ${year}` : 'Sin pagos registrados';

  const del = async (id: string) => {
    try { await coachApi.deletePayment(id); setConfirm(null); toast('Pago borrado'); reload(); } catch (e) { toast((e as ApiError).message); }
  };

  return (
    <section className="card">
      <div className="card-h">
        <h2>Facturado</h2>
        {per !== 'todo' && (
          <div className="pernav">
            <button className="btn sm" aria-label={per === 'mes' ? 'Mes anterior' : 'Año anterior'} onClick={() => step(-1)}>‹</button>
            <span>{label}</span>
            <button className="btn sm" aria-label={per === 'mes' ? 'Mes siguiente' : 'Año siguiente'} disabled={atEnd} onClick={() => step(1)}>›</button>
          </div>
        )}
      </div>
      <Seg small value={per} onChange={(v) => { setPer(v); setOpen(null); }} options={[['mes', 'Mes'], ['anio', 'Año'], ['todo', 'Todo']]} />
      <div className="fin-total">
        <b>{fin.totalTxt(pays)}</b>
        <small>{pays.length ? `${pays.length === 1 ? '1 pago' : `${pays.length} pagos`} de ${byStu.size === 1 ? '1 alumno' : `${byStu.size} alumnos`}` : 'Todavía no hay pagos en este período'}</small>
      </div>
      {[pagaron, sinPago].map((group, gi) => group.length > 0 && (
      <div key={gi} className="rows">
        {gi === 1 && <div className="lgroup">{sinPagos} ({group.length})</div>}
        {group.map((r) => {
          const isOpen = open === r.id;
          return (
            <div key={r.id} className={`lrow${isOpen ? ' open' : ''}`}>
              <button className="frow" aria-expanded={isOpen} onClick={() => { setOpen(isOpen ? null : r.id); setConfirm(null); }}>
                <span className="fw">
                  <b>{r.name}</b>
                  <small>{r.n ? `${r.n === 1 ? '1 pago' : `${r.n} pagos`}, el último el ${shortDate(r.last!)}` : r.ever ? 'Tocá para ver sus pagos anteriores' : 'Todavía no tiene pagos registrados'}</small>
                </span>
                <span className={`amt${r.sum ? '' : ' zero'}`}>{r.sum ? money(r.sum, fin.moneda(r.id)) : '—'}</span>
                <span className="chev" aria-hidden="true">›</span>
              </button>
              {isOpen && (
                <Ledger fin={fin} id={r.id} confirm={confirm} setConfirm={setConfirm} onDelete={del}
                  onPay={onPay} onRemind={onRemind} onOpen={onOpen} />
              )}
            </div>
          );
        })}
      </div>
      ))}
    </section>
  );
}

/** Registro de pagos de un alumno, mes a mes, con la fecha de cada pago. */
function Ledger({ fin, id, confirm, setConfirm, onDelete, onPay, onRemind, onOpen }: {
  fin: Fin; id: string; confirm: string | null; setConfirm: (id: string | null) => void; onDelete: (id: string) => void;
  onPay: (id: string) => void; onRemind: (id: string) => void; onOpen: OpenStudent;
}) {
  const [all, setAll] = useState(false);
  const s = fin.students.find((x) => x.id === id);
  const pays = s ? fin.pagosDe(id) : fin.payments.filter((p) => p.student_id === id);
  const byMonth = new Map<string, Payment[]>();
  for (const p of pays) byMonth.set(ym(p.paid_on), [...(byMonth.get(ym(p.paid_on)) ?? []), p]);
  const first = pays.length ? ym(pays[0]!.paid_on) : null;
  const top = [ym(fin.today), ...byMonth.keys()].sort().pop()!;
  const months: string[] = [];
  if (first) for (let mm = top; mm >= first && months.length < 240; mm = shiftYM(mm, -1)) months.push(mm);
  const shown = all ? months : months.slice(0, 12);
  const activo = s && fin.estado(s).estado === 'activo';
  const c = activo ? fin.estadoPago(s) : null;

  return (
    <div className="ledger">
      {s && (
        <p className="lstate">
          {c ? <Pill c={c} /> : <span className="pill">{ESTADO_LABEL[fin.estado(s).estado]}</span>}
          <span>{fin.modoTxt(s)}</span>
        </p>
      )}
      {!months.length && <p className="hint" style={{ margin: '8px 0' }}>Todavía no tiene pagos registrados.</p>}
      {shown.map((mm) => {
        const ps = byMonth.get(mm) ?? [];
        return (
          <div key={mm} className="lmonth">
            <div className="lm-h">
              <span>{cap(monthName(mm))} {mm.slice(0, 4)}</span>
              <span className={`amt${ps.length ? '' : ' zero'}`}>{ps.length ? money(ps.reduce((a, p) => a + p.amount, 0), fin.moneda(id)) : 'Sin pagos'}</span>
            </div>
            {ps.map((p) => (
              <div key={p.id} className="lpay">
                <span className="ld">{shortDate(p.paid_on)}</span>
                <span className="lc">{fin.queCubre(p)}{p.note ? `, ${p.note}` : ''}{localDateOf(p.created_at) !== p.paid_on ? ` · registrado el ${registrado(p.created_at)}` : ''}</span>
                <span className="amt">{money(p.amount, fin.moneda(id))}</span>
                {confirm === p.id
                  ? <span className="lconf"><button className="btn sm danger" onClick={() => onDelete(p.id)}>Borrar</button><button className="btn sm" onClick={() => setConfirm(null)}>No</button></span>
                  : <button className="btn sm ghost" aria-label={`Borrar el pago del ${shortDate(p.paid_on)}`} onClick={() => setConfirm(p.id)}>{Icon.trash}</button>}
              </div>
            ))}
          </div>
        );
      })}
      {months.length > shown.length && (
        <button className="btn sm ghost" onClick={() => setAll(true)}>Ver los {months.length - shown.length} meses anteriores</button>
      )}
      <div className="lacts">
        <button className="btn sm" onClick={() => onPay(id)}>Registrar pago</button>
        {c && (urgente(c) || c.k === 'pronto') && <button className="btn sm" onClick={() => onRemind(id)}>Recordar</button>}
        {s && <button className="btn sm ghost" onClick={() => onOpen(id, 'pagos')}>Abrir su ficha</button>}
      </div>
    </div>
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

/** Fecha y hora de registro (cuándo se cargó el pago en la plataforma). */
const registrado = (at: string): string => {
  const d = new Date(at);
  return `${shortDate(localDateOf(d))} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/**
 * Registrar un pago: se asigna a un período del alumno y sólo cambia lo
 * abonado y el saldo de ese período. Nunca crea ni cambia clases. Crear un
 * período nuevo es aparte (botón "Crear período nuevo").
 */
export function PaymentSheet({ fin, studentId, chargeId, onClose, onSaved, onChanged, toast }: {
  fin: Fin; studentId: string | null; chargeId?: string | null; onClose: () => void; onSaved: () => void; onChanged: () => void; toast: Toast;
}) {
  const options = fin.students.filter((s) => fin.estado(s).estado !== 'baja' || s.id === studentId).sort((a, b) => a.name.localeCompare(b.name));
  const [sid, setSid] = useState(studentId ?? options[0]?.id ?? '');
  const s = fin.students.find((x) => x.id === sid);
  // Período recién creado, mientras se recargan los datos.
  const [nuevo, setNuevo] = useState<Charge | null>(null);
  const cargos = s ? [...fin.cargosDe(s.id), ...(nuevo && nuevo.student_id === s.id && !fin.cargo(nuevo.id) ? [nuevo] : [])] : [];
  const pend = cargos.filter((c) => fin.saldoDe(c) > 0);
  const otros = cargos.filter((c) => fin.saldoDe(c) <= 0).reverse();
  const sugerido = pend[0] ?? null;
  const [cid, setCid] = useState('');
  const [fecha, setFecha] = useState(fin.today);
  const [monto, setMonto] = useState('');
  const [nota, setNota] = useState('');
  const [creating, setCreating] = useState(false);
  const [progPend, setProgPend] = useState(true);
  const [busy, setBusy] = useState(false);
  const m = s ? fin.modo(s) : 'clases';
  useEffect(() => {
    if (!s) return;
    const pre = chargeId && fin.cargo(chargeId)?.student_id === s.id ? chargeId : fin.pendientes(s)[0]?.id ?? '';
    setCid(pre);
    setCreating(!fin.cargosDe(s.id).length);
  }, [sid]); // eslint-disable-line react-hooks/exhaustive-deps
  const c = cargos.find((x) => x.id === cid) ?? null;
  useEffect(() => {
    if (c) setMonto(fin.saldoDe(c) > 0 ? String(fin.saldoDe(c)) : '');
  }, [cid]); // eslint-disable-line react-hooks/exhaustive-deps
  const mon = s ? fin.moneda(s) : 'USD';
  const saldo = c ? fin.saldoDe(c) : 0;
  const n = Number(monto) || 0;

  const save = async () => {
    if (!s || !c) return;
    setBusy(true);
    try {
      await coachApi.addPayment({ student_id: s.id, charge_id: c.id, paid_on: fecha, amount: n, note: nota.trim() || null });
      const b = fin.billing(s);
      if (m === 'prog' && progPend !== b.prog_pendiente) await coachApi.updateStudent(s.id, { billing: { ...b, prog_pendiente: progPend } });
      onSaved();
    } catch (e) { toast((e as ApiError).message); } finally { setBusy(false); }
  };

  const opt = (x: Charge) => {
    const sx = fin.saldoDe(x);
    return `${cap(fin.cargoMes(x))} · ${fin.cargoTxt(x)} · ${money(x.amount, mon)} · ${sx > 0 ? `saldo ${money(sx, mon)}` : sx < 0 ? 'pagado de más' : 'pagado'}`;
  };

  return (
    <Sheet title="Registrar pago" onClose={onClose}>
      <div className="fields" style={{ marginTop: 0 }}>
        <div className="field full">
          <label htmlFor="pg-al">Alumno</label>
          <select id="pg-al" value={sid} onChange={(e) => { setSid(e.target.value); setNuevo(null); }}>
            {options.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </div>
        <div className="field full">
          <label htmlFor="pg-per">Período que se paga</label>
          <select id="pg-per" value={cid} onChange={(e) => setCid(e.target.value)} disabled={!cargos.length}>
            <option value="">{cargos.length ? 'Elegí el período…' : 'No tiene períodos: crealo abajo'}</option>
            {pend.length > 0 && <optgroup label="Pendientes de pago">{pend.map((x) => <option key={x.id} value={x.id}>{opt(x)}</option>)}</optgroup>}
            {otros.length > 0 && <optgroup label="Ya pagados (pagos de períodos anteriores)">{otros.map((x) => <option key={x.id} value={x.id}>{opt(x)}</option>)}</optgroup>}
          </select>
        </div>
      </div>
      {c && (
        <div className="phase" style={{ marginTop: 10 }}>
          <span className="ph-tag">{c.id === sugerido?.id ? 'Sugerido' : 'Elegido'}</span>
          <div>
            <b>{cap(fin.cargoMes(c))}</b> · {fin.cargoTxt(c)}
            <br />Importe {money(c.amount, mon)} · pagado {money(fin.pagadoDe(c), mon)} · {saldo > 0 ? <>saldo <b>{money(saldo, mon)}</b></> : saldo < 0 ? `pagado de más ${money(-saldo, mon)}` : 'sin saldo'}
            {c.id === sugerido?.id && pend.length > 1 && <><br /><small>Es el período pendiente más antiguo. Tiene {pend.length - 1} más pendiente{pend.length > 2 ? 's' : ''}.</small></>}
          </div>
        </div>
      )}
      {s && !creating && (
        <>
          {!pend.length && <p className="hint" style={{ margin: '8px 0 0' }}>No tiene períodos pendientes de pago. Si empezó uno nuevo, crealo primero; si es el pago de un período anterior, elegilo en la lista.</p>}
          <div className="actions" style={{ marginTop: 8 }}><button className="btn sm" onClick={() => setCreating(true)}>{Icon.plus} Crear período nuevo</button></div>
        </>
      )}
      {s && creating && (
        <PeriodForm fin={fin} s={s} toast={toast}
          onCancel={cargos.length ? () => setCreating(false) : undefined}
          onDone={(ch, created) => { setNuevo(ch); setCid(ch.id); setCreating(false); if (created) { toast('Período creado'); onChanged(); } }} />
      )}
      {c && (
        <>
          <div className="fields">
            <div className="field"><label htmlFor="pg-f">Fecha en que recibiste el pago</label><DateInput id="pg-f" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
            <div className="field"><label htmlFor="pg-m">Monto ({mon === 'ARS' ? '$' : 'US$'})</label><input id="pg-m" type="number" inputMode="decimal" min={0} step="any" value={monto} onChange={(e) => setMonto(e.target.value)} /></div>
            {m === 'prog' && (
              <label className="field full checkline"><input type="checkbox" checked={progPend} onChange={(e) => setProgPend(e.target.checked)} /> Falta mandarle la programación nueva</label>
            )}
            <div className="field full"><label htmlFor="pg-n">Nota</label><input id="pg-n" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Opcional (transferencia, efectivo…)" /></div>
          </div>
          <p className="hint" style={{ margin: 0 }}>
            Fecha de registro: se guarda sola al registrar (hoy, {registrado(new Date().toISOString())}).
            {fecha > fin.today ? ' Ojo: la fecha en que lo recibiste es posterior a hoy.' : ''}
          </p>
          <p className="hint" style={{ margin: '4px 0 0' }}>
            {n > 0 && saldo > 0 && n < saldo ? `Pago parcial: queda un saldo de ${money(saldo - n, mon)}. ` : ''}
            {n > 0 && n > Math.max(0, saldo) ? `Queda pagado de más ${money(n - Math.max(0, saldo), mon)}. ` : ''}
            {c.kind === 'paquete' ? `Registrar el pago no cambia las clases del período (${c.sessions ?? '—'} incluidas).` : 'Registrar el pago no cambia el período.'}
          </p>
          <button className="btn primary wide" disabled={busy || !s || !fecha || !(n > 0)} onClick={save}>{busy ? 'Guardando…' : 'Guardar pago'}</button>
        </>
      )}
    </Sheet>
  );
}

/** Crear un período (paquete, mes o programación). Aparte del pago; si ya existe, no se duplica. */
function PeriodForm({ fin, s, onDone, onCancel, toast }: {
  fin: Fin; s: FinanceStudent; onDone: (c: Charge, created: boolean) => void; onCancel?: () => void; toast: Toast;
}) {
  const sug = useMemo(() => fin.sugerirPeriodo(s), [s.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [inicio, setInicio] = useState(sug.kind === 'mes' ? sug.starts_on.slice(0, 7) : sug.starts_on);
  const [ses, setSes] = useState(sug.sessions != null ? String(sug.sessions) : '');
  const [imp, setImp] = useState(sug.amount ? String(sug.amount) : '');
  const [nota, setNota] = useState('');
  const [busy, setBusy] = useState(false);
  const mon = fin.moneda(s);
  const startsOn = sug.kind === 'mes' ? `${inicio}-01` : inicio;
  const dup = inicio ? fin.periodoExistente(s, sug.kind, startsOn) : null;
  const valid = Boolean(inicio) && imp !== '' && Number(imp) >= 0 && (sug.kind !== 'paquete' || Number(ses) >= 1);

  const save = async () => {
    setBusy(true);
    try {
      const b = fin.billing(s);
      if (sug.kind === 'paquete' && !b.cuenta_desde) await coachApi.updateStudent(s.id, { billing: { ...b, cuenta_desde: startsOn, saldo_inicial: 0 } });
      const r = await coachApi.addCharge({
        student_id: s.id, kind: sug.kind, starts_on: startsOn, sessions: sug.kind === 'paquete' ? Number(ses) : null,
        amount: Number(imp), note: nota.trim() || null,
      });
      onDone(r.charge, true);
    } catch (e) { toast((e as ApiError).message); } finally { setBusy(false); }
  };

  return (
    <div className="ledger" style={{ marginTop: 12 }}>
      <div className="lm-h"><span>Nuevo período</span></div>
      <p className="hint" style={{ margin: '4px 0 0' }}>Es aparte del pago: crea el período con sus clases. Después le asignás el pago.</p>
      <div className="fields">
        {sug.kind === 'mes'
          ? <div className="field"><label htmlFor="np-i">Mes</label><DateInput id="np-i" type="month" value={inicio} onChange={(e) => setInicio(e.target.value)} /></div>
          : <div className="field"><label htmlFor="np-i">{sug.kind === 'paquete' ? 'Primera clase del paquete' : 'Fecha de la programación'}</label><DateInput id="np-i" value={inicio} onChange={(e) => setInicio(e.target.value)} /></div>}
        {sug.kind === 'paquete' && <div className="field"><label htmlFor="np-s">Clases incluidas</label><input id="np-s" type="number" inputMode="numeric" min={1} value={ses} onChange={(e) => setSes(e.target.value)} /></div>}
        <div className="field"><label htmlFor="np-a">Importe ({mon === 'ARS' ? '$' : 'US$'})</label><input id="np-a" type="number" inputMode="decimal" min={0} step="any" value={imp} onChange={(e) => setImp(e.target.value)} /></div>
        <div className="field full"><label htmlFor="np-n">Nota</label><input id="np-n" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Opcional" /></div>
      </div>
      {dup ? (
        <div className="phase warn" style={{ marginTop: 8 }}>
          <span className="ph-tag">Ya existe</span>
          <div>Ese período ya está creado ({fin.cargoTxt(dup)}). No se crea otro. <button className="linkbtn" onClick={() => onDone(dup, false)}>Usar ese período</button></div>
        </div>
      ) : null}
      <div className="actions">
        <button className="btn primary" disabled={busy || !valid || Boolean(dup)} onClick={save}>{busy ? 'Creando…' : 'Crear período'}</button>
        {onCancel && <button className="btn ghost" onClick={onCancel}>Cancelar</button>}
      </div>
    </div>
  );
}

function PeriodSheet({ fin, s, onClose, onSaved, toast }: { fin: Fin; s: FinanceStudent; onClose: () => void; onSaved: () => void; toast: Toast }) {
  return (
    <Sheet title={`Nuevo período · ${firstName(s.name)}`} onClose={onClose}>
      <PeriodForm fin={fin} s={s} toast={toast} onCancel={onClose} onDone={(_c, created) => { if (created) onSaved(); else onClose(); }} />
    </Sheet>
  );
}

/** Cambiar un período ya creado (sumar clases, corregir el importe) es explícito y pide el motivo. */
function ChargeEditSheet({ fin, c, onClose, onSaved, toast }: { fin: Fin; c: Charge; onClose: () => void; onSaved: () => void; toast: Toast }) {
  const [ses, setSes] = useState(c.sessions != null ? String(c.sessions) : '');
  const [imp, setImp] = useState(String(c.amount));
  const [motivo, setMotivo] = useState('');
  const [busy, setBusy] = useState(false);
  const mon = fin.moneda(c.student_id);
  const changedSes = c.kind === 'paquete' && ses !== '' && Number(ses) !== c.sessions;
  const changedImp = imp !== '' && Number(imp) !== c.amount;
  const save = async () => {
    setBusy(true);
    try {
      await coachApi.updateCharge(c.id, {
        ...(changedSes ? { sessions: Number(ses) } : {}), ...(changedImp ? { amount: Number(imp) } : {}), reason: motivo.trim() || null,
      });
      onSaved();
    } catch (e) { toast((e as ApiError).message); } finally { setBusy(false); }
  };
  return (
    <Sheet title="Cambiar período" onClose={onClose}>
      <p className="hint" style={{ marginTop: 0 }}>{cap(fin.cargoMes(c))} · {fin.cargoTxt(c)}</p>
      <div className="fields" style={{ marginTop: 0 }}>
        {c.kind === 'paquete' && <div className="field"><label htmlFor="ce-s">Clases incluidas</label><input id="ce-s" type="number" inputMode="numeric" min={0} value={ses} onChange={(e) => setSes(e.target.value)} /></div>}
        <div className="field"><label htmlFor="ce-a">Importe ({mon === 'ARS' ? '$' : 'US$'})</label><input id="ce-a" type="number" inputMode="decimal" min={0} step="any" value={imp} onChange={(e) => setImp(e.target.value)} /></div>
        <div className="field full"><label htmlFor="ce-m">Motivo</label><input id="ce-m" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: 2 clases extra de recuperación" /></div>
      </div>
      {changedSes && <p className="hint" style={{ margin: 0 }}>{Number(ses) > (c.sessions ?? 0) ? `Suma ${Number(ses) - (c.sessions ?? 0)} clases` : `Quita ${(c.sessions ?? 0) - Number(ses)} clases`} al saldo del paquete. Queda en el registro de cambios.</p>}
      <button className="btn primary wide" disabled={busy || (!changedSes && !changedImp)} onClick={save}>{busy ? 'Guardando…' : 'Guardar cambios'}</button>
    </Sheet>
  );
}

/** Registros viejos con clases posiblemente duplicadas por un pago. Se muestran antes de corregir. */
function RevisionPeriodos({ fin, onOpen, reload, toast }: { fin: Fin; onOpen: OpenStudent; reload: () => void; toast: Toast }) {
  const [items, setItems] = useState<ChargeReviewItem[] | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const key = `${fin.payments.length}:${fin.charges.length}:${fin.charges.filter((c) => c.reviewed_at).length}`;
  useEffect(() => {
    let live = true;
    coachApi.chargeReview().then((r) => { if (live) setItems(r.items); }).catch(() => { if (live) setItems([]); });
    return () => { live = false; };
  }, [key]);
  if (!items?.length) return null;
  const resolve = async (it: ChargeReviewItem, action: 'fix' | 'keep') => {
    setBusy(true);
    try {
      const body = action === 'keep' ? { action: 'keep' as const }
        : it.proposal.action === 'merge' ? { action: 'merge' as const, into: it.proposal.into.id } : { action: 'opening' as const };
      await coachApi.resolveCharge(it.charge.id, body);
      setConfirm(null);
      toast(action === 'keep' ? 'Marcado como revisado' : 'Período corregido');
      setItems((xs) => (xs ?? []).filter((x) => x.charge.id !== it.charge.id));
      reload();
    } catch (e) { toast((e as ApiError).message); } finally { setBusy(false); }
  };
  return (
    <section className="card">
      <div className="card-h"><h2>Revisar períodos</h2><span className="mini">{items.length}</span></div>
      <div className="phase warn" style={{ marginTop: 0 }}>
        <span className="ph-tag">Revisar</span>
        <div>Antes, registrar un pago sumaba las clases del paquete aunque ese paquete ya estuviera contado. Estos períodos parecen repetidos. Revisalos: nada se corrige hasta que confirmes, y corregir no borra pagos ni asistencias.</div>
      </div>
      <div className="rows">
        {items.map((it) => {
          const mon = fin.moneda(it.student_id);
          return (
            <div key={it.charge.id} className="ledger" style={{ marginTop: 10 }}>
              <div className="lm-h">
                <button className="linkbtn" onClick={() => onOpen(it.student_id, 'pagos')}>{it.student_name}</button>
                <span>{fin.cargoTxt(it.charge)}</span>
              </div>
              <p className="hint" style={{ margin: '6px 0' }}>{it.reason}</p>
              {it.payments.map((p) => (
                <div key={p.id} className="lpay">
                  <span className="ld">{shortDate(p.paid_on)}</span>
                  <span className="lc">Recibido el {shortDate(p.paid_on)} · registrado el {registrado(p.created_at)}</span>
                  <span className="amt">{money(p.amount, mon)}</span>
                </div>
              ))}
              <p style={{ margin: '8px 0 4px', fontSize: 14 }}>
                Hoy le figuran <b>{it.restan_hoy}</b> clases; corregido quedarían <b>{it.restan_corregido}</b>.
              </p>
              <p className="hint" style={{ margin: 0 }}>Corrección: {it.proposal_text}</p>
              {it.proposal.action === 'merge' && (
                <p className="hint" style={{ margin: '4px 0 0' }}>Los pagos quedan registrados. Si al unir queda pagado de más, fijate si fue un pago cargado dos veces o un adelanto (en ese caso, “Está bien así”).</p>
              )}
              <div className="lacts">
                {confirm === it.charge.id ? (
                  <>
                    <button className="btn sm danger" disabled={busy} onClick={() => resolve(it, 'fix')}>Confirmar corrección</button>
                    <button className="btn sm" onClick={() => setConfirm(null)}>Cancelar</button>
                  </>
                ) : (
                  <>
                    <button className="btn sm primary" onClick={() => setConfirm(it.charge.id)}>Corregir</button>
                    <button className="btn sm" disabled={busy} onClick={() => resolve(it, 'keep')}>Está bien así</button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
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
        <div className="field"><label htmlFor="mv-a">Nuevo día</label><DateInput id="mv-a" value={to} onChange={(e) => setTo(e.target.value)} /></div>
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
  const [paying, setPaying] = useState<{ charge: string | null } | null>(null);
  const [reminding, setReminding] = useState(false);
  const [moving, setMoving] = useState(false);
  const [newPeriod, setNewPeriod] = useState(false);
  const [editCharge, setEditCharge] = useState<Charge | null>(null);
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
  const lastPay = fin.pagosDe(s.id).map((p) => p.created_at).sort().pop() ?? '';
  const aviso = b.pago_avisado && b.pago_avisado > lastPay ? b.pago_avisado : null;
  const link = b.pago_link && b.pago_link.creado > lastPay ? b.pago_link : null;

  const del = async (id: string) => {
    try { await coachApi.deletePayment(id); setConfirm(null); toast('Pago borrado'); reload(); } catch (e) { toast((e as ApiError).message); }
  };
  const delCharge = async (id: string) => {
    try { await coachApi.deleteCharge(id); setConfirm(null); toast('Período borrado'); reload(); } catch (e) { toast((e as ApiError).message); }
  };
  const cargos = [...fin.cargosDe(s.id)].reverse();
  const sueltos = ps.filter((p) => !fin.cargo(p.charge_id));
  const mon = fin.moneda(s);

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
          <dt>Honorarios</dt><dd>{b.cuota != null ? <><span className="amt">{money(fin.cuotaEn(s, fin.today), fin.moneda(s))}</span> · {fin.modoTxt(s)}</> : <span className="hint">Sin cargar</span>}</dd>
          {sd && <><dt>Paquete</dt><dd>{sd.restan > 0 ? `Le ${sd.restan === 1 ? 'queda 1 clase' : `quedan ${sd.restan} clases`}` : sd.restan === 0 ? 'Terminó el paquete' : `Debe ${-sd.restan} ${-sd.restan === 1 ? 'clase' : 'clases'}`}{c?.due && sd.restan >= 0 ? ` · paga el ${fmtLong(c.due)}` : ''}</dd></>}
          {!sd && c?.due && <><dt>Vence</dt><dd>{fmtLong(c.due)}</dd></>}
          <dt>Enfoque</dt><dd>{b.enfoque || '—'}</dd>
          <dt>WhatsApp</dt><dd>{b.telefono || '—'}</dd>
        </dl>
        <div className="actions">
          <button className="btn primary" onClick={() => setPaying({ charge: null })}>{Icon.plus} Registrar pago</button>
          <button className="btn" onClick={() => setNewPeriod(true)}>{Icon.plus} Nuevo período</button>
          {c && (urgente(c) || c.k === 'pronto') && <button className="btn" onClick={() => setReminding(true)}>Recordar pago</button>}
          {!fin.isAsinc(s) && est.estado === 'activo' && <button className="btn" onClick={() => setMoving(true)}>Pasar una clase</button>}
          <button className="btn" onClick={() => setEditing(true)}>{Icon.edit} Honorarios y datos</button>
        </div>
        {aviso && (
          <div className="phase warn" style={{ marginTop: 12 }}><span className="ph-tag">A confirmar</span>
            <div>Avisó desde la app que pagó el {shortDate(aviso.slice(0, 10))}. Cuando lo verifiques, registrá el pago.</div>
          </div>
        )}
        {moves.length > 0 && (
          <div className="phase" style={{ marginTop: 12 }}><span className="ph-tag">Cambios</span>
            <div>{moves.map((o) => <div key={o.from!}>Clase del {shortDate(o.from!)} pasada al {shortDate(o.date)}{o.time ? ` · ${o.time}` : ''}</div>)}</div>
          </div>
        )}
      </section>

      <PayLinkCard fin={fin} s={s} link={link} suggested={c?.monto ?? fin.cuotaEn(s, fin.today)} toast={toast} reload={reload} />

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
        <div className="card-h"><h2>Períodos y pagos</h2><span className="mini">Cobrado {money(total, mon)}</span></div>
        {!cargos.length && !sueltos.length && <p className="hint">Todavía no tiene períodos. Creá el período (paquete, mes o programación) y después registrás su pago.</p>}
        {cargos.map((c) => {
          const pays = fin.pagosDeCargo(c);
          const sal = fin.saldoDe(c);
          const pill = sal <= 0 ? { t: sal < 0 ? 'Pagado de más' : 'Pagado', cls: 'ok' } : pays.length ? { t: 'Pago parcial', cls: 'low' } : { t: 'Pendiente', cls: c.starts_on <= fin.today ? 'bad' : 'low' };
          return (
            <div key={c.id} className="ledger" style={{ marginTop: 10 }}>
              <div className="lm-h"><span>{fin.cargoTxt(c)}</span><Pill c={pill} /></div>
              <p className="hint" style={{ margin: '4px 0 6px' }}>
                {cap(fin.cargoMes(c))} · importe {money(c.amount, mon)} · pagado {money(fin.pagadoDe(c), mon)}
                {sal > 0 ? ` · saldo ${money(sal, mon)}` : sal < 0 ? ` · ${money(-sal, mon)} de más` : ''}
                {c.kind === 'paquete' && c.in_opening ? ' · sus clases ya estaban en el saldo inicial' : c.kind === 'paquete' && !fin.cuenta(s, c) ? ' · antes de la cuenta actual del paquete' : ''}
              </p>
              {pays.map((p) => (
                <div key={p.id} className="lpay">
                  <span className="ld">{shortDate(p.paid_on)}</span>
                  <span className="lc">Recibido el {shortDate(p.paid_on)} · registrado el {registrado(p.created_at)}{p.note ? ` · ${p.note}` : ''}</span>
                  <span className="amt">{money(p.amount, mon)}</span>
                  {confirm === p.id
                    ? <span className="lconf"><button className="btn sm danger" onClick={() => del(p.id)}>Borrar</button><button className="btn sm" onClick={() => setConfirm(null)}>No</button></span>
                    : <button className="btn sm ghost" aria-label={`Borrar el pago del ${shortDate(p.paid_on)}`} onClick={() => setConfirm(p.id)}>{Icon.trash}</button>}
                </div>
              ))}
              <div className="lacts">
                <button className="btn sm" onClick={() => setPaying({ charge: c.id })}>Registrar pago</button>
                <button className="btn sm ghost" onClick={() => setEditCharge(c)}>{c.kind === 'paquete' ? 'Cambiar clases o importe' : 'Cambiar importe'}</button>
                {!pays.length && (confirm === c.id
                  ? <><button className="btn sm danger" onClick={() => delCharge(c.id)}>Borrar período</button><button className="btn sm" onClick={() => setConfirm(null)}>No</button></>
                  : <button className="btn sm ghost" onClick={() => setConfirm(c.id)}>Borrar</button>)}
              </div>
            </div>
          );
        })}
        {sueltos.length > 0 && (
          <div className="ledger" style={{ marginTop: 10 }}>
            <div className="lm-h"><span>Pagos sin período</span></div>
            {sueltos.map((p) => (
              <div key={p.id} className="lpay">
                <span className="ld">{shortDate(p.paid_on)}</span>
                <span className="lc">{fin.queCubre(p)} · registrado el {registrado(p.created_at)}</span>
                <span className="amt">{money(p.amount, mon)}</span>
              </div>
            ))}
          </div>
        )}
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
                    <small>{prev ? (pct !== null ? `${pct > 0 ? '+' : ''}${pct}% sobre ${money(prev.monto, fin.moneda(s))}` : 'Cambio') : 'Antes del primer cambio registrado'}</small></span>
                  <span className="amt">{money(x.monto, fin.moneda(s))}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {paying && <PaymentSheet fin={fin} studentId={s.id} chargeId={paying.charge} onClose={() => setPaying(null)} onSaved={() => { setPaying(null); reload(); toast('Pago registrado'); }} onChanged={reload} toast={toast} />}
      {newPeriod && <PeriodSheet fin={fin} s={s} onClose={() => setNewPeriod(false)} onSaved={() => { setNewPeriod(false); reload(); toast('Período creado'); }} toast={toast} />}
      {editCharge && <ChargeEditSheet fin={fin} c={editCharge} onClose={() => setEditCharge(null)} onSaved={() => { setEditCharge(null); reload(); toast('Período actualizado'); }} toast={toast} />}
      {reminding && <ReminderSheet fin={fin} studentId={s.id} onClose={() => setReminding(false)} toast={toast} />}
      {moving && <MoveSheet fin={fin} studentId={s.id} onClose={() => setMoving(false)} onSaved={(m) => { setMoving(false); reload(); toast(m); }} />}
    </>
  );
}

/** Link de Mercado Pago para la cuota que sigue: lo ve el alumno en "Mi plan y pagos". */
function PayLinkCard({ fin, s, link, suggested, toast, reload }: {
  fin: Fin; s: FinanceStudent; link: PayLink | null; suggested: number; toast: Toast; reload: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState('');
  const [monto, setMonto] = useState('');
  const [detalle, setDetalle] = useState('');
  const [busy, setBusy] = useState(false);
  const moneda = fin.moneda(s);
  const cuota = fin.cuotaEn(s, fin.today);
  const save = async (next: PayLink | null) => {
    setBusy(true);
    try {
      await coachApi.updateStudent(s.id, { billing: { ...fin.billing(s), pago_link: next } });
      setEditing(false);
      reload();
      toast(next ? 'Link de pago guardado' : 'Link quitado');
    } catch (e) { toast((e as ApiError).message); } finally { setBusy(false); }
  };
  const open = () => { setUrl(''); setMonto(suggested ? String(suggested) : ''); setDetalle(''); setEditing(true); };
  const valid = isMercadoPago(url) && monto !== '' && Number(monto) > 0;
  return (
    <section className="card">
      <div className="card-h">
        <h2>Link de pago</h2>
        {!editing && <button className="btn sm" onClick={open}>{link ? 'Cambiar' : <>{Icon.plus} Cargar link</>}</button>}
      </div>
      {!editing && (link ? (
        <>
          <div className="paylink">
            <span className="fw"><b>{money(link.monto, link.moneda)}</b><small>{link.detalle || 'Próxima cuota'} · cargado el {shortDate(link.creado.slice(0, 10))}</small></span>
            <a className="btn sm" href={link.url} target="_blank" rel="noopener noreferrer">Abrir</a>
          </div>
          {link.moneda !== moneda || (cuota && link.monto !== cuota)
            ? <p className="hint warn-t">El link no coincide con sus honorarios ({money(cuota, moneda)}). Revisá que sea el correcto.</p>
            : null}
          <div className="actions" style={{ marginTop: 6 }}><button className="btn sm ghost" disabled={busy} onClick={() => save(null)}>Quitar link</button></div>
        </>
      ) : <p className="hint">Pegá el link de cobro de Mercado Pago de su próxima cuota y lo ve en su perfil con el botón para pagar. Se oculta solo cuando registrás el pago.</p>)}
      {editing && (
        <>
          <div className="fields">
            <div className="field full">
              <label htmlFor="pl-url">Link de Mercado Pago</label>
              <input id="pl-url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://mpago.la/…" />
              {url && !isMercadoPago(url) && <small className="err">Tiene que ser un link https de Mercado Pago (mercadopago.com.ar, mpago.la o mpago.li).</small>}
            </div>
            <div className="field">
              <label htmlFor="pl-monto">Importe del link ({moneda === 'ARS' ? '$' : 'US$'})</label>
              <input id="pl-monto" type="number" inputMode="decimal" min={0} step="any" value={monto} onChange={(e) => setMonto(e.target.value)} />
              {monto !== '' && cuota > 0 && Number(monto) !== cuota && <small>Sus honorarios son {money(cuota, moneda)}: el importe tiene que coincidir con lo que configuraste en Mercado Pago.</small>}
            </div>
            <div className="field">
              <label htmlFor="pl-det">Detalle (opcional)</label>
              <input id="pl-det" value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder="Ej.: paquete de 8 clases" />
            </div>
          </div>
          <p className="hint">Que el alumno abra el link no marca la cuota como pagada: cuando te llegue el pago, registralo acá.</p>
          <div className="actions">
            <button className="btn primary" disabled={busy || !valid}
              onClick={() => save({ url: url.trim(), monto: Number(monto), moneda, detalle: detalle.trim() || null, creado: new Date().toISOString() })}>
              {busy ? 'Guardando…' : 'Guardar link'}
            </button>
            <button className="btn ghost" onClick={() => setEditing(false)}>Cancelar</button>
          </div>
        </>
      )}
    </section>
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
                <option value="clases">Por paquete de clases</option><option value="mensual">Mensual (paga después de la 1ª clase del mes)</option>
              </select>
            </div>
          </>
        )}
        <div className="field">
          <label htmlFor="b-mon">Moneda</label>
          <select id="b-mon" value={b.moneda ?? 'USD'} onChange={(e) => set({ moneda: e.target.value as Moneda })}>
            <option value="USD">Dólares (US$)</option><option value="ARS">Pesos ($)</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="b-cuota">Honorarios ({b.moneda === 'ARS' ? '$' : 'US$'})</label>
          <input id="b-cuota" type="number" inputMode="decimal" min={0} step="any" value={cuota} onChange={(e) => setCuota(e.target.value)} />
        </div>
        {changedCuota && (
          <div className="field">
            <label htmlFor="b-desde">El cambio rige desde</label>
            <DateInput id="b-desde" value={desde} onChange={(e) => setDesde(e.target.value)} />
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
            <DateInput id="b-vence" value={b.vence ?? ''} onChange={(e) => set({ vence: e.target.value || null })} />
            <small>Sólo si todavía no tiene pagos cargados.</small>
          </div>
        )}
        {asinc && (
          <div className="field full">
            <label htmlFor="b-prog">Última programación enviada</label>
            <DateInput id="b-prog" value={b.prog_enviada ?? ''} onChange={(e) => set({ prog_enviada: e.target.value || null })} />
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


// ── Asistencia: registro de presentes y ausencias ───────────────────────────

const daysOfMonth = (m: string): string[] => {
  const n = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0).getDate();
  return Array.from({ length: n }, (_, i) => `${m}-${String(i + 1).padStart(2, '0')}`);
};

interface MonthAtt { k: Record<Mark, number>; marks: Array<[string, Mark]>; sinMarcar: string[] }

/** Marcas del mes de un alumno y las clases de su agenda (hasta hoy) que quedaron sin marcar. */
function monthAtt(fin: Fin, s: FinanceStudent, m: string, scheduled: Map<string, Set<string>>): MonthAtt {
  const marks = fin.marcasDe(s.id).filter(([f]) => f.startsWith(m));
  const k: Record<Mark, number> = { p: 0, a: 0, e: 0 };
  for (const [, v] of marks) k[v]++;
  const sinMarcar = [...(scheduled.get(s.id) ?? [])].filter((f) => !fin.marca(s.id, f)).sort();
  return { k, marks, sinMarcar };
}

function scheduledIn(fin: Fin, m: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const f of daysOfMonth(m)) {
    if (f >= fin.today) break;
    for (const x of fin.programados(f)) out.set(x.s.id, (out.get(x.s.id) ?? new Set()).add(f));
  }
  return out;
}

const pctOf = (k: Record<Mark, number>): number | null => {
  const n = k.p + k.a + k.e;
  return n ? Math.round((k.p / n) * 100) : null;
};

function MonthNav({ m, setM, today }: { m: string; setM: (m: string) => void; today: string }) {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      <button className="btn sm" aria-label="Mes anterior" onClick={() => setM(shiftYM(m, -1))}>‹</button>
      <span style={{ minWidth: 92, textAlign: 'center', fontWeight: 600 }}>{cap(monthName(m))} {m.slice(0, 4) !== today.slice(0, 4) ? m.slice(0, 4) : ''}</span>
      <button className="btn sm" aria-label="Mes siguiente" disabled={m >= ym(today)} onClick={() => setM(shiftYM(m, 1))}>›</button>
    </div>
  );
}

function Dots({ marks, sinMarcar }: { marks: Array<[string, Mark]>; sinMarcar: string[] }) {
  const all = [...marks.map(([f, k]) => ({ f, k: k as Mark | null })), ...sinMarcar.map((f) => ({ f, k: null }))].sort((a, b) => a.f.localeCompare(b.f));
  if (!all.length) return null;
  return (
    <span className="attdots" aria-hidden="true">
      {all.map(({ f, k }) => <i key={f} className={k ?? 'none'} title={`${shortDate(f)}: ${k ? MARKS[k].label : 'sin marcar'}`}>{parse(f).getDate()}</i>)}
    </span>
  );
}

/** Más → Asistencia: todos los alumnos, mes por mes. */
export function AttendanceRegister({ fin, right, onOpen, onBack }: { fin: Fin | null; right: ReactNode; onOpen: OpenStudent; onBack: () => void }) {
  const [m, setM] = useState(() => (fin ? ym(fin.today) : ''));
  if (!fin) return <><TopHeader title="Asistencia" right={right} onBack={onBack} /><Skeleton /></>;
  const mm = m || ym(fin.today);
  const sch = scheduledIn(fin, mm);
  const rows = fin.students.filter((s) => !fin.isAsinc(s))
    .map((s) => ({ s, a: monthAtt(fin, s, mm, sch) }))
    .filter((r) => r.a.marks.length || r.a.sinMarcar.length)
    .sort((x, y) => x.s.name.localeCompare(y.s.name));
  const tot = rows.reduce((t, r) => ({ p: t.p + r.a.k.p, a: t.a + r.a.k.a, e: t.e + r.a.k.e, sm: t.sm + r.a.sinMarcar.length }), { p: 0, a: 0, e: 0, sm: 0 });
  return (
    <>
      <TopHeader title="Asistencia" right={right} onBack={onBack} sub={<span>Presentes, ausencias y clases sin marcar</span>} />
      <Enter k={mm}>
        <section className="card">
          <div className="card-h"><h2>Por alumno</h2><MonthNav m={mm} setM={setM} today={fin.today} /></div>
          <div className="attsum">
            <span className="ok"><b>{tot.p}</b>presentes</span>
            <span className="bad"><b>{tot.a}</b>ausentes</span>
            <span className="info"><b>{tot.e}</b>con ejercicios</span>
            <span><b>{tot.sm}</b>sin marcar</span>
          </div>
          {!rows.length ? <p className="hint">No hay clases registradas en este mes.</p> : (
            <div className="rows">
              {rows.map(({ s, a }) => {
                const pct = pctOf(a.k);
                return (
                  <button key={s.id} className="frow attrow" onClick={() => onOpen(s.id, 'agenda')}>
                    <span className="fw">
                      <b>{s.name}</b>
                      <small>{a.k.p} P · {a.k.a} A{a.k.e ? ` · ${a.k.e} E` : ''}{a.sinMarcar.length ? ` · ${a.sinMarcar.length} sin marcar` : ''}</small>
                      <Dots marks={a.marks} sinMarcar={a.sinMarcar} />
                    </span>
                    {pct != null && <span className={`pill ${pct >= 85 ? 'ok' : pct >= 70 ? 'low' : 'bad'}`}>{pct}%</span>}
                  </button>
                );
              })}
            </div>
          )}
          <p className="hint" style={{ fontSize: 12 }}>P presente · A ausente · E faltó y entrenó con los ejercicios que le mandaste. Una sesión cargada cuenta como presente. "Sin marcar" son clases de su agenda que pasaron sin registro: se marcan en Hoy → Agenda.</p>
        </section>
      </Enter>
    </>
  );
}

/** Ficha del alumno → Agenda: su registro de asistencia. */
export function AttendanceLog({ fin, studentId }: { fin: Fin | null; studentId: string }) {
  const [m, setM] = useState(() => (fin ? ym(fin.today) : ''));
  const s = fin?.students.find((x) => x.id === studentId);
  if (!fin || !s) return null;
  const mm = m || ym(fin.today);
  const a = monthAtt(fin, s, mm, scheduledIn(fin, mm));
  const pct = pctOf(a.k);
  const total = fin.marcasDe(s.id);
  const kt: Record<Mark, number> = { p: 0, a: 0, e: 0 };
  for (const [, v] of total) kt[v]++;
  const list = [...a.marks.map(([f, k]) => ({ f, k: k as Mark | null })), ...a.sinMarcar.map((f) => ({ f, k: null }))].sort((x, y) => y.f.localeCompare(x.f));
  return (
    <section className="card">
      <div className="card-h"><h2>Asistencia</h2><MonthNav m={mm} setM={setM} today={fin.today} /></div>
      <div className="attsum">
        <span className="ok"><b>{a.k.p}</b>presentes</span>
        <span className="bad"><b>{a.k.a}</b>ausentes</span>
        <span className="info"><b>{a.k.e}</b>con ejercicios</span>
        <span><b>{pct != null ? `${pct}%` : '—'}</b>asistencia</span>
      </div>
      {!list.length ? <p className="hint">Sin clases registradas en {monthName(mm)}.</p> : (
        <div className="rows">
          {list.map(({ f, k }) => (
            <div key={f} className="frow" style={{ minHeight: 40 }}>
              <span className="fw"><b style={{ fontWeight: 500 }}>{cap(longDate(f))}</b></span>
              <span className={`pill ${k ? MARKS[k].cls : ''}`}>{k ? MARKS[k].label : 'Sin marcar'}</span>
            </div>
          ))}
        </div>
      )}
      <p className="hint" style={{ fontSize: 12 }}>Desde que empezó: {kt.p} presentes, {kt.a} ausencias{kt.e ? `, ${kt.e} con ejercicios` : ''}.</p>
    </section>
  );
}
