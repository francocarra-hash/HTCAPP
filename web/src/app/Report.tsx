import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ApiError } from '../api';
import {
  ASPECT_LABEL, CAP_LABEL, coachApi, QUALITY_SCORE, Cycle, firstName, fmtValue, longDate, pctGain, ReportData, shortDate, StoredReport, studentApi, timeAgo,
} from './data';
import { CapTag, Icon, Skeleton } from './ui';

const FEEL = ['', 'muy duro', 'duro', 'bien', 'muy bien', 'genial'];
const pct = (x: number) => Math.round(x * 100);

/** El informe tal como lo ve (e imprime) el alumno. */
export function ReportView({ data, message, nextGoal, publishedAt }: {
  data: ReportData; message: string | null; nextGoal: string | null; publishedAt?: string | null;
}) {
  const r = data;
  const maxWeek = Math.max(1, ...r.sessions.per_week);
  const diff = r.sessions.count - r.sessions.previous;
  // Asistencia sólo con faltas marcadas por el profe (la agenda puede no haber existido en ese período).
  const missed = r.attendance.a + r.attendance.e;
  const asist = missed ? Math.round((r.sessions.count / (r.sessions.count + missed)) * 100) : null;
  return (
    <article className="report">
      <header className="rp-h">
        <div className="rp-brand"><b>HTC</b><span>Informe de progreso</span></div>
        <h1>{r.student_name}</h1>
        <p>Ciclo {r.cycle} · semanas {r.week_from} a {r.week_to} de tu proceso · {shortDate(r.start)} al {shortDate(r.end)}</p>
      </header>

      <section className="rp-stats">
        <div><b>{r.sessions.count}</b><span>sesiones</span>
          <small>{r.sessions.previous ? (diff > 0 ? `+${diff} que el ciclo anterior` : diff < 0 ? `${diff} que el ciclo anterior` : 'igual que el ciclo anterior') : 'primer ciclo'}</small></div>
        <div><b>{asist != null ? `${asist}%` : r.sessions.total_to_date}</b><span>{asist != null ? 'asistencia' : 'en total'}</span>
          <small>{asist != null ? `${r.sessions.count} de ${r.sessions.count + missed} clases` : 'sesiones desde que empezaste'}</small></div>
        <div><b>{r.feeling ? String(r.feeling.average).replace('.', ',') : '—'}</b><span>cómo te sentiste</span>
          <small>{r.feeling ? `${FEEL[Math.round(r.feeling.average)]} · ${r.feeling.count} ${r.feeling.count === 1 ? 'sesión' : 'sesiones'}` : 'de 1 a 5'}</small></div>
      </section>

      <section className="rp-sec">
        <h2>Tu constancia</h2>
        <div className="rp-weeks" role="img" aria-label={`Sesiones por semana: ${r.sessions.per_week.join(', ')}`}>
          {r.sessions.per_week.map((n, i) => (
            <div key={i}><i style={{ height: `${(n / maxWeek) * 100}%` }} /><b>{n}</b><span>Sem. {r.week_from + i}</span></div>
          ))}
        </div>
        {(r.attendance.a > 0 || r.attendance.e > 0) && (
          <p className="rp-note">{r.attendance.a ? `${r.attendance.a} ${r.attendance.a === 1 ? 'clase' : 'clases'} sin venir` : ''}{r.attendance.a && r.attendance.e ? ' · ' : ''}{r.attendance.e ? `${r.attendance.e} con ejercicios para hacer por tu cuenta` : ''}.</p>
        )}
      </section>

      {r.capacities.length > 0 && (
        <section className="rp-sec">
          <h2>En qué trabajaste</h2>
          <div className="rp-caps">
            {r.capacities.map((c) => {
              const d = pct(c.share) - pct(c.previous_share);
              return (
                <div key={c.id} className="rp-cap" style={{ ['--c' as string]: `var(--cap-${c.id})` }}>
                  <span className="nm"><CapTag id={c.id} label={c.label} /></span>
                  <span className="track"><i style={{ width: `${pct(c.share)}%` }} /></span>
                  <span className="v">{pct(c.share)}%{r.sessions.previous > 0 && Math.abs(d) >= 5 ? <small> ({d > 0 ? '+' : ''}{d})</small> : null}</span>
                </div>
              );
            })}
          </div>
          <p className="rp-note">Parte de tus ejercicios dedicada a cada capacidad{r.sessions.previous ? '; entre paréntesis, el cambio contra el ciclo anterior' : ''}.</p>
        </section>
      )}

      <section className="rp-sec">
        <h2>Tus mejoras</h2>
        {r.improvements.length ? (
          <div className="rp-wins">
            {r.improvements.map((w) => (
              <div key={w.name} className="rp-win" style={{ ['--c' as string]: w.capacity ? `var(--cap-${w.capacity})` : 'var(--accent)' }}>
                <div className="t"><b>{w.name}</b><span className="g">+{pctGain(w.from, w.to)}%</span></div>
                <div className="ft">
                  <span>{fmtValue(w.from, w.unit)} <small>{shortDate(w.from_date)}</small></span>
                  <span className="ar" aria-hidden="true">→</span>
                  <span><b>{fmtValue(w.to, w.unit)}</b> <small>{shortDate(w.to_date)}</small></span>
                  {w.capacity && <CapTag id={w.capacity} label={CAP_LABEL[w.capacity]} muted />}
                </div>
              </div>
            ))}
          </div>
        ) : <p className="rp-note">En este ciclo no hubo ejercicios con cantidades comparables para medir. Se consolidó lo trabajado.</p>}
      </section>

      {((r.quality?.length ?? 0) > 0 || (r.practice?.length ?? 0) > 0) && (
        <section className="rp-sec">
          <h2>Calidad del movimiento</h2>
          <p className="rp-note" style={{ marginTop: 0, marginBottom: 10 }}>
            Hay ejercicios que sostenés en el tiempo para hacerlos cada vez mejor. Ahí el avance está en cómo te movés, no siempre en los números.
          </p>
          {(r.quality ?? []).map((q) => (
            <div key={q.name} className="rp-q">
              <div className="t">
                <b>{q.name}</b>
                <span className="qv">{q.from != null && q.from !== q.to ? <>{q.from} → </> : null}<b>{q.to}</b>/5 · {QUALITY_SCORE[q.to]}</span>
              </div>
              {q.aspects.length > 0 && <div className="rp-chips sm">{q.aspects.map((a) => <span key={a}>{ASPECT_LABEL[a]}</span>)}</div>}
              {q.note && <p className="rp-note" style={{ marginTop: 4 }}>“{q.note}”</p>}
            </div>
          ))}
          {(r.practice ?? []).length > 0 && (
            <>
              <h3 className="rp-h3">Lo que seguiste puliendo</h3>
              <div className="rp-chips">
                {r.practice!.map((p) => <span key={p.name}>{p.name} <small>{p.weeks} sem.</small></span>)}
              </div>
            </>
          )}
        </section>
      )}

      {r.new_exercises.length > 0 && (
        <section className="rp-sec">
          <h2>Nuevos desafíos</h2>
          <div className="rp-chips">{r.new_exercises.map((x) => <span key={x.name}>{x.name}</span>)}</div>
        </section>
      )}

      {r.comments.length > 0 && (
        <section className="rp-sec">
          <h2>Lo que contaste</h2>
          {r.comments.map((c, i) => <blockquote key={i}>“{c.text}” <small>{shortDate(c.date)}</small></blockquote>)}
        </section>
      )}

      {(message || nextGoal) && (
        <section className="rp-sec rp-coach">
          {message && <><h2>Mensaje de tu profe</h2><p>{message}</p></>}
          {nextGoal && <><h2>Objetivo para las próximas 4 semanas</h2><p>{nextGoal}</p></>}
        </section>
      )}
      <footer className="rp-f">HTC · {publishedAt ? `Publicado el ${longDate(publishedAt.slice(0, 10))}` : 'Vista previa'}</footer>
    </article>
  );
}

/** Pantalla completa con el informe y la opción de guardarlo en PDF. */
export function ReportScreen({ report, onClose }: { report: StoredReport; onClose: () => void }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', esc); };
  }, [onClose]);
  return createPortal(
    <div className="bt rp-screen print-root" role="dialog" aria-modal="true" aria-label="Informe">
      <div className="rp-bar no-print">
        <button className="btn sm" onClick={onClose}>{Icon.back} Volver</button>
        <button className="btn sm primary" onClick={() => window.print()}>{Icon.share} Guardar PDF</button>
      </div>
      <ReportView data={report.data} message={report.message} nextGoal={report.next_goal} publishedAt={report.published_at} />
    </div>,
    document.body,
  );
}

// ── coach: pestaña Informes del alumno ──────────────────────────────────────

export function ReportsPanel({ studentId, name, phone, toast, onPublished }: {
  studentId: string; name: string; phone: string | null; toast: (m: string) => void; onPublished: () => void;
}) {
  const [info, setInfo] = useState<{ first_date: string | null; current: Cycle | null; last_complete: Cycle | null; reports: StoredReport[] } | null>(null);
  const [draft, setDraft] = useState<{ cycle: Cycle; data: ReportData | null } | null>(null);
  const [message, setMessage] = useState('');
  const [goal, setGoal] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<StoredReport | null>(null);
  const [justPublished, setJustPublished] = useState<StoredReport | null>(null);

  const load = useCallback(() => {
    coachApi.reports(studentId).then(setInfo).catch((e: Error) => toast(e.message));
  }, [studentId, toast]);
  useEffect(load, [load]);

  const prepare = async (cycle: Cycle) => {
    const prev = info?.reports.find((r) => r.period_start === cycle.start);
    setMessage(prev?.message ?? '');
    setGoal(prev?.next_goal ?? '');
    setDraft({ cycle, data: null });
    setJustPublished(null);
    try {
      const r = await coachApi.reportPreview(studentId, cycle.start);
      setDraft({ cycle, data: r.report });
    } catch (e) { toast((e as ApiError).message); setDraft(null); }
  };
  const publish = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const r = await coachApi.publishReport(studentId, { start: draft.cycle.start, message: message.trim() || null, next_goal: goal.trim() || null });
      toast(`Informe publicado: ${firstName(name)} ya lo ve en su app`);
      setDraft(null);
      setJustPublished(r.report);
      load();
      onPublished();
    } catch (e) { toast((e as ApiError).message); } finally { setBusy(false); }
  };
  const remove = async (r: StoredReport) => {
    if (!window.confirm(`¿Borrar el informe del ${shortDate(r.period_start)} al ${shortDate(r.period_end)}? ${firstName(name)} deja de verlo.`)) return;
    await coachApi.deleteReport(r.id);
    load();
    onPublished();
  };

  if (!info) return <Skeleton />;
  if (!info.first_date) return <p className="empty">Cuando tenga sesiones cargadas, cada 4 semanas vas a poder entregarle su informe.</p>;

  const published = new Set(info.reports.map((r) => r.period_start));
  const due = info.last_complete && !published.has(info.last_complete.start) ? info.last_complete : null;
  const daysLeft = info.current ? Math.round((new Date(`${info.current.end}T12:00:00`).getTime() - new Date().setHours(12, 0, 0, 0)) / 86400000) : 0;
  const waText = `Hola ${firstName(name)}! Ya tenés en la app tu informe de las últimas 4 semanas de entrenamiento: ${window.location.origin}`;
  const tel = (phone ?? '').replace(/\D/g, '');

  if (draft) {
    return (
      <>
        <section className="card">
          <div className="card-h"><h2>Informe · ciclo {draft.cycle.n}</h2><button className="btn sm ghost" onClick={() => setDraft(null)}>Cancelar</button></div>
          <p className="hint">{shortDate(draft.cycle.start)} al {shortDate(draft.cycle.end)}. Los números salen solos de sus sesiones; sumale tu mensaje.</p>
          <div className="field">
            <label htmlFor="rp-msg">Mensaje para {firstName(name)}</label>
            <textarea id="rp-msg" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Qué destacás de estas 4 semanas" />
          </div>
          <div className="field">
            <label htmlFor="rp-goal">Objetivo para las próximas 4 semanas</label>
            <textarea id="rp-goal" rows={2} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Ej.: llegar a 3 sesiones por semana, pistol completo…" />
          </div>
          <button className="btn primary wide" disabled={busy || !draft.data} onClick={publish}>
            {busy ? 'Publicando…' : published.has(draft.cycle.start) ? 'Volver a publicar' : `Publicar para ${firstName(name)}`}
          </button>
        </section>
        <div className="rp-preview">
          {draft.data ? <ReportView data={draft.data} message={message.trim() || null} nextGoal={goal.trim() || null} /> : <Skeleton />}
        </div>
      </>
    );
  }

  return (
    <>
      {justPublished && (
        <section className="card">
          <div className="done-banner" style={{ marginTop: 0 }}>{Icon.check} Publicado. {firstName(name)} lo ve en Progreso, en su app.</div>
          <div className="actions">
            {tel && <a className="btn" href={`https://wa.me/${tel}?text=${encodeURIComponent(waText)}`} target="_blank" rel="noopener noreferrer">Avisar por WhatsApp</a>}
            <button className="btn" onClick={() => setOpen(justPublished)}>{Icon.share} Ver / PDF</button>
          </div>
        </section>
      )}
      <section className="card">
        <div className="card-h"><h2>Informe cada 4 semanas</h2></div>
        {info.current && (
          <p className="hint">
            Ciclo {info.current.n} en curso ({shortDate(info.current.start)} al {shortDate(info.current.end)}){daysLeft >= 0 ? `: termina en ${daysLeft} ${daysLeft === 1 ? 'día' : 'días'}` : ''}.
            Los ciclos se cuentan desde su primera sesión ({shortDate(info.first_date)}).
          </p>
        )}
        {due ? (
          <div className="phase warn" style={{ marginTop: 10 }}>
            <span className="ph-tag">Para entregar</span>
            <div>Terminó el ciclo {due.n} ({shortDate(due.start)} al {shortDate(due.end)}).</div>
          </div>
        ) : null}
        <div className="actions">
          {due && <button className="btn primary" onClick={() => prepare(due)}>{Icon.note} Preparar informe del ciclo {due.n}</button>}
          {info.current && <button className="btn" onClick={() => prepare(info.current!)}>Ciclo en curso (hasta hoy)</button>}
          {!due && info.last_complete && published.has(info.last_complete.start) && <span className="hint">El último ciclo ya está entregado.</span>}
        </div>
      </section>

      <section className="card">
        <div className="card-h"><h2>Entregados</h2><span className="mini">{info.reports.length}</span></div>
        {!info.reports.length ? <p className="hint">Todavía no le publicaste informes.</p> : (
          <div className="rows">
            {info.reports.map((r) => (
              <div key={r.id} className="frow">
                <button className="fw" onClick={() => setOpen(r)}>
                  <b>Ciclo {r.data.cycle} · {shortDate(r.period_start)} al {shortDate(r.period_end)}</b>
                  <small>Publicado {timeAgo(r.published_at)} · {r.seen_at ? `lo vio ${timeAgo(r.seen_at)}` : 'todavía no lo abrió'}</small>
                </button>
                <span className="fr-r">
                  <button className="btn sm" onClick={() => prepare({ n: r.data.cycle, start: r.period_start, end: r.period_end })}>{Icon.edit}</button>
                  <button className="btn sm ghost" aria-label="Borrar informe" onClick={() => remove(r)}>{Icon.trash}</button>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
      {open && <ReportScreen report={open} onClose={() => setOpen(null)} />}
    </>
  );
}

// ── alumno ──────────────────────────────────────────────────────────────────

/** Tarjeta del último informe en la vista del alumno. */
export function StudentReports({ reports, onSeen }: { reports: StoredReport[]; onSeen: (id: string) => void }) {
  const [open, setOpen] = useState<StoredReport | null>(null);
  const [all, setAll] = useState(false);
  if (!reports.length) return null;
  const [last, ...rest] = reports;
  const show = (r: StoredReport) => {
    setOpen(r);
    if (!r.seen_at) studentApi.reportSeen(r.id).catch(() => undefined);
  };
  // Se marca como visto al cerrarlo: si no, el aviso de "nuevo" desaparece con el informe abierto.
  const close = () => {
    if (open && !open.seen_at) onSeen(open.id);
    setOpen(null);
  };
  return (
    <>
      <button className={`rp-card${last!.seen_at ? '' : ' new'}`} onClick={() => show(last!)}>
        <span className="ic" aria-hidden="true">{Icon.note}</span>
        <span>
          <small>{last!.seen_at ? 'Tu informe' : 'Nuevo informe de tu profe'}</small>
          <b>Semanas {last!.data.week_from} a {last!.data.week_to}</b>
          <span>{last!.data.sessions.count} sesiones{last!.data.improvements.length ? ` · ${last!.data.improvements.length} mejoras` : ''}</span>
        </span>
        {Icon.chev}
      </button>
      {rest.length > 0 && (
        <>
          <button className="btn ghost sm" onClick={() => setAll(!all)}>{all ? 'Ocultar anteriores' : `Ver informes anteriores (${rest.length})`}</button>
          {all && rest.map((r) => (
            <button key={r.id} className="frow" onClick={() => show(r)}>
              <span className="fw"><b>Semanas {r.data.week_from} a {r.data.week_to}</b><small>{shortDate(r.period_start)} al {shortDate(r.period_end)}</small></span>
              {Icon.chev}
            </button>
          ))}
        </>
      )}
      {open && <ReportScreen report={open} onClose={close} />}
    </>
  );
}
