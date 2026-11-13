import { useMemo, useState } from 'react';
import { ApiError } from '../api';
import {
  ASPECT_LABEL, CAP_INFO, CAP_LABEL, CapacityId, coachApi, fmtValue, Highlight, longDate, pctGain, Progress, QUALITY_ASPECTS,
  QUALITY_SCORE, QualityAspect, QualityEntry, shortDate, todayIso, unitLabel,
} from './data';
import { CapacityDefs } from './ExerciseLibrary';
import { CapTag, CountUp, DateInput, Icon, LineChart, MonthBars, Sheet } from './ui';

/** Logro: de dónde arrancó a dónde llegó, con barra proporcional. */
export function WinCard({ h, i = 0 }: { h: Highlight; i?: number }) {
  const max = Math.max(h.from, h.to) || 1;
  return (
    <div className="win" style={{ ['--c' as string]: h.capacity ? `var(--cap-${h.capacity})` : 'var(--accent)', ['--i' as string]: i }}>
      <div className="win-h">
        <b>{h.name}<small className="vtag">{h.kind === 'volumen' ? 'volumen' : h.unit === 's' ? 'duración' : h.unit === 'kg' ? 'carga' : 'repeticiones'}</small></b>
        <span className="pct">+{pctGain(h.from, h.to)}%</span>
      </div>
      <div className="win-bar" role="img" aria-label={`${h.name}: de ${fmtValue(h.from, h.unit)} a ${fmtValue(h.to, h.unit)}`}>
        <i style={{ width: `${(h.to / max) * 100}%` }} />
        <u style={{ width: `${(h.from / max) * 100}%` }} />
      </div>
      <div className="win-v">
        <span>{shortDate(h.first_date)} · <b>{fmtValue(h.from, h.unit)}</b></span>
        {h.capacity && <CapTag id={h.capacity} label={CAP_LABEL[h.capacity]} muted />}
        <span>{shortDate(h.last_date)} · <b>{fmtValue(h.to, h.unit)}</b></span>
      </div>
    </div>
  );
}

/** Vista del profe: todo lo anotado. Vista del alumno: sus logros. */
export function ProgressView(props: {
  progress: Progress; you: boolean; quality?: QualityEntry[];
  /** Vista del profe: puede registrar la calidad del movimiento. */
  studentId?: string; onQualityChanged?: () => void; toast?: (m: string) => void;
}) {
  return props.you ? <StudentProgress progress={props.progress} quality={props.quality ?? []} /> : <FullProgress {...props} />;
}

// ── Progreso del alumno: el resultado de su esfuerzo ────────────────────────

const MILESTONES = [10, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500, 750, 1000];
const gainOf = (h: Highlight): number => (h.from > 0 ? (h.to - h.from) / h.from : 0);
const daysAgo = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Lo que ve el alumno en Progreso: primero sus logros (en qué mejoró y cuánto),
 * sus marcas nuevas y los niveles que subió; después la constancia. Sin tablas
 * ni aclaraciones técnicas: eso queda en la vista del profe.
 */
function StudentProgress({ progress, quality }: { progress: Progress; quality: QualityEntry[] }) {
  const { stats, exercises, months, capacities } = progress;
  const [capSel, setCapSel] = useState<CapacityId | null>(null);
  const [more, setMore] = useState(false);
  const [sel, setSel] = useState<string | null>(null);

  // Todos los ejercicios en los que mejoró, de la primera vez a la última.
  const wins = useMemo<Highlight[]>(() => {
    const byDose = exercises.filter((e) => e.first > 0 && e.last > e.first).map((e): Highlight => ({
      key: e.key, name: e.name, capacity: e.capacity, unit: e.unit, from: e.first, to: e.last,
      first_date: e.points[0]!.date, last_date: e.points[e.points.length - 1]!.date,
    }));
    const byVolume = progress.highlights.filter((h) => h.kind === 'volumen' && !byDose.some((x) => x.key === h.key));
    // Primero lo que subió en cada serie; después lo que subió sólo en volumen total.
    return [...byDose.sort((a, b) => gainOf(b) - gainOf(a)), ...byVolume];
  }, [exercises, progress.highlights]);

  // Marcas nuevas: la última vez superó todo lo anterior, en las últimas 4 semanas.
  const records = useMemo(() => {
    const since = daysAgo(28);
    return exercises.flatMap((e) => {
      const last = e.points[e.points.length - 1]!;
      const before = Math.max(...e.points.slice(0, -1).map((p) => p.value));
      return last.date >= since && e.points.length > 1 && last.value > before
        ? [{ key: e.key, name: e.name, capacity: e.capacity, unit: e.unit, value: last.value, before, date: last.date }] : [];
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [exercises]);

  if (!stats.sessions) return <p className="empty">Cuando completes tus primeras sesiones, acá vas a ver cómo vas mejorando.</p>;

  const inCap = <T extends { capacity: CapacityId | null }>(x: T) => !capSel || x.capacity === capSel;
  const shownWins = wins.filter(inCap);
  const visibleWins = more ? shownWins : shownWins.slice(0, 5);
  const shownRecords = records.filter(inCap);
  const variants = (progress.variants ?? []).filter(inCap);
  const shownEx = exercises.filter(inCap);
  const current = shownEx.find((e) => e.key === sel) ?? shownEx.find((e) => e.key === shownWins[0]?.key) ?? shownEx[0];
  const reached = [...MILESTONES].reverse().find((m) => m <= stats.sessions);
  const next = MILESTONES.find((m) => m > stats.sessions);
  const pick = (c: CapacityId | null) => { setCapSel(c); setSel(null); setMore(false); };

  return (
    <>
      <section className="ach" aria-label="Tu progreso">
        <div className="ach-k">Semana {stats.process_week} de tu proceso</div>
        {wins.length > 0 ? (
          <div className="ach-big"><b><CountUp to={wins.length} /></b><span>{wins.length === 1 ? 'ejercicio en el que mejoraste' : 'ejercicios en los que mejoraste'}</span></div>
        ) : (
          <div className="ach-big"><b><CountUp to={stats.sessions} /></b><span>{stats.sessions === 1 ? 'sesión hecha' : 'sesiones hechas'}</span></div>
        )}
        <div className="ach-stats">
          <div><b><CountUp to={stats.sessions} /></b><span>Sesiones</span></div>
          <div><b><CountUp to={stats.streak_weeks} /></b><span>{stats.streak_weeks === 1 ? 'Semana seguida' : 'Semanas seguidas'}</span></div>
          <div><b><CountUp to={(progress.variants ?? []).length} /></b><span>{(progress.variants ?? []).length === 1 ? 'Nivel subido' : 'Niveles subidos'}</span></div>
        </div>
        {stats.first_date && <p>Entrenás desde el {longDate(stats.first_date)}.{next ? ` Te ${next - stats.sessions === 1 ? 'falta 1 sesión' : `faltan ${next - stats.sessions} sesiones`} para las ${next}.` : ''}</p>}
      </section>

      {capacities.length > 1 && (
        <div className="filters" role="group" aria-label="Ver por capacidad">
          <button className="tog" aria-pressed={!capSel} onClick={() => pick(null)}>Todo</button>
          {capacities.map((c) => (
            <button key={c.id} className="tog" aria-pressed={capSel === c.id} style={{ ['--c' as string]: `var(--cap-${c.id})` }} onClick={() => pick(capSel === c.id ? null : c.id)}>
              <i aria-hidden="true" />{c.label}
            </button>
          ))}
        </div>
      )}

      {shownRecords.length > 0 && (
        <section className="card">
          <div className="card-h"><h2>Marcas nuevas</h2><span className="mini">últimas 4 semanas</span></div>
          <div className="rows">
            {shownRecords.slice(0, 6).map((r) => (
              <div key={r.key} className="recrow" style={{ ['--c' as string]: r.capacity ? `var(--cap-${r.capacity})` : 'var(--accent)' }}>
                <span className="fw"><b>{r.name}</b><small>{shortDate(r.date)} · antes {fmtValue(r.before, r.unit)}</small></span>
                <span className="rec-v">{fmtValue(r.value, r.unit)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <div className="card-h"><h2>Tus logros</h2>{shownWins.length > 0 && <span className="mini">{shownWins.length}</span>}</div>
        {shownWins.length ? (
          <>
            <div className="hint">De tu primera vez a la última.</div>
            <div className="wins">{visibleWins.map((h, i) => <WinCard key={h.key + (h.kind ?? '')} h={h} i={i < 5 ? i : 0} />)}</div>
            {shownWins.length > 5 && (
              <button className="btn wide" style={{ marginTop: 12 }} onClick={() => setMore(!more)}>{more ? 'Ver menos' : `Ver los ${shownWins.length} logros`}</button>
            )}
          </>
        ) : (
          <p className="hint">{capSel ? 'Todavía no hay logros en esta capacidad. Seguí así: aparecen cuando un ejercicio se repite y sube.' : 'Con algunas sesiones más vas a ver acá en qué ejercicios mejoraste.'}</p>
        )}
      </section>

      {variants.length > 0 && (
        <section className="card">
          <div className="card-h"><h2>Subiste de nivel</h2><span className="mini">{variants.length}</span></div>
          <p className="hint" style={{ margin: '4px 0 8px' }}>Pasaste a una versión más difícil del mismo movimiento.</p>
          <div className="rows">
            {variants.map((v) => (
              <div key={v.to + v.date} className="vstep" style={{ ['--c' as string]: v.capacity ? `var(--cap-${v.capacity})` : 'var(--accent)' }}>
                <span className="vs-from">{v.from}</span>
                <span className="vs-ar" aria-hidden="true">→</span>
                <b>{v.to}</b>
                <small>desde el {shortDate(v.date)}{v.date.slice(0, 4) !== String(new Date().getFullYear()) ? ` de ${v.date.slice(0, 4)}` : ''}</small>
              </div>
            ))}
          </div>
        </section>
      )}

      <QualitySection progress={progress} quality={quality} capSel={capSel} you onlyRated />

      {!capSel && capacities.length > 0 && (
        <section className="card">
          <h2>Por capacidad</h2>
          <div className="hint">En cuántos ejercicios mejoraste de cada una. Tocá una para ver sus logros.</div>
          <div className="capgrid">
            {capacities.map((c) => (
              <button key={c.id} className="capcard" style={{ ['--c' as string]: `var(--cap-${c.id})` }} onClick={() => { pick(c.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                <CapTag id={c.id} label={c.label} lg />
                <span className="big">{c.improved}<small>{c.improved === 1 ? 'mejoró' : 'mejoraron'}</small></span>
                {c.top
                  ? <span className="top">{c.top.name}: <span>{fmtValue(c.top.from, c.top.unit)} → {fmtValue(c.top.to, c.top.unit)}</span></span>
                  : <span className="top"><span>{c.sessions} {c.sessions === 1 ? 'sesión' : 'sesiones'}</span></span>}
              </button>
            ))}
          </div>
        </section>
      )}

      {!capSel && months.length > 1 && (
        <section className="card">
          <h2>Tu constancia</h2>
          <div className="hint">
            {reached ? `Ya pasaste las ${reached} sesiones.` : 'Sesiones por mes.'}
            {stats.this_month ? ` Este mes llevás ${stats.this_month}.` : ''}
          </div>
          <MonthBars months={months} />
        </section>
      )}

      {current && (
        <details className="older achdet">
          <summary><span>Ver cada ejercicio</span><span className="chev" aria-hidden="true">⌄</span></summary>
          <select className="full" value={current.key} onChange={(e) => setSel(e.target.value)} aria-label="Ejercicio" style={{ marginTop: 10 }}>
            {shownEx.map((e) => <option key={e.key} value={e.key}>{e.name}</option>)}
          </select>
          <section className="card" key={current.key}>
            <div className="card-h">
              <div className="label">{current.name} · {unitLabel(current.unit)}</div>
              {current.capacity && <CapTag id={current.capacity} label={CAP_LABEL[current.capacity]} />}
            </div>
            <LineChart points={current.points} unit={current.unit} />
            <div className="stats" style={{ marginTop: 10 }}>
              <div className="stat"><div className="v">{fmtValue(current.best, current.unit)}</div><div className="l">Tu mejor marca</div></div>
              <div className="stat"><div className="v">{current.points.length}</div><div className="l">Sesiones</div></div>
              {current.last > current.first && (
                <div className="stat"><div className="v">+{fmtValue(current.last - current.first, current.unit)}</div><div className="l">Desde {shortDate(current.points[0]!.date)}</div></div>
              )}
            </div>
          </section>
        </details>
      )}
    </>
  );
}

function FullProgress({ progress, you, quality = [], studentId, onQualityChanged, toast }: {
  progress: Progress; you: boolean; quality?: QualityEntry[];
  /** Vista del profe: puede registrar la calidad del movimiento. */
  studentId?: string; onQualityChanged?: () => void; toast?: (m: string) => void;
}) {
  const [defs, setDefs] = useState(false);
  const { stats, highlights, exercises, months, capacities } = progress;
  const [capSel, setCapSel] = useState<CapacityId | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const shownEx = useMemo(() => exercises.filter((e) => !capSel || e.capacity === capSel), [exercises, capSel]);
  const shownWins = highlights.filter((h) => !capSel || h.capacity === capSel);
  const current = shownEx.find((e) => e.key === sel) ?? shownEx.find((e) => e.key === shownWins[0]?.key) ?? shownEx[0];
  const recent = capacities.filter((c) => c.recent_share > 0);
  const variants = (progress.variants ?? []).filter((v) => !capSel || v.capacity === capSel);

  if (!stats.sessions) {
    return <p className="empty">{you ? 'Cuando completes tus primeras sesiones, acá vas a ver cómo vas mejorando.' : 'Todavía no hay sesiones realizadas.'}</p>;
  }

  return (
    <>
      {capacities.length > 0 && (
        <div className="filters" role="group" aria-label="Filtrar por capacidad">
          <button className="tog" aria-pressed={!capSel} onClick={() => { setCapSel(null); setSel(null); }}>Todas</button>
          {capacities.map((c) => (
            <button key={c.id} className="tog" aria-pressed={capSel === c.id} style={{ ['--c' as string]: `var(--cap-${c.id})` }}
              onClick={() => { setCapSel(capSel === c.id ? null : c.id); setSel(null); }}>
              <i aria-hidden="true" />{c.label}
            </button>
          ))}
        </div>
      )}

      {!capSel && (
        <section className="card" style={{ marginTop: 6 }}>
          <div className="pstats">
            <div><b><CountUp to={stats.sessions} /></b><span>Sesiones</span></div>
            <div><b><CountUp to={stats.process_week} /></b><span>Semana</span></div>
            <div><b>{stats.per_week != null ? <CountUp to={stats.per_week} dec={1} /> : '—'}</b><span>Por semana</span></div>
            <div><b><CountUp to={stats.streak_weeks} /></b><span>Racha sem.</span></div>
          </div>
          {stats.first_date && (
            <p className="hint" style={{ textAlign: 'center', marginTop: 10 }}>
              {you ? 'Entrenás' : 'Entrena'} desde el {longDate(stats.first_date)}.
              {stats.this_month ? ` Este mes: ${stats.this_month} ${stats.this_month === 1 ? 'sesión' : 'sesiones'}.` : ''}
            </p>
          )}
        </section>
      )}

      {capacities.length > 0 && (
        <section className="card">
          <div className="card-h">
            <h2>{capSel ? CAP_LABEL[capSel] : 'Capacidades'}</h2>
            <button className="btn sm ghost" onClick={() => setDefs(!defs)} aria-expanded={defs}>{Icon.info} {defs ? 'Ocultar' : 'Qué es cada una'}</button>
          </div>
          <div className="hint">
            {capSel ? CAP_INFO[capSel].def : 'Tocá una capacidad para ver sólo sus avances.'}
          </div>
          {defs && <CapacityDefs only={capSel} />}
          <div className="capgrid">
            {capacities.filter((c) => !capSel || c.id === capSel).map((c) => (
              <button key={c.id} className={`capcard${capSel === c.id ? ' on' : ''}`} style={{ ['--c' as string]: `var(--cap-${c.id})` }}
                onClick={() => { setCapSel(capSel === c.id ? null : c.id); setSel(null); }}>
                <CapTag id={c.id} label={c.label} lg />
                <span className="big">{c.improved}<small>{c.improved === 1 ? 'mejoró' : 'mejoraron'} de {c.tracked}</small></span>
                {c.top
                  ? <span className="top">{c.top.name}: <span>{fmtValue(c.top.from, c.top.unit)} → {fmtValue(c.top.to, c.top.unit)}</span></span>
                  : <span className="top"><span>{c.sessions} sesiones trabajadas</span></span>}
              </button>
            ))}
          </div>
        </section>
      )}

      {!capSel && recent.length > 1 && (
        <section className="card">
          <h2>En qué {you ? 'estás' : 'está'} trabajando</h2>
          <div className="hint">De los ejercicios anotados en las últimas 4 semanas, qué parte fue de cada capacidad. No es el reparto del estímulo total.</div>
          <div className="cap-strip" role="img" aria-label={recent.map((c) => `${c.label} ${Math.round(c.recent_share * 100)}%`).join(', ')}>
            {recent.map((c) => <span key={c.id} style={{ flexGrow: c.recent_share, ['--c' as string]: `var(--cap-${c.id})` }} title={`${c.label}: ${Math.round(c.recent_share * 100)}%`} />)}
          </div>
          <div className="cap-legend">
            {recent.map((c) => (
              <span key={c.id} className="cap" style={{ ['--c' as string]: `var(--cap-${c.id})` }}><i />{c.label} <b>{Math.round(c.recent_share * 100)}%</b></span>
            ))}
          </div>
        </section>
      )}

      {shownWins.length > 0 && (
        <section className="card">
          <h2>Logros</h2>
          <div className="hint">De la primera vez a la última, según lo que quedó escrito en la rutina{you ? '' : ' (indicado o registrado por vos)'}. Cada número mide sólo eso: no es un porcentaje de fuerza.</div>
          <div className="wins">{shownWins.map((h, i) => <WinCard key={h.key + (h.kind ?? '')} h={h} i={i} />)}</div>
          {shownWins.some((h) => h.kind === 'volumen') && <p className="hint" style={{ fontSize: 12 }}>Volumen: el total de la sesión (dosis × series × vueltas), cuando subió sin cambiar la dosis de cada serie.</p>}
        </section>
      )}

      {variants.length > 0 && (
        <section className="card">
          <h2>Pasó a variantes más complejas</h2>
          <p className="hint" style={{ margin: '4px 0 8px' }}>Cambiar a una versión más difícil del mismo movimiento también es progresar, aunque los números arranquen más abajo.</p>
          <div className="rows">
            {variants.map((v) => (
              <div key={v.to + v.date} className="vstep" style={{ ['--c' as string]: v.capacity ? `var(--cap-${v.capacity})` : 'var(--accent)' }}>
                <span className="vs-from">{v.from}</span>
                <span className="vs-ar" aria-hidden="true">→</span>
                <b>{v.to}</b>
                <small>desde el {shortDate(v.date)}{v.date.slice(0, 4) !== String(new Date().getFullYear()) ? ` de ${v.date.slice(0, 4)}` : ''} · {v.sessions} {v.sessions === 1 ? 'sesión' : 'sesiones'}</small>
              </div>
            ))}
          </div>
        </section>
      )}

      <QualitySection progress={progress} quality={quality} capSel={capSel} you={you}
        studentId={studentId} onChanged={onQualityChanged} toast={toast} />

      {!capSel && months.length > 1 && (
        <section className="card">
          <h2>Constancia</h2>
          <div className="hint">Sesiones por mes.</div>
          <MonthBars months={months} />
        </section>
      )}

      {current ? (
        <>
          <select className="full" value={current.key} onChange={(e) => setSel(e.target.value)} aria-label="Ejercicio">
            {shownEx.map((e) => (
              <option key={e.key} value={e.key}>{e.name} · {e.points.length} sesiones</option>
            ))}
          </select>
          <section className="card" key={current.key}>
            <div className="card-h">
              <div className="label">{current.name} · {unitLabel(current.unit)}</div>
              {current.capacity && <CapTag id={current.capacity} label={CAP_LABEL[current.capacity]} />}
            </div>
            <LineChart points={current.points} unit={current.unit} />
            <div className="stats" style={{ marginTop: 10 }}>
              <div className="stat"><div className="v">{fmtValue(current.best, current.unit)}</div><div className="l">Mejor marca</div></div>
              <div className="stat"><div className="v">{current.points.length}</div><div className="l">Sesiones</div></div>
              {current.last !== current.first && (
                <div className="stat">
                  <div className="v">{current.last > current.first ? '+' : '−'}{fmtValue(Math.abs(current.last - current.first), current.unit)}</div>
                  <div className="l">Desde {shortDate(current.points[0]!.date)}</div>
                </div>
              )}
            </div>
            <div className="tbl-wrap" style={{ marginTop: 12 }}>
              <table className="tbl">
                <thead><tr><th>Fecha</th><th>Lo anotado</th></tr></thead>
                <tbody>
                  {[...current.points].reverse().map((p, i) => (
                    <tr key={i}><td className="nw">{shortDate(p.date)}</td><td className="m">{p.text}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            {current.note && <p className="hint">{current.note}</p>}
            <p className="hint">Se grafica la mejor serie de cada sesión según lo escrito en la rutina. Entran los ejercicios anotados con cantidades en al menos 3 sesiones.</p>
          </section>
        </>
      ) : (
        <p className="empty">Con algunas sesiones más vas a ver acá la evolución de cada ejercicio.</p>
      )}
    </>
  );
}

// ── calidad del movimiento ──────────────────────────────────────────────────

function Dots({ n }: { n: number }) {
  return (
    <span className="qdots" role="img" aria-label={`${n} de 5: ${QUALITY_SCORE[n]}`}>
      {[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= n ? 'on' : ''} />)}
    </span>
  );
}

/**
 * Ejercicios que se sostienen en el tiempo: el progreso está en la calidad
 * (cómo organiza el cuerpo, transfiere el peso, siente el movimiento) aunque los
 * números no cambien. El profe registra cómo lo ejecuta, del 1 al 5.
 */
function QualitySection({ progress, quality, capSel, you, studentId, onChanged, toast, onlyRated }: {
  progress: Progress; quality: QualityEntry[]; capSel: CapacityId | null; you: boolean;
  studentId?: string; onChanged?: () => void; toast?: (m: string) => void;
  /** Sólo los ejercicios que el profe ya evaluó (vista de logros del alumno). */
  onlyRated?: boolean;
}) {
  const [adding, setAdding] = useState<string | null | 'new'>(null);
  const [open, setOpen] = useState<string | null>(null);
  const coach = Boolean(studentId);
  const practice = (progress.practice ?? []).filter((p) => !capSel || p.capacity === capSel);
  const byKey = new Map<string, QualityEntry[]>();
  for (const q of quality) byKey.set(q.exercise_key, [...(byKey.get(q.exercise_key) ?? []), q]);
  const keys = [...new Set([...byKey.keys(), ...(onlyRated ? [] : practice.map((p) => p.key))])]
    .filter((k) => !capSel || practice.some((p) => p.key === k) || (byKey.has(k) && !onlyRated));
  if (!keys.length && !coach) return null;
  const rows = keys.map((k) => {
    const list = (byKey.get(k) ?? []).sort((a, b) => a.day.localeCompare(b.day) || a.created_at.localeCompare(b.created_at));
    const p = practice.find((x) => x.key === k);
    return { key: k, name: p?.name ?? list[list.length - 1]?.exercise_name ?? k, practice: p, list };
  }).sort((a, b) => (b.list.length ? 1 : 0) - (a.list.length ? 1 : 0) || (b.practice?.recent ?? 0) - (a.practice?.recent ?? 0));

  const del = async (id: string) => {
    if (!window.confirm('¿Borrar este registro de calidad?')) return;
    try { await coachApi.deleteQuality(id); onChanged?.(); } catch (e) { toast?.((e as ApiError).message); }
  };

  return (
    <section className="card">
      <div className="card-h">
        <h2>{onlyRated ? 'Cómo te movés' : 'Calidad del movimiento'}</h2>
        {coach && <button className="btn sm" onClick={() => setAdding('new')}>{Icon.plus} Registrar</button>}
      </div>
      <div className="hint">
        {onlyRated
          ? 'Lo que anotó tu profe sobre cómo ejecutás estos ejercicios. Ahí el avance no siempre está en los números.'
          : you
          ? 'Hay ejercicios que sostenés en el tiempo para hacerlos cada vez mejor: cómo organizás el cuerpo, cómo transferís el peso, cuánto sentís el movimiento. Ahí el avance no siempre está en los números.'
          : 'Ejercicios que sostiene en el tiempo: el avance está en la ejecución, aunque los números no cambien. Registrá cómo lo hace del 1 al 5 y en qué mejoró.'}
      </div>
      {!rows.length && <p className="hint">Todavía no hay registros.</p>}
      <div className="qrows">
        {rows.map((r) => {
          const last = r.list[r.list.length - 1];
          const first = r.list[0];
          return (
            <div key={r.key} className="qrow">
              <button className="qhead" onClick={() => setOpen(open === r.key ? null : r.key)} aria-expanded={open === r.key}>
                <span className="qn">
                  <b>{r.name}</b>
                  <small>
                    {r.practice ? `${r.practice.weeks} semanas · ${r.practice.sessions} sesiones` : ''}
                    {r.practice && last ? ' · ' : ''}
                    {last ? `última evaluación ${shortDate(last.day)}` : ''}
                  </small>
                </span>
                {last
                  ? <span className="qv"><Dots n={last.score} /><small>{QUALITY_SCORE[last.score]}{first && first !== last && last.score > first.score ? ` · antes ${first.score}` : ''}</small></span>
                  : <span className="pill">Práctica sostenida</span>}
              </button>
              {last && last.aspects.length > 0 && (
                <div className="chips-row" style={{ marginTop: 6 }}>{last.aspects.map((a) => <span key={a} className="mini">{ASPECT_LABEL[a]}</span>)}</div>
              )}
              {last?.note && <p className="qnote">“{last.note}”</p>}
              {open === r.key && (
                <div className="qhist">
                  {[...r.list].reverse().map((q) => (
                    <div key={q.id} className="qh">
                      <span>{shortDate(q.day)}</span><Dots n={q.score} />
                      <span className="hint" style={{ margin: 0 }}>{q.aspects.map((a) => ASPECT_LABEL[a]).join(' · ')}{q.note ? ` · ${q.note}` : ''}</span>
                      {coach && <button className="btn sm ghost" aria-label="Borrar" onClick={() => del(q.id)}>{Icon.trash}</button>}
                    </div>
                  ))}
                  {coach && <button className="btn sm" onClick={() => setAdding(r.name)}>{Icon.plus} Registrar {r.name}</button>}
                  {!r.list.length && !coach && <p className="hint">Tu profe todavía no registró cómo lo ejecutás.</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {adding && studentId && (
        <QualitySheet studentId={studentId} exercise={adding === 'new' ? '' : adding}
          suggestions={rows.map((r) => r.name)} onClose={() => setAdding(null)}
          onSaved={() => { setAdding(null); onChanged?.(); toast?.('Calidad registrada'); }} toast={toast} />
      )}
    </section>
  );
}

function QualitySheet({ studentId, exercise, suggestions, onClose, onSaved, toast }: {
  studentId: string; exercise: string; suggestions: string[]; onClose: () => void; onSaved: () => void; toast?: (m: string) => void;
}) {
  const [name, setName] = useState(exercise);
  const [day, setDay] = useState(todayIso());
  const [score, setScore] = useState(3);
  const [aspects, setAspects] = useState<QualityAspect[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const toggle = (a: QualityAspect) => setAspects((x) => (x.includes(a) ? x.filter((y) => y !== a) : [...x, a]));
  const save = async () => {
    setBusy(true);
    try {
      await coachApi.addQuality(studentId, { exercise_name: name.trim(), day, score, aspects, note: note.trim() || null });
      onSaved();
    } catch (e) { toast?.((e as ApiError).message); } finally { setBusy(false); }
  };
  return (
    <Sheet title="Calidad del movimiento" onClose={onClose}>
      <div className="fields" style={{ marginTop: 0 }}>
        <div className="field full">
          <label htmlFor="q-ex">Ejercicio</label>
          <input id="q-ex" list="q-ex-list" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Turkish get up" />
          <datalist id="q-ex-list">{suggestions.map((x) => <option key={x} value={x} />)}</datalist>
        </div>
        <div className="field"><label htmlFor="q-day">Fecha</label><DateInput id="q-day" value={day} onChange={(e) => setDay(e.target.value)} /></div>
        <div className="field full">
          <span className="lab">Cómo lo ejecuta</span>
          <div className="qscore" role="radiogroup" aria-label="Cómo lo ejecuta">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} role="radio" aria-checked={score === n} onClick={() => setScore(n)}><b>{n}</b>{QUALITY_SCORE[n]}</button>
            ))}
          </div>
        </div>
        <div className="field full">
          <span className="lab">En qué mejoró o hay que poner el foco</span>
          <div className="chipset">
            {QUALITY_ASPECTS.map(([k, l]) => <button key={k} type="button" className="tog" aria-pressed={aspects.includes(k)} onClick={() => toggle(k)}>{l}</button>)}
          </div>
        </div>
        <div className="field full">
          <label htmlFor="q-note">Nota (la ve el alumno)</label>
          <textarea id="q-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej.: apoya todo el pie y el peso pasa sin saltos" />
        </div>
      </div>
      <button className="btn primary wide" disabled={busy || !name.trim()} onClick={save}>{busy ? 'Guardando…' : 'Guardar'}</button>
    </Sheet>
  );
}
