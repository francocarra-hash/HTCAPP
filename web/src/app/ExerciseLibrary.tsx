import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api';
import { CAP_LABEL, CAPACITIES, CapacityId, coachApi, ExerciseEntry, fold, shortDate } from './data';
import { CapTag, Enter, Icon, Sheet, Skeleton, TopHeader } from './ui';

export function useLibrary(): [ExerciseEntry[], () => void] {
  const [list, setList] = useState<ExerciseEntry[]>([]);
  const load = useCallback(() => { coachApi.exercises().then((r) => setList(r.exercises)).catch(() => setList([])); }, []);
  useEffect(load, [load]);
  return [list, load];
}

const PAGE = 80;
const whoUses = (names: string[]): string =>
  names.length > 3 ? `${names.slice(0, 3).join(', ')} y ${names.length - 3} más` : names.join(', ');

export function ExerciseLibrary({ avatar, toast }: { avatar: ReactNode; toast: (m: string) => void }) {
  const [list, setList] = useState<ExerciseEntry[] | null>(null);
  const [q, setQ] = useState('');
  const [capSel, setCapSel] = useState<CapacityId | 'none' | null>(null);
  const [editing, setEditing] = useState<ExerciseEntry | 'new' | null>(null);
  // Son miles: se muestran de a tandas para que la lista no trabe el celular.
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [q, capSel]);

  const load = useCallback(() => { coachApi.exercises().then((r) => setList(r.exercises)).catch(() => setList([])); }, []);
  useEffect(load, [load]);

  const shown = useMemo(() => (list ?? []).filter((e) =>
    (!q || fold(e.name).includes(fold(q))) &&
    (!capSel || (capSel === 'none' ? !e.capacity : e.capacity === capSel))), [list, q, capSel]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of list ?? []) m.set(e.capacity ?? 'none', (m.get(e.capacity ?? 'none') ?? 0) + 1);
    return m;
  }, [list]);

  return (
    <>
      <TopHeader title="Ejercicios" right={avatar}
        sub={list && <><span><b>{list.length}</b> en la biblioteca</span><span>se suman solos al cargar sesiones</span></>} />
      {!list ? <Skeleton /> : (
        <Enter>
          <div className="actions" style={{ marginTop: 4 }}>
            <button className="btn primary wide" onClick={() => setEditing('new')}>{Icon.plus} Nuevo ejercicio</button>
          </div>
          <input className="search" type="search" placeholder="Buscar ejercicio…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar ejercicio" style={{ marginTop: 12 }} />
          <div className="filters" role="group" aria-label="Filtrar por capacidad">
            <button className="tog" aria-pressed={!capSel} onClick={() => setCapSel(null)}>Todas</button>
            {CAPACITIES.filter((c) => counts.has(c.id)).map((c) => (
              <button key={c.id} className="tog" aria-pressed={capSel === c.id} style={{ ['--c' as string]: `var(--cap-${c.id})` }} onClick={() => setCapSel(capSel === c.id ? null : c.id)}>
                <i aria-hidden="true" />{c.label} <span style={{ opacity: .7 }}>{counts.get(c.id)}</span>
              </button>
            ))}
            {counts.has('none') && (
              <button className="tog" aria-pressed={capSel === 'none'} onClick={() => setCapSel(capSel === 'none' ? null : 'none')}>
                Sin clasificar <span style={{ opacity: .7 }}>{counts.get('none')}</span>
              </button>
            )}
          </div>
          <section className="card" style={{ paddingTop: 4, paddingBottom: 4, marginTop: 6 }}>
            {!shown.length && <p className="empty">No hay ejercicios con ese filtro.</p>}
            {shown.slice(0, limit).map((e) => (
              <button key={e.key} className="lib-row" onClick={() => setEditing(e)}>
                <b>{e.name}</b>
                {e.capacity
                  ? <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                      <CapTag id={e.capacity} label={CAP_LABEL[e.capacity]} />
                      {e.capacity_source === 'auto' && <span className="tag">auto</span>}
                    </span>
                  : <span className="tag">sin clasificar</span>}
                <span className="m">
                  {e.uses ? `${e.uses} usos · ${whoUses(e.students)}${e.last_text ? ` · último: ${e.last_text}` : ''}` : 'Creado a mano · todavía sin usar'}
                </span>
              </button>
            ))}
          </section>
          {shown.length > limit && (
            <button className="btn wide" style={{ marginTop: 10 }} onClick={() => setLimit(limit + PAGE * 2)}>
              Mostrar más · quedan {shown.length - limit}
            </button>
          )}
        </Enter>
      )}
      {editing && (
        <ExerciseSheet entry={editing === 'new' ? null : editing} onClose={() => setEditing(null)}
          onSaved={(msg) => { setEditing(null); toast(msg); load(); }} />
      )}
    </>
  );
}

function ExerciseSheet({ entry, onClose, onSaved }: { entry: ExerciseEntry | null; onClose: () => void; onSaved: (msg: string) => void }) {
  const [name, setName] = useState(entry?.name ?? '');
  const [capacity, setCapacity] = useState<CapacityId | null>(entry?.capacity ?? null);
  const [description, setDescription] = useState(entry?.description ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    setBusy(true); setErr('');
    try {
      const body = { name: name.trim(), capacity, description: description.trim() || null };
      if (entry) await coachApi.saveExercise(entry.key, body);
      else await coachApi.createExercise(body);
      onSaved(entry ? 'Ejercicio actualizado' : 'Ejercicio agregado a la biblioteca');
    } catch (e) { setErr((e as ApiError).message); } finally { setBusy(false); }
  };
  return (
    <Sheet title={entry ? 'Ejercicio' : 'Nuevo ejercicio'} onClose={onClose}>
      <div className="fields" style={{ marginTop: 0 }}>
        <div className="field full">
          <label htmlFor="ex-name">Nombre</label>
          <input id="ex-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Copenhagen" />
          {entry && <small>Cambiar el nombre no cambia las sesiones ya cargadas: sigue agrupando el mismo ejercicio.</small>}
        </div>
        <div className="field full">
          <span className="lab">Capacidad</span>
          <div className="chipset" role="group" aria-label="Capacidad">
            {CAPACITIES.map((c) => (
              <button key={c.id} type="button" className="tog" aria-pressed={capacity === c.id} onClick={() => setCapacity(capacity === c.id ? null : c.id)}
                style={{ ['--c' as string]: `var(--cap-${c.id})` }}>
                <span className="cap" style={{ color: 'inherit' }}><i />{c.label}</span>
              </button>
            ))}
          </div>
          <small>{entry?.capacity_source === 'auto' ? 'Hoy está clasificado automáticamente por el nombre; al guardar queda fijado por vos.' : 'Define en qué capacidad suma su progreso.'}</small>
        </div>
        <div className="field full">
          <label htmlFor="ex-desc">Descripción / cues (opcional)</label>
          <textarea id="ex-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Cómo se hace, en qué fijarse…" />
        </div>
      </div>
      {entry && entry.uses > 0 && (
        <p className="hint" style={{ margin: 0 }}>
          Usado {entry.uses} veces por {entry.students.join(', ')}{entry.last_date ? ` · último ${shortDate(entry.last_date)}: ${entry.last_text}` : ''}.
        </p>
      )}
      {err && <p className="err">{err}</p>}
      <button className="btn primary wide" disabled={busy || !name.trim()} onClick={save}>{busy ? 'Guardando…' : 'Guardar'}</button>
    </Sheet>
  );
}
