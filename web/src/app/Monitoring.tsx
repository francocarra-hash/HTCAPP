import { useEffect, useMemo, useState } from 'react';
import {
  cap, CAP_LABEL, CapacityId, CHANGE_CATEGORIES, coachApi, CompareGroup, Monitoring, Profile, QualityEntry, shortDate, TRACKINGS,
  WindowSummary,
} from './data';
import { ProgressView } from './ProgressView';
import { LineChart, Seg, Skeleton } from './ui';
import { api as v3api, DOMAIN_ES } from '../v3/shared';
import { AssessmentSummary } from '../v3/types';

type View = 'resumen' | 'ejercicios' | 'carga' | 'evaluaciones' | 'revisar';
type Win = WindowSummary['key'];
const WIN_LABEL: Record<Win, string> = { '7d': '7 días', '28d': '28 días', todo: 'Todo' };
const TRACK_LABEL = Object.fromEntries(TRACKINGS) as Record<string, string>;
const CAT_LABEL = Object.fromEntries(CHANGE_CATEGORIES) as Record<string, string>;
const n1 = (v: number) => Math.round(v * 10) / 10;
const sgn = (v: number) => (v > 0 ? `+${n1(v)}` : `${n1(v)}`);

/** Progreso del alumno para el profe: lo indicado, lo realizado, la respuesta y la adherencia, por separado. */
export function CoachProgress({ profile, quality, onQualityChanged, toast, onOpenAssessment }: {
  profile: Profile; quality: QualityEntry[] | undefined; onQualityChanged: () => void; toast: (m: string) => void;
  onOpenAssessment: (assessmentId: string) => void;
}) {
  const id = profile.student.id;
  const [view, setView] = useState<View>('resumen');
  const [mon, setMon] = useState<Monitoring | null>(null);
  const [err, setErr] = useState('');
  const [win, setWin] = useState<Win>('28d');
  useEffect(() => {
    coachApi.monitoring(id).then((r) => setMon(r.monitoring)).catch((e: Error) => setErr(e.message));
  }, [id, profile]);
  const w = mon?.windows.find((x) => x.key === win);

  return (
    <>
      <div className="subnav" role="tablist" aria-label="Vistas de progreso">
        {([['resumen', 'Resumen'], ['ejercicios', 'Ejercicios'], ['carga', 'Carga'], ['evaluaciones', 'Evaluaciones'], ['revisar', 'Revisar']] as Array<[View, string]>).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)}>
            {l}{k === 'revisar' && mon?.review.length ? <span className="cnt">{mon.review.length}</span> : null}
          </button>
        ))}
      </div>
      {err && <p className="err">No se pudo cargar el monitoreo: {err}</p>}

      {view === 'resumen' && (
        <>
          {!mon ? <Skeleton /> : w && (
            <section className="card">
              <h2>Adherencia y frecuencia</h2>
              <div className="winsel"><Seg small value={win} onChange={setWin} options={(['7d', '28d', 'todo'] as Win[]).map((k) => [k, WIN_LABEL[k]])} /></div>
              <Overview w={w} onReview={() => setView('revisar')} pending={mon.review.length} />
            </section>
          )}
          <div className="sect-lab">Lo anotado en las rutinas</div>
          <ProgressView progress={profile.progress} you={false} quality={quality} studentId={id} onQualityChanged={onQualityChanged} toast={toast} />
        </>
      )}

      {view === 'ejercicios' && (!mon ? <Skeleton /> : <ExerciseView mon={mon} />)}
      {view === 'carga' && (!mon ? <Skeleton /> : <LoadView mon={mon} win={win} setWin={setWin} />)}
      {view === 'evaluaciones' && <AssessmentsView ids={profile.assessment_ids ?? []} onOpen={onOpenAssessment} />}
      {view === 'revisar' && (!mon ? <Skeleton /> : <ReviewView mon={mon} />)}
    </>
  );
}

function Overview({ w, onReview, pending }: { w: WindowSummary; onReview: () => void; pending: number }) {
  const att = w.present + w.absent + w.sent;
  return (
    <>
      <div className="mstats">
        <div><b>{w.realized}</b><span>Sesiones hechas</span></div>
        <div><b>{w.per_week ?? '—'}</b><span>Por semana</span></div>
        <div><b>{att ? `${w.present}/${att}` : '—'}</b><span>Presentes</span></div>
        <div><b>{w.prescription.total ? `${w.prescription.done}/${w.prescription.total}` : '—'}</b><span>Ejercicios hechos</span></div>
      </div>
      <dl className="dl">
        <dt>Asistencia</dt>
        <dd>{att ? `${w.present} presentes, ${w.absent} ausentes${w.sent ? `, ${w.sent} con ejercicios enviados` : ''}.` : 'Sin clases registradas en el período.'}</dd>
        <dt>Lo indicado</dt>
        <dd>{w.prescription.sessions
          ? `En ${w.prescription.sessions} ${w.prescription.sessions === 1 ? 'sesión' : 'sesiones'} con registro hizo ${w.prescription.done} de ${w.prescription.total} ejercicios indicados.`
          : 'Sin sesiones con registro de lo realizado.'}
          {w.partial ? ` ${w.partial} parciales.` : ''}{w.modified ? ` ${w.modified} modificadas.` : ''}
          {w.assigned_not_done ? ` ${w.assigned_not_done} ${w.assigned_not_done === 1 ? 'rutina asignada quedó' : 'rutinas asignadas quedaron'} sin hacer.` : ''}
        </dd>
        <dt>Carga interna</dt>
        <dd>{w.srpe_load != null ? `${w.srpe_load} UA en ${w.srpe_sessions} ${w.srpe_sessions === 1 ? 'sesión' : 'sesiones'}` : 'Sin sRPE y duración registrados'}{w.missing_srpe && w.srpe_load != null ? ` · ${w.missing_srpe} sin dato` : ''}.</dd>
      </dl>
      <Exposure w={w} />
      <p className="hint">La asistencia cuenta las clases; lo indicado cuenta los ejercicios hechos dentro de cada sesión. Son cosas distintas.</p>
      {pending > 0 && <button className="btn sm" onClick={onReview}>{pending} {pending === 1 ? 'punto' : 'puntos'} para revisar</button>}
    </>
  );
}

function Exposure({ w, cat }: { w: WindowSummary; cat?: CapacityId | null }) {
  if (!w.entries_total) return null;
  const shown = w.exposure.filter((e) => !cat || e.capacity === cat);
  return (
    <div style={{ marginTop: 10 }}>
      <div className="label">Exposición por capacidad</div>
      <div className="cap-strip" role="img" aria-label={w.exposure.map((e) => `${e.label} ${e.entries} entradas`).join(', ')}>
        {w.exposure.map((e) => <span key={e.capacity} style={{ flexGrow: e.entries, ['--c' as string]: `var(--cap-${e.capacity})` }} />)}
        {w.unclassified > 0 && <span style={{ flexGrow: w.unclassified, ['--c' as string]: 'var(--line)' }} />}
      </div>
      <ul className="expo">
        {shown.map((e) => (
          <li key={e.capacity} style={{ ['--c' as string]: `var(--cap-${e.capacity})` }}>
            <i aria-hidden="true" />
            <span><b>{e.label}</b> · {Math.round((e.entries / w.entries_total) * 100)}% de los ejercicios registrados ({e.entries} de {w.entries_total})</span>
          </li>
        ))}
      </ul>
      <p className="hint" style={{ fontSize: 12 }}>Es la proporción de ejercicios anotados de cada capacidad, no del estímulo total de entrenamiento.</p>
    </div>
  );
}

// ── ejercicios: lo realizado, comparado sólo en condiciones comparables ──

const chartUnit = (u: string): 's' | 'kg' | 'reps' | null => (u === 's' ? 's' : u === 'kg' ? 'kg' : u === 'reps' || u === 'contactos' ? 'reps' : null);

function GroupCard({ g }: { g: CompareGroup }) {
  // Se grafica la medida que cambió (o la principal).
  const main = g.changes.find((c) => c.abs) ?? g.changes[0];
  const pts = main ? g.records.filter((r) => r.values[main.id] != null).map((r) => ({ date: r.day, value: r.values[main.id]! })) : [];
  const u = main ? chartUnit(main.unit) : null;
  return (
    <section className="card">
      <div className="card-h">
        <div>
          <div className="label">{TRACK_LABEL[g.tracking]}</div>
          <h3 style={{ margin: 0 }}>{cap(g.label)}</h3>
        </div>
        <span className={`pill${g.limited ? ' low' : ' ok'}`}>{g.limited ? 'Comparación limitada' : 'Comparable'}</span>
      </div>
      <p className="hint" style={{ marginTop: 4 }}>{g.conditions.join(' · ')}.</p>
      {g.reasons.length > 0 && <ul className="reasons">{g.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
      {u && pts.length > 1 && <LineChart points={pts} unit={u} />}
      {g.changes.length > 0 && (
        <div className="tbl-wrap" style={{ marginTop: 8 }}>
          <table className="tbl">
            <thead><tr><th>Medida</th><th>Base</th><th>Actual</th><th>Cambio</th></tr></thead>
            <tbody>
              {g.changes.map((c) => (
                <tr key={c.id}>
                  <td>{c.label} <small className="m">({c.unit})</small></td>
                  <td className="nw">{c.baseline ? `${n1(c.baseline.value)} · ${shortDate(c.baseline.day)}` : '—'}</td>
                  <td className="nw">{c.current ? `${n1(c.current.value)} · ${shortDate(c.current.day)}` : '—'}</td>
                  <td className="nw">{c.abs != null ? `${sgn(c.abs)} ${c.unit}${c.pct != null ? ` (${c.pct > 0 ? '+' : ''}${c.pct}%)` : ''}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="interp">{g.interpretation.map((t) => <p key={t}>{t}</p>)}</div>
      <details className="chlog">
        <summary>Registros ({g.records.length})</summary>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Fecha</th><th>Series</th><th>Esfuerzo</th><th>Dolor</th><th>Datos</th></tr></thead>
            <tbody>
              {[...g.records].reverse().map((r) => (
                <tr key={r.execution_id}>
                  <td className="nw">{shortDate(r.day)}</td>
                  <td className="m">{r.summary}{r.rom ? ` · ROM ${r.rom}` : ''}</td>
                  <td className="nw">{[r.rpe != null ? `RPE ${r.rpe}` : null, r.rir != null ? `RIR ${r.rir}` : null].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="nw">{r.pain != null ? `${r.pain}/10` : '—'}</td>
                  <td className="nw">{r.data_quality === 'incompleto' ? 'Incompletos' : 'Completos'} · {r.source === 'coach' ? 'profe' : 'alumno'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

function ExerciseView({ mon }: { mon: Monitoring }) {
  const [cat, setCat] = useState<CapacityId | 'todas'>('todas');
  const list = mon.exercises.filter((e) => cat === 'todas' || e.capacity === cat);
  const [sel, setSel] = useState<string | null>(null);
  const cur = list.find((e) => e.key === sel) ?? list[0];
  const caps = [...new Set(mon.exercises.map((e) => e.capacity).filter((c): c is CapacityId => Boolean(c)))];
  if (!mon.exercises.length) {
    return (
      <section className="card">
        <h2>Todavía no hay registros por serie</h2>
        <p className="hint">Cuando registres lo que hizo en una sesión (Historial → Registrar lo realizado) o lo anote el alumno en su rutina, acá se ve la evolución de cada ejercicio comparando sólo registros en las mismas condiciones.</p>
      </section>
    );
  }
  return (
    <>
      {caps.length > 1 && (
        <div className="filters" role="group" aria-label="Filtrar por capacidad">
          <button className="tog" aria-pressed={cat === 'todas'} onClick={() => setCat('todas')}>Todas</button>
          {caps.map((c) => (
            <button key={c} className="tog" aria-pressed={cat === c} style={{ ['--c' as string]: `var(--cap-${c})` }} onClick={() => setCat(c)}><i aria-hidden="true" />{CAP_LABEL[c]}</button>
          ))}
        </div>
      )}
      {cur && (
        <>
          <select className="full" value={cur.key} onChange={(e) => setSel(e.target.value)} aria-label="Ejercicio">
            {list.map((e) => <option key={e.key} value={e.key}>{e.name} · {e.records} {e.records === 1 ? 'registro' : 'registros'}</option>)}
          </select>
          {cur.transitions.length > 0 && (
            <div className="phase" style={{ marginTop: 10 }}>
              <span className="ph-tag">Cambios</span>
              <div>{cur.transitions.map((t) => <div key={t.day + t.to}>El {shortDate(t.day)} pasó de {t.from} a {t.to}. No se compara directamente con lo anterior.</div>)}</div>
            </div>
          )}
          {cur.groups.map((g) => <GroupCard key={g.key} g={g} />)}
        </>
      )}
    </>
  );
}

// ── carga ──

function LoadView({ mon, win, setWin }: { mon: Monitoring; win: Win; setWin: (w: Win) => void }) {
  const w = mon.windows.find((x) => x.key === win)!;
  const [cat, setCat] = useState<CapacityId | null>(null);
  const weeks = useMemo(() => mon.weeks.filter((x) => win === 'todo' || x.week_start >= weekStartOf(w.from)), [mon.weeks, w.from, win]);
  const mx = Math.max(1, ...weeks.map((x) => x.srpe_load ?? 0));
  const responses = mon.responses.filter((r) => r.day >= w.from);
  return (
    <>
      <section className="card">
        <h2>Carga por semana</h2>
        <div className="winsel"><Seg small value={win} onChange={setWin} options={(['7d', '28d', 'todo'] as Win[]).map((k) => [k, WIN_LABEL[k]])} /></div>
        <p className="hint">Carga interna = minutos × esfuerzo de la sesión (sRPE), en unidades arbitrarias (UA). Es la carga percibida, no una medición fisiológica. No se suman ejercicios distintos en un número único.</p>
        {weeks.length ? (
          <div className="tbl-wrap">
            <table className="tbl wk">
              <thead><tr><th>Semana</th><th>Sesiones</th><th>Minutos</th><th>Carga interna</th><th>Series hechas / indicadas</th></tr></thead>
              <tbody>
                {[...weeks].reverse().map((x) => (
                  <tr key={x.week_start}>
                    <td className="nw">{shortDate(x.week_start)}</td>
                    <td>{x.sessions}{x.days.length ? <small className="m"> · {x.days.map((d) => shortDate(d)).join(', ')}</small> : ''}</td>
                    <td>{x.minutes ?? '—'}</td>
                    <td>
                      {x.srpe_load != null ? (
                        <span className="ubar"><i style={{ width: `${(x.srpe_load / mx) * 100}%` }} /><b>{x.srpe_load} UA</b></span>
                      ) : '—'}
                      {x.missing_srpe > 0 && x.sessions > 0 && <small className="m"> {x.missing_srpe} sin dato</small>}
                    </td>
                    <td>{x.sets_performed || x.sets_prescribed ? `${x.sets_performed} / ${x.sets_prescribed || '—'}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="hint">Sin sesiones en el período.</p>}
      </section>

      <section className="card">
        <h2>Exposición por capacidad</h2>
        <div className="filters" role="group" aria-label="Filtrar capacidad">
          <button className="tog" aria-pressed={!cat} onClick={() => setCat(null)}>Todas</button>
          {w.exposure.map((e) => (
            <button key={e.capacity} className="tog" aria-pressed={cat === e.capacity} style={{ ['--c' as string]: `var(--cap-${e.capacity})` }}
              onClick={() => setCat(cat === e.capacity ? null : e.capacity)}><i aria-hidden="true" />{e.label}</button>
          ))}
        </div>
        <Exposure w={w} cat={cat} />
        {!w.entries_total && <p className="hint">Sin ejercicios registrados en el período.</p>}
      </section>

      <section className="card">
        <h2>Respuesta a cada sesión</h2>
        <p className="hint">Lo que informó el alumno o registró el profe. Un solo dato subjetivo no mide la recuperación.</p>
        {responses.length ? (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Fecha</th><th>sRPE</th><th>Min</th><th>UA</th><th>Fatiga</th><th>D. muscular</th><th>Dolor</th><th>Recup.</th></tr></thead>
              <tbody>
                {[...responses].reverse().map((r) => (
                  <tr key={r.session_id}>
                    <td className="nw">{shortDate(r.day)}</td>
                    <td>{r.srpe ?? '—'}</td><td>{r.duration_min ?? '—'}</td><td>{r.load ?? '—'}</td>
                    <td>{r.fatigue ?? '—'}</td><td>{r.soreness ?? '—'}</td>
                    <td>{r.pain != null ? `${r.pain}${r.pain_area ? ` · ${r.pain_area}` : ''}` : '—'}</td>
                    <td>{r.recovery ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="hint">Todavía no hay respuestas registradas en el período.</p>}
      </section>
    </>
  );
}

const weekStartOf = (d: string): string => {
  const t = new Date(`${d}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  return t.toISOString().slice(0, 10);
};

// ── evaluaciones formales (aparte) ──

function AssessmentsView({ ids, onOpen }: { ids: string[]; onOpen: (id: string) => void }) {
  const [list, setList] = useState<AssessmentSummary[] | null>(null);
  useEffect(() => {
    v3api<{ assessments: AssessmentSummary[] }>('/assessments').then((r) => setList(r.assessments.filter((a) => ids.includes(a.assessment_id))))
      .catch(() => setList([]));
  }, [ids]);
  return (
    <section className="card">
      <h2>Evaluaciones HTC</h2>
      <p className="hint">Las clasificaciones formales salen sólo de las Evaluaciones HTC. El progreso de los ejercicios no las cambia: para actualizarlas hace falta una reevaluación.</p>
      {!list ? <Skeleton /> : list.length ? (
        <div className="rows">
          {[...list].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).map((a) => (
            <button key={a.assessment_id} className="frow" onClick={() => onOpen(a.assessment_id)}>
              <span className="fw">
                <b>{shortDate(a.timestamp.slice(0, 10))} {a.timestamp.slice(0, 4)}</b>
                <small>{a.health_status === 'BLOCKED' ? 'Bloqueada por health gates' : a.p1_domain ? `P1: ${DOMAIN_ES[a.p1_domain]}` : 'Sin P1'}
                  {a.coach_confirmed === true ? ' · confirmada' : a.coach_confirmed === false ? ' · con override' : ' · pendiente'}</small>
              </span>
            </button>
          ))}
        </div>
      ) : <p className="hint">No tiene evaluaciones vinculadas. Se vinculan desde la pestaña Datos.</p>}
    </section>
  );
}

// ── para revisar y cambios de la programación ──

function ReviewView({ mon }: { mon: Monitoring }) {
  const c = mon.coverage;
  return (
    <>
      <section className="card">
        <h2>Para revisar</h2>
        <p className="hint">Patrones descriptivos con los registros que los respaldan. No son alertas automáticas ni diagnósticos: la decisión es tuya.</p>
        {mon.review.length ? (
          <div className="review">
            {mon.review.map((r) => (
              <details key={r.kind + r.title} className="rv">
                <summary><b>{r.title}</b><small>{r.detail}</small></summary>
                <ul>{r.evidence.map((e, i) => <li key={i}><span className="nw">{shortDate(e.day)}</span> {e.text}</li>)}</ul>
              </details>
            ))}
          </div>
        ) : <p className="hint">Nada para revisar en las últimas 4 semanas con los datos que hay.</p>}
        <p className="hint" style={{ fontSize: 12 }}>
          Datos disponibles: de {c.realized} sesiones hechas, {c.with_srpe} con sRPE, {c.with_duration} con duración y {c.with_records} con registro por serie.
        </p>
      </section>
      <section className="card">
        <h2>Cambios en la programación</h2>
        <p className="hint">Qué cambió al editar una sesión, cuándo y el motivo que dejaste.</p>
        {mon.changes.length ? (
          <div className="review">
            {mon.changes.map((x, i) => (
              <div key={i} className="chg">
                <div className="chg-h">
                  <b>{x.session_day ? `Sesión del ${shortDate(x.session_day)}` : 'Sesión'}</b>
                  <small>editada el {shortDate(x.at.slice(0, 10))}{x.category ? ` · ${CAT_LABEL[x.category]}` : ''}</small>
                </div>
                {x.reason && <p className="qnote">“{x.reason}”</p>}
                <ul>{x.lines.map((l) => <li key={l}>{l}</li>)}</ul>
                {x.context && <small className="m">{x.context}</small>}
              </div>
            ))}
          </div>
        ) : <p className="hint">Sin cambios registrados todavía.</p>}
      </section>
    </>
  );
}
