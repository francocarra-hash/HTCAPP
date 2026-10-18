import { CSSProperties, ReactNode, useMemo, useState } from 'react';
import {
  closestCenter, DndContext, DragEndEvent, KeyboardSensor, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  BlockKind, CAP_LABEL, ExerciseEntry, firstName, fold, groupLabels, KIND_LABEL, Routine, RoutineBlock, RoutineGroup,
  RoutineItem, uid,
} from './data';
import { CapTag, Icon } from './ui';

const DEFAULT_TITLE: Record<BlockKind, string> = { list: 'Movilidad', circuit: 'Circuito', superset: 'Bloque principal', notes: 'Notas' };

export const newItem = (name = '', dose = ''): RoutineItem => ({ id: uid(), name, dose });
const newGroup = (): RoutineGroup => ({ id: uid(), items: [newItem()] });
export const newBlock = (kind: BlockKind): RoutineBlock => ({
  id: uid(), kind, title: DEFAULT_TITLE[kind], rounds: kind === 'circuit' ? 2 : kind === 'superset' ? 3 : null,
  groups: [newGroup()],
});

/** Puntero (mouse y dedo: la manija tiene touch-action:none, así no pelea con el scroll) y teclado. */
function useDndSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

function Sortable({ id, className, children }: {
  id: string; className: string;
  children: (handle: ReactNode) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition };
  const handle = (
    <button type="button" className="grip" aria-label="Arrastrar para mover" {...attributes} {...listeners}>{Icon.grip}</button>
  );
  return <div ref={setNodeRef} style={style} className={`${className}${isDragging ? ' dragging' : ''}`}>{children(handle)}</div>;
}

function move<T extends { id: string }>(list: T[], e: DragEndEvent): T[] {
  const { active, over } = e;
  if (!over || active.id === over.id) return list;
  const from = list.findIndex((x) => x.id === active.id);
  const to = list.findIndex((x) => x.id === over.id);
  return from < 0 || to < 0 ? list : arrayMove(list, from, to);
}

export function RoutineBuilder({ value, onChange, library, participants }: {
  value: Routine;
  onChange: (r: Routine) => void;
  library: ExerciseEntry[];
  /** Si entrenan varios, cada ejercicio puede ser una variante para uno. */
  participants: Array<{ id: string; name: string }>;
}) {
  const sensors = useDndSensors();
  const labels = useMemo(() => groupLabels(value), [value]);
  // Bloques contraídos: con todos cerrados se reordenan cómodos en el celular.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const allCollapsed = value.blocks.length > 0 && value.blocks.every((b) => collapsed.has(b.id));
  const toggleCollapse = (id: string) => setCollapsed((p) => {
    const n = new Set(p);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const summary = (b: RoutineBlock) => {
    const items = b.groups.flatMap((g) => g.items).filter((i) => i.name.trim());
    return `${items.length} ${items.length === 1 ? 'ejercicio' : 'ejercicios'}${b.rounds ? ` · ×${b.rounds}` : ''} · ${items.slice(0, 3).map((i) => i.name).join(', ')}${items.length > 3 ? '…' : ''}`;
  };
  const byName = useMemo(() => new Map(library.map((e) => [fold(e.name), e])), [library]);
  // Para autocompletar: lo que se usó más de una vez o se cargó a mano (lo de una sola vez suele ser una anotación).
  const names = useMemo(() => [...new Set(library.filter((e) => e.uses !== 1 || e.capacity_source === 'coach').map((e) => e.name))]
    .sort((a, b) => a.localeCompare(b)), [library]);

  const setBlocks = (blocks: RoutineBlock[]) => onChange({ ...value, blocks });
  const updBlock = (id: string, fn: (b: RoutineBlock) => RoutineBlock) => setBlocks(value.blocks.map((b) => (b.id === id ? fn(b) : b)));
  const updGroups = (bid: string, fn: (g: RoutineGroup[]) => RoutineGroup[]) => updBlock(bid, (b) => ({ ...b, groups: fn(b.groups) }));
  const updItems = (bid: string, gid: string, fn: (i: RoutineItem[]) => RoutineItem[]) =>
    updGroups(bid, (gs) => gs.map((g) => (g.id === gid ? { ...g, items: fn(g.items) } : g)));
  const setItem = (bid: string, gid: string, iid: string, patch: Partial<RoutineItem>) =>
    updItems(bid, gid, (its) => its.map((it) => (it.id === iid ? { ...it, ...patch } : it)));

  /** Alternativa al arrastre: subir/bajar con un toque (también accesible). */
  const moveBlock = (id: string, dir: -1 | 1) => {
    const i = value.blocks.findIndex((b) => b.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= value.blocks.length) return;
    setBlocks(arrayMove(value.blocks, i, j));
  };
  const duplicate = (b: RoutineBlock) => {
    const copy: RoutineBlock = { ...b, id: uid(), groups: b.groups.map((g) => ({ id: uid(), items: g.items.map((i) => ({ ...i, id: uid() })) })) };
    const i = value.blocks.findIndex((x) => x.id === b.id);
    setBlocks([...value.blocks.slice(0, i + 1), copy, ...value.blocks.slice(i + 1)]);
  };
  const changeKind = (b: RoutineBlock, kind: BlockKind) => {
    // Lista/notas: un ejercicio por renglón; circuito/superserie: agrupados.
    const single = kind === 'list' || kind === 'notes';
    const groups = single ? b.groups.flatMap((g) => g.items.map((it) => ({ id: uid(), items: [it] }))) : b.groups;
    updBlock(b.id, () => ({
      ...b, kind, groups: groups.length ? groups : [newGroup()],
      rounds: single ? null : b.rounds ?? (kind === 'circuit' ? 2 : 3),
      title: b.title === DEFAULT_TITLE[b.kind] ? DEFAULT_TITLE[kind] : b.title,
    }));
  };

  const itemRow = (b: RoutineBlock, g: RoutineGroup, it: RoutineItem, handle: ReactNode, canDelete: boolean, onDelete: () => void) => {
    const entry = byName.get(fold(it.name));
    const shared = participants.length > 1 && b.kind !== 'notes';
    return (
      <>
        {handle}
        <input value={it.name} list="ex-lib" placeholder={b.kind === 'notes' ? 'Nota' : 'Ejercicio'} aria-label="Ejercicio"
          onChange={(e) => setItem(b.id, g.id, it.id, { name: e.target.value })} />
        <input className="dose" value={it.dose} placeholder={b.kind === 'notes' ? '' : '10r · 30s · 3x8'} aria-label="Dosis"
          onChange={(e) => setItem(b.id, g.id, it.id, { dose: e.target.value })} />
        <button type="button" className="xbtn" aria-label="Quitar ejercicio" disabled={!canDelete} onClick={onDelete}>{Icon.x}</button>
        {(entry?.capacity || shared || it.who) && b.kind !== 'notes' && (
          <div className="wrow">
            {entry?.capacity && <CapTag id={entry.capacity} label={CAP_LABEL[entry.capacity]} muted />}
            {(shared || it.who) && (
              <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                Para
                <select value={it.who ?? ''} onChange={(e) => setItem(b.id, g.id, it.id, { who: e.target.value || undefined })}>
                  <option value="">todos</option>
                  {participants.map((p) => <option key={p.id} value={firstName(p.name)}>{firstName(p.name)}</option>)}
                  {it.who && !participants.some((p) => fold(firstName(p.name)) === fold(it.who!)) && <option value={it.who}>{it.who}</option>}
                </select>
              </label>
            )}
          </div>
        )}
      </>
    );
  };

  const blockBody = (b: RoutineBlock) => {
    const single = b.kind === 'list' || b.kind === 'notes';
    if (single) {
      return (
        <>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => updGroups(b.id, (gs) => move(gs, e))}>
            <SortableContext items={b.groups.map((g) => g.id)} strategy={verticalListSortingStrategy}>
              <div style={{ display: 'grid', gap: 4 }}>
                {b.groups.map((g) => {
                  const it = g.items[0]!;
                  return (
                    <Sortable key={g.id} id={g.id} className="bitem">
                      {(handle) => itemRow(b, g, it, handle, true, () => updGroups(b.id, (gs) => gs.filter((x) => x.id !== g.id)))}
                    </Sortable>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
          <div className="addrow">
            <button type="button" className="btn sm dashed" onClick={() => updGroups(b.id, (gs) => [...gs, newGroup()])}>
              {Icon.plus} {b.kind === 'notes' ? 'Nota' : 'Ejercicio'}
            </button>
          </div>
        </>
      );
    }
    return (
      <>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => updGroups(b.id, (gs) => move(gs, e))}>
          <SortableContext items={b.groups.map((g) => g.id)} strategy={verticalListSortingStrategy}>
            {b.groups.map((g) => (
              <Sortable key={g.id} id={g.id} className="bgroup">
                {(handle) => (
                  <>
                    <div className="bg-head">
                      {handle}
                      <span className="lbl">{labels.get(g.id)}</span>
                      <span className="hint">
                        {g.items.length > 1 ? (b.kind === 'circuit' ? 'se alternan' : 'van seguidos') : b.kind === 'circuit' ? 'estación' : 'línea'}
                      </span>
                      <button type="button" className="xbtn" aria-label="Quitar grupo" onClick={() => updGroups(b.id, (gs) => gs.filter((x) => x.id !== g.id))}>{Icon.trash}</button>
                    </div>
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => updItems(b.id, g.id, (its) => move(its, e))}>
                      <SortableContext items={g.items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                        {g.items.map((it) => (
                          <Sortable key={it.id} id={it.id} className="bitem">
                            {(h) => itemRow(b, g, it, h, g.items.length > 1, () => updItems(b.id, g.id, (its) => its.filter((x) => x.id !== it.id)))}
                          </Sortable>
                        ))}
                      </SortableContext>
                    </DndContext>
                    <div className="addrow" style={{ paddingLeft: 36 }}>
                      <button type="button" className="btn sm dashed" onClick={() => updItems(b.id, g.id, (its) => [...its, newItem()])}>
                        {Icon.plus} {b.kind === 'circuit' ? 'Alternar con otro' : 'Sumar a la superserie'}
                      </button>
                    </div>
                  </>
                )}
              </Sortable>
            ))}
          </SortableContext>
        </DndContext>
        <div className="addrow">
          <button type="button" className="btn sm dashed" onClick={() => updGroups(b.id, (gs) => [...gs, newGroup()])}>
            {Icon.plus} {b.kind === 'circuit' ? 'Estación' : 'Línea'}
          </button>
        </div>
      </>
    );
  };

  return (
    <div className="bld">
      <datalist id="ex-lib">{names.map((n) => <option key={n} value={n} />)}</datalist>
      {value.blocks.length > 1 && (
        <div className="card-h">
          <span className="hint" style={{ margin: 0 }}>Arrastrá desde ⋮⋮ para mover. Contraé los bloques para reordenarlos fácil.</span>
          <button type="button" className="btn sm" onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(value.blocks.map((b) => b.id)))}>
            {allCollapsed ? 'Expandir todo' : 'Contraer todo'}
          </button>
        </div>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => setBlocks(move(value.blocks, e))}>
        <SortableContext items={value.blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          {value.blocks.map((b, bi) => (
            <Sortable key={b.id} id={b.id} className={`bblock k-${b.kind}`}>
              {(handle) => (
                <>
                  <div className="bb-head">
                    {handle}
                    <input className="bb-title" value={b.title} aria-label="Nombre del bloque" placeholder={KIND_LABEL[b.kind]}
                      onChange={(e) => updBlock(b.id, (x) => ({ ...x, title: e.target.value }))} />
                    <div className="bb-tools">
                      {collapsed.has(b.id) && (
                        <>
                          <button type="button" className="xbtn" aria-label="Subir bloque" disabled={bi === 0}
                            onClick={() => moveBlock(b.id, -1)} style={{ transform: 'rotate(90deg)' }}>{Icon.back}</button>
                          <button type="button" className="xbtn" aria-label="Bajar bloque" disabled={bi === value.blocks.length - 1}
                            onClick={() => moveBlock(b.id, 1)} style={{ transform: 'rotate(-90deg)' }}>{Icon.back}</button>
                        </>
                      )}
                      <button type="button" className="xbtn" aria-expanded={!collapsed.has(b.id)}
                        aria-label={collapsed.has(b.id) ? 'Expandir bloque' : 'Contraer bloque'} onClick={() => toggleCollapse(b.id)}
                        style={{ transform: collapsed.has(b.id) ? 'none' : 'rotate(180deg)', transition: 'transform var(--t2) var(--ease)' }}>
                        {Icon.chev}
                      </button>
                      <button type="button" className="xbtn" aria-label="Duplicar bloque" onClick={() => duplicate(b)}>{Icon.dup}</button>
                      <button type="button" className="xbtn" aria-label="Borrar bloque"
                        onClick={() => { if (window.confirm(`¿Borrar el bloque “${b.title || KIND_LABEL[b.kind]}”?`)) setBlocks(value.blocks.filter((x) => x.id !== b.id)); }}>
                        {Icon.trash}
                      </button>
                    </div>
                  </div>
                  {collapsed.has(b.id) ? (
                    <div className="bb-sub" style={{ paddingBottom: 10 }}>
                      <span className="hint" style={{ margin: 0, fontSize: 12.5 }}>{summary(b)}</span>
                    </div>
                  ) : <>
                  <div className="bb-sub">
                    <select className="mini-sel" value={b.kind} aria-label="Tipo de bloque" onChange={(e) => changeKind(b, e.target.value as BlockKind)}>
                      {(Object.keys(KIND_LABEL) as BlockKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                    </select>
                    {(b.kind === 'circuit' || b.kind === 'superset') && (
                      <span className="stepper" role="group" aria-label="Vueltas">
                        <button type="button" aria-label="Una vuelta menos" onClick={() => updBlock(b.id, (x) => ({ ...x, rounds: Math.max(1, (x.rounds ?? 1) - 1) }))}>−</button>
                        <span>×{b.rounds ?? 1} {b.rounds === 1 ? 'vuelta' : 'vueltas'}</span>
                        <button type="button" aria-label="Una vuelta más" onClick={() => updBlock(b.id, (x) => ({ ...x, rounds: Math.min(30, (x.rounds ?? 0) + 1) }))}>+</button>
                      </span>
                    )}
                  </div>
                  <div className="bb-body">{blockBody(b)}</div>
                  </>}
                </>
              )}
            </Sortable>
          ))}
        </SortableContext>
      </DndContext>
      <div className="card" style={{ marginTop: 0, borderStyle: 'dashed', background: 'transparent' }}>
        <div className="label">Agregar bloque</div>
        <div className="addrow" style={{ marginTop: 8 }}>
          {(['list', 'circuit', 'superset', 'notes'] as BlockKind[]).map((k) => (
            <button key={k} type="button" className="btn sm" onClick={() => setBlocks([...value.blocks, newBlock(k)])}>
              {Icon.plus} {k === 'list' ? 'Movilidad / lista' : KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Limpia la rutina antes de guardar: sin ejercicios vacíos ni grupos/bloques vacíos. */
export function cleanRoutine(r: Routine): Routine {
  return {
    note: r.note?.trim() || null,
    blocks: r.blocks
      .map((b) => ({
        ...b,
        title: b.title.trim() || KIND_LABEL[b.kind],
        groups: b.groups
          .map((g) => ({ ...g, items: g.items.filter((i) => i.name.trim()).map((i) => ({ ...i, name: i.name.trim(), dose: i.dose.trim() })) }))
          .filter((g) => g.items.length),
      }))
      .filter((b) => b.groups.length),
  };
}

export const routineCount = (r: Routine): number =>
  r.blocks.filter((b) => b.kind !== 'notes').reduce((a, b) => a + b.groups.reduce((x, g) => x + g.items.filter((i) => i.name.trim() && !i.who).length, 0), 0);
