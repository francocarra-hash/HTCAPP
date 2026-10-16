import { useMemo, useState } from 'react';
import { CAP_LABEL, CapacityId, fmtValue, Highlight, longDate, pctGain, Progress, shortDate, unitLabel } from './data';
import { CapTag, CountUp, LineChart, MonthBars } from './ui';

/** Logro: de dónde arrancó a dónde llegó, con barra proporcional. */
export function WinCard({ h, i = 0 }: { h: Highlight; i?: number }) {
  const max = Math.max(h.from, h.to) || 1;
  return (
    <div className="win" style={{ ['--c' as string]: h.capacity ? `var(--cap-${h.capacity})` : 'var(--accent)', ['--i' as string]: i }}>
      <div className="win-h">
        <b>{h.name}</b>
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

export function ProgressView({ progress, you }: { progress: Progress; you: boolean }) {
  const { stats, highlights, exercises, months, capacities } = progress;
  const [capSel, setCapSel] = useState<CapacityId | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const shownEx = useMemo(() => exercises.filter((e) => !capSel || e.capacity === capSel), [exercises, capSel]);
  const shownWins = highlights.filter((h) => !capSel || h.capacity === capSel);
  const current = shownEx.find((e) => e.key === sel) ?? shownEx.find((e) => e.key === shownWins[0]?.key) ?? shownEx[0];
  const recent = capacities.filter((c) => c.recent_share > 0);

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
          <h2>{capSel ? CAP_LABEL[capSel] : 'Capacidades'}</h2>
          <div className="hint">
            {capSel ? 'Ejercicios con seguimiento en esta capacidad.' : 'Tocá una capacidad para ver sólo sus avances.'}
          </div>
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
          <div className="hint">Reparto de los ejercicios de las últimas 4 semanas.</div>
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
          <div className="hint">De la primera vez a la última, según lo que anotó {you ? 'tu profe' : 'el profe'}.</div>
          <div className="wins">{shownWins.map((h, i) => <WinCard key={h.key} h={h} i={i} />)}</div>
        </section>
      )}

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
            <p className="hint">Se grafica la mejor serie de cada sesión. Entran los ejercicios anotados con cantidades en al menos 3 sesiones.</p>
          </section>
        </>
      ) : (
        <p className="empty">Con algunas sesiones más vas a ver acá la evolución de cada ejercicio.</p>
      )}
    </>
  );
}
