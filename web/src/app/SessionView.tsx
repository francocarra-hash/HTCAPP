import { ReactNode, useState } from 'react';
import { firstName, fold, longDate, ParsedItem, ParsedSessionBody, PreviewSession, Session, sessionSummary, splitDose } from './data';
import { Icon } from './ui';

/** viewer = nombre de pila del alumno que mira (undefined = vista del coach). */
type Viewer = string | undefined;

const isMine = (who: string | undefined, viewer: Viewer) => Boolean(who && viewer && fold(who) === fold(viewer));

function Item({ item, viewer, replaced }: { item: ParsedItem; viewer: Viewer; replaced: boolean }) {
  if (item.who) {
    const mine = isMine(item.who, viewer);
    if (viewer && !mine) return null; // la variante de un compañero no le sirve al alumno
    return (
      <div className={`itm${mine ? ' mine' : ''}`}>
        <span className={`who${mine || !viewer ? '' : ' other'}`}>{mine ? 'Para vos' : item.who}</span>
        <b>{item.text}</b>
      </div>
    );
  }
  const [name, dose] = splitDose(item);
  return (
    <div className={`itm${replaced ? ' dim' : ''}`}>
      <b>{name}</b>
      {dose && <span className="rx">{dose}</span>}
    </div>
  );
}

function Items({ items, viewer }: { items: ParsedItem[]; viewer: Viewer }) {
  return (
    <>
      {items.map((it, i) => (
        <Item key={i} item={it} viewer={viewer} replaced={Boolean(viewer && isMine(items[i + 1]?.who, viewer))} />
      ))}
    </>
  );
}

interface Group { title: string; sum: string; badge?: string; body: ReactNode }

function groupsOf(p: ParsedSessionBody, viewer: Viewer): Group[] {
  const g: Group[] = [];
  if (p.warmup.length) {
    g.push({
      title: 'Movilidad',
      sum: p.warmup.slice(0, 3).join(' · ') + (p.warmup.length > 3 ? ` · +${p.warmup.length - 3}` : ''),
      badge: `${p.warmup.length}`,
      body: <ol className="mob">{p.warmup.map((w, i) => <li key={i}>{w}</li>)}</ol>,
    });
  }
  p.circuits.forEach((c, ci) => {
    g.push({
      title: p.circuits.length > 1 ? `Circuito ${ci + 1}` : 'Circuito',
      sum: `${c.stations.length} estaciones${c.rounds ? ` · ${c.rounds} ${c.rounds === 1 ? 'vuelta' : 'vueltas'}` : ''}`,
      badge: c.rounds ? `×${c.rounds}` : undefined,
      body: (
        <>
          {c.stations.some((s) => s.filter((x) => !x.who).length > 1) && (
            <div className="ss-note">En cada estación alternás los ejercicios del par.</div>
          )}
          {c.stations.map((st, si) => (
            <div className="station" key={si}>
              <i className="sn">{si + 1}</i>
              <div className="sitems"><Items items={st} viewer={viewer} /></div>
            </div>
          ))}
        </>
      ),
    });
  });
  if (p.strength) {
    const s = p.strength;
    g.push({
      title: 'Bloque principal',
      sum: `${s.lines.map((l) => l.label).join(' · ')}${s.rounds ? ` · ${s.rounds} vueltas` : ''}`,
      badge: s.rounds ? `×${s.rounds}` : undefined,
      body: (
        <>
          {s.lines.some((l) => l.items.filter((x) => !x.who).length > 1) && (
            <div className="ss-note">Superseries: hacés los ejercicios de cada línea seguidos.</div>
          )}
          {s.lines.map((l, li) => (
            <div className="station" key={li}>
              <i className="sn">{l.label}</i>
              <div className="sitems"><Items items={l.items} viewer={viewer} /></div>
            </div>
          ))}
        </>
      ),
    });
  }
  if (p.extras.length) {
    g.push({
      title: 'Notas',
      sum: p.extras.join(' · '),
      body: <div className="chips-row">{p.extras.map((x, i) => <span className="mini" key={i}>{x}</span>)}</div>,
    });
  }
  return g;
}

/** Sesión completa como tarjetas numeradas que se expanden de a una. */
export function SessionCard({ session, viewer, defaultOpen = 0 }: { session: Session | PreviewSession; viewer: Viewer; defaultOpen?: number }) {
  const groups = groupsOf(session.parsed, viewer);
  const [open, setOpen] = useState<number | null>(defaultOpen);
  if (session.parsed.note && !groups.length) {
    return <div className="card"><p className="note-txt" style={{ margin: 0 }}>{session.parsed.note}</p></div>;
  }
  return (
    <ol className="exlist">
      {groups.map((g, i) => {
        const isOpen = open === i;
        return (
          <li key={i} className={`ex${isOpen ? ' open' : ''}`}>
            <button className="ex-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : i)}>
              <span className="num">{i + 1}</span>
              <span className="ex-title">
                <span className="ex-name">{g.title}</span>
                <span className="ex-sum">{g.sum}</span>
              </span>
              <span className="ex-st">{g.badge && <span className="tag">{g.badge}</span>}{Icon.chev}</span>
            </button>
            <div className="ex-wrap" {...(isOpen ? {} : { inert: '' })}>
              <div className="ex-body"><div className="ex-inner">{g.body}</div></div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const itemText = (it: ParsedItem, viewer: Viewer) => (it.who ? (viewer ? `(vos: ${it.text})` : `(${it.who}: ${it.text})`) : it.text);
const visible = (items: ParsedItem[], viewer: Viewer) => items.filter((it) => !it.who || !viewer || isMine(it.who, viewer));

/** Versión compacta para el historial. */
export function SessionCompact({ parsed, viewer }: { parsed: ParsedSessionBody; viewer: Viewer }) {
  if (parsed.note && !parsed.warmup.length && !parsed.circuits.length && !parsed.strength) {
    return <p className="note-txt" style={{ margin: 0 }}>{parsed.note}</p>;
  }
  return (
    <>
      {parsed.warmup.length > 0 && (
        <div className="line"><b>Movilidad</b><span>{parsed.warmup.join(' · ')}</span></div>
      )}
      {parsed.circuits.map((c, i) => (
        <div className="line" key={i}>
          <b>{parsed.circuits.length > 1 ? `Circuito ${i + 1}` : 'Circuito'}{c.rounds ? ` ×${c.rounds}` : ''}</b>
          <span>{c.stations.map((st) => visible(st, viewer).map((it) => itemText(it, viewer)).join(' / ')).join('  ·  ')}</span>
        </div>
      ))}
      {parsed.strength && (
        <div className="line">
          <b>Bloque principal{parsed.strength.rounds ? ` ×${parsed.strength.rounds}` : ''}</b>
          <span>
            {parsed.strength.lines.map((l) => `${l.label} ${visible(l.items, viewer).map((it) => itemText(it, viewer)).join(' + ')}`).join('  ·  ')}
          </span>
        </div>
      )}
      {parsed.extras.length > 0 && <div className="line"><b>Notas</b><span>{parsed.extras.join(' · ')}</span></div>}
    </>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function HistoryList({ sessions, viewer, names, onEdit, onDelete }: {
  sessions: Session[];
  viewer: Viewer;
  /** id → nombre, para mostrar con quién entrenó (vista del coach). */
  names?: Map<string, string>;
  onEdit?: (s: Session) => void;
  onDelete?: (s: Session) => void;
}) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  if (!sessions.length) return <p className="empty">Todavía no hay sesiones cargadas.</p>;
  const total = sessions.length;
  const list = [...sessions].reverse();
  return (
    <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
      {list.map((s, i) => {
        const who = names ? s.participant_ids.map((id) => firstName(names.get(id) ?? '—')).join(' y ') : null;
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
              <span className="sd">#{total - i}</span>
              <span className="sm">
                {s.title ? `${cap(longDate(s.date))} · ` : ''}{sessionSummary(s.parsed)}
                {who ? ` · ${who}` : ''}
                {names && s.date_note ? <><br /><span className="flag">⚠ {s.date_note}</span></> : null}
              </span>
            </summary>
            {openIds.has(s.id) && (
              <div className="sbody">
                <SessionCompact parsed={s.parsed} viewer={viewer} />
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
