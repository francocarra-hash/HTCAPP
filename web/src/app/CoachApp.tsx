import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api';
import LegacyV2 from '../LegacyV2';
import V3App from '../v3/V3App';
import { api as v3api, DOMAIN_ES } from '../v3/shared';
import { AssessmentSummary } from '../v3/types';
import {
  coachApi, daysSince, firstName, initials, longDate, PreviewSession, Profile, relDays, Session, sessionSummary,
  SEX_LABEL, Sex, shortDate, Student, StudentListItem, todayIso,
} from './data';
import { ProgressView } from './ProgressView';
import { HistoryList, SessionCard, SessionCompact } from './SessionView';
import { RoutineView } from './StudentApp';
import { Enter, Icon, Seg, Sheet, Skeleton, TabBar, TabDef, TopHeader, useToast } from './ui';

type Tab = 'alumnos' | 'cargar' | 'evaluaciones';
type DetailTab = 'rutina' | 'progreso' | 'historial' | 'datos';

const TABS: TabDef<Tab>[] = [
  { id: 'alumnos', label: 'Alumnos', icon: Icon.users },
  { id: 'cargar', label: 'Cargar', icon: Icon.add },
  { id: 'evaluaciones', label: 'Evaluaciones', icon: Icon.eval },
];

interface EvalCtx { key: number; studentId?: string; prefill?: { key: number; name: string; age: number | null; sex: Sex | null }; openId?: { key: number; id: string } }

export default function CoachApp({ onLogout, authEnabled }: { onLogout: () => void; authEnabled: boolean }) {
  const [tab, setTab] = useState<Tab>('alumnos');
  const [students, setStudents] = useState<StudentListItem[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loadFor, setLoadFor] = useState<{ key: number; ids: string[] } | null>(null);
  const [evalCtx, setEvalCtx] = useState<EvalCtx | null>(null);
  const [legacy, setLegacy] = useState(false);
  const [menu, setMenu] = useState(false);
  const [toast, showToast] = useToast();

  const refresh = useCallback(() => {
    coachApi.students().then((r) => { setStudents(r.students); setListError(null); }).catch((e: Error) => setListError(e.message));
  }, []);
  useEffect(refresh, [refresh]);

  const go = (t: Tab) => {
    if (t === tab) {
      if (t === 'alumnos') setSelected(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setTab(t);
    window.scrollTo(0, 0);
  };
  const openStudent = (id: string) => { setSelected(id); setTab('alumnos'); window.scrollTo(0, 0); };

  const avatar = (
    <button className={`avatar${menu ? ' on' : ''}`} onClick={() => setMenu(true)} aria-label="Cuenta del profe">PR</button>
  );

  const onAssessed = async (assessmentId: string) => {
    if (!evalCtx?.studentId) return;
    try {
      await coachApi.linkAssessment(evalCtx.studentId, assessmentId);
      const s = students?.find((x) => x.id === evalCtx.studentId);
      showToast(`Evaluación guardada en el perfil de ${s ? firstName(s.name) : 'el alumno'}`);
    } catch {
      showToast('La evaluación se guardó, pero no se pudo vincular al alumno');
    }
  };

  return (
    <>
      {tab !== 'evaluaciones' ? (
        <div className="bt">
          <div className="bt-page">
            <div className="wrap">
              {tab === 'alumnos' && (selected
                ? (
                  <StudentDetail
                    key={selected}
                    id={selected}
                    all={students ?? []}
                    avatar={avatar}
                    toast={showToast}
                    onBack={() => { setSelected(null); refresh(); window.scrollTo(0, 0); }}
                    onDeleted={() => { setSelected(null); refresh(); showToast('Alumno eliminado'); }}
                    onChanged={refresh}
                    onLoad={(ids) => { setLoadFor({ key: Date.now(), ids }); setTab('cargar'); window.scrollTo(0, 0); }}
                    onEvaluate={(s) => {
                      setEvalCtx({ key: Date.now(), studentId: s.id, prefill: { key: Date.now(), name: s.name, age: s.age, sex: s.sex } });
                      setLegacy(false);
                      setTab('evaluaciones');
                    }}
                    onOpenAssessment={(sid, aid) => {
                      setEvalCtx({ key: Date.now(), studentId: sid, openId: { key: Date.now(), id: aid } });
                      setLegacy(false);
                      setTab('evaluaciones');
                    }}
                  />
                )
                : <StudentList students={students} error={listError} avatar={avatar} onOpen={openStudent} onCreated={(id) => { refresh(); openStudent(id); }} toast={showToast} />
              )}
              {tab === 'cargar' && (
                <LoadSessions
                  key={loadFor?.key ?? 0}
                  students={students ?? []}
                  initialIds={loadFor?.ids ?? []}
                  avatar={avatar}
                  onSaved={(ids, n) => {
                    refresh();
                    showToast(`${n} ${n === 1 ? 'sesión cargada' : 'sesiones cargadas'}`);
                    setLoadFor(null);
                    if (ids.length === 1) openStudent(ids[0]!);
                    else { setSelected(null); setTab('alumnos'); }
                  }}
                />
              )}
            </div>
          </div>
          <TabBar tabs={TABS} current={tab} onChange={go} />
          {toast}
        </div>
      ) : (
        <>
          <div className="bt bt-page" style={{ position: 'sticky', top: 0, zIndex: 6, paddingBottom: 0, background: 'var(--bg)' }}>
            <div className="wrap" style={{ maxWidth: 1152 }}>
              <TopHeader
                title={legacy ? 'Modelo v2' : 'Evaluaciones'}
                sub={
                  <>
                    <span>{legacy ? 'Histórico, sólo consulta' : 'HTC OS v3.0 · Health Gates → Clasificación → Movement → Roadmap'}</span>
                    <button className="btn ghost" style={{ minHeight: 24, padding: 0, fontSize: 13 }} onClick={() => setLegacy(!legacy)}>
                      {legacy ? 'Volver a OS v3.0' : 'Ver modelo v2 (histórico)'}
                    </button>
                  </>
                }
                right={avatar}
              />
            </div>
          </div>
          <div className="mx-auto max-w-6xl px-4 pb-28 pt-2 sm:px-6">
            {legacy ? <LegacyV2 /> : (
              <V3App
                key={evalCtx?.key ?? 0}
                embedded
                prefill={evalCtx?.prefill}
                openId={evalCtx?.openId}
                onAssessed={onAssessed}
              />
            )}
          </div>
          <div className="bt">
            <TabBar tabs={TABS} current={tab} onChange={go} />
            {toast}
          </div>
        </>
      )}
      {menu && (
        <Sheet title="Cuenta" onClose={() => setMenu(false)}>
          <p className="hint" style={{ margin: 0 }}>
            {authEnabled ? 'Estás adentro como profe: ves y editás todos los perfiles.' : 'Modo local sin contraseña (sólo desarrollo).'}
          </p>
          {authEnabled && (
            <button className="btn wide" onClick={() => { setMenu(false); onLogout(); }}>{Icon.logout} Cerrar sesión</button>
          )}
        </Sheet>
      )}
    </>
  );
}

// ── lista de alumnos ────────────────────────────────────────────────────────

function StudentList({ students, error, avatar, onOpen, onCreated, toast }: {
  students: StudentListItem[] | null; error: string | null; avatar: ReactNode;
  onOpen: (id: string) => void; onCreated: (id: string) => void; toast: (m: string) => void;
}) {
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [creds, setCreds] = useState<{ student: Student; password: string } | null>(null);
  const total = students?.reduce((a, s) => a + s.sessions_count, 0) ?? 0;
  const shown = (students ?? []).filter((s) => !q || s.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <TopHeader
        title="Alumnos"
        sub={students && <><span><b>{students.length}</b> {students.length === 1 ? 'alumno' : 'alumnos'}</span><span><b>{total}</b> sesiones</span></>}
        right={avatar}
      />
      {error ? <p className="empty">No se pudo cargar la lista: {error}</p> : !students ? <Skeleton /> : (
        <Enter>
          <div className="actions" style={{ marginTop: 4 }}>
            <button className="btn primary wide" onClick={() => setCreating(true)}>{Icon.add} Nuevo alumno</button>
          </div>
          {students.length > 5 && (
            <input className="search" type="search" placeholder="Buscar alumno…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar alumno" style={{ marginTop: 12 }} />
          )}
          {!students.length ? (
            <p className="empty">Todavía no hay alumnos. Creá el primero y después cargale sus sesiones.</p>
          ) : (
            <div>
              {shown.map((s) => {
                const d = daysSince(s.last_date);
                const line = [s.age ? `${s.age} años` : null, s.partners.length ? `con ${s.partners.map(firstName).join(' y ')}` : null, s.goal]
                  .filter(Boolean).join(' · ');
                return (
                  <button key={s.id} className="stu" onClick={() => onOpen(s.id)}>
                    <span className="avatar" aria-hidden="true">{initials(s.name)}</span>
                    <span style={{ minWidth: 0, display: 'grid', gap: 3 }}>
                      <span className="stu-name">{s.name}</span>
                      <span className="stu-line">{line || `@${s.username}`}</span>
                    </span>
                    <span className="stu-r">
                      <b>{s.sessions_count}</b>
                      <span className={`pill${d === null ? '' : d <= 10 ? ' ok' : d > 21 ? ' low' : ''}`}>{relDays(s.last_date)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Enter>
      )}
      {creating && (
        <StudentFormSheet
          onClose={() => setCreating(false)}
          onSaved={(r) => { setCreating(false); if (r.password) setCreds({ student: r.student, password: r.password }); else onCreated(r.student.id); }}
        />
      )}
      {creds && (
        <CredentialsSheet student={creds.student} password={creds.password} toast={toast}
          onClose={() => { const id = creds.student.id; setCreds(null); onCreated(id); }} />
      )}
    </>
  );
}

// ── alta / edición de datos ─────────────────────────────────────────────────

function StudentForm({ initial, onSubmit, busy, submitLabel, err }: {
  initial?: Student; busy: boolean; submitLabel: string; err: string;
  onSubmit: (v: { name: string; username?: string; age: number | null; sex: Sex | null; goal: string | null; notes: string | null }) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [username, setUsername] = useState(initial?.username ?? '');
  const [age, setAge] = useState(initial?.age ? String(initial.age) : '');
  const [sex, setSex] = useState<Sex | ''>(initial?.sex ?? '');
  const [goal, setGoal] = useState(initial?.goal ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      onSubmit({
        name: name.trim(),
        ...(initial || username.trim() ? { username: username.trim().toLowerCase() } : {}),
        age: age ? Number(age) : null, sex: sex || null, goal: goal.trim() || null, notes: notes.trim() || null,
      });
    }}>
      <div className="fields" style={{ marginTop: 0 }}>
        <div className="field full">
          <label htmlFor="f-name">Nombre</label>
          <input id="f-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Ceci" required autoFocus={!initial} />
        </div>
        <div className="field">
          <label htmlFor="f-user">Usuario</label>
          <input id="f-user" value={username} onChange={(e) => setUsername(e.target.value)} placeholder={initial ? '' : 'automático'} autoCapitalize="none" autoCorrect="off" />
          <small>Con este entra el alumno.</small>
        </div>
        <div className="field">
          <label htmlFor="f-age">Edad</label>
          <input id="f-age" type="number" inputMode="numeric" min={5} max={110} value={age} onChange={(e) => setAge(e.target.value)} />
        </div>
        <div className="field full">
          <span className="lab">Sexo (para las bandas de las evaluaciones)</span>
          <Seg small value={sex || 'NONE'} onChange={(v) => setSex(v === 'NONE' ? '' : v)}
            options={[['FEMALE', SEX_LABEL.FEMALE], ['MALE', SEX_LABEL.MALE], ['NONE', 'Sin cargar']]} />
        </div>
        <div className="field full">
          <label htmlFor="f-goal">Objetivo</label>
          <textarea id="f-goal" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Lo ve el alumno en su perfil." />
        </div>
        <div className="field full">
          <label htmlFor="f-notes">Notas privadas</label>
          <textarea id="f-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Lesiones, contexto… El alumno no las ve." />
        </div>
      </div>
      {err && <p className="err">{err}</p>}
      <div className="actions">
        <button className="btn primary wide" type="submit" disabled={busy || !name.trim()}>{busy ? 'Guardando…' : submitLabel}</button>
      </div>
    </form>
  );
}

function StudentFormSheet({ onClose, onSaved }: { onClose: () => void; onSaved: (r: { student: Student; password?: string }) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <Sheet title="Nuevo alumno" onClose={onClose}>
      <StudentForm busy={busy} err={err} submitLabel="Crear alumno" onSubmit={async (v) => {
        setBusy(true); setErr('');
        try { onSaved(await coachApi.createStudent(v)); } catch (e) { setErr((e as ApiError).message); } finally { setBusy(false); }
      }} />
    </Sheet>
  );
}

function CredentialsSheet({ student, password, toast, onClose }: { student: Student; password: string; toast: (m: string) => void; onClose: () => void }) {
  const text = `Hola ${firstName(student.name)}! Este es tu acceso a la app de entrenamiento:\n${window.location.origin}\nUsuario: ${student.username}\nContraseña: ${password}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); toast('Datos de acceso copiados'); } catch { toast('No se pudo copiar: anotalos a mano'); }
  };
  const share = async () => {
    try { await navigator.share({ text }); } catch { /* cancelado */ }
  };
  return (
    <Sheet title="Acceso del alumno" onClose={onClose}>
      <p className="hint" style={{ margin: 0 }}>
        Pasale estos datos a {firstName(student.name)}. La contraseña se muestra sólo ahora; si se pierde, generás una nueva desde su perfil.
      </p>
      <div className="creds">
        <span>Link</span><div>{window.location.origin}</div>
        <span>Usuario</span><div>{student.username}</div>
        <span>Contraseña</span><div>{password}</div>
      </div>
      <div className="actions" style={{ marginTop: 0 }}>
        <button className="btn primary" onClick={copy}>{Icon.copy} Copiar mensaje</button>
        {typeof navigator.share === 'function' && <button className="btn" onClick={share}>{Icon.share} Compartir</button>}
      </div>
      <button className="btn wide" onClick={onClose}>Listo</button>
    </Sheet>
  );
}

// ── perfil del alumno (vista del coach) ─────────────────────────────────────

function StudentDetail({ id, all, avatar, toast, onBack, onDeleted, onChanged, onLoad, onEvaluate, onOpenAssessment }: {
  id: string; all: StudentListItem[]; avatar: ReactNode; toast: (m: string) => void;
  onBack: () => void; onDeleted: () => void; onChanged: () => void; onLoad: (ids: string[]) => void;
  onEvaluate: (s: Student) => void; onOpenAssessment: (studentId: string, assessmentId: string) => void;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<DetailTab>('rutina');
  const [editing, setEditing] = useState<Session | null>(null);

  const load = useCallback(() => {
    coachApi.student(id).then(setProfile).catch((e: Error) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  const names = useMemo(() => new Map(all.map((s) => [s.id, s.name])), [all]);
  const s = profile?.student;
  const last = profile?.sessions[profile.sessions.length - 1];

  const remove = async (sess: Session) => {
    if (!window.confirm(`¿Borrar la sesión del ${longDate(sess.date)}?${sess.participant_ids.length > 1 ? ' Se borra para todos los que la compartían.' : ''}`)) return;
    await coachApi.deleteSession(sess.id);
    toast('Sesión borrada');
    load(); onChanged();
  };

  return (
    <>
      <TopHeader
        title={s ? s.name : 'Alumno'}
        onBack={onBack}
        sub={s && profile && (
          <>
            <span>@{s.username}</span>
            <span><b>{profile.sessions.length}</b> sesiones</span>
            {last && <span>última {relDays(last.date)}</span>}
          </>
        )}
        right={avatar}
      />
      {error ? <p className="empty">No se pudo cargar: {error}</p> : !profile || !s ? <Skeleton /> : (
        <>
          <Seg value={tab} onChange={(t) => setTab(t)}
            options={[['rutina', 'Rutina'], ['progreso', 'Progreso'], ['historial', 'Historial'], ['datos', 'Datos']]} />
          <Enter k={tab}>
            {tab === 'rutina' && (
              <>
                <RoutineView profile={profile} viewer={undefined} />
                <div className="actions" style={{ marginTop: 16 }}>
                  <button className="btn primary wide" onClick={() => onLoad([s.id, ...(last?.participant_ids.filter((p) => p !== s.id) ?? [])])}>
                    {Icon.add} Cargar sesión{last && last.participant_ids.length > 1 ? ` (con ${last.participant_ids.filter((p) => p !== s.id).map((p) => firstName(names.get(p) ?? '')).join(' y ')})` : ''}
                  </button>
                </div>
              </>
            )}
            {tab === 'progreso' && <ProgressView progress={profile.progress} you={false} />}
            {tab === 'historial' && (
              <>
                {profile.sessions.some((x) => x.date_note) && (
                  <div className="phase warn">
                    <span className="ph-tag">Revisar</span>
                    <div>Hay {profile.sessions.filter((x) => x.date_note).length} fechas que estaban fuera de orden y se corrigieron solas. Abrí cada una (⚠) y confirmalas o editalas.</div>
                  </div>
                )}
                <HistoryList sessions={profile.sessions} viewer={undefined} names={names} onEdit={setEditing} onDelete={remove} />
              </>
            )}
            {tab === 'datos' && (
              <DataTab profile={profile} toast={toast} onEvaluate={() => onEvaluate(s)}
                onOpenAssessment={(aid) => onOpenAssessment(s.id, aid)}
                onSaved={(st) => { setProfile({ ...profile, student: st }); onChanged(); }}
                onDeleted={onDeleted} reload={load} />
            )}
          </Enter>
        </>
      )}
      {editing && (
        <EditSessionSheet session={editing} all={all} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); toast('Sesión actualizada'); load(); onChanged(); }} />
      )}
    </>
  );
}

function DataTab({ profile, toast, onEvaluate, onOpenAssessment, onSaved, onDeleted, reload }: {
  profile: Profile; toast: (m: string) => void; onEvaluate: () => void; onOpenAssessment: (id: string) => void;
  onSaved: (s: Student) => void; onDeleted: () => void; reload: () => void;
}) {
  const s = profile.student;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [creds, setCreds] = useState<string | null>(null);
  const [assessments, setAssessments] = useState<AssessmentSummary[] | null>(null);
  const [linkPick, setLinkPick] = useState('');
  const linked = new Set(profile.assessment_ids ?? []);

  useEffect(() => {
    v3api<{ assessments: AssessmentSummary[] }>('/assessments').then((r) => setAssessments(r.assessments)).catch(() => setAssessments([]));
  }, []);

  const mine = (assessments ?? []).filter((a) => linked.has(a.assessment_id));
  const others = (assessments ?? []).filter((a) => !linked.has(a.assessment_id));

  const resetPw = async () => {
    if (!window.confirm(`¿Generar una contraseña nueva para ${firstName(s.name)}? La anterior deja de funcionar.`)) return;
    const r = await coachApi.resetPassword(s.id);
    setCreds(r.password);
  };
  const del = async () => {
    if (!window.confirm(`¿Eliminar a ${s.name}? Se borran su acceso y las sesiones que no compartió con nadie. No se puede deshacer.`)) return;
    await coachApi.deleteStudent(s.id);
    onDeleted();
  };
  const link = async (aid: string) => {
    await coachApi.linkAssessment(s.id, aid);
    setLinkPick('');
    toast('Evaluación vinculada');
    reload();
  };
  const unlink = async (aid: string) => {
    await coachApi.unlinkAssessment(s.id, aid);
    reload();
  };

  return (
    <>
      <section className="card">
        <div className="hero">
          <div className="avatar-lg" aria-hidden="true">{initials(s.name)}</div>
          <div style={{ minWidth: 0 }}>
            <h2>{s.name}</h2>
            <p>{[s.age ? `${s.age} años` : null, s.sex ? SEX_LABEL[s.sex] : null, profile.partners[0] ? `entrena con ${firstName(profile.partners[0].name)}` : null].filter(Boolean).join(' · ') || 'Sin datos cargados'}</p>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Evaluaciones HTC</h2>
        <div className="hint">Evaluaciones del sistema OS v3.0 guardadas en este perfil.</div>
        {!assessments ? <div className="skel"><i style={{ height: 52 }} /></div> : (
          <>
            {mine.length ? (
              <div style={{ marginTop: 6 }}>
                {mine.map((a) => (
                  <div key={a.assessment_id} className="sess" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <button className="btn ghost" style={{ paddingLeft: 0, textAlign: 'left', display: 'grid', justifyItems: 'start' }} onClick={() => onOpenAssessment(a.assessment_id)}>
                      <span style={{ fontFamily: 'var(--f-display)', fontSize: 18, color: 'var(--ink)' }}>{shortDate(a.timestamp.slice(0, 10))}</span>
                      <span style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 500 }}>
                        {a.health_status === 'BLOCKED' ? 'Bloqueada por health gates' : a.p1_domain ? `P1: ${DOMAIN_ES[a.p1_domain]}` : 'Sin P1'}
                        {a.coach_confirmed === true ? ' · confirmada' : a.coach_confirmed === false ? ' · con override' : ' · pendiente'}
                      </span>
                    </button>
                    <button className="btn ghost" style={{ color: 'var(--muted)' }} onClick={() => unlink(a.assessment_id)}>Quitar</button>
                  </div>
                ))}
              </div>
            ) : <p className="hint">Todavía no tiene evaluaciones.</p>}
            <div className="actions">
              <button className="btn primary" onClick={onEvaluate}>{Icon.eval} Nueva evaluación</button>
            </div>
            {others.length > 0 && (
              <div className="field" style={{ marginTop: 12 }}>
                <label htmlFor="link-pick">Vincular una evaluación existente</label>
                <select id="link-pick" value={linkPick} onChange={(e) => { setLinkPick(e.target.value); if (e.target.value) void link(e.target.value); }}>
                  <option value="">Elegir…</option>
                  {others.map((a) => (
                    <option key={a.assessment_id} value={a.assessment_id}>{a.client_name} · {shortDate(a.timestamp.slice(0, 10))}</option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}
      </section>

      <section className="card">
        <h2>Datos</h2>
        <div style={{ marginTop: 14 }}>
          <StudentForm initial={s} busy={busy} err={err} submitLabel="Guardar cambios" onSubmit={async (v) => {
            setBusy(true); setErr('');
            try { const r = await coachApi.updateStudent(s.id, v); onSaved(r.student); toast('Datos guardados'); }
            catch (e) { setErr((e as ApiError).message); } finally { setBusy(false); }
          }} />
        </div>
      </section>

      <section className="card">
        <h2>Acceso</h2>
        <div className="hint">Entra con el usuario <b style={{ fontFamily: 'var(--f-data)' }}>{s.username}</b>. Si se olvidó la contraseña, generale una nueva.</div>
        <div className="actions">
          <button className="btn" onClick={resetPw}>{Icon.key} Generar contraseña nueva</button>
        </div>
      </section>

      <div className="actions" style={{ marginTop: 20 }}>
        <button className="btn danger wide" onClick={del}>{Icon.trash} Eliminar alumno</button>
      </div>

      {creds && <CredentialsSheet student={s} password={creds} toast={toast} onClose={() => setCreds(null)} />}
    </>
  );
}

// ── cargar sesiones ─────────────────────────────────────────────────────────

const PLACEHOLDER = `16/10/2026
Cat/Cow - Spinal Bridge - Hip CARs - RDL SL
[Rotational Plank 45s/ Crawling 1min - Copenhagen 30s+10r - Wall sit 2min] x2
A1 - Skater sq 12 + CMJ 3
A2 - Swimmers 15 + Push ups 20/25/30
x3`;

function LoadSessions({ students, initialIds, avatar, onSaved }: {
  students: StudentListItem[]; initialIds: string[]; avatar: ReactNode; onSaved: (ids: string[], n: number) => void;
}) {
  const [ids, setIds] = useState<string[]>(initialIds);
  const [date, setDate] = useState(todayIso());
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<{ sessions: PreviewSession[]; warnings: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const names = useMemo(() => new Map(students.map((s) => [s.id, s.name])), [students]);

  const toggle = (id: string) => { setIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id])); setPreview(null); };
  const run = async (save: boolean) => {
    setBusy(true); setErr('');
    try {
      if (save) {
        const r = await coachApi.saveSessions(text, ids, date);
        onSaved(ids, r.sessions.length);
      } else {
        setPreview(await coachApi.preview(text, ids, date));
        window.setTimeout(() => document.getElementById('preview')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
      }
    } catch (e) {
      setErr((e as ApiError).message);
    } finally { setBusy(false); }
  };

  return (
    <>
      <TopHeader title="Cargar" sub={<span>Pegá una o varias sesiones con tu formato de siempre</span>} right={avatar} />
      <Enter>
        <section className="card" style={{ marginTop: 4 }}>
          <h2>¿Quiénes entrenaron?</h2>
          <div className="hint">Si entrenan juntos, elegí a los dos: la sesión queda en ambos perfiles.</div>
          {students.length ? (
            <div className="chipset" style={{ marginTop: 12 }}>
              {students.map((s) => (
                <button key={s.id} className="tog" aria-pressed={ids.includes(s.id)} onClick={() => toggle(s.id)}>{s.name}</button>
              ))}
            </div>
          ) : <p className="hint">Primero creá un alumno en la pestaña Alumnos.</p>}
        </section>

        <section className="card">
          <div className="fields" style={{ marginTop: 0 }}>
            <div className="field full">
              <label htmlFor="ld-text">Sesiones</label>
              <textarea id="ld-text" className="mono" value={text} placeholder={PLACEHOLDER} spellCheck={false}
                onChange={(e) => { setText(e.target.value); setPreview(null); }} />
              <small>
                Cada sesión arranca con su fecha (13/2/2026). Si una sesión es sólo de uno, poné el nombre al lado: <b>26/6/2026 - Carlos</b>.
                Variantes personales dentro de la sesión: <b>push ups 25/30/30/ ceci 15 inclined</b>.
              </small>
            </div>
            <div className="field">
              <label htmlFor="ld-date">Fecha si el texto no la trae</label>
              <input id="ld-date" type="date" value={date} onChange={(e) => { setDate(e.target.value); setPreview(null); }} />
            </div>
          </div>
          {err && <p className="err">{err}</p>}
          <div className="actions">
            <button className="btn primary wide" disabled={busy || !ids.length || !text.trim()} onClick={() => run(false)}>
              {busy && !preview ? 'Leyendo…' : 'Vista previa'}
            </button>
          </div>
        </section>

        {preview && (
          <section id="preview" style={{ scrollMarginTop: 90 }}>
            <div className="card">
              <div className="card-h">
                <h2>{preview.sessions.length} {preview.sessions.length === 1 ? 'sesión' : 'sesiones'}</h2>
                <span className="mini">{preview.sessions.filter((x) => x.date_note).length} fechas a revisar</span>
              </div>
              {preview.warnings.map((w, i) => <p key={i} className="flag" style={{ marginBottom: 0 }}>⚠ {w}</p>)}
              <div style={{ marginTop: 8 }}>
                {preview.sessions.map((p, i) => (
                  <details className="sess" key={i}>
                    <summary>
                      <span className="st">{p.title ?? longDate(p.date)}</span>
                      <span className="sd">{shortDate(p.date)}</span>
                      <span className="sm">
                        {sessionSummary(p.parsed)} · {p.participant_ids.map((x) => firstName(names.get(x) ?? '')).join(' y ')}
                        {p.date_note && <><br /><span className="flag">⚠ {p.date_note}</span></>}
                      </span>
                    </summary>
                    <div className="sbody"><SessionCompact parsed={p.parsed} viewer={undefined} /></div>
                  </details>
                ))}
              </div>
            </div>
            {preview.sessions.length === 1 && (
              <SessionCard session={preview.sessions[0]!} viewer={undefined} />
            )}
            <div className="actions" style={{ marginTop: 16 }}>
              <button className="btn primary wide" disabled={busy || !preview.sessions.length} onClick={() => run(true)}>
                {busy ? 'Guardando…' : `Guardar ${preview.sessions.length} ${preview.sessions.length === 1 ? 'sesión' : 'sesiones'}`}
              </button>
            </div>
          </section>
        )}
      </Enter>
    </>
  );
}

function EditSessionSheet({ session, all, onClose, onSaved }: { session: Session; all: StudentListItem[]; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(session.date);
  const [title, setTitle] = useState(session.title ?? '');
  const [body, setBody] = useState(session.body);
  const [ids, setIds] = useState<string[]>(session.participant_ids);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    setBusy(true); setErr('');
    try {
      await coachApi.updateSession(session.id, {
        ...(date !== session.date || session.date_note ? { date } : {}),
        title: title.trim() || null, body, participant_ids: ids,
      });
      onSaved();
    } catch (e) { setErr((e as ApiError).message); } finally { setBusy(false); }
  };
  return (
    <Sheet title="Editar sesión" onClose={onClose}>
      {session.date_note && <div className="phase warn" style={{ marginTop: 0 }}><span className="ph-tag">Fecha</span><div>{session.date_note} Al guardar, queda confirmada.</div></div>}
      <div className="fields" style={{ marginTop: 0 }}>
        <div className="field">
          <label htmlFor="es-date">Fecha</label>
          <input id="es-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="es-title">Título (opcional)</label>
          <input id="es-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Hombros" />
        </div>
        <div className="field full">
          <span className="lab">Quiénes</span>
          <div className="chipset">
            {all.map((s) => (
              <button key={s.id} type="button" className="tog" aria-pressed={ids.includes(s.id)}
                onClick={() => setIds((p) => (p.includes(s.id) ? p.filter((x) => x !== s.id) : [...p, s.id]))}>{s.name}</button>
            ))}
          </div>
        </div>
        <div className="field full">
          <label htmlFor="es-body">Sesión</label>
          <textarea id="es-body" className="mono" value={body} onChange={(e) => setBody(e.target.value)} spellCheck={false} />
        </div>
      </div>
      {err && <p className="err">{err}</p>}
      <button className="btn primary wide" disabled={busy || !ids.length || !body.trim()} onClick={save}>{busy ? 'Guardando…' : 'Guardar'}</button>
    </Sheet>
  );
}
