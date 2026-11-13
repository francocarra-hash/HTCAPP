import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api';
import {
  checkableItems, coachApi, emptyResponse, emptySet, ExecSet, Execution, ExecutionDraft, firstName, LOAD_CONFIGS, LoadConfig,
  RecordData, ResponseDraft, RoutineItem, Session, shortDate, SRPE_LABEL, studentApi, Tracking, TRACKINGS, timeAgo,
} from './data';
import { Icon, Sheet, Skeleton } from './ui';

// ── dosis → series (sólo cuando la persona toca "Igual que lo indicado") ──

function secsIn(t: string): number | null {
  const mmss = /(\d+)\s*:\s*(\d{2})/.exec(t);
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2]);
  const min = /(\d+(?:[.,]\d+)?)\s*(?:min|mins|minutos|m)\b/i.exec(t);
  if (min) return Math.round(Number(min[1]!.replace(',', '.')) * 60);
  const s = /(\d+(?:[.,]\d+)?)\s*(?:seg|segs|sec|s)\b/i.exec(t);
  return s ? Number(s[1]!.replace(',', '.')) : null;
}

/** "3x10 20kg" → 3 series de 10 con 20 kg; "45s" → 1 serie de 45 s; multiplicado por las vueltas del bloque. */
export function setsFromDose(dose: string, rounds: number | null, tracking: Tracking): ExecSet[] {
  const t = dose.replace(/\(.*?\)/g, ' ');
  const kg = /(\d+(?:[.,]\d+)?)\s*(?:kg|k)\b/i.exec(t);
  const load = kg ? Number(kg[1]!.replace(',', '.')) : null;
  const secs = secsIn(t);
  const rest = t.replace(/(\d+(?:[.,]\d+)?)\s*(?:kg|k)\b/gi, ' ').replace(/(\d+)\s*:\s*(\d{2})\s*\w*/g, ' ').replace(/(\d+(?:[.,]\d+)?)\s*(?:min|mins|minutos|m|seg|segs|sec|s)\b/gi, ' ');
  let sets = 1;
  let reps: number | null = null;
  const lead = /(\d{1,2})\s*[x×]\s*(\d+)/.exec(rest);
  const trail = /(\d+)\s*\w*\s*[x×]\s*(\d{1,2})\b/.exec(rest);
  if (lead) { sets = Number(lead[1]); reps = Number(lead[2]); }
  else if (trail) { reps = Number(trail[1]); sets = Number(trail[2]); }
  else {
    const r = /(\d+)\s*(?:reps?|repes|r)?\b/.exec(rest);
    if (r) reps = Number(r[1]);
  }
  if (secs != null && !lead && !trail && tracking !== 'dinamica') reps = null;
  // Series escritas en la dosis ("4x6") mandan; si no, una por vuelta del bloque.
  const total = Math.max(1, Math.min(20, lead || trail ? sets : rounds ?? 1));
  return Array.from({ length: total }, (_, i) => ({ ...emptySet(i + 1), reps, load, secs }));
}

export function inferTracking(it: RoutineItem): Tracking {
  const c = it.capacity ?? null;
  if (c === 'resistencia') return 'aerobica';
  if (c === 'reactividad') return 'pliometria';
  if (c === 'movilidad') return 'movilidad';
  if (c === 'control_motor') return 'control_motor';
  const d = it.dose || '';
  return secsIn(d) != null && !/\d\s*[x×]\s*\d|\d+\s*(?:reps?|r)\b/i.test(d) ? 'isometrica' : 'dinamica';
}

// ── campos por tipo de registro ──

type Field = 'reps' | 'load' | 'secs' | 'dist_m' | 'height_cm' | 'hr' | 'rpe' | 'rir' | 'pain' | 'rest_s' | 'velocity' | 'power';
const MAIN: Record<Tracking, Array<[Field, string]>> = {
  dinamica: [['reps', 'Reps'], ['load', 'Carga']],
  isometrica: [['secs', 'Seg.'], ['load', 'Carga']],
  movilidad: [['reps', 'Reps'], ['secs', 'Seg.']],
  pliometria: [['reps', 'Contactos'], ['height_cm', 'Altura cm'], ['dist_m', 'Dist. m']],
  aerobica: [['secs', 'Min'], ['dist_m', 'Dist. m'], ['hr', 'FC']],
  control_motor: [['reps', 'Reps'], ['secs', 'Seg.']],
};
const EXTRA: Record<Tracking, Array<[Field, string]>> = {
  dinamica: [['rir', 'RIR'], ['rpe', 'RPE'], ['pain', 'Dolor'], ['rest_s', 'Desc. s'], ['velocity', 'm/s'], ['power', 'W']],
  isometrica: [['rpe', 'RPE'], ['pain', 'Dolor'], ['rest_s', 'Desc. s']],
  movilidad: [['pain', 'Dolor'], ['rpe', 'RPE']],
  pliometria: [['rpe', 'RPE'], ['pain', 'Dolor'], ['rest_s', 'Desc. s']],
  aerobica: [['rpe', 'RPE'], ['power', 'W'], ['pain', 'Dolor']],
  control_motor: [['rpe', 'RPE'], ['pain', 'Dolor']],
};

const numOrNull = (v: string): number | null => (v.trim() === '' ? null : Number(v.replace(',', '.')));

function NumIn({ value, onChange, label, minutes }: { value: number | null; onChange: (v: number | null) => void; label: string; minutes?: boolean }) {
  const shown = value == null ? '' : minutes ? String(Math.round((value / 60) * 100) / 100) : String(value);
  return (
    <label className="sv">
      <span>{label}</span>
      <input type="number" inputMode="decimal" min={0} step="any" value={shown}
        onChange={(e) => { const n = numOrNull(e.target.value); onChange(n == null || Number.isNaN(n) ? null : minutes ? Math.round(n * 60) : n); }} />
    </label>
  );
}

function SetRows({ tracking, sets, onChange, unilateral, more }: {
  tracking: Tracking; sets: ExecSet[]; onChange: (s: ExecSet[]) => void; unilateral: boolean; more: boolean;
}) {
  const upd = (i: number, p: Partial<ExecSet>) => onChange(sets.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const addSet = () => {
    const last = sets[sets.length - 1];
    if (unilateral) {
      const n = (last?.n ?? 0) + 1;
      onChange([...sets, { ...(last ?? emptySet(n)), n, side: 'L', done: 'completa', note: null }, { ...(last ?? emptySet(n)), n, side: 'R', done: 'completa', note: null }]);
    } else {
      const n = (last?.n ?? 0) + 1;
      onChange([...sets, { ...(last ?? emptySet(n)), n, side: null, done: 'completa', note: null }]);
    }
  };
  return (
    <div className="sets">
      {sets.map((x, i) => (
        <div key={`${x.n}-${x.side ?? ''}-${i}`} className={`setrow${x.done !== 'completa' ? ` ${x.done}` : ''}`}>
          <span className="sn">{x.n}{x.side ? <small>{x.side === 'L' ? 'Izq' : 'Der'}</small> : null}</span>
          <div className="svs">
            {MAIN[tracking].map(([k, l]) => (
              k === 'load'
                ? (
                  <label key={k} className="sv">
                    <span>{l} <button type="button" className="unit" onClick={() => upd(i, { unit: x.unit === 'kg' ? 'lb' : 'kg' })}>{x.unit}</button></span>
                    <input type="number" inputMode="decimal" min={0} step="any" value={x.load ?? ''} onChange={(e) => upd(i, { load: numOrNull(e.target.value) })} />
                  </label>
                )
                : <NumIn key={k} label={l} value={x[k] as number | null} minutes={tracking === 'aerobica' && k === 'secs'} onChange={(v) => upd(i, { [k]: v } as Partial<ExecSet>)} />
            ))}
            {more && EXTRA[tracking].map(([k, l]) => (
              <NumIn key={k} label={l} value={x[k] as number | null} onChange={(v) => upd(i, { [k]: v } as Partial<ExecSet>)} />
            ))}
            {more && (
              <>
                <label className="sv wide"><span>ROM / posición</span><input value={x.rom ?? ''} maxLength={40} onChange={(e) => upd(i, { rom: e.target.value || null })} /></label>
                {tracking === 'dinamica' && <label className="sv"><span>Tempo</span><input value={x.tempo ?? ''} maxLength={20} placeholder="3-1-1" onChange={(e) => upd(i, { tempo: e.target.value || null })} /></label>}
              </>
            )}
          </div>
          <div className="sacts">
            <select aria-label={`Serie ${x.n}: cómo salió`} value={x.done} onChange={(e) => upd(i, { done: e.target.value as ExecSet['done'] })}>
              <option value="completa">Hecha</option><option value="parcial">Parcial</option><option value="no">No la hizo</option>
            </select>
            <button type="button" className="xbtn" aria-label={`Quitar serie ${x.n}`} onClick={() => onChange(sets.filter((_, k) => k !== i))}>{Icon.x}</button>
          </div>
        </div>
      ))}
      <button type="button" className="btn sm" onClick={addSet}>{Icon.plus} Serie</button>
    </div>
  );
}

interface ItemCtx { it: RoutineItem; rounds: number | null; block: string }

function ExerciseRecord({ ctx, draft, onChange, locked }: {
  ctx: ItemCtx; draft: ExecutionDraft; onChange: (d: ExecutionDraft) => void; locked?: string;
}) {
  const [open, setOpen] = useState(draft.sets.length > 0);
  const [more, setMore] = useState(draft.sets.some((s) => s.rpe != null || s.rir != null || s.pain != null || s.rom));
  const unilateral = draft.sets.some((s) => s.side);
  const set = (p: Partial<ExecutionDraft>) => onChange({ ...draft, ...p });
  const toggleSides = () => {
    if (unilateral) set({ sets: draft.sets.filter((s) => s.side !== 'R').map((s) => ({ ...s, side: null })) });
    else set({ sets: draft.sets.flatMap((s) => [{ ...s, side: 'L' as const }, { ...s, side: 'R' as const }]) });
  };
  const copyRx = () => {
    const base = setsFromDose(ctx.it.dose, ctx.rounds, draft.tracking);
    set({ sets: unilateral ? base.flatMap((s) => [{ ...s, side: 'L' as const }, { ...s, side: 'R' as const }]) : base });
  };
  const n = new Set(draft.sets.map((s) => s.n)).size;
  return (
    <div className={`xrec${open ? ' open' : ''}`}>
      <button type="button" className="xrec-h" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="fw">
          <b>{ctx.it.who ? `${ctx.it.who}: ` : ''}{ctx.it.name}</b>
          <small>Indicado: {ctx.it.dose || '—'}{ctx.rounds ? ` · ${ctx.rounds} vueltas` : ''}</small>
        </span>
        <span className={`pill${n ? ' ok' : ''}`}>{n ? `${n} ${n === 1 ? 'serie' : 'series'}` : 'Sin registrar'}</span>
      </button>
      {open && locked && <p className="hint">{locked}</p>}
      {open && !locked && (
        <div className="xrec-b">
          <div className="xrec-opts">
            <select aria-label="Tipo de registro" value={draft.tracking} onChange={(e) => set({ tracking: e.target.value as Tracking })}>
              {TRACKINGS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <select aria-label="Equipamiento" value={draft.load_config ?? ''} onChange={(e) => set({ load_config: (e.target.value || null) as LoadConfig | null })}>
              <option value="">Equipamiento…</option>
              {LOAD_CONFIGS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <input aria-label="Variante" placeholder="Variante (opcional)" value={draft.variant ?? ''} maxLength={80} onChange={(e) => set({ variant: e.target.value || null })} />
          </div>
          {draft.tracking === 'control_motor' && (
            <input className="full" aria-label="Asistencia" placeholder="Asistencia (ej.: con apoyo de una mano)" value={draft.assistance ?? ''} maxLength={80}
              onChange={(e) => set({ assistance: e.target.value || null })} />
          )}
          <div className="xrec-tools">
            {!draft.sets.length && <button type="button" className="btn sm" onClick={copyRx}>{Icon.copyPrev} Igual que lo indicado</button>}
            <label className="chk-inline"><input type="checkbox" checked={unilateral} onChange={toggleSides} /> Cada lado por separado</label>
            <label className="chk-inline"><input type="checkbox" checked={more} onChange={() => setMore(!more)} /> Esfuerzo, dolor y más</label>
          </div>
          <SetRows tracking={draft.tracking} sets={draft.sets} unilateral={unilateral} more={more} onChange={(sets) => set({ sets })} />
          <textarea rows={2} className="full" placeholder={draft.tracking === 'control_motor' ? 'Tarea, criterios de ejecución, observaciones' : 'Observaciones (opcional)'}
            value={draft.notes ?? ''} maxLength={500} onChange={(e) => set({ notes: e.target.value || null })} />
        </div>
      )}
    </div>
  );
}

// ── respuesta a la sesión ──

function Scale({ value, onChange, label, low, high }: { value: number | null; onChange: (v: number | null) => void; label: string; low: string; high: string }) {
  return (
    <div className="field full">
      <span className="lab">{label}</span>
      <div className="scale" role="radiogroup" aria-label={label}>
        {Array.from({ length: 11 }, (_, n) => (
          <button key={n} type="button" role="radio" aria-checked={value === n} onClick={() => onChange(value === n ? null : n)}>{n}</button>
        ))}
      </div>
      <div className="scale-ends"><span>0 · {low}</span><span>10 · {high}</span></div>
    </div>
  );
}

export function ResponseFields({ value, onChange, you }: { value: ResponseDraft; onChange: (r: ResponseDraft) => void; you: boolean }) {
  const [more, setMore] = useState(value.fatigue != null || value.soreness != null || value.pain != null || value.recovery != null || Boolean(value.pain_area));
  const set = (p: Partial<ResponseDraft>) => onChange({ ...value, ...p });
  return (
    <div className="fields" style={{ marginTop: 0 }}>
      <div className="field full">
        <span className="lab">{you ? '¿Qué tan intensa fue la sesión en general?' : 'Esfuerzo de la sesión (sRPE)'}</span>
        <div className="srpe" role="radiogroup" aria-label="Esfuerzo de la sesión, de 0 a 10">
          {SRPE_LABEL.map((l, n) => (
            <button key={n} type="button" role="radio" aria-checked={value.srpe === n} onClick={() => set({ srpe: value.srpe === n ? null : n })}>
              <b>{n}</b>{l && <small>{l}</small>}
            </button>
          ))}
        </div>
        <small>Pensando en toda la sesión, no en el último ejercicio. Escala 0–10 (CR-10).</small>
      </div>
      <div className="field">
        <label htmlFor="r-min">Duración (minutos)</label>
        <input id="r-min" type="number" inputMode="numeric" min={1} max={600} value={value.duration_min ?? ''}
          onChange={(e) => set({ duration_min: e.target.value === '' ? null : Math.max(1, Math.round(Number(e.target.value))) })} />
      </div>
      <div className="field">
        <label htmlFor="r-st">¿Cómo quedó?</label>
        <select id="r-st" value={value.status ?? ''} onChange={(e) => set({ status: (e.target.value || null) as ResponseDraft['status'] })}>
          <option value="">Sin indicar</option><option value="completa">Completa</option><option value="parcial">Parcial</option><option value="modificada">Modificada</option>
        </select>
      </div>
      <div className="field full">
        <label className="chk-inline"><input type="checkbox" checked={more} onChange={() => setMore(!more)} /> Fatiga, dolor y recuperación</label>
      </div>
      {more && (
        <>
          <Scale label="Dolor o molestia" value={value.pain} onChange={(v) => set({ pain: v })} low="sin dolor" high="el peor imaginable" />
          <div className="field full">
            <label htmlFor="r-pa">¿Dónde?</label>
            <input id="r-pa" value={value.pain_area ?? ''} maxLength={120} placeholder="Ej.: rodilla derecha al bajar" onChange={(e) => set({ pain_area: e.target.value || null })} />
          </div>
          <Scale label="Fatiga" value={value.fatigue} onChange={(v) => set({ fatigue: v })} low="nada" high="máxima" />
          <Scale label="Dolor muscular" value={value.soreness} onChange={(v) => set({ soreness: v })} low="nada" high="máximo" />
          <Scale label="Recuperación antes de la sesión" value={value.recovery} onChange={(v) => set({ recovery: v })} low="nada recuperado" high="totalmente recuperado" />
        </>
      )}
      <div className="field full">
        <label htmlFor="r-note">Nota</label>
        <textarea id="r-note" rows={2} value={value.note ?? ''} maxLength={500} onChange={(e) => set({ note: e.target.value || null })} />
      </div>
    </div>
  );
}

// ── hoja completa: lo realizado en una sesión ──

const toDraft = (e: Execution): ExecutionDraft => ({
  item_id: e.item_id, tracking: e.tracking, variant: e.variant, load_config: e.load_config, assistance: e.assistance,
  body_mass_kg: e.body_mass_kg, sets: e.sets, notes: e.notes,
});

export function RecordSheet({ session, studentId, studentName, mode, onClose, onSaved, toast, only }: {
  session: Session; studentId: string; studentName: string; mode: 'coach' | 'client';
  onClose: () => void; onSaved?: () => void; toast: (m: string) => void;
  /** Sólo un ejercicio (desde la rutina del alumno). */
  only?: string;
}) {
  const [data, setData] = useState<RecordData | null>(null);
  const [drafts, setDrafts] = useState<Record<string, ExecutionDraft>>({});
  const [resp, setResp] = useState<ResponseDraft>(emptyResponse());
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const items = useMemo<ItemCtx[]>(() => {
    const own = new Set(checkableItems(session.routine, firstName(studentName)).map((i) => i.id));
    return session.routine.blocks.flatMap((b) => (b.kind === 'notes' ? [] : b.groups.flatMap((g) => g.items
      .filter((it) => own.has(it.id) && (!only || it.id === only))
      .map((it) => ({ it, rounds: b.rounds, block: b.title })))));
  }, [session.routine, studentName, only]);

  useEffect(() => {
    const load = mode === 'coach' ? coachApi.record(session.id, studentId) : studentApi.record(session.id);
    load.then((r) => {
      setData(r);
      const by = new Map(r.executions.map((e) => [e.item_id, e]));
      setDrafts(Object.fromEntries(items.map(({ it }) => [it.id, by.get(it.id) ? toDraft(by.get(it.id)!) : {
        item_id: it.id, tracking: inferTracking(it), variant: null, load_config: null, assistance: null, body_mass_kg: null, sets: [], notes: null,
      }])));
      if (r.response) {
        const { srpe, duration_min, status, fatigue, soreness, pain, pain_area, recovery, note } = r.response;
        setResp({ srpe, duration_min, status, fatigue, soreness, pain, pain_area, recovery, note });
      }
    }).catch((e: Error) => setErr(e.message));
  }, [session.id, studentId, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const existing = new Map((data?.executions ?? []).map((e) => [e.item_id, e]));
  const editingOld = (data?.executions.length ?? 0) > 0 || Boolean(data?.response);
  const save = async () => {
    setBusy(true); setErr('');
    try {
      const executions = Object.values(drafts).filter((d) => d.sets.length || d.notes || existing.has(d.item_id))
        .filter((d) => !(mode === 'client' && existing.get(d.item_id)?.source === 'coach'));
      const body = { executions, response: only ? undefined : resp, reason: reason.trim() || null };
      const r = mode === 'coach' ? await coachApi.saveRecord(session.id, studentId, body) : await studentApi.saveRecord(session.id, body);
      toast(r.skipped?.length ? 'Guardado. Lo que registró tu profe no se cambió.' : 'Registro guardado');
      onSaved?.();
      onClose();
    } catch (e) { setErr((e as ApiError).message); } finally { setBusy(false); }
  };

  return (
    <Sheet title={only ? 'Anotar lo que hiciste' : mode === 'coach' ? `Lo realizado · ${firstName(studentName)}` : 'Lo que hiciste'} onClose={onClose}>
      <p className="hint" style={{ margin: 0 }}>
        {shortDate(session.date)}{session.title ? ` · ${session.title}` : ''}. {mode === 'coach'
          ? 'No hace falta completar esto: la carga ya se toma de la planificación. Usalo sólo si algo salió distinto; lo que anotes acá reemplaza a lo planificado en ese ejercicio.'
          : 'Anotá lo que hiciste de verdad: lo que no se completa queda vacío, no en cero.'}
      </p>
      {!data && !err ? <Skeleton /> : (
        <>
          <div className="xrecs">
            {items.map((c) => drafts[c.it.id] && (
              <ExerciseRecord key={c.it.id} ctx={c} draft={drafts[c.it.id]!}
                locked={mode === 'client' && existing.get(c.it.id)?.source === 'coach' ? 'Lo registró tu profe.' : undefined}
                onChange={(d) => setDrafts((p) => ({ ...p, [c.it.id]: d }))} />
            ))}
            {!items.length && <p className="hint">Esta sesión no tiene ejercicios para registrar.</p>}
          </div>
          {!only && (
            <section className="card" style={{ marginTop: 12 }}>
              <h2>{mode === 'coach' ? 'Respuesta a la sesión' : 'Cómo te fue'}</h2>
              <ResponseFields value={resp} onChange={setResp} you={mode === 'client'} />
            </section>
          )}
          {editingOld && (
            <div className="field" style={{ marginTop: 10 }}>
              <label htmlFor="rec-why">Si estás corrigiendo algo, ¿por qué? (opcional)</label>
              <input id="rec-why" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="Ej.: eran 10 repeticiones, no 8" />
              <small>La versión anterior queda guardada en el registro de cambios.</small>
            </div>
          )}
          {data?.changes && data.changes.length > 0 && (
            <details className="chlog">
              <summary>Historial de este registro ({data.changes.length})</summary>
              {[...data.changes].reverse().map((c) => (
                <div key={c.id} className="hint" style={{ margin: '4px 0' }}>
                  {timeAgo(c.at)} · {c.action === 'create' ? 'Creado' : c.action === 'update' ? 'Corregido' : 'Borrado'}
                  {' '}por {c.actor === 'coach' ? 'el profe' : 'el alumno'}{c.reason ? ` · “${c.reason}”` : ''}
                </div>
              ))}
            </details>
          )}
          {err && <p className="err">{err}</p>}
          <button className="btn primary wide" style={{ marginTop: 12 }} disabled={busy || !data} onClick={save}>{busy ? 'Guardando…' : 'Guardar'}</button>
        </>
      )}
    </Sheet>
  );
}
