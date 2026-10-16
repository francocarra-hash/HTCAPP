import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  CAP_LABEL, capacityMix, checkableItems, Completion, firstName, fold, groupLabels, itemText, KIND_LABEL, longDate,
  Routine, RoutineBlock, RoutineItem, routineSummary, Session, studentApi, timeAgo, cap,
} from './data';
import { Celebration } from './Celebration';
import { Icon } from './ui';

/** viewer = nombre de pila del alumno que mira (undefined = vista del coach). */
type Viewer = string | undefined;

const isMine = (who: string | undefined, viewer: Viewer) => Boolean(who && viewer && fold(who) === fold(viewer));

function blockCaps(b: RoutineBlock): string {
  const ids = capacityMix({ blocks: [b] }).map((c) => CAP_LABEL[c.id]);
  return ids.join(' · ');
}

function CapDots({ routine }: { routine: Routine }) {
  return (
    <span className="cap-dots" aria-hidden="true">
      {capacityMix(routine).map((c) => <i key={c.id} style={{ ['--c' as string]: `var(--cap-${c.id})` }} />)}
    </span>
  );
}

/** Ítem de sólo lectura (+ notas de los alumnos en la vista del coach). */
function ReadItem({ item, viewer, replaced, notes }: {
  item: RoutineItem; viewer: Viewer; replaced: boolean; notes?: Array<{ who: string; note: string; checked: boolean }>;
}) {
  if (item.who) {
    const mine = isMine(item.who, viewer);
    if (viewer && !mine) return null; // la variante de un compañero no le sirve al alumno
    return (
      <div className={`itm${mine ? ' mine' : ''}`}>
        <span className={`who${mine || !viewer ? '' : ' other'}`}>{mine ? 'Para vos' : item.who}</span>
        <b>{item.name}</b>
        {item.dose && <span className="rx">{item.dose}</span>}
      </div>
    );
  }
  return (
    <>
      <div className={`itm${replaced ? ' dim' : ''}`}>
        <b>{item.name}</b>
        {item.dose && <span className="rx">{item.dose}</span>}
      </div>
      {notes?.filter((n) => n.note).map((n, i) => (
        <div key={i} className="note-show"><b>{n.who}:</b> {n.note}</div>
      ))}
    </>
  );
}

function blockBody(b: RoutineBlock, labels: Map<string, string>, render: (items: RoutineItem[]) => ReactNode): ReactNode {
  if (b.kind === 'list') {
    return <ol className="mob">{b.groups.flatMap((g) => g.items).map((it) => <li key={it.id}>{itemText(it)}</li>)}</ol>;
  }
  if (b.kind === 'notes') {
    return <div className="chips-row">{b.groups.flatMap((g) => g.items).map((it) => <span className="mini" key={it.id}>{itemText(it)}</span>)}</div>;
  }
  const multi = b.groups.some((g) => g.items.filter((x) => !x.who).length > 1);
  return (
    <>
      {multi && (
        <div className="ss-note">
          {b.kind === 'circuit' ? 'En cada estación alternás los ejercicios del par.' : 'Superseries: hacés los ejercicios de cada línea seguidos.'}
        </div>
      )}
      {b.groups.map((g) => (
        <div className="station" key={g.id}>
          <i className="sn">{labels.get(g.id)}</i>
          <div className="sitems">{render(g.items)}</div>
        </div>
      ))}
    </>
  );
}

const blockSum = (b: RoutineBlock): string => {
  const n = b.groups.length;
  const caps = blockCaps(b);
  if (b.kind === 'list') return `${b.groups.flatMap((g) => g.items).length} ejercicios${caps ? ` · ${caps}` : ''}`;
  if (b.kind === 'notes') return b.groups.flatMap((g) => g.items).map(itemText).join(' · ');
  const unit = b.kind === 'circuit' ? (n === 1 ? 'estación' : 'estaciones') : n === 1 ? 'línea' : 'líneas';
  return `${n} ${unit}${b.rounds ? ` · ${b.rounds} vueltas` : ''}${caps ? ` · ${caps}` : ''}`;
};

/** Rutina como tarjetas numeradas que se expanden de a una (vista del coach y sesiones pasadas). */
export function RoutineBlocks({ routine, viewer, completions, names, defaultOpen = 0 }: {
  routine: Routine; viewer: Viewer; completions?: Completion[]; names?: Map<string, string>; defaultOpen?: number | null;
}) {
  const [open, setOpen] = useState<number | null>(defaultOpen);
  const labels = useMemo(() => groupLabels(routine), [routine]);
  if (!routine.blocks.length) {
    return <div className="card"><p className="note-txt" style={{ margin: 0 }}>{routine.note || 'Sesión sin ejercicios cargados.'}</p></div>;
  }
  const notesFor = (id: string) =>
    (completions ?? []).map((c) => ({
      who: firstName(names?.get(c.student_id) ?? ''), note: c.notes[id] ?? '', checked: c.checks.includes(id),
    }));
  return (
    <ol className="exlist">
      {routine.blocks.map((b, i) => {
        const isOpen = open === i;
        return (
          <li key={b.id} className={`ex${isOpen ? ' open' : ''}`}>
            <button className="ex-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : i)}>
              <span className="num">{i + 1}</span>
              <span className="ex-title">
                <span className="ex-name">{b.title || KIND_LABEL[b.kind]}</span>
                <span className="ex-sum">{blockSum(b)}</span>
              </span>
              <span className="ex-st">{b.rounds && <span className="tag">×{b.rounds}</span>}{Icon.chev}</span>
            </button>
            <div className="ex-wrap" {...(isOpen ? {} : { inert: '' })}>
              <div className="ex-body">
                <div className="ex-inner">
                  {blockBody(b, labels, (items) => items.map((it, k) => (
                    <ReadItem key={it.id} item={it} viewer={viewer} notes={completions ? notesFor(it.id) : undefined}
                      replaced={Boolean(viewer && isMine(items[k + 1]?.who, viewer))} />
                  )))}
                </div>
              </div>
            </div>
          </li>
        );
      })}
      {routine.note && <li className="card" style={{ marginTop: 0 }}><p className="note-txt" style={{ margin: 0 }}>{routine.note}</p></li>}
    </ol>
  );
}

// ── rutina interactiva del alumno ───────────────────────────────────────────

export function RoutinePlayer({ session, studentId, studentName, onProgress, onDone }: {
  session: Session; studentId: string; studentName: string;
  onProgress: (done: number, total: number) => void;
  onDone: () => void;
}) {
  const viewer = firstName(studentName);
  const routine = session.routine;
  const own = session.completions.find((c) => c.student_id === studentId);
  const [checks, setChecks] = useState<Set<string>>(new Set(own?.checks ?? []));
  const [notes, setNotes] = useState<Record<string, string>>(own?.notes ?? {});
  const [noteOpen, setNoteOpen] = useState<string | null>(null);
  const [completedAt, setCompletedAt] = useState<string | null>(own?.completed_at ?? null);
  const [celebrate, setCelebrate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const items = useMemo(() => checkableItems(routine, viewer), [routine, viewer]);
  const labels = useMemo(() => groupLabels(routine), [routine]);
  const total = items.length;
  const done = items.filter((i) => checks.has(i.id)).length;
  const dirty = useRef(false);

  useEffect(() => onProgress(done, total), [done, total, onProgress]);

  // Guardado automático de checks y notas mientras hace la rutina.
  useEffect(() => {
    if (!dirty.current || completedAt) return;
    setSaveState('saving');
    const t = window.setTimeout(() => {
      studentApi.progress(session.id, { checks: [...checks], notes })
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('error'));
    }, 700);
    return () => window.clearTimeout(t);
  }, [checks, notes, session.id, completedAt]);

  const toggle = (id: string) => {
    if (completedAt) return;
    dirty.current = true;
    setChecks((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id); else n.add(id);
      if (!p.has(id) && 'vibrate' in navigator) navigator.vibrate?.(12);
      return n;
    });
  };
  const setNote = (id: string, v: string) => { dirty.current = true; setNotes((p) => ({ ...p, [id]: v })); };

  const finish = async () => {
    if (done < total && !window.confirm(`Te faltan ${total - done} ${total - done === 1 ? 'ejercicio' : 'ejercicios'}. ¿Terminar igual?`)) return;
    setBusy(true);
    try {
      const r = await studentApi.complete(session.id, { checks: [...checks], notes });
      setCompletedAt(r.completion.completed_at);
      setCelebrate(true);
    } catch (e) {
      window.alert(`No se pudo guardar: ${(e as Error).message}`);
    } finally { setBusy(false); }
  };

  const row = (it: RoutineItem, replaced: boolean) => {
    if (it.who && !isMine(it.who, viewer)) return null;
    if (replaced) {
      return (
        <div className="itm dim" key={it.id}><b>{it.name}</b>{it.dose && <span className="rx">{it.dose}</span>}</div>
      );
    }
    const on = checks.has(it.id);
    const note = notes[it.id] ?? '';
    return (
      <div className={`chk${on ? ' on' : ''}`} key={it.id}>
        <div className="nm">
          {it.who && <span className="for">Para vos</span>}
          <b>{it.name}</b>
          {it.dose && <span className="rx">{it.dose}</span>}
        </div>
        <button className={`nb${note ? ' has' : ''}`} aria-label={note ? 'Editar nota' : 'Agregar nota'}
          onClick={() => setNoteOpen(noteOpen === it.id ? null : it.id)}>{Icon.note}</button>
        <button className="ck" aria-pressed={on} aria-label={on ? `Desmarcar ${it.name}` : `Marcar ${it.name} como hecho`}
          disabled={Boolean(completedAt)} onClick={() => toggle(it.id)}>
          {on && Icon.check}
        </button>
        {noteOpen === it.id ? (
          <textarea className="note-in" autoFocus rows={2} value={note} placeholder="¿Cambiaste algo? Ej.: hice 10 en vez de 12, me molestó la rodilla…"
            onChange={(e) => setNote(it.id, e.target.value)} onBlur={() => setNoteOpen(null)} />
        ) : note ? <div className="note-show">{note}</div> : null}
      </div>
    );
  };

  return (
    <>
      {completedAt && (
        <div className="done-banner">{Icon.check} Sesión terminada {timeAgo(completedAt)}. ¡Bien ahí!</div>
      )}
      {routine.blocks.map((b, bi) => (
        <section className="card" key={b.id} style={{ paddingTop: 12 }}>
          <div className="card-h">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <span className="num" style={{ width: 32, height: 32, fontSize: 17, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: '50%', background: 'var(--chip)', fontFamily: 'var(--f-display)', fontWeight: 700, color: 'var(--muted)' }}>{bi + 1}</span>
              <div style={{ minWidth: 0 }}>
                <h3 style={{ textTransform: 'uppercase', fontSize: 20 }}>{b.title || KIND_LABEL[b.kind]}</h3>
                <div className="hint" style={{ marginTop: 0, fontSize: 12 }}>{blockCaps(b) || KIND_LABEL[b.kind]}</div>
              </div>
            </div>
            {b.rounds && <span className="tag" style={{ fontSize: 12, padding: '2px 8px' }}>{b.rounds} vueltas</span>}
          </div>
          <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
            {b.kind === 'notes'
              ? <div className="chips-row">{b.groups.flatMap((g) => g.items).map((it) => <span className="mini" key={it.id}>{itemText(it)}</span>)}</div>
              : b.groups.map((g) => (
                <div className="station" key={g.id}>
                  {b.kind === 'list' ? <span /> : <i className="sn">{labels.get(g.id)}</i>}
                  <div className="sitems" style={{ gap: 0 }}>
                    {g.items.map((it, k) => row(it, !it.who && isMine(g.items[k + 1]?.who, viewer)))}
                  </div>
                </div>
              ))}
          </div>
        </section>
      ))}
      {routine.note && <div className="card"><p className="note-txt" style={{ margin: 0 }}>{routine.note}</p></div>}
      {!completedAt && (
        <div className="finish">
          <button className="btn primary wide" disabled={busy || done === 0} onClick={finish}>
            {busy ? 'Guardando…' : done === total ? <>{Icon.check} Terminar sesión</> : `Terminar sesión · ${done} de ${total}`}
          </button>
          <p className="hint" style={{ textAlign: 'center', fontSize: 12 }}>
            {saveState === 'saving' ? 'Guardando…' : saveState === 'saved' ? 'Guardado ✓' : saveState === 'error' ? 'Sin conexión: se guarda al terminar' : 'Tocá el cuadrado de cada ejercicio al hacerlo.'}
          </p>
        </div>
      )}
      {celebrate && (
        <Celebration
          routine={routine} seed={session.id} done={done} total={total} studentName={studentName}
          onClose={async (feeling, comment) => {
            setCelebrate(false);
            if (feeling || comment) await studentApi.complete(session.id, { feeling, comment }).catch(() => undefined);
            onDone();
          }}
        />
      )}
    </>
  );
}

// ── historial ───────────────────────────────────────────────────────────────

const visible = (items: RoutineItem[], viewer: Viewer) => items.filter((it) => !it.who || !viewer || isMine(it.who, viewer));
const label = (it: RoutineItem, viewer: Viewer) => (it.who ? (viewer ? `(vos: ${itemText(it)})` : `(${it.who}: ${itemText(it)})`) : itemText(it));

export function RoutineCompact({ routine, viewer }: { routine: Routine; viewer: Viewer }) {
  if (!routine.blocks.length) return <p className="note-txt" style={{ margin: 0 }}>{routine.note || 'Sin ejercicios.'}</p>;
  const labels = groupLabels(routine);
  return (
    <>
      {routine.blocks.map((b) => (
        <div className="line" key={b.id}>
          <b>{b.title || KIND_LABEL[b.kind]}{b.rounds ? ` ×${b.rounds}` : ''}</b>
          <span>
            {b.kind === 'list' || b.kind === 'notes'
              ? b.groups.flatMap((g) => g.items).map(itemText).join(' · ')
              : b.groups.map((g) => `${b.kind === 'superset' ? `${labels.get(g.id)} ` : ''}${visible(g.items, viewer).map((it) => label(it, viewer)).join(b.kind === 'circuit' ? ' / ' : ' + ')}`).join('  ·  ')}
          </span>
        </div>
      ))}
      {routine.note && <div className="line"><b>Nota</b><span>{routine.note}</span></div>}
    </>
  );
}

export function HistoryList({ sessions, viewer, studentId, names, onEdit, onDelete }: {
  sessions: Session[];
  viewer: Viewer;
  /** Alumno dueño del perfil (para mostrar si terminó cada sesión). */
  studentId?: string;
  /** id → nombre, para mostrar con quién entrenó (vista del coach). */
  names?: Map<string, string>;
  onEdit?: (s: Session) => void;
  onDelete?: (s: Session) => void;
}) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  if (!sessions.length) return <p className="empty">Todavía no hay sesiones.</p>;
  const list = [...sessions].reverse();
  return (
    <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
      {list.map((s) => {
        const who = names ? s.participant_ids.map((id) => firstName(names.get(id) ?? '—')).join(' y ') : null;
        const mine = studentId ? s.completions.find((c) => c.student_id === studentId) : undefined;
        const status = s.status === 'planned'
          ? mine?.completed_at ? <span className="pill done">Hecha ✓</span> : <span className="pill accent">Asignada</span>
          : null;
        return (
          <details className="sess" key={s.id} open={openIds.has(s.id)}
            onToggle={(e) => {
              const isOpen = (e.currentTarget as HTMLDetailsElement).open;
              setOpenIds((prev) => {
                const n = new Set(prev);
                if (isOpen) n.add(s.id); else n.delete(s.id);
                return n;
              });
            }}>
            <summary>
              <span className="st">{s.title ?? cap(longDate(s.date))}</span>
              <span className="sd" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><CapDots routine={s.routine} />{status}</span>
              <span className="sm">
                {s.title ? `${cap(longDate(s.date))} · ` : ''}{routineSummary(s.routine)}
                {who ? ` · ${who}` : ''}
                {names && s.completions.some((c) => Object.values(c.notes).some((v) => v.trim())) ? ' · 💬 notas' : ''}
                {names && s.date_note ? <><br /><span className="flag">⚠ {s.date_note}</span></> : null}
              </span>
            </summary>
            {openIds.has(s.id) && (
              <div className="sbody">
                <RoutineCompact routine={s.routine} viewer={viewer} />
                {names && s.completions.filter((c) => c.completed_at || Object.keys(c.notes).length).map((c) => (
                  <div className="line" key={c.student_id}>
                    <b>{firstName(names.get(c.student_id) ?? '—')} {c.completed_at ? `terminó ${timeAgo(c.completed_at)}` : 'está haciéndola'}</b>
                    <span>{c.checks.length} ejercicios tildados{c.feeling ? ` · se sintió ${c.feeling}/5` : ''}{c.comment ? ` · “${c.comment}”` : ''}</span>
                  </div>
                ))}
                {(onEdit || onDelete) && (
                  <div className="actions" style={{ marginTop: 0 }}>
                    {onEdit && <button className="btn" onClick={() => onEdit(s)}>{Icon.edit} Editar</button>}
                    {onDelete && <button className="btn danger" onClick={() => onDelete(s)}>{Icon.trash} Borrar</button>}
                  </div>
                )}
              </div>
            )}
          </details>
        );
      })}
    </div>
  );
}
