import { ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fmtValue, monthShort, shortDate, Unit } from './data';

// ── íconos (trazo 1.8, mismos que la bitácora) ──────────────────────────────
const svg = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
export const Icon = {
  routine: svg(<path d="M3 9v6M6 6.5v11M18 6.5v11M21 9v6M6 12h12" />),
  progress: svg(<><path d="M3 19h18M4 15l5-5 4 3 7-7" /><path d="M15 6h5v5" /></>),
  history: svg(<><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 9.5h16M8.5 3v4M15.5 3v4M8 13.5h3M8 16.5h6" /></>),
  user: svg(<><circle cx="12" cy="8" r="3.6" /><path d="M5 20c.8-3.8 3.6-6 7-6s6.2 2.2 7 6" /></>),
  users: svg(<><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.6-3.2 2.9-5 5.5-5s4.9 1.8 5.5 5" /><circle cx="17" cy="9" r="2.5" /><path d="M16 14.2c2.4.2 4 1.8 4.5 4.8" /></>),
  add: svg(<><rect x="4" y="4" width="16" height="16" rx="3.5" /><path d="M12 8.5v7M8.5 12h7" /></>),
  eval: svg(<><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 3.5h6v3H9z" /><path d="M8 14h2l1.5-3 2 5 1.5-2H16" /></>),
  back: svg(<path d="M15 5l-7 7 7 7" />),
  chev: (
    <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  ),
  copy: svg(<><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>),
  edit: svg(<><path d="M4 20h4L19 9l-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" /></>),
  trash: svg(<><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></>),
  logout: svg(<><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 16l-4-4 4-4M6 12h10" /></>),
  key: svg(<><circle cx="8" cy="15" r="4" /><path d="M11 12l8-8M16 7l2 2M14 9l2 2" /></>),
  share: svg(<><path d="M12 15V4M8 8l4-4 4 4" /><path d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /></>),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  ),
  bell: svg(<><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>),
  grip: svg(<><circle cx="9" cy="6" r="1.2" /><circle cx="15" cy="6" r="1.2" /><circle cx="9" cy="12" r="1.2" /><circle cx="15" cy="12" r="1.2" /><circle cx="9" cy="18" r="1.2" /><circle cx="15" cy="18" r="1.2" /></>),
  calendar: svg(<><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 9.5h16M8.5 3v4M15.5 3v4" /><path d="M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01" /></>),
  book: svg(<><path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z" /><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19M9 7h6M9 10.5h4" /></>),
  note: svg(<><path d="M5 4h14v11l-5 5H5z" /><path d="M14 20v-5h5M8.5 8.5h7M8.5 12h4" /></>),
  flame: svg(<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.1 2.2-5.1 3.6-7.4.5 1.5 1.3 2.6 2.4 3.1C11.5 7.4 12.6 4.7 14.8 3c.2 3 3.7 5.4 3.7 10.4C18.5 18.1 15.8 21 12 21z" />),
  copyPrev: svg(<><path d="M9 14l-4-4 4-4" /><path d="M5 10h9a5 5 0 0 1 0 10h-2" /></>),
  blank: svg(<><rect x="5" y="3.5" width="14" height="17" rx="2" /><path d="M12 9v6M9 12h6" /></>),
  paste: svg(<><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9.5 3h5v3h-5zM9 11h6M9 14.5h6M9 18h3.5" /></>),
  dup: svg(<><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>),
  x: svg(<path d="M6 6l12 12M18 6L6 18" />),
  plus: svg(<path d="M12 5v14M5 12h14" />),
  play: svg(<path d="M8 5.5v13l10.5-6.5z" />),
  money: svg(<><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.6" /><path d="M6.5 9.5v.01M17.5 14.5v.01" /></>),
  menu: svg(<><circle cx="6" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="18" cy="12" r="1.3" /></>),
  star: svg(<path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9 6.7 19.6l1-5.8-4.2-4.1 5.9-.9z" />),
};

/** Etiqueta de capacidad: color + nombre escrito (nunca sólo color). */
export function CapTag({ id, label, lg, muted }: { id: string; label: string; lg?: boolean; muted?: boolean }) {
  return (
    <span className={`cap${lg ? ' lg' : ''}${muted ? ' muted' : ''}`} style={{ ['--c' as string]: `var(--cap-${id})` }}>
      <i aria-hidden="true" />{label}
    </span>
  );
}

// ── estructura ──────────────────────────────────────────────────────────────

export function TopHeader({ title, sub, onBack, right, below }: {
  title: string; sub?: ReactNode; onBack?: () => void; right?: ReactNode;
  /** Va dentro del header sticky (ej. barra de progreso de la rutina). */
  below?: ReactNode;
}) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 4);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return (
    <header className="top" style={scrolled ? { boxShadow: '0 10px 18px -16px rgba(0,0,0,.5)' } : undefined}>
      <div className="top-row">
        <div className="top-left">
          {onBack && <button className="back" onClick={onBack} aria-label="Volver">{Icon.back}</button>}
          <h1>{title}</h1>
        </div>
        <div className="top-right">{right}</div>
      </div>
      {sub && <div className="sub">{sub}</div>}
      {below}
    </header>
  );
}

export interface TabDef<T extends string> { id: T; label: string; icon: ReactNode }

export function TabBar<T extends string>({ tabs, current, onChange }: { tabs: TabDef<T>[]; current: T; onChange: (t: T) => void }) {
  const idx = Math.max(0, tabs.findIndex((t) => t.id === current));
  return (
    <nav className="tabs" aria-label="Secciones">
      <div className="in" style={{ ['--n' as string]: tabs.length, ['--ti' as string]: idx }}>
        <span className="ind" aria-hidden="true" />
        {tabs.map((t) => (
          <button key={t.id} aria-current={t.id === current ? 'page' : 'false'} onClick={() => onChange(t.id)}>
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

export function Seg<T extends string>({ options, value, onChange, small }: {
  options: Array<[T, ReactNode]>; value: T; onChange: (v: T) => void; small?: boolean;
}) {
  const idx = Math.max(0, options.findIndex(([v]) => v === value));
  return (
    <div className={`seg${small ? ' sm' : ''}`} role="group" style={{ ['--n' as string]: options.length, ['--idx' as string]: idx }}>
      <span className="thumb" aria-hidden="true" />
      {options.map(([v, label]) => (
        <button key={v} aria-pressed={v === value} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  );
}

/** Contenido que entra escalonado (como .enter de la bitácora). */
export function Enter({ children, k }: { children: ReactNode; k?: string }) {
  return (
    <div className="enter" key={k}>
      {(Array.isArray(children) ? children : [children]).map((c, i) => (
        <div key={i} style={{ ['--i' as string]: i }}>{c}</div>
      ))}
    </div>
  );
}

export function Skeleton() {
  return <div className="skel" aria-label="Cargando"><i /><i /><i /></div>;
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', esc); };
  }, [onClose]);
  // En el <body>: dentro de una pantalla animada el position:fixed queda atrapado.
  return createPortal(
    <div className="bt bt-sheet-back" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="in">
          <div className="grab" />
          <div className="sheet-h">
            <h2>{title}</h2>
            <button className="btn ghost" onClick={onClose}>Cerrar</button>
          </div>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function useToast(): [ReactNode, (msg: string) => void] {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<number>();
  const show = (m: string) => {
    setMsg(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), 3200);
  };
  return [msg ? <div className="toast" role="status">{msg}</div> : null, show];
}

/** Número que cuenta hasta su valor al aparecer. */
export function CountUp({ to, dec = 0 }: { to: number; dec?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(to); return; }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 900);
      setV(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{dec ? v.toFixed(dec).replace('.', ',') : Math.round(v)}</>;
}

// ── gráficos ────────────────────────────────────────────────────────────────

function niceTicks(min: number, max: number, n: number): number[] {
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  let step = Math.pow(10, Math.floor(Math.log10(span / n)));
  const err = span / n / step;
  step *= err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1;
  const a = Math.floor(min / step) * step;
  const b = Math.ceil(max / step) * step;
  const t: number[] = [];
  for (let v = a; v <= b + step / 2; v += step) t.push(Math.round(v * 1000) / 1000);
  return t;
}

export function LineChart({ points, unit }: { points: Array<{ date: string; value: number }>; unit: Unit }) {
  const W = 340, H = 170, L = 40, R = 14, T = 18, B = 24;
  const pathRef = useRef<SVGPolylineElement>(null);
  const [len, setLen] = useState(1000);
  useEffect(() => { if (pathRef.current?.getTotalLength) setLen(pathRef.current.getTotalLength()); }, [points]);
  if (!points.length) return null;
  const ts = points.map((p) => new Date(`${p.date}T00:00:00`).getTime());
  const ys = points.map((p) => p.value);
  const tk = niceTicks(Math.min(...ys), Math.max(...ys), 4);
  const y0 = tk[0]!, y1 = tk[tk.length - 1]!;
  const x0 = Math.min(...ts), x1 = Math.max(...ts);
  const X = (t: number) => (points.length === 1 || x1 === x0 ? L + (W - L - R) / 2 : L + ((t - x0) / (x1 - x0)) * (W - L - R));
  const Y = (v: number) => T + (1 - (v - y0) / (y1 - y0 || 1)) * (H - T - B);
  const tickLabel = (v: number) => (unit === 's' && v >= 60 ? fmtValue(v, 's').replace(' min', '′') : String(v));
  let maxI = 0;
  ys.forEach((v, i) => { if (v > ys[maxI]!) maxI = i; });
  const idx = points.length > 2 ? [0, Math.floor((points.length - 1) / 2), points.length - 1] : points.map((_, i) => i);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Evolución en ${unit}`}>
      {tk.map((v) => (
        <g key={v}>
          <line className="gl" x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} />
          <text x={L - 6} y={Y(v) + 3} textAnchor="end">{tickLabel(v)}</text>
        </g>
      ))}
      <polyline ref={pathRef} className="ln" style={{ ['--len' as string]: len }} key={points.map((p) => p.value).join(',')}
        points={points.map((p, i) => `${X(ts[i]!).toFixed(1)},${Y(p.value).toFixed(1)}`).join(' ')} />
      {points.map((p, i) => {
        const last = i === points.length - 1;
        const cx = X(ts[i]!);
        const showVal = last || (i === maxI && Math.abs(X(ts[ts.length - 1]!) - cx) > 34);
        const anchor = cx > W - R - 16 ? 'end' : cx < L + 16 ? 'start' : 'middle';
        return (
          <g key={`${p.date}-${i}`}>
            <circle className={`pt${last ? ' last' : ''}`} style={{ ['--i' as string]: i }} cx={cx} cy={Y(p.value)} r={4}>
              <title>{`${shortDate(p.date)}: ${fmtValue(p.value, unit)}`}</title>
            </circle>
            {showVal && <text className="val" x={cx} y={Y(p.value) - 9} textAnchor={anchor}>{fmtValue(p.value, unit)}</text>}
          </g>
        );
      })}
      {idx.map((i) => (
        <text key={`x${i}`} x={X(ts[i]!)} y={H - 6}
          textAnchor={i === 0 && points.length > 1 ? 'start' : i === points.length - 1 && points.length > 1 ? 'end' : 'middle'}>
          {shortDate(points[i]!.date)}
        </text>
      ))}
    </svg>
  );
}

export function MonthBars({ months }: { months: Array<{ month: string; count: number }> }) {
  const data = months.slice(-12);
  const W = 340, H = 130, T = 16, B = 22, L = 4, R = 4;
  const max = Math.max(1, ...data.map((m) => m.count));
  const bw = (W - L - R) / Math.max(1, data.length);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Sesiones por mes">
      <line className="gl" x1={L} x2={W - R} y1={H - B} y2={H - B} />
      {data.map((m, i) => {
        const h = m.count ? Math.max(4, ((H - T - B) * m.count) / max) : 3;
        const x = L + i * bw + bw * 0.18;
        return (
          <g key={m.month}>
            <rect className={`bar${m.count ? '' : ' zero'}`} style={{ ['--i' as string]: i }} x={x} y={H - B - h} width={bw * 0.64} height={h} rx={4} />
            {m.count > 0 && <text className="val" x={x + bw * 0.32} y={H - B - h - 5} textAnchor="middle">{m.count}</text>}
            <text x={x + bw * 0.32} y={H - 6} textAnchor="middle">{monthShort(m.month)}</text>
          </g>
        );
      })}
    </svg>
  );
}
