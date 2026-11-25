import { useEffect, useState } from 'react';
import { ApiError } from '../api';
import { cap, coachApi, longDate, Routine, routineToText, timeAgo, todayIso } from './data';
import { Icon, Sheet } from './ui';

interface BackupData {
  exported_at: string;
  students: Array<{ id: string; name: string }>;
  sessions: Array<{ id: string; date: string; title: string | null; status: string; participant_ids: string[]; routine: Routine }>;
  attendance: unknown[];
  payments: unknown[];
}

function save(name: string, type: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Las rutinas de cada alumno, con el formato de siempre, para leerlas sin la app. */
function readable(d: BackupData): string {
  const names = new Map(d.students.map((s) => [s.id, s.name]));
  const out = [`HTC · Rutinas de todos los alumnos`, `Copia del ${longDate(d.exported_at.slice(0, 10))}`, ''];
  for (const st of [...d.students].sort((a, b) => a.name.localeCompare(b.name, 'es'))) {
    const mine = d.sessions.filter((x) => x.participant_ids.includes(st.id)).sort((a, b) => b.date.localeCompare(a.date));
    out.push('='.repeat(48), st.name.toUpperCase(), `${mine.length} ${mine.length === 1 ? 'sesión' : 'sesiones'}`, '='.repeat(48), '');
    for (const x of mine) {
      const others = x.participant_ids.filter((p) => p !== st.id).map((p) => names.get(p) ?? '—');
      out.push(`${cap(longDate(x.date))}${x.title ? ` · ${x.title}` : ''}${x.status === 'planned' ? ' (asignada)' : ''}${others.length ? ` · con ${others.join(', ')}` : ''}`);
      out.push(routineToText(x.routine) || '(sin rutina)', '');
    }
  }
  return out.join('\n');
}

/** Más → Copia de seguridad: descargar todo lo cargado, para tenerlo guardado fuera de la app. */
export function BackupSheet({ onClose, toast }: { onClose: () => void; toast: (m: string) => void }) {
  const [last, setLast] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState<'' | 'json' | 'txt'>('');
  useEffect(() => { coachApi.backupLast().then((r) => setLast(r.last)).catch(() => setLast(null)); }, []);

  const download = async (kind: 'json' | 'txt') => {
    setBusy(kind);
    try {
      const d = await coachApi.backup() as unknown as BackupData;
      const day = todayIso();
      if (kind === 'json') save(`htc-copia-${day}.json`, 'application/json', JSON.stringify(d, null, 1));
      else save(`htc-rutinas-${day}.txt`, 'text/plain;charset=utf-8', readable(d));
      setLast(d.exported_at);
      toast('Copia descargada. Guardala en Drive, iCloud o tu compu');
    } catch (e) { toast((e as ApiError).message); } finally { setBusy(''); }
  };

  return (
    <Sheet title="Copia de seguridad" onClose={onClose}>
      <p className="hint" style={{ margin: 0 }}>
        Todo lo que cargaste queda guardado en la base de datos de la app. Además, podés descargar una copia y guardarla donde quieras
        (Drive, iCloud, tu compu): si algún día pasa algo, con ese archivo se recupera todo.
      </p>
      <p className="cls-now" style={{ fontSize: 14 }}>
        {last === undefined ? 'Revisando…' : last ? <>Última copia: <b style={{ fontSize: 15 }}>{timeAgo(last)}</b></> : 'Todavía no descargaste ninguna copia.'}
      </p>
      <div className="actions" style={{ marginTop: 0 }}>
        <button className="btn primary" disabled={Boolean(busy)} onClick={() => download('json')}>{Icon.copy} {busy === 'json' ? 'Preparando…' : 'Copia completa'}</button>
        <button className="btn" disabled={Boolean(busy)} onClick={() => download('txt')}>{busy === 'txt' ? 'Preparando…' : 'Rutinas para leer'}</button>
      </div>
      <ul className="callist">
        <li><b>Copia completa:</b> todos los datos (alumnos, rutinas, asistencia, pagos, informes, progreso). Es la que sirve para recuperar todo.</li>
        <li><b>Rutinas para leer:</b> las rutinas de cada alumno, con el formato de siempre, para abrirlas sin la app (como en Evernote).</li>
        <li>Conviene descargar una copia completa una vez por semana.</li>
      </ul>
    </Sheet>
  );
}
