import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { benefitsFor } from './benefits';
import { CAP_LABEL, capacityMix, firstName, Routine } from './data';
import { Icon } from './ui';

const FEEL = [
  { v: 1, label: 'Muy duro' },
  { v: 2, label: 'Duro' },
  { v: 3, label: 'Bien' },
  { v: 4, label: 'Muy bien' },
  { v: 5, label: 'Genial' },
];

/** Confeti en canvas con los colores de las capacidades trabajadas. */
function useConfetti(canvas: React.RefObject<HTMLCanvasElement>, colors: string[]) {
  useEffect(() => {
    const c = canvas.current;
    if (!c || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // Se dibuja en el tamaño que el canvas ocupa en pantalla, así nunca sale estirado.
    let w = 0, h = 0;
    const resize = () => {
      w = c.clientWidth || innerWidth;
      h = c.clientHeight || innerHeight;
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    };
    resize();
    const palette = colors.length ? colors : ['#2a78d6', '#1baf7a', '#eda100'];
    const parts = Array.from({ length: 150 }, (_, i) => ({
      x: w / 2 + (Math.random() - .5) * 80,
      y: h * .38,
      vx: (Math.random() - .5) * 14,
      vy: -Math.random() * 15 - 6,
      w: 6 + Math.random() * 6,
      h: 8 + Math.random() * 8,
      r: Math.random() * Math.PI,
      vr: (Math.random() - .5) * .35,
      color: palette[i % palette.length]!,
    }));
    const t0 = performance.now();
    let prev = t0;
    let raf = 0;
    const tick = (t: number) => {
      const age = t - t0;
      // Pasos en "cuadros de 60 fps": misma velocidad en pantallas de 60 o 120 Hz.
      const k = Math.min(3, Math.max(0, (t - prev) / (1000 / 60)));
      prev = t;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = Math.max(0, Math.min(1, (3600 - age) / 900));
      for (const p of parts) {
        p.vy += 0.38 * k;
        p.vx *= 0.99 ** k;
        p.x += p.vx * k;
        p.y += p.vy * k;
        p.r += p.vr * k;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)) + 2);
        ctx.restore();
      }
      if (age < 3600) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(tick);
    // Sigue al canvas (barra de scroll que desaparece, barra del navegador en el celu, rotación).
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    if (ro) ro.observe(c); else window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(raf); ro?.disconnect(); window.removeEventListener('resize', resize); };
  }, [canvas, colors]);
}

export function Celebration({ routine, seed, done, total, studentName, onClose }: {
  routine: Routine; seed: string; done: number; total: number; studentName: string;
  onClose: (feeling: number | null, comment: string | null) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const mix = capacityMix(routine);
  const [colors] = useState(() => {
    const css = getComputedStyle(document.documentElement);
    return mix.map((m) => css.getPropertyValue(`--cap-${m.id}`).trim()).filter(Boolean);
  });
  // Antes que el confeti: sin la barra de scroll, el canvas se mide con su ancho final.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
  useConfetti(canvas, colors);
  const [feeling, setFeeling] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const benefits = benefitsFor(routine, seed);

  // En el <body>: dentro de una pantalla animada el position:fixed queda atrapado
  // y el festejo sale corrido, tapado por la barra y con el confeti estirado.
  return createPortal(
    <div className="bt bt-celebrate" role="dialog" aria-modal="true" aria-labelledby="cel-title">
      <canvas ref={canvas} aria-hidden="true" />
      <div className="cel">
        <div className="badge" aria-hidden="true">{Icon.check}</div>
        <h2 id="cel-title">¡Sesión completada!</h2>
        <p className="lead">Bien ahí, {firstName(studentName)}. Tu profe ya lo puede ver.</p>
        <div className="row3">
          <div><b>{done}</b><span>Ejercicios</span></div>
          <div><b>{routine.blocks.filter((b) => b.kind !== 'notes').length}</b><span>Bloques</span></div>
          <div><b>{total ? Math.round((done / total) * 100) : 0}%</b><span>Completado</span></div>
        </div>
        {mix.length > 0 && (
          <div className="cap-legend" style={{ justifyContent: 'center' }}>
            {mix.map((m) => (
              <span key={m.id} className="cap" style={{ ['--c' as string]: `var(--cap-${m.id})` }}><i />{CAP_LABEL[m.id]}</span>
            ))}
          </div>
        )}
        {benefits.length > 0 && (
          <div className="ben">
            <div className="label" style={{ background: 'none', padding: 0, animation: 'none' }}>Lo que te llevás hoy</div>
            {benefits.map((b, i) => (
              <div key={b.capacity} style={{ ['--c' as string]: `var(--cap-${b.capacity})`, ['--i' as string]: i }}>
                {b.text}
                <small>{CAP_LABEL[b.capacity]} · {b.ref}</small>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 18, textAlign: 'left' }}>
          <div className="label">¿Cómo te sentiste?</div>
          <div className="feel" role="group" aria-label="Cómo te sentiste">
            {FEEL.map((f) => (
              <button key={f.v} aria-pressed={feeling === f.v} onClick={() => setFeeling(feeling === f.v ? null : f.v)}>
                <b>{f.v}</b>{f.label}
              </button>
            ))}
          </div>
          <div className="field" style={{ marginTop: 10 }}>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Algo para contarle a tu profe (opcional)" rows={2} />
          </div>
        </div>
        <button className="btn primary wide" style={{ marginTop: 14 }} onClick={() => onClose(feeling, comment.trim() || null)}>
          Listo
        </button>
      </div>
    </div>,
    document.body,
  );
}
