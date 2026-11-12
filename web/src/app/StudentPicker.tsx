import { KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { fold } from './data';
import { Avatar } from './social';

export interface PickerStudent { id: string; name: string; billing?: { estado?: string | null } | null }

/** Coincide si cada palabra buscada empieza alguna palabra del nombre (sin acentos), o está contenida. */
export function matchesName(name: string, query: string): boolean {
  const q = fold(query).split(/\s+/).filter(Boolean);
  if (!q.length) return true;
  const words = fold(name).split(/\s+/);
  const full = fold(name);
  return q.every((w) => words.some((x) => x.startsWith(w))) || full.includes(q.join(' '));
}

const archived = (s: PickerStudent) => s.billing?.estado === 'baja';

/**
 * Selector de alumno con búsqueda por nombre o apellido. Compacto: un campo,
 * la lista aparece al escribir o al tocarlo. Debajo (opcional) los recientes.
 * Se usa en Planificar y sirve para cualquier otra sección.
 */
export function StudentPicker({ students, onPick, exclude = [], recents = [], label = 'Seleccionar alumno', autoFocus }: {
  students: PickerStudent[];
  onPick: (id: string) => void;
  /** Ya elegidos: no se ofrecen de nuevo. */
  exclude?: string[];
  /** Ids de los últimos abiertos, del más reciente al más viejo. */
  recents?: string[];
  label?: string;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const listId = useId();
  const box = useRef<HTMLDivElement>(null);

  const options = useMemo(() => {
    const pool = students.filter((s) => !exclude.includes(s.id) && matchesName(s.name, q));
    return pool.sort((a, b) => Number(archived(a)) - Number(archived(b)) || a.name.localeCompare(b.name, 'es'));
  }, [students, exclude, q]);
  const recent = useMemo(() => {
    const byId = new Map(students.map((s) => [s.id, s]));
    return recents.map((id) => byId.get(id)).filter((s): s is PickerStudent => Boolean(s) && !archived(s!) && !exclude.includes(s!.id)).slice(0, 5);
  }, [students, recents, exclude]);

  useEffect(() => { setHi(0); }, [q]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const choose = (id: string) => { setQ(''); setOpen(false); onPick(id); };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.min(options.length - 1, h + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if (e.key === 'Enter' && open && options[hi]) { e.preventDefault(); choose(options[hi]!.id); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  return (
    <div className="spick" ref={box}>
      <div className="spick-in">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></svg>
        <input
          role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-label={label}
          aria-activedescendant={open && options[hi] ? `${listId}-${options[hi]!.id}` : undefined}
          placeholder={label} value={q} autoFocus={autoFocus} autoComplete="off" spellCheck={false}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onKeyDown={onKey}
        />
      </div>
      {open && (
        <ul className="spick-list" id={listId} role="listbox" aria-label="Alumnos">
          {options.map((s, i) => (
            <li key={s.id} id={`${listId}-${s.id}`} role="option" aria-selected={i === hi}
              onMouseEnter={() => setHi(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(s.id)}>
              <Avatar id={s.id} name={s.name} size={28} />
              <span className="nm">{s.name}</span>
              {archived(s) && <small>Baja</small>}
            </li>
          ))}
          {!options.length && <li className="none" role="presentation">{q ? `Nadie se llama “${q}”.` : 'No hay alumnos para elegir.'}</li>}
        </ul>
      )}
      {!open && recent.length > 0 && (
        <div className="spick-recent">
          <div className="lab">Recientes</div>
          {recent.map((s) => (
            <button key={s.id} className="spick-row" onClick={() => choose(s.id)}>
              <Avatar id={s.id} name={s.name} size={32} />
              <span>{s.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
