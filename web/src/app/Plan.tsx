import { ReactNode, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api';
import {
  cloneRoutine, coachApi, ExerciseEntry, longDate, PreviewSession, Profile, relDays, Routine, Session, shortDate,
  StudentListItem, todayIso, cap, firstName,
} from './data';
import { RoutineCompact } from './RoutineView';
import { cleanRoutine, newBlock, RoutineBuilder, routineCount } from './RoutineBuilder';
import { Icon, Seg, Sheet, TopHeader } from './ui';

type Start = 'prev' | 'blank' | 'paste';

export function PlanSession({ students, initialIds, editing, avatar, library, onSaved, onCancel, toast }: {
  students: StudentListItem[];
  initialIds: string[];
  editing: Session | null;
  avatar: ReactNode;
  library: ExerciseEntry[];
  onSaved: (studentIds: string[], msg: string) => void;
  onCancel?: () => void;
  toast: (m: string) => void;
}) {
  const [ids, setIds] = useState<string[]>(editing?.participant_ids ?? initialIds);
  const firstStudent = students.find((s) => s.id === ids[0]);
  const [date, setDate] = useState(editing?.date ?? (firstStudent?.next_session?.date && firstStudent.next_session.date >= todayIso() ? firstStudent.next_session.date : todayIso()));
  const [status, setStatus] = useState<'planned' | 'done'>(editing?.status ?? 'planned');
  const [title, setTitle] = useState(editing?.title ?? '');
  const [routine, setRoutine] = useState<Routine | null>(editing ? cloneKeepIds(editing.routine) : null);
  const [start, setStart] = useState<Start | null>(editing ? 'prev' : null);
  const [ref, setRef] = useState<Profile | null>(null);
  const [refIdx, setRefIdx] = useState(0);
  const [refOpen, setRefOpen] = useState(true);
  const [pasting, setPasting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

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
      const clean = cleanRoutine(routine);
      if (editing) {
        await coachApi.updateSession(editing.id, { date, title: title.trim() || null, status, participant_ids: ids, routine: clean });
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
      <TopHeader title={editing ? 'Editar sesión' : 'Planificar'} onBack={onCancel} right={avatar}
        sub={<span>{editing ? cap(longDate(editing.date)) : 'Armá la próxima sesión por bloques'}</span>} />

      <section className="card" style={{ marginTop: 4 }}>
        <h2>¿Para quién?</h2>
        <div className="chipset" style={{ marginTop: 10 }}>
          {students.map((s) => (
            <button key={s.id} className="tog" aria-pressed={ids.includes(s.id)} onClick={() => toggle(s.id)}>{s.name}</button>
          ))}
          {!students.length && <p className="hint">Primero creá un alumno en la pestaña Alumnos.</p>}
        </div>
        <div className="fields">
          <div className="field">
            <label htmlFor="pl-date">Fecha</label>
            <input id="pl-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
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
      </section>

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
            <RoutineBuilder value={routine} onChange={setRoutine} library={library} participants={participants} />
          )}
        </div>
        <div className="plan-side-desk">{reference}</div>
      </div>

      {err && <p className="err">{err}</p>}
      {routine && (
        <div className="savebar">
          <div className="meta">
            <span>{routine.blocks.length} bloques · {count} ejercicios</span>
            <span>{participants.map((p) => firstName(p.name)).join(' y ') || 'Elegí alumnos'} · {shortDate(date)}</span>
          </div>
          <button className="btn primary wide" disabled={busy || !ids.length || !count} onClick={save}>
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
