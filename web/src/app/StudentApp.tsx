import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api';
import { firstName, initials, longDate, Profile, relDays, Session, shortDate, studentApi } from './data';
import { ProgressView } from './ProgressView';
import { HistoryList, SessionCard } from './SessionView';
import { Enter, Icon, Seg, Skeleton, TabBar, TabDef, TopHeader, useToast } from './ui';

type Tab = 'rutina' | 'progreso' | 'historial' | 'perfil';

const TABS: TabDef<Tab>[] = [
  { id: 'rutina', label: 'Rutina', icon: Icon.routine },
  { id: 'progreso', label: 'Progreso', icon: Icon.progress },
  { id: 'historial', label: 'Historial', icon: Icon.history },
  { id: 'perfil', label: 'Perfil', icon: Icon.user },
];

export function partnersOf(session: Session, selfId: string, names: Map<string, string>): string {
  const others = session.participant_ids.filter((id) => id !== selfId).map((id) => firstName(names.get(id) ?? ''));
  return others.filter(Boolean).join(' y ');
}

/** Rutina: la última sesión (o una de las 3 últimas) como tarjetas numeradas. */
export function RoutineView({ profile, viewer }: { profile: Profile; viewer: string | undefined }) {
  const recent = [...profile.sessions].reverse().slice(0, 3);
  const [pick, setPick] = useState(recent[0]?.id ?? '');
  const session = recent.find((s) => s.id === pick) ?? recent[0];
  const names = new Map(profile.partners.map((p) => [p.id, p.name]));
  if (!session) {
    return (
      <p className="empty">
        {viewer ? 'Tu profe todavía no cargó tu primera rutina.' : 'Todavía no hay sesiones. Cargá la primera desde “Cargar”.'}
      </p>
    );
  }
  const partner = partnersOf(session, profile.student.id, names);
  return (
    <>
      {recent.length > 1 && (
        <Seg small value={session.id} onChange={setPick}
          options={recent.map((s, i): [string, string] => [s.id, i === 0 ? `Última · ${shortDate(s.date)}` : shortDate(s.date)])} />
      )}
      {(session.title || partner) && (
        <div className="phase">
          <span className="ph-tag">{session.title ? 'Foco' : 'Dúo'}</span>
          <div>
            {session.title && <b>{session.title}. </b>}
            {partner && <span>{viewer ? 'Entrenaste' : 'Entrenó'} con {partner}.</span>}
          </div>
        </div>
      )}
      {!viewer && session.date_note && (
        <div className="phase warn"><span className="ph-tag">Fecha</span><div>{session.date_note}</div></div>
      )}
      <SessionCard key={session.id} session={session} viewer={viewer} />
    </>
  );
}

export default function StudentApp({ onLogout }: { onLogout: () => void }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('rutina');
  const [toast, showToast] = useToast();

  const load = useCallback(() => {
    studentApi.me().then(setProfile).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const go = (t: Tab) => {
    if (t === tab) window.scrollTo({ top: 0, behavior: 'smooth' });
    else { setTab(t); window.scrollTo(0, 0); }
  };

  const s = profile?.student;
  const viewer = s ? firstName(s.name) : undefined;
  const last = profile?.sessions[profile.sessions.length - 1];
  const titles: Record<Tab, string> = { rutina: 'Rutina', progreso: 'Progreso', historial: 'Historial', perfil: 'Perfil' };
  const sub = !profile ? null
    : tab === 'rutina' ? (last ? <><span>Última sesión: <b>{longDate(last.date)}</b></span><span>{relDays(last.date)}</span></> : <span>Hola, {viewer}</span>)
    : tab === 'progreso' ? <span>Cómo vas mejorando sesión a sesión</span>
    : tab === 'historial' ? <span>{profile.sessions.length} sesiones registradas</span>
    : <span>Tus datos y tu cuenta</span>;

  return (
    <div className="bt">
      <div className="bt-page">
        <div className="wrap">
          <TopHeader title={titles[tab]} sub={sub}
            right={s && <button className={`avatar${tab === 'perfil' ? ' on' : ''}`} onClick={() => go('perfil')} aria-label="Perfil">{initials(s.name)}</button>} />
          <main aria-live="polite">
            {error ? <p className="empty">No se pudo cargar tu información: {error}</p>
              : !profile ? <Skeleton />
              : (
                <Enter k={tab}>
                  {tab === 'rutina' && <RoutineView profile={profile} viewer={viewer} />}
                  {tab === 'progreso' && <ProgressView progress={profile.progress} you />}
                  {tab === 'historial' && <HistoryList sessions={profile.sessions} viewer={viewer} />}
                  {tab === 'perfil' && <ProfileTab profile={profile} onLogout={onLogout} onSaved={() => showToast('Contraseña actualizada')} />}
                </Enter>
              )}
          </main>
        </div>
      </div>
      <TabBar tabs={TABS} current={tab} onChange={go} />
      {toast}
    </div>
  );
}

function ProfileTab({ profile, onLogout, onSaved }: { profile: Profile; onLogout: () => void; onSaved: () => void }) {
  const s = profile.student;
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [rep, setRep] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const line = [s.age ? `${s.age} años` : null, profile.partners[0] ? `entrena con ${firstName(profile.partners[0].name)}` : null]
    .filter(Boolean).join(' · ');

  const save = async () => {
    setErr('');
    if (next.length < 6) { setErr('La contraseña nueva lleva al menos 6 caracteres.'); return; }
    if (next !== rep) { setErr('Las dos contraseñas nuevas no coinciden.'); return; }
    setBusy(true);
    try {
      await studentApi.changePassword(cur, next);
      setCur(''); setNext(''); setRep('');
      onSaved();
    } catch (e) {
      setErr((e as ApiError).message);
    } finally { setBusy(false); }
  };

  return (
    <>
      <section className="card">
        <div className="hero">
          <div className="avatar-lg" aria-hidden="true">{initials(s.name)}</div>
          <div style={{ minWidth: 0 }}>
            <h2>{s.name}</h2>
            {line && <p>{line}</p>}
          </div>
        </div>
      </section>
      {s.goal && (
        <section className="card">
          <h2>Objetivo</h2>
          <p style={{ margin: '8px 0 0', fontSize: 15 }}>{s.goal}</p>
        </section>
      )}
      <section className="card">
        <h2>Cuenta</h2>
        <div className="hint">Entrás con el usuario <b style={{ fontFamily: 'var(--f-data)' }}>{s.username}</b>.</div>
        <div className="fields">
          <div className="field full">
            <label htmlFor="pw-cur">Contraseña actual</label>
            <input id="pw-cur" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="pw-new">Nueva</label>
            <input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="pw-rep">Repetila</label>
            <input id="pw-rep" type="password" autoComplete="new-password" value={rep} onChange={(e) => setRep(e.target.value)} />
          </div>
        </div>
        {err && <p className="err">{err}</p>}
        <div className="actions">
          <button className="btn primary" disabled={busy || !cur || !next} onClick={save}>{busy ? 'Guardando…' : 'Cambiar contraseña'}</button>
        </div>
      </section>
      <div className="actions" style={{ marginTop: 16 }}>
        <button className="btn wide" onClick={onLogout}>{Icon.logout} Cerrar sesión</button>
      </div>
    </>
  );
}
