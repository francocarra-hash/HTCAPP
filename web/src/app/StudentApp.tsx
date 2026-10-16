import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api';
import {
  CAP_LABEL, firstName, initials, longDate, Occurrence, ProcessPhase, Profile, relDays, Session, studentApi, todayIso,
  whenLabel, cap,
} from './data';
import { ProgressView, WinCard } from './ProgressView';
import { HistoryList, RoutineBlocks, RoutinePlayer } from './RoutineView';
import { CapTag, Enter, Icon, Skeleton, TabBar, TabDef, TopHeader, useToast } from './ui';

type Tab = 'hoy' | 'progreso' | 'historial' | 'perfil';

const TABS: TabDef<Tab>[] = [
  { id: 'hoy', label: 'Hoy', icon: Icon.routine },
  { id: 'progreso', label: 'Progreso', icon: Icon.progress },
  { id: 'historial', label: 'Historial', icon: Icon.history },
  { id: 'perfil', label: 'Perfil', icon: Icon.user },
];

/** Rutina asignada que el alumno todavía no terminó (la más próxima o atrasada). */
export function pendingSession(p: Profile): Session | undefined {
  const mine = (s: Session) => s.completions.find((c) => c.student_id === p.student.id);
  const pending = p.sessions.filter((s) => s.status === 'planned' && !mine(s)?.completed_at);
  const today = todayIso();
  return pending.filter((s) => s.date <= today).pop() ?? pending.find((s) => s.date > today);
}

/** Última sesión realizada (por el profe o terminada por el alumno). */
export function lastRealized(p: Profile): Session | undefined {
  return [...p.sessions].reverse().find((s) => s.status === 'done' || s.completions.some((c) => c.student_id === p.student.id && c.completed_at));
}

export function partnersOf(session: Session, selfId: string, names: Map<string, string>): string {
  return session.participant_ids.filter((id) => id !== selfId).map((id) => firstName(names.get(id) ?? '')).filter(Boolean).join(' y ');
}

export function NextCard({ next, you }: { next: Occurrence | undefined; you: boolean }) {
  if (!next) return null;
  return (
    <div className="next">
      <span className="ic" aria-hidden="true">{Icon.calendar}</span>
      <div>
        <span>{you ? 'Tu próxima sesión' : 'Próxima sesión'}</span>
        <b>{cap(whenLabel(next))}</b>
        {next.note && <span>{next.note}</span>}
      </div>
    </div>
  );
}

export default function StudentApp({ onLogout }: { onLogout: () => void }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('hoy');
  const [prog, setProg] = useState<{ done: number; total: number } | null>(null);
  const [toast, showToast] = useToast();

  const load = useCallback(() => {
    studentApi.me().then(setProfile).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  const onProgress = useCallback((done: number, total: number) => setProg({ done, total }), []);

  const go = (t: Tab) => {
    if (t === tab) window.scrollTo({ top: 0, behavior: 'smooth' });
    else { setTab(t); window.scrollTo(0, 0); }
  };

  const s = profile?.student;
  const pending = profile ? pendingSession(profile) : undefined;
  const last = profile ? lastRealized(profile) : undefined;
  const titles: Record<Tab, string> = { hoy: pending ? 'Tu rutina' : 'Hoy', progreso: 'Progreso', historial: 'Historial', perfil: 'Perfil' };
  const sub = !profile ? null
    : tab === 'hoy'
      ? pending
        ? <><span>Para el <b>{longDate(pending.date)}</b></span>{prog && <span><b>{prog.done}</b> de {prog.total}</span>}</>
        : <span>Hola, {firstName(profile.student.name)} 👋</span>
      : tab === 'progreso' ? <span>Tus avances, por capacidad</span>
      : tab === 'historial' ? <span>{profile.sessions.length} sesiones</span>
      : <span>Tu proceso de entrenamiento</span>;
  const below = tab === 'hoy' && pending && prog
    ? <div className={`pbar${prog.done === prog.total && prog.total ? ' full' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={prog.total} aria-valuenow={prog.done} aria-label="Ejercicios hechos"><i style={{ width: `${prog.total ? (prog.done / prog.total) * 100 : 0}%` }} /></div>
    : null;

  return (
    <div className="bt">
      <div className="bt-page">
        <div className="wrap">
          <TopHeader title={titles[tab]} sub={sub} below={below}
            right={s && <button className={`avatar${tab === 'perfil' ? ' on' : ''}`} onClick={() => go('perfil')} aria-label="Perfil">{initials(s.name)}</button>} />
          <main aria-live="polite">
            {error ? <p className="empty">No se pudo cargar tu información: {error}</p>
              : !profile ? <Skeleton />
              : (
                <Enter k={tab}>
                  {tab === 'hoy' && (pending
                    ? (
                      <RoutinePlayer key={pending.id} session={pending} studentId={profile.student.id} studentName={profile.student.name}
                        onProgress={onProgress} onDone={() => { setProg(null); load(); }} />
                    )
                    : <TodayIdle profile={profile} last={last} />)}
                  {tab === 'progreso' && <ProgressView progress={profile.progress} you />}
                  {tab === 'historial' && <HistoryList sessions={profile.sessions} viewer={firstName(profile.student.name)} studentId={profile.student.id} />}
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

function TodayIdle({ profile, last }: { profile: Profile; last: Session | undefined }) {
  const names = new Map(profile.partners.map((p) => [p.id, p.name]));
  const partner = last ? partnersOf(last, profile.student.id, names) : '';
  const own = last?.completions.find((c) => c.student_id === profile.student.id);
  return (
    <>
      <NextCard next={profile.next_sessions[0]} you />
      <div className="phase" style={{ marginTop: 12 }}>
        <span className="ph-tag">Al día</span>
        <div>Tu profe te asigna la próxima rutina y aparece acá para que la hagas y la tildes.</div>
      </div>
      {last && (
        <>
          <div className="card-h" style={{ marginTop: 20 }}>
            <h2>Tu última sesión</h2>
            <span className="mini">{relDays(last.date)}</span>
          </div>
          <p className="hint" style={{ marginTop: 2 }}>
            {cap(longDate(last.date))}{partner ? ` · con ${partner}` : ''}{own?.completed_at ? ' · terminada ✓' : ''}
          </p>
          <RoutineBlocks routine={last.routine} viewer={firstName(profile.student.name)} defaultOpen={null} />
        </>
      )}
    </>
  );
}

/** Hitos reales por cantidad de sesiones, cuando el profe no cargó etapas. */
function autoPhases(sessions: number, first: string | null): ProcessPhase[] {
  const marks = [10, 25, 50, 75, 100, 150, 200];
  const phases: ProcessPhase[] = [{ id: 'start', title: 'Arrancaste', description: first ? `El ${longDate(first)}.` : null, status: 'done' }];
  let next = false;
  for (const m of marks) {
    if (sessions >= m) phases.push({ id: `m${m}`, title: `${m} sesiones`, description: null, status: 'done' });
    else if (!next) {
      next = true;
      phases.push({ id: `m${m}`, title: `${m} sesiones`, description: `Te ${m - sessions === 1 ? 'falta 1' : `faltan ${m - sessions}`}.`, status: 'current' });
    }
  }
  return phases.slice(-5);
}

export function ProcessTimeline({ phases }: { phases: ProcessPhase[] }) {
  return (
    <ol className="tl">
      {phases.map((p, i) => (
        <li key={p.id} className={p.status}>
          <span className="dot" aria-hidden="true">{p.status === 'done' ? Icon.check : i + 1}</span>
          <div>
            <b>{p.title}</b>{p.status === 'current' && <span className="here">Estás acá</span>}
            {p.description && <p>{p.description}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function ProfileTab({ profile, onLogout, onSaved }: { profile: Profile; onLogout: () => void; onSaved: () => void }) {
  const s = profile.student;
  const { stats, highlights, capacities } = profile.progress;
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [rep, setRep] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const phases = useMemo(
    () => (s.process?.length ? s.process : autoPhases(stats.sessions, stats.first_date)),
    [s.process, stats.sessions, stats.first_date],
  );
  const partner = profile.partners[0] ? firstName(profile.partners[0].name) : null;
  const improvedTotal = capacities.reduce((a, c) => a + c.improved, 0);

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
            <p>{[s.age ? `${s.age} años` : null, partner ? `entrena con ${partner}` : null].filter(Boolean).join(' · ') || 'Tu espacio de entrenamiento'}</p>
          </div>
        </div>
        {stats.sessions > 0 && (
          <div className="mhero" style={{ marginTop: 18 }}>
            <div className="wk">Semana {stats.process_week}<small>de tu proceso · {stats.sessions} sesiones</small></div>
            <div className="side">
              <b>{Icon.flame}{stats.streak_weeks}</b>
              <small>{stats.streak_weeks === 1 ? 'semana seguida' : 'semanas seguidas'}</small>
            </div>
          </div>
        )}
        <NextCard next={profile.next_sessions[0]} you />
      </section>

      {s.goal && (
        <section className="card">
          <div className="label">Tu objetivo</div>
          <p style={{ margin: '6px 0 0', fontSize: 16, fontWeight: 500 }}>{s.goal}</p>
        </section>
      )}

      <section className="card">
        <h2>Tu proceso</h2>
        <div className="hint">{s.process?.length ? 'Las etapas que armó tu profe para vos.' : 'Tus hitos de constancia.'}</div>
        <ProcessTimeline phases={phases} />
      </section>

      {highlights.length > 0 && (
        <section className="card">
          <h2>Tus mejores avances</h2>
          <div className="hint">{improvedTotal} ejercicios mejoraron desde que empezaste.</div>
          <div className="wins">{highlights.slice(0, 3).map((h, i) => <WinCard key={h.key} h={h} i={i} />)}</div>
        </section>
      )}

      {capacities.length > 0 && (
        <section className="card">
          <h2>Tus capacidades</h2>
          <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
            {capacities.map((c) => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                <CapTag id={c.id} label={CAP_LABEL[c.id]} lg />
                <span style={{ fontFamily: 'var(--f-data)', fontSize: 12.5, color: 'var(--muted)', textAlign: 'right' }}>
                  {c.improved ? `${c.improved} ${c.improved === 1 ? 'mejoró' : 'mejoraron'}` : `${c.sessions} sesiones`}
                </span>
              </div>
            ))}
          </div>
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
