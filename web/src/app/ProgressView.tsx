import { useMemo, useState } from 'react';
import { fmtValue, longDate, Progress, shortDate, unitLabel } from './data';
import { CountUp, LineChart, MonthBars } from './ui';

export function ProgressView({ progress, you }: { progress: Progress; you: boolean }) {
  const { stats, highlights, exercises, months } = progress;
  const [sel, setSel] = useState<string | null>(null);
  const current = useMemo(
    () => exercises.find((e) => e.key === sel) ?? exercises.find((e) => e.key === highlights[0]?.key) ?? exercises[0],
    [sel, exercises, highlights],
  );

  if (!stats.sessions) {
    return <p className="empty">{you ? 'Cuando tu profe cargue tus sesiones, acá vas a ver cómo vas mejorando.' : 'Todavía no hay sesiones cargadas.'}</p>;
  }

  return (
    <>
      <section className="card">
        <div className="pstats">
          <div><b><CountUp to={stats.sessions} /></b><span>Sesiones</span></div>
          <div><b><CountUp to={stats.weeks_active} /></b><span>Semanas</span></div>
          <div><b>{stats.per_week != null ? <CountUp to={stats.per_week} dec={1} /> : '—'}</b><span>Por semana</span></div>
          <div><b><CountUp to={stats.streak_weeks} /></b><span>Racha sem.</span></div>
        </div>
        {stats.first_date && (
          <p className="hint" style={{ textAlign: 'center', marginTop: 10 }}>
            {you ? 'Entrenando' : 'Entrena'} desde el {longDate(stats.first_date)}.
            {stats.this_month ? ` Este mes: ${stats.this_month} ${stats.this_month === 1 ? 'sesión' : 'sesiones'}.` : ''}
          </p>
        )}
      </section>

      {highlights.length > 0 && (
        <section className="card">
          <h2>Logros</h2>
          <div className="hint">De la primera vez a la última, según lo que anotó {you ? 'tu profe' : 'el profe'}.</div>
          <ul className="list">
            {highlights.map((h, i) => (
              <li key={h.key} style={{ ['--i' as string]: i }}>
                <div>
                  <b>{h.name}</b> <span>{fmtValue(h.from, h.unit)} → {fmtValue(h.to, h.unit)}</span>
                  <small>{shortDate(h.first_date)} → {shortDate(h.last_date)}</small>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {months.length > 1 && (
        <section className="card">
          <h2>Constancia</h2>
          <div className="hint">Sesiones por mes.</div>
          <MonthBars months={months} />
        </section>
      )}

      {current ? (
        <>
          <select className="full" value={current.key} onChange={(e) => setSel(e.target.value)} aria-label="Ejercicio">
            {exercises.map((e) => (
              <option key={e.key} value={e.key}>{e.name} · {e.points.length} sesiones</option>
            ))}
          </select>
          <section className="card" key={current.key}>
            <div className="label">{current.name} · {unitLabel(current.unit)}</div>
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
            <p className="hint">
              Se grafica la mejor serie de cada sesión. Aparecen los ejercicios anotados con cantidades en al menos 3 sesiones.
            </p>
          </section>
        </>
      ) : (
        <p className="empty">Con algunas sesiones más vas a ver acá la evolución de cada ejercicio.</p>
      )}
    </>
  );
}
