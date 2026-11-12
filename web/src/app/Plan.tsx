import { ReactNode, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api';
import {
  cloneRoutine, keepIds, routineToText, coachApi, ExerciseEntry, longDate, PreviewSession, Profile, relDays, Routine, Session, shortDate,
  StudentListItem, todayIso, cap, firstName, CHANGE_CATEGORIES, ChangeCategory,
} from './data';
import { StudentPicker } from './StudentPicker';
import { Avatar } from './social';
import { RoutineCompact } from './RoutineView';
import { cleanRoutine, newBlock, RoutineBuilder, routineCount } from './RoutineBuilder';
import { DateInput, Icon, Seg, Sheet, TopHeader } from './ui';

type Start = 'prev' | 'blank' | 'paste';

export function PlanSession({ students, initialIds, editing, avatar, library, onSaved, onCancel, onExit, onWriting, toast }: {
  students: StudentListItem[];
  initialIds: string[];
  editing: Session | null;
  avatar: ReactNode;
  library: ExerciseEntry[];
  onSaved: (studentIds: string[], msg: string) => void;
  onCancel?: () => void;
  /** Salir de planificar (sin pestañas abajo mientras se escribe la rutina). */
  onExit?: () => void;
  /** Avisa cuando hay una rutina abierta: la app esconde la barra de abajo para dar lugar. */
  onWriting?: (on: boolean) => void;
  toast: (m: string) => void;
}) {
  const [ids, setIds] = useState<string[]>(editing?.participant_ids ?? initialIds);
  // Últimos alumnos abiertos en Planificar (se guardan en el servidor: valen en cualquier dispositivo).
  const [recents, setRecents] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [why, setWhy] = useState<ChangeCategory | null>(null);
  const [whyText, setWhyText] = useState('');
  const remember = (id: string) => { coachApi.pushPlanRecent(id).then((r) => setRecents(r.ids)).catch(() => undefined); };
  useEffect(() => {
    coachApi.planRecent().then((r) => setRecents(r.ids)).catch(() => undefined);
    if (!editing && initialIds[0]) remember(initialIds[0]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const choose = (id: string) => { setIds([id]); setAdding(false); remember(id); };
  const firstStudent = students.find((s) => s.id === ids[0]);
  const [date, setDate] = useState(editing?.date ?? todayIso());
  const [status, setStatus] = useState<'planned' | 'done'>(editing?.status ?? 'planned');
  const [title, setTitle] = useState(editing?.title ?? '');
  const [routine, setRoutine] = useState<Routine | null>(editing ? cloneKeepIds(editing.routine) : null);
  const [start, setStart] = useState<Start | null>(editing ? 'prev' : null);
  const [ref, setRef] = useState<Profile | null>(null);
  const writing = routine != null;
  useEffect(() => { onWriting?.(writing); }, [writing, onWriting]);
  useEffect(() => () => onWriting?.(false), [onWriting]);
  const leave = onCancel ?? onExit;
  const back = leave && writing
    ? () => { if (window.confirm('¿Salir sin guardar esta rutina?')) leave(); }
    : leave;
  const [refIdx, setRefIdx] = useState(0);
  const [refOpen, setRefOpen] = useState(true);
  const [pasting, setPasting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // Editar todo como texto (sin bloques), con el formato de siempre.
  const [mode, setMode] = useState<'bloques' | 'texto'>('bloques');
  const [text, setText] = useState('');
  const [textDirty, setTextDirty] = useState(false);
  const toText = () => { if (routine) { setText(routineToText(routine)); setTextDirty(false); setMode('texto'); } };
  /** Lee el texto y devuelve la rutina (o null si no se pudo). */
  const readText = async (): Promise<Routine | null> => {
    if (!routine) return null;
    if (!textDirty) return routine;
    if (!text.trim()) { setErr('El texto está vacío.'); return null; }
    try {
      const r = await coachApi.preview(text, ids, date);
      const first = r.sessions[0];
      if (!first || r.sessions.length > 1) { setErr('Escribí una sola sesión (sin fechas en el medio).'); return null; }
      const next = editing ? keepIds(routine, first.routine) : cloneRoutine(first.routine);
      setRoutine(next);
      setTextDirty(false);
      return next;
    } catch (e) { setErr((e as ApiError).message); return null; }
  };
  const toBlocks = async () => {
    setBusy(true); setErr('');
    const r = await readText();
    setBusy(false);
    if (r) setMode('bloques');
  };

  // La sesión anterior del primer alumno elegido, como referencia.
  useEffect(() => {
    setRef(null);
    setRefIdx(0);
    if (!ids[0]) return;
    let live = true;
    coachApi.student(ids[0]).then((p) => { if (live) setRef(p); }).catch(() => undefined);
    return () => { live = false; };
  }, [ids[0]]); // eslint-disable-line react-hooks/exhaustive-deps

  const refSessions = useMemo(
    () => (ref?.sessions ?? []).filter((s) => s.id !== editing?.id).slice(-4).reverse(),
    [ref, editing?.id],
  );
  const refSession = refSessions[refIdx];
  const participants = students.filter((s) => ids.includes(s.id)).map((s) => ({ id: s.id, name: s.name }));

  const pick = (k: Start) => {
    if (routine && routineCount(routine) > 0 && !window.confirm('Se reemplaza lo que armaste hasta ahora. ¿Seguir?')) return;
    if (k === 'prev') {
      if (!refSession) { toast('Todavía no hay una sesión anterior: arrancá en blanco.'); return; }
      setRoutine(cloneRoutine(refSession.routine));
    } else if (k === 'blank') {
      setRoutine({ blocks: [newBlock('list'), newBlock('circuit'), newBlock('superset')] });
    } else {
      setPasting(true);
      return;
    }
    setStart(k);
  };

  const toggle = (id: string) => setIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const count = routine ? routineCount(routine) : 0;

  const save = async () => {
    if (!routine) return;
    setBusy(true); setErr('');
    try {
      const base = mode === 'texto' ? await readText() : routine;
      if (!base) return;
      const clean = cleanRoutine(base);
      if (editing) {
        await coachApi.updateSession(editing.id, {
          date, title: title.trim() || null, status, participant_ids: ids, routine: clean,
          change_category: why, change_reason: whyText.trim() || null,
        });
        onSaved(ids, 'Sesión actualizada');
      } else {
        await coachApi.createRoutine({ date, title: title.trim() || null, status, participant_ids: ids, routine: clean });
        onSaved(ids, status === 'planned' ? `Rutina asignada para el ${shortDate(date)}` : 'Sesión registrada');
      }
    } catch (e) { setErr((e as ApiError).message); } finally { setBusy(false); }
  };

  const reference = (
    <section className="card plan-ref" style={{ marginTop: 0 }}>
      <div className="card-h">
        <div>
          <div className="label">Referencia</div>
          <h3 style={{ textTransform: 'uppercase' }}>{refSession ? `Sesión ${refSession.status === 'planned' ? 'asignada' : 'anterior'}` : 'Sin sesiones previas'}</h3>
        </div>
        <button className="btn ghost sm" onClick={() => setRefOpen(!refOpen)} aria-expanded={refOpen}>{refOpen ? 'Ocultar' : 'Ver'}</button>
      </div>
      {refOpen && refSession && (
        <>
          {refSessions.length > 1 && (
            <Seg small value={String(refIdx)} onChange={(v) => setRefIdx(Number(v))}
              options={refSessions.map((s, i): [string, string] => [String(i), shortDate(s.date)])} />
          )}
          <p className="hint">{cap(longDate(refSession.date))} · {relDays(refSession.date)}{firstStudent ? ` · ${firstName(firstStudent.name)}` : ''}</p>
          <div style={{ display: 'grid', gap: 8, marginTop: 8 }}><RoutineCompact routine={refSession.routine} viewer={undefined} /></div>
          {refSession.completions.some((c) => Object.values(c.notes).some((v) => v.trim()) || c.comment) && (
            <div style={{ marginTop: 10 }}>
              <div className="label">Lo que anotaron</div>
              {refSession.completions.flatMap((c) => [
                ...(c.comment ? [`“${c.comment}”`] : []),
                ...Object.values(c.notes).filter((v) => v.trim()),
              ]).map((t, i) => <p key={i} className="note-show" style={{ marginTop: 6 }}>{t}</p>)}
            </div>
          )}
          <div className="actions">
            <button className="btn sm" onClick={() => {
              if (routine && routineCount(routine) > 0 && !window.confirm('Se reemplaza lo que armaste hasta ahora. ¿Seguir?')) return;
              setRoutine(cloneRoutine(refSession.routine));
              setStart('prev');
            }}>{Icon.copyPrev} Usar como base</button>
          </div>
        </>
      )}
      {refOpen && !refSession && ids.length > 0 && <p className="hint">Cuando tenga sesiones, la última aparece acá para que la tengas a mano.</p>}
    </section>
  );

  return (
    <>
      <TopHeader title={editing ? 'Editar sesión' : 'Planificar'} onBack={writing ? back : onCancel} right={avatar}
        sub={<span>{editing ? cap(longDate(editing.date)) : 'Armá la próxima sesión por bloques'}</span>} />

      <section className="card" style={{ marginTop: 4 }}>
        {!ids.length ? (
          <>
            <h2>¿Con quién trabajás?</h2>
            {students.length
              ? <div style={{ marginTop: 10 }}><StudentPicker students={students} recents={recents} onPick={choose} /></div>
              : <p className="hint">Primero creá un alumno en la pestaña Alumnos.</p>}
          </>
        ) : (
        <>
        <div className="who-sel">
          {participants.map((p) => (
            <span key={p.id} className="who-chip">
              <Avatar id={p.id} name={p.name} size={30} />
              <b>{p.name}</b>
              {ids.length > 1 && <button className="xbtn" aria-label={`Quitar a ${p.name}`} onClick={() => toggle(p.id)}>{Icon.x}</button>}
            </span>
          ))}
          <button className="linkbtn" onClick={() => { setIds([]); setAdding(false); }}>Cambiar</button>
        </div>
        {adding
          ? <div style={{ marginTop: 8 }}><StudentPicker students={students} exclude={ids} label="Sumar un alumno a la sesión" autoFocus
              onPick={(id) => { setIds((p) => [...p, id]); setAdding(false); }} /></div>
          : <button className="btn sm ghost" style={{ marginTop: 6, paddingLeft: 0 }} onClick={() => setAdding(true)}>{Icon.plus} Entrena con alguien más</button>}
        <div className="fields">
          <div className="field">
            <label htmlFor="pl-date">Fecha</label>
            <DateInput id="pl-date" value={date} onChange={(e) => setDate(e.target.value)} />
            {firstStudent?.next_session && !editing && <small>Próxima en su agenda: {shortDate(firstStudent.next_session.date)}{firstStudent.next_session.time ? ` ${firstStudent.next_session.time}` : ''}</small>}
          </div>
          <div className="field">
            <label htmlFor="pl-title">Título (opcional)</label>
            <input id="pl-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Hombros" />
          </div>
          <div className="field full">
            <span className="lab">¿Cómo queda?</span>
            <Seg small value={status} onChange={setStatus}
              options={[['planned', 'Asignar: la hace y la tilda'], ['done', 'Registrar: ya la hicieron']]} />
          </div>
        </div>
        </>
        )}
      </section>

      {ids.length > 0 && (
      <div className="plan-grid" style={{ marginTop: 12 }}>
        <div>
          {!editing && (
            <section className="card" style={{ marginTop: 0 }}>
              <h2>Empezar desde</h2>
              <div className="startrow">
                <button className="startopt" aria-pressed={start === 'prev'} onClick={() => pick('prev')}>
                  {Icon.copyPrev}<b>Sesión anterior</b><span>La copia para ajustarla</span>
                </button>
                <button className="startopt" aria-pressed={start === 'blank'} onClick={() => pick('blank')}>
                  {Icon.blank}<b>Canvas en blanco</b><span>Bloques vacíos para armar</span>
                </button>
                <button className="startopt" aria-pressed={start === 'paste'} onClick={() => pick('paste')}>
                  {Icon.paste}<b>Pegar texto</b><span>Con tu formato de siempre</span>
                </button>
              </div>
            </section>
          )}
          <div className="plan-side-mobile">{reference}</div>
          {routine && (
            <div className="modebar">
              <Seg small value={mode} onChange={(m) => { if (m === 'texto') toText(); else void toBlocks(); }}
                options={[['bloques', 'Bloques'], ['texto', 'Texto']]} />
            </div>
          )}
          {routine && mode === 'bloques' && (
            <RoutineBuilder value={routine} onChange={setRoutine} library={library} participants={participants} />
          )}
          {routine && mode === 'texto' && (
            <section className="card textmode">
              <textarea className="mono" value={text} spellCheck={false} aria-label="Rutina en texto"
                onChange={(e) => { setText(e.target.value); setTextDirty(true); }} />
              <p className="hint" style={{ fontSize: 12 }}>
                Como en tus notas: movilidad separada con " - ", circuitos entre [ ] con "x2" al final (estaciones con " - ", alternados con "/"),
                bloque principal en renglones A1, A2… y "x3" abajo. Al volver a Bloques o al guardar se lee el texto; los nombres de los bloques vuelven a los de siempre.
              </p>
            </section>
          )}
        </div>
        <div className="plan-side-desk">{reference}</div>
      </div>
      )}

      {editing && routine && ids.length > 0 && (
        <section className="card">
          <h2>¿Por qué el cambio?</h2>
          <p className="hint">Opcional. Queda en el registro de cambios del alumno, junto con lo que había antes.</p>
          <div className="chipset" style={{ marginTop: 8 }}>
            {CHANGE_CATEGORIES.map(([k, l]) => (
              <button key={k} className="tog" aria-pressed={why === k} onClick={() => setWhy(why === k ? null : k)}>{l}</button>
            ))}
          </div>
          <div className="field" style={{ marginTop: 10 }}>
            <label htmlFor="pl-why">Motivo</label>
            <input id="pl-why" value={whyText} maxLength={300} onChange={(e) => setWhyText(e.target.value)} placeholder="Ej.: molestia en la rodilla, bajo la profundidad" />
          </div>
        </section>
      )}

      {err && <p className="err">{err}</p>}
      {routine && ids.length > 0 && (
        <div className="savebar">
          <div className="meta">
            <span>{mode === 'texto' ? (textDirty ? 'Texto con cambios' : 'Texto') : `${routine.blocks.length} bloques · ${count} ejercicios`}</span>
            <span>{participants.map((p) => firstName(p.name)).join(' y ') || 'Elegí alumnos'} · {shortDate(date)}</span>
          </div>
          <button className="btn primary wide" disabled={busy || !ids.length || (mode === 'bloques' && !count)} onClick={save}>
            {busy ? 'Guardando…' : editing ? 'Guardar cambios' : status === 'planned' ? `Asignar rutina para el ${shortDate(date)}` : 'Guardar como hecha'}
          </button>
        </div>
      )}

      {pasting && (
        <PasteSheet ids={ids} date={date} onClose={() => setPasting(false)}
          onRoutine={(r) => { setRoutine(r); setStart('paste'); setPasting(false); }}
          onImported={(n) => { setPasting(false); onSaved(ids, `${n} sesiones importadas`); }} />
      )}
    </>
  );
}

/** Al editar se conservan los ids: las notas y checks de los alumnos siguen apuntando bien. */
function cloneKeepIds(r: Routine): Routine {
  return JSON.parse(JSON.stringify(r)) as Routine;
}

function PasteSheet({ ids, date, onClose, onRoutine, onImported }: {
  ids: string[]; date: string; onClose: () => void; onRoutine: (r: Routine) => void; onImported: (n: number) => void;
}) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<{ sessions: PreviewSession[]; warnings: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const read = async () => {
    setBusy(true); setErr('');
    try {
      const r = await coachApi.preview(text, ids, date);
      if (r.sessions.length === 1) onRoutine(cloneRoutine(r.sessions[0]!.routine));
      else setPreview(r);
    } catch (e) { setErr((e as ApiError).message); } finally { setBusy(false); }
  };
  const importAll = async () => {
    setBusy(true); setErr('');
    try {
      const r = await coachApi.saveSessions(text, ids, date);
      onImported(r.sessions.length);
    } catch (e) { setErr((e as ApiError).message); } finally { setBusy(false); }
  };
  return (
    <Sheet title="Pegar texto" onClose={onClose}>
      <p className="hint" style={{ margin: 0 }}>
        Pegá la sesión como la escribís siempre. Si pegás varias (cada una con su fecha), las podés importar todas de una como sesiones hechas.
      </p>
      <div className="field">
        <textarea className="mono" value={text} onChange={(e) => { setText(e.target.value); setPreview(null); }} spellCheck={false} autoFocus
          placeholder={'Cat/Cow - Spinal Bridge - Hip CARs\n[Rotational Plank 45s/ Crawling 1min - Copenhagen 30s+10r] x2\nA1 - Skater sq 12 + CMJ 3\nx3'} />
      </div>
      {!ids.length && <p className="err">Elegí primero para quién es.</p>}
      {err && <p className="err">{err}</p>}
      {preview ? (() => {
        const all = preview.sessions;
        const fresh = all.filter((s) => !s.existing);
        const dates = all.map((s) => s.date).sort();
        return (
        <>
          <p style={{ margin: 0 }}>
            Encontré <b>{all.length} sesiones</b> ({all.length > 6 ? `del ${shortDate(dates[0]!)} al ${shortDate(dates[dates.length - 1]!)}` : all.map((s) => shortDate(s.date)).join(', ')}).
            {fresh.length < all.length && <> <b>{all.length - fresh.length}</b> ya estaban cargadas y no se repiten.</>}
          </p>
          <button className="btn primary wide" disabled={busy || !fresh.length} onClick={importAll}>
            {busy ? 'Importando…' : !fresh.length ? 'Ya estaban todas cargadas' : fresh.length === all.length ? `Importar las ${all.length} como hechas` : `Importar las ${fresh.length} nuevas como hechas`}
          </button>
          <button className="btn wide" onClick={() => onRoutine(cloneRoutine(preview.sessions[preview.sessions.length - 1]!.routine))}>
            Usar sólo la última para editarla
          </button>
        </>
        );
      })() : (
        <button className="btn primary wide" disabled={busy || !text.trim() || !ids.length} onClick={read}>{busy ? 'Leyendo…' : 'Convertir en bloques'}</button>
      )}
    </Sheet>
  );
}
