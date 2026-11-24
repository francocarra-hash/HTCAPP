import { useMemo, useState } from 'react';
import { ApiError } from '../api';
import {
  ASPECT_LABEL, CAP_INFO, CAP_LABEL, CapacityId, coachApi, fmtValue, Highlight, longDate, pctGain, Progress, QUALITY_ASPECTS,
  QUALITY_SCORE, QualityAspect, QualityEntry, relDays, shortDate, todayIso, Unit, unitLabel,
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

// ── Progreso del alumno: simple, con sus números ────────────────────────────

const MILESTONES = [10, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500, 750, 1000];
const daysAgo = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const round1 = (n: number): number => Math.round(n * 10) / 10;
/** La marca tal como se dice: "1:45 min", "20 kg", "12 reps". */
const mark = (v: number, unit: Unit): string => (unit === 'reps' ? `${v} reps` : fmtValue(v, unit));
const gainTxt = (d: number, unit: Unit): string => (unit === 'reps' ? `${d} ${d === 1 ? 'repetición' : 'repeticiones'}` : fmtValue(d, unit));
/** La mejor marca hasta cada fecha: una línea que sólo sube. */
const runningBest = (values: number[]): number[] => {
  let top = -Infinity;
  return values.map((v) => (top = Math.max(top, v)));
};

/** Las veces que superó su marca (más el punto de hoy), para un gráfico que se lee de un vistazo. */
function recordSteps(points: Array<{ date: string; value: number }>): Array<{ date: string; value: number }> {
  const out: Array<{ date: string; value: number }> = [];
  let top = -Infinity;
  for (const p of points) if (p.value > top) { top = p.value; out.push({ date: p.date, value: p.value }); }
  const last = points[points.length - 1]!;
  if (out[out.length - 1]!.date !== last.date) out.push({ date: last.date, value: top });
  return out;
}

type Ex = Progress['exercises'][number];
interface Rec {
  ex: Ex; best: number;
  /** Cuándo llegó a su mejor marca. */
  bestDate: string; firstDate: string;
  /** Cuánto subió desde la primera vez. */
  gain: number;
  /** La mejor marca es de las últimas 4 semanas. */
  fresh: boolean;
}

/** Línea simple de cómo fue subiendo la mejor marca; el último punto, resaltado. */
function Spark({ values }: { values: number[] }) {
  const W = 160, H = 48, P = 5;
  if (values.length < 2) return <svg className="spark" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" />;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [P + (i * (W - 2 * P)) / (values.length - 1), H - P - ((v - min) / span) * (H - 2 * P - 4)] as const);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1]!;
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <polygon className="sp-a" points={`${P},${H} ${line} ${W - P},${H}`} />
      <polyline className="sp-l" points={line} />
      <circle className="sp-d" cx={last[0]} cy={last[1]} r="3.5" />
    </svg>
  );
}

/**
 * Lo que ve el alumno en Progreso, en cuatro bloques y sin porcentajes: cuánto
 * viene entrenando, su mejor marca en lo que más entrena, el resto de sus
 * récords y los niveles que subió. El detalle fino queda en la vista del profe.
 */
function StudentProgress({ progress, quality }: { progress: Progress; quality: QualityEntry[] }) {
  const { stats, exercises, months } = progress;
  const [order, setOrder] = useState<'recientes' | 'az'>('recientes');
  const [all, setAll] = useState(false);
  const [allLevels, setAllLevels] = useState(false);
  const [open, setOpen] = useState<Rec | null>(null);

  const recs = useMemo<Rec[]>(() => {
    const since = daysAgo(28);
    return exercises.filter((e) => e.points.length > 0).map((e) => {
      const best = Math.max(...e.points.map((p) => p.value));
      const at = e.points.findIndex((p) => p.value === best);
      const bestDate = e.points[at]!.date;
      return { ex: e, best, bestDate, firstDate: e.points[0]!.date, gain: round1(best - e.points[0]!.value), fresh: at > 0 && bestDate >= since };
    });
  }, [exercises]);

  // Lo que más entrena: los ejercicios que más veces repitió (primero, en los que subió).
  const main = useMemo(() => {
    const m = recs.filter((r) => r.ex.points.length >= 3)
      .sort((a, b) => Number(b.gain > 0) - Number(a.gain > 0) || b.ex.points.length - a.ex.points.length).slice(0, 4);
    return m.length >= 2 ? m : [];
  }, [recs]);
  const others = useMemo(() => recs.filter((r) => !main.includes(r))
    .sort((a, b) => (order === 'az' ? a.ex.name.localeCompare(b.ex.name, 'es') : b.bestDate.localeCompare(a.bestDate) || a.ex.name.localeCompare(b.ex.name, 'es'))),
  [recs, main, order]);

  if (!stats.sessions) return <p className="empty">Cuando completes tus primeras sesiones, acá vas a ver cómo vas mejorando.</p>;

  const fresh = recs.filter((r) => r.fresh).length;
  const next = MILESTONES.find((m) => m > stats.sessions);
  const left = next ? next - stats.sessions : 0;
  const variants = progress.variants ?? [];
  const shownOthers = all ? others : others.slice(0, 6);
  const shownLevels = allLevels ? variants : variants.slice(0, 3);

  return (
    <>
      <section className="ach" aria-label="Tu constancia">
        <div className="ach-k">Semana {stats.process_week} de tu proceso</div>
        <div className="ach-big"><b><CountUp to={stats.sessions} /></b><span>{stats.sessions === 1 ? 'sesión hecha' : 'sesiones hechas'}</span></div>
        {next && (
          <div className="ach-goal">
            <div className="ach-bar" role="img" aria-label={`${stats.sessions} de ${next} sesiones`}><i style={{ width: `${Math.max(4, (stats.sessions / next) * 100)}%` }} /></div>
            <p>{left === 1 ? 'Te falta 1 sesión' : `Te faltan ${left} sesiones`} para llegar a las <b>{next}</b>.</p>
          </div>
        )}
        <div className="ach-stats">
          <div><b><CountUp to={stats.streak_weeks} /></b><span>{stats.streak_weeks === 1 ? 'Semana seguida' : 'Semanas seguidas'}</span></div>
          <div><b><CountUp to={stats.this_month} /></b><span>Este mes</span></div>
          {/* El tercer número nunca es un cero: marcas nuevas, niveles subidos o ejercicios con marca. */}
          {fresh > 0
            ? <div><b><CountUp to={fresh} /></b><span>{fresh === 1 ? 'Marca nueva' : 'Marcas nuevas'}</span></div>
            : variants.length > 0
              ? <div><b><CountUp to={variants.length} /></b><span>{variants.length === 1 ? 'Nivel subido' : 'Niveles subidos'}</span></div>
              : <div><b><CountUp to={recs.length} /></b><span>{recs.length === 1 ? 'Ejercicio con marca' : 'Ejercicios con marca'}</span></div>}
        </div>
      </section>

      {main.length > 0 && (
        <section className="card">
          <h2>Lo que más entrenás</h2>
          <div className="hint">Tu mejor marca en cada uno. Tocá para ver cómo fuiste subiendo.</div>
          <div className="keygrid">
            {main.map((r) => (
              <button key={r.ex.key} className="keycard" onClick={() => setOpen(r)}>
                <span className="kc-n">{r.ex.name}{r.fresh && <i className="pr">Nueva</i>}</span>
                <span className="kc-v">{mark(r.best, r.ex.unit)}</span>
                <span className={`kc-d${r.gain > 0 ? ' up' : ''}`}>{r.gain > 0 ? `▲ Subiste ${mark(r.gain, r.ex.unit)}` : `Desde el ${shortDate(r.firstDate)}`}</span>
                <Spark values={runningBest(r.ex.points.map((p) => p.value))} />
              </button>
            ))}
          </div>
        </section>
      )}

      {others.length > 0 && (
        <section className="card">
          <div className="card-h"><h2>{main.length ? 'Otros récords' : 'Tus récords'}</h2><span className="mini">{others.length} {others.length === 1 ? 'ejercicio' : 'ejercicios'}</span></div>
          <div className="hint">Tu mejor marca en cada ejercicio. "Nueva" es una marca de las últimas 4 semanas.</div>
          <div className="filters" role="group" aria-label="Ordenar">
            <button className="tog" aria-pressed={order === 'recientes'} onClick={() => setOrder('recientes')}>Recientes</button>
            <button className="tog" aria-pressed={order === 'az'} onClick={() => setOrder('az')}>A–Z</button>
          </div>
          <div className="recgrid">
            {shownOthers.map((r) => (
              <button key={r.ex.key} className="reccard" onClick={() => setOpen(r)}>
                <span className="kc-n">{r.ex.name}{r.fresh && <i className="pr">Nueva</i>}</span>
                <span className="rc-v">{mark(r.best, r.ex.unit)}</span>
                <span className="rc-d">{relDays(r.bestDate)}</span>
              </button>
            ))}
          </div>
          {others.length > 6 && (
            <button className="btn wide" style={{ marginTop: 12 }} onClick={() => setAll(!all)}>{all ? 'Ver menos' : `Ver los ${others.length}`}</button>
          )}
        </section>
      )}

      {!recs.length && (
        <section className="card"><p className="hint" style={{ margin: 0 }}>Cuando repitas ejercicios, acá vas a ver tu mejor marca en cada uno.</p></section>
      )}

      {variants.length > 0 && (
        <section className="card">
          <div className="card-h"><h2>Subiste de nivel</h2><span className="mini">{variants.length}</span></div>
          <p className="hint" style={{ margin: '4px 0 8px' }}>Pasaste a una versión más difícil del mismo movimiento.</p>
          <div className="rows">
            {shownLevels.map((v) => (
              <div key={v.to + v.date} className="vstep" style={{ ['--c' as string]: 'var(--accent)' }}>
                <span className="vs-from">{v.from}</span>
                <span className="vs-ar" aria-hidden="true">→</span>
                <b>{v.to}</b>
                <small>desde el {shortDate(v.date)}{v.date.slice(0, 4) !== String(new Date().getFullYear()) ? ` de ${v.date.slice(0, 4)}` : ''}</small>
              </div>
            ))}
          </div>
          {variants.length > 3 && (
            <button className="btn wide" style={{ marginTop: 12 }} onClick={() => setAllLevels(!allLevels)}>{allLevels ? 'Ver menos' : `Ver los ${variants.length}`}</button>
          )}
        </section>
      )}

      <QualitySection progress={progress} quality={quality} capSel={null} you onlyRated />

      {months.length > 1 && (
        <section className="card">
          <h2>Tus sesiones por mes</h2>
          <div className="hint">{stats.this_month ? `Este mes llevás ${stats.this_month}.` : 'Cada barra es un mes.'}</div>
          <MonthBars months={months} />
        </section>
      )}

      {open && (
        <Sheet title={open.ex.name} onClose={() => setOpen(null)}>
          <p className="cls-now"><b>{mark(open.best, open.ex.unit)}</b> · tu mejor marca, el {longDate(open.bestDate)}</p>
          {open.ex.points.length > 1 && (
            <>
              <LineChart points={recordSteps(open.ex.points)} unit={open.ex.unit} />
              <p className="hint" style={{ margin: 0, fontSize: 12 }}>Cada punto es una vez que superaste tu marca.</p>
            </>
          )}
          <div className="stats">
            <div className="stat"><div className="v">{mark(open.ex.points[0]!.value, open.ex.unit)}</div><div className="l">La primera vez · {shortDate(open.firstDate)}</div></div>
            <div className="stat"><div className="v">{mark(open.ex.last, open.ex.unit)}</div><div className="l">La última vez</div></div>
            <div className="stat"><div className="v">{open.ex.points.length}</div><div className="l">{open.ex.points.length === 1 ? 'Vez' : 'Veces'}</div></div>
          </div>
          {open.gain > 0 && <p className="hint" style={{ margin: 0 }}>Subiste {gainTxt(open.gain, open.ex.unit)} desde que empezaste con este ejercicio.</p>}
        </Sheet>
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
