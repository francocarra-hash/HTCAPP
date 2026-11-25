import { useEffect, useState } from 'react';
import { ApiError } from '../api';
import { BackupAuto, cap, coachApi, longDate, Routine, routineToText, timeAgo, todayIso } from './data';
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
  const [auto, setAuto] = useState<BackupAuto | null>(null);
  const [busy, setBusy] = useState<'' | 'json' | 'txt' | 'mail'>('');
  useEffect(() => {
    coachApi.backupLast().then((r) => { setLast(r.last); setAuto(r.auto); }).catch(() => setLast(null));
  }, []);
  const sendNow = async () => {
    setBusy('mail');
    try {
      const r = await coachApi.sendBackup();
      setAuto((a) => a && { ...a, status: r.status });
      toast(r.status.ok ? `Copia enviada a ${auto?.to ?? 'tu mail'}` : 'No se pudo mandar el mail');
    } catch (e) { toast((e as ApiError).message); } finally { setBusy(''); }
  };
  const st = auto?.status;

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
        Todo lo que cargaste queda guardado en la base de datos de la app. Además, se guarda una copia fuera de la app por si algún día pasa algo.
      </p>
      {auto && (
        auto.configured ? (
          <div className={`phase${st && st.ok === false ? ' warn' : ''}`} style={{ marginTop: 0 }}>
            <span className="ph-tag">{st && st.ok === false ? 'Ojo' : 'Auto'}</span>
            <div>
              Todos los viernes se manda sola una copia completa a <b>{auto.to}</b>.
              {st?.at && (st.ok
                ? <> La última salió {timeAgo(st.at)}.</>
                : <> La última vez no se pudo mandar ({st.error}). Se vuelve a intentar sola.</>)}
              <div className="actions" style={{ marginTop: 8 }}>
                <button className="btn sm" disabled={Boolean(busy)} onClick={sendNow}>{busy === 'mail' ? 'Mandando…' : 'Mandar una ahora'}</button>
              </div>
            </div>
          </div>
        ) : (
          <p className="hint" style={{ margin: 0 }}>El envío automático por mail de los viernes todavía no está activado. Mientras tanto, descargá la copia acá.</p>
        )
      )}
      <p className="cls-now" style={{ fontSize: 14 }}>
        {last === undefined ? 'Revisando…' : last ? <>Última descarga: <b style={{ fontSize: 15 }}>{timeAgo(last)}</b></> : 'Todavía no descargaste ninguna copia.'}
      </p>
      <div className="actions" style={{ marginTop: 0 }}>
        <button className="btn primary" disabled={Boolean(busy)} onClick={() => download('json')}>{Icon.copy} {busy === 'json' ? 'Preparando…' : 'Copia completa'}</button>
        <button className="btn" disabled={Boolean(busy)} onClick={() => download('txt')}>{busy === 'txt' ? 'Preparando…' : 'Rutinas para leer'}</button>
      </div>
      <ul className="callist">
        <li><b>Copia completa:</b> todos los datos (alumnos, rutinas, asistencia, pagos, informes, progreso). Es la que sirve para recuperar todo.</li>
        <li><b>Rutinas para leer:</b> las rutinas de cada alumno, con el formato de siempre, para abrirlas sin la app (como en Evernote).</li>
        {!auto?.configured && <li>Conviene descargar una copia completa una vez por semana.</li>}
      </ul>
    </Sheet>
  );
}
