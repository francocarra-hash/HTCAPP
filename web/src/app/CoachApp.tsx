import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api';
import LegacyV2 from '../LegacyV2';
import V3App from '../v3/V3App';
import { api as v3api, DOMAIN_ES } from '../v3/shared';
import { AssessmentSummary } from '../v3/types';
import {
  ActivityItem, coachApi, daysSince, FinanceData, Mark, firstName, initials, localDateOf, longDate, ProcessPhase, Profile, relDays, Session,
  SEX_LABEL, Sex, shortDate, Student, StudentListItem, timeAgo, todayIso, uid, whenLabel, cap,
} from './data';
import { AgendaEditor } from './Agenda';
import { FinanzasView, HoyView, StudentPayments, usePayPill } from './Finance';
import { makeFin } from './billing';
import { ReportsPanel } from './Report';
import { ExerciseLibrary, useLibrary } from './ExerciseLibrary';
import { PlanSession } from './Plan';
import { ProgressView } from './ProgressView';
import { HistoryList, RoutineBlocks } from './RoutineView';
import { lastRealized, NextCard, ProcessTimeline } from './StudentApp';
import { Enter, Icon, Seg, Sheet, Skeleton, TabBar, TabDef, TopHeader, useToast } from './ui';

type Tab = 'hoy' | 'alumnos' | 'planificar' | 'finanzas' | 'mas' | 'ejercicios' | 'evaluaciones';
type BarTab = 'hoy' | 'alumnos' | 'planificar' | 'finanzas' | 'mas';
type DetailTab = 'rutina' | 'progreso' | 'historial' | 'informes' | 'agenda' | 'pagos' | 'datos';

const TABS: TabDef<BarTab>[] = [
  { id: 'hoy', label: 'Hoy', icon: Icon.calendar },
  { id: 'alumnos', label: 'Alumnos', icon: Icon.users },
  { id: 'planificar', label: 'Planificar', icon: Icon.add },
  { id: 'finanzas', label: 'Finanzas', icon: Icon.money },
  { id: 'mas', label: 'Más', icon: Icon.menu },
];
const barTab = (t: Tab): BarTab => (t === 'ejercicios' || t === 'evaluaciones' ? 'mas' : t);

interface EvalCtx { key: number; studentId?: string; prefill?: { key: number; name: string; age: number | null; sex: Sex | null }; openId?: { key: number; id: string } }
interface PlanCtx { key: number; ids: string[]; editing: Session | null; back?: string }

const FEEL_LABEL = ['', 'muy duro', 'duro', 'bien', 'muy bien', 'genial'];

export default function CoachApp({ onLogout, authEnabled }: { onLogout: () => void; authEnabled: boolean }) {
  const [tab, setTab] = useState<Tab>('hoy');
  const [detailTab, setDetailTab] = useState<{ key: number; tab: DetailTab }>({ key: 0, tab: 'rutina' });
  const [finData, setFinData] = useState<FinanceData | null>(null);
  const fin = useMemo(() => (finData ? makeFin(finData) : null), [finData]);
  const [students, setStudents] = useState<StudentListItem[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanCtx>({ key: 0, ids: [], editing: null });
  const [evalCtx, setEvalCtx] = useState<EvalCtx | null>(null);
  const [legacy, setLegacy] = useState(false);
  const [menu, setMenu] = useState(false);
  const [activity, setActivity] = useState<{ items: ActivityItem[]; unseen: number } | null>(null);
  const [showActivity, setShowActivity] = useState(false);
  const [library, reloadLibrary] = useLibrary();
  const [toast, showToast] = useToast();

  const loadFin = useCallback(() => { coachApi.finance().then(setFinData).catch(() => undefined); }, []);
  const refresh = useCallback(() => {
    coachApi.students().then((r) => { setStudents(r.students); setListError(null); }).catch((e: Error) => setListError(e.message));
    loadFin();
  }, [loadFin]);
  useEffect(refresh, [refresh]);

  // Asistencia: se marca al instante y se guarda de fondo.
  const onAttendance = useCallback((ids: string[], day: string, mark: Mark | null) => {
    setFinData((d) => d && {
      ...d,
      attendance: [
        ...d.attendance.filter((a) => !(a.day === day && ids.includes(a.student_id))),
        ...(mark ? ids.map((student_id) => ({ student_id, day, mark })) : []),
      ],
    });
    coachApi.setAttendance(ids, day, mark).catch(() => { showToast('No se pudo guardar la asistencia'); loadFin(); });
  }, [loadFin]); // eslint-disable-line react-hooks/exhaustive-deps

  // Actividad de los alumnos (sesiones terminadas): se consulta cada minuto y al volver a la app.
  const loadActivity = useCallback(() => { coachApi.activity().then(setActivity).catch(() => undefined); }, []);
  useEffect(() => {
    loadActivity();
    const t = window.setInterval(loadActivity, 60_000);
    window.addEventListener('focus', loadActivity);
    return () => { window.clearInterval(t); window.removeEventListener('focus', loadActivity); };
  }, [loadActivity]);

  const go = (t: Tab) => {
    if (t === 'mas' && (tab === 'ejercicios' || tab === 'evaluaciones')) { setTab('mas'); return; }
    if (t === tab) {
      if (t === 'alumnos') setSelected(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (t === 'planificar' && !plan.editing && !plan.ids.length && selected) setPlan({ key: Date.now(), ids: [selected], editing: null });
    setTab(t);
    window.scrollTo(0, 0);
  };
  const openStudent = (id: string, dt: DetailTab = 'rutina') => {
    setSelected(id); setDetailTab({ key: Date.now(), tab: dt }); setTab('alumnos'); window.scrollTo(0, 0);
  };
  const startPlan = (ids: string[], editing: Session | null = null) => {
    setPlan({ key: Date.now(), ids, editing, back: selected ?? undefined });
    setTab('planificar');
    window.scrollTo(0, 0);
  };

  const right = (
    <>
      <button className="avatar bell" onClick={() => setShowActivity(true)} aria-label={`Actividad${activity?.unseen ? `: ${activity.unseen} nuevas` : ''}`}>
        {Icon.bell}
        {activity && activity.unseen > 0 && <span className="count">{activity.unseen}</span>}
      </button>
      <button className={`avatar${menu ? ' on' : ''}`} onClick={() => setMenu(true)} aria-label="Cuenta del profe">PR</button>
    </>
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
            <div className={`wrap${tab === 'planificar' ? ' wide' : ''}`}>
              {tab === 'hoy' && (
                <HoyView fin={fin} right={right} onOpen={openStudent} onAttendance={onAttendance} reload={loadFin} toast={showToast} />
              )}
              {tab === 'finanzas' && <FinanzasView fin={fin} right={right} onOpen={openStudent} reload={loadFin} toast={showToast} />}
              {tab === 'mas' && (
                <>
                  <TopHeader title="Más" right={right} />
                  <Enter>
                    <button className="menuopt" onClick={() => go('ejercicios')}>
                      <span className="ic">{Icon.book}</span><span><b>Ejercicios</b><small>Biblioteca con la capacidad de cada ejercicio</small></span>
                    </button>
                    <button className="menuopt" onClick={() => { setEvalCtx(null); setTab('evaluaciones'); }}>
                      <span className="ic">{Icon.eval}</span><span><b>Evaluaciones</b><small>HTC OS v3.0: health gates, clasificación y roadmap</small></span>
                    </button>
                    {authEnabled && (
                      <button className="menuopt" onClick={onLogout}>
                        <span className="ic">{Icon.logout}</span><span><b>Cerrar sesión</b><small>Salir de la cuenta del profe</small></span>
                      </button>
                    )}
                  </Enter>
                </>
              )}
              {tab === 'alumnos' && (selected
                ? (
                  <StudentDetail
                    key={`${selected}-${detailTab.key}`}
                    id={selected}
                    initialTab={detailTab.tab}
                    fin={fin}
                    reloadFin={loadFin}
                    all={students ?? []}
                    right={right}
                    toast={showToast}
                    onBack={() => { setSelected(null); refresh(); window.scrollTo(0, 0); }}
                    onDeleted={() => { setSelected(null); refresh(); showToast('Alumno eliminado'); }}
                    onChanged={refresh}
                    onPlan={startPlan}
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
                : <StudentList students={students} fin={fin} error={listError} right={right} onOpen={openStudent}
                    onCreated={(id) => { refresh(); openStudent(id); }} toast={showToast} />
              )}
              {tab === 'planificar' && (
                <PlanSession
                  key={plan.key}
                  students={students ?? []}
                  initialIds={plan.ids}
                  editing={plan.editing}
                  avatar={right}
                  library={library}
                  toast={showToast}
                  onCancel={plan.back ? () => openStudent(plan.back!) : undefined}
                  onSaved={(ids, msg) => {
                    refresh();
                    reloadLibrary();
                    showToast(msg);
                    setPlan({ key: Date.now(), ids: [], editing: null });
                    if (ids.length >= 1) openStudent(ids[0]!);
                  }}
                />
              )}
              {tab === 'ejercicios' && <ExerciseLibrary avatar={right} toast={(m) => { showToast(m); reloadLibrary(); }} />}
            </div>
          </div>
          <TabBar tabs={TABS} current={barTab(tab)} onChange={go} />
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
                right={right}
              />
            </div>
          </div>
          <div className="mx-auto max-w-6xl px-4 pb-28 pt-2 sm:px-6">
            {legacy ? <LegacyV2 /> : (
              <V3App key={evalCtx?.key ?? 0} embedded prefill={evalCtx?.prefill} openId={evalCtx?.openId} onAssessed={onAssessed} />
            )}
          </div>
          <div className="bt">
            <TabBar tabs={TABS} current={barTab(tab)} onChange={go} />
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
      {showActivity && (
        <ActivitySheet data={activity} onClose={() => setShowActivity(false)}
          onSeen={() => { coachApi.activitySeen().then(() => setActivity((a) => (a ? { ...a, unseen: 0 } : a))).catch(() => undefined); }}
          onOpen={(id) => { setShowActivity(false); openStudent(id); }} />
      )}
    </>
  );
}

// ── actividad ───────────────────────────────────────────────────────────────

function ActivitySheet({ data, onClose, onSeen, onOpen }: {
  data: { items: ActivityItem[]; unseen: number } | null; onClose: () => void; onSeen: () => void; onOpen: (studentId: string) => void;
}) {
  useEffect(() => { if (data?.unseen) onSeen(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Sheet title="Actividad" onClose={onClose}>
      <p className="hint" style={{ margin: 0 }}>Sesiones que terminaron tus alumnos, con lo que anotaron.</p>
      {!data ? <Skeleton /> : !data.items.length ? <p className="empty">Todavía nadie terminó una rutina asignada.</p> : (
        <div>
          {data.items.map((a) => (
            <div key={`${a.session_id}${a.student_id}`} className="act">
              <div className="act-h">
                <b>{!a.seen && <span className="new" aria-label="nuevo" />}{a.student_name} terminó su sesión</b>
                <span>{timeAgo(a.completed_at)}</span>
              </div>
              <div className="hint" style={{ margin: 0 }}>
                {a.session_title ? `${a.session_title} · ` : ''}{a.session_date ? cap(longDate(a.session_date)) : ''} · {a.checks} de {a.total} ejercicios
                {a.feeling ? ` · se sintió ${a.feeling}/5 (${FEEL_LABEL[a.feeling]})` : ''}
              </div>
              {a.comment && <div className="quote">“{a.comment}”</div>}
              {a.notes.map((n, i) => <div key={i} className="nt"><b>{n.item}:</b> {n.note}</div>)}
              <div><button className="btn ghost sm" style={{ paddingLeft: 0 }} onClick={() => onOpen(a.student_id)}>Ver perfil →</button></div>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}

// ── lista de alumnos ────────────────────────────────────────────────────────

type ListFilter = 'todos' | 'rehab' | 'asinc' | 'pausa' | 'baja';

function StudentList({ students, fin, error, right, onOpen, onCreated, toast }: {
  students: StudentListItem[] | null; fin: ReturnType<typeof makeFin> | null; error: string | null; right: ReactNode;
  onOpen: (id: string) => void; onCreated: (id: string) => void; toast: (m: string) => void;
}) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<ListFilter>('todos');
  const payPill = usePayPill(fin);
  const fs = (id: string) => fin?.students.find((x) => x.id === id);
  const matches = (s: StudentListItem) => {
    if (filter === 'todos' || !fin) return true;
    const x = fs(s.id);
    if (!x) return false;
    const est = fin.estado(x).estado;
    if (filter === 'rehab') return fin.billing(x).rehab && est !== 'baja';
    if (filter === 'asinc') return fin.isAsinc(x) && est !== 'baja';
    return est === filter;
  };
  const counts = (k: ListFilter) => (students ?? []).filter((s) => {
    if (!fin) return false;
    const x = fs(s.id);
    if (!x) return false;
    const est = fin.estado(x).estado;
    return k === 'rehab' ? fin.billing(x).rehab && est !== 'baja' : k === 'asinc' ? fin.isAsinc(x) && est !== 'baja' : est === k;
  }).length;
  const [creating, setCreating] = useState(false);
  const [creds, setCreds] = useState<{ student: Student; password: string } | null>(null);
  const shown = (students ?? []).filter((s) => (!q || s.name.toLowerCase().includes(q.toLowerCase())) && matches(s));
  const today = todayIso();
  const todays = (students ?? []).filter((s) => s.next_session?.date === today);
  // Sin agenda, sin rutina asignada y sin entrenar hace más de 2 meses: van aparte (salvo al buscar).
  const isOld = (s: StudentListItem) => {
    if (q || filter !== 'todos') return false;
    const x = fs(s.id);
    // Baja o en pausa (cargado o automático: sin entrenar hace más de 2 meses) van aparte.
    if (fin && x) return fin.estado(x).estado !== 'activo';
    return !s.next_session && !s.pending_count && (daysSince(s.last_date) ?? 0) > 60;
  };
  const current = shown.filter((s) => !isOld(s))
    .sort((a, b) => (a.next_session?.date ?? '9999').localeCompare(b.next_session?.date ?? '9999') || a.name.localeCompare(b.name));
  const older = shown.filter(isOld).sort((a, b) => (b.last_date ?? '').localeCompare(a.last_date ?? ''));
  const row = (s: StudentListItem) => {
    const d = daysSince(s.last_date);
    const trainedToday = Boolean(s.last_completed_at && localDateOf(s.last_completed_at) === today);
    const line = [s.age ? `${s.age} años` : null, s.partners.length ? `con ${s.partners.map(firstName).join(' y ')}` : null]
      .filter(Boolean).join(' · ');
    return (
      <button key={s.id} className="stu" onClick={() => onOpen(s.id)}>
        <span className="avatar" aria-hidden="true">{initials(s.name)}</span>
        <span style={{ minWidth: 0, display: 'grid', gap: 4 }}>
          <span className="stu-name">{s.name}</span>
          <span className="stu-line">{line || `@${s.username}`}</span>
          <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span className={`pill${s.next_session?.date === today ? ' accent' : ''}`}>
              {s.next_session ? `Próx. ${whenLabel(s.next_session)}` : 'Sin agenda'}
            </span>
            {trainedToday && <span className="pill done">✓ Entrenó hoy</span>}
            {!trainedToday && s.pending_count > 0 && <span className="pill">Rutina asignada</span>}
            {(() => { const c = payPill(s.id); return c && <span className={`pill ${c.cls}`}>{c.t}</span>; })()}
            {fin && fs(s.id) && fin.billing(fs(s.id)!).rehab && <span className="pill low">Rehab</span>}
          </span>
        </span>
        <span className="stu-r">
          <b>{s.sessions_count}</b>
          <span className={`pill${d === null ? '' : d <= 10 ? ' ok' : d > 21 ? ' low' : ''}`}>{relDays(s.last_date)}</span>
        </span>
      </button>
    );
  };

  return (
    <>
      <TopHeader
        title="Alumnos"
        sub={students && <><span><b>{students.length}</b> {students.length === 1 ? 'alumno' : 'alumnos'}</span>{todays.length > 0 && <span><b>{todays.length}</b> entrenan hoy</span>}</>}
        right={right}
      />
      {error ? <p className="empty">No se pudo cargar la lista: {error}</p> : !students ? <Skeleton /> : (
        <Enter>
          <div className="actions" style={{ marginTop: 4 }}>
            <button className="btn primary wide" onClick={() => setCreating(true)}>{Icon.add} Nuevo alumno</button>
          </div>
          {students.length > 5 && (
            <input className="search" type="search" placeholder="Buscar alumno…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar alumno" style={{ marginTop: 12 }} />
          )}
          {fin && (['rehab', 'asinc', 'pausa', 'baja'] as ListFilter[]).some((k) => counts(k)) && (
            <div className="filters" role="group" aria-label="Filtrar alumnos">
              <button className="tog" aria-pressed={filter === 'todos'} onClick={() => setFilter('todos')}>Todos</button>
              {([['rehab', 'Rehab'], ['asinc', 'Asincrónicos'], ['pausa', 'En pausa'], ['baja', 'Baja']] as Array<[ListFilter, string]>)
                .filter(([k]) => counts(k)).map(([k, l]) => (
                  <button key={k} className="tog" aria-pressed={filter === k} onClick={() => setFilter(filter === k ? 'todos' : k)}>{l} <span style={{ opacity: .7 }}>{counts(k)}</span></button>
                ))}
            </div>
          )}
          {!students.length ? (
            <p className="empty">Todavía no hay alumnos. Creá el primero y después planificale su rutina.</p>
          ) : (
            <div>
              {current.map(row)}
              {q && !shown.length && <p className="empty">Ningún alumno se llama así.</p>}
              {older.length > 0 && (
                <details className="older">
                  <summary>
                    <span>En pausa o de baja <b>{older.length}</b></span>
                    {Icon.chev}
                  </summary>
                  {older.map(row)}
                </details>
              )}
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

function StudentDetail({ id, initialTab, fin, reloadFin, all, right, toast, onBack, onDeleted, onChanged, onPlan, onEvaluate, onOpenAssessment }: {
  id: string; initialTab: DetailTab; fin: ReturnType<typeof makeFin> | null; reloadFin: () => void;
  all: StudentListItem[]; right: ReactNode; toast: (m: string) => void;
  onBack: () => void; onDeleted: () => void; onChanged: () => void;
  onPlan: (ids: string[], editing?: Session | null) => void;
  onEvaluate: (s: Student) => void; onOpenAssessment: (studentId: string, assessmentId: string) => void;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<DetailTab>(initialTab);

  const load = useCallback(() => {
    coachApi.student(id).then(setProfile).catch((e: Error) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  const names = useMemo(() => new Map(all.map((s) => [s.id, s.name])), [all]);
  const s = profile?.student;
  const last = profile ? lastRealized(profile) : undefined;
  const planned = (profile?.sessions ?? []).filter((x) => x.status === 'planned' && !x.completions.some((c) => c.student_id === id && c.completed_at));
  const partnerIds = last?.participant_ids.filter((p) => p !== id) ?? [];

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
            <span>Semana <b>{profile.progress.stats.process_week || '—'}</b></span>
            <span><b>{profile.progress.stats.sessions}</b> sesiones</span>
            <span>próx. {whenLabel(profile.next_sessions[0])}</span>
          </>
        )}
        right={right}
      />
      {error ? <p className="empty">No se pudo cargar: {error}</p> : !profile || !s ? <Skeleton /> : (
        <>
          <div className="dtabs" role="tablist" aria-label="Secciones del alumno">
            {([['rutina', 'Rutina'], ['progreso', 'Progreso'], ['historial', 'Historial'], ['informes', 'Informes'], ['agenda', 'Agenda'], ['pagos', 'Pagos'], ['datos', 'Datos']] as Array<[DetailTab, string]>).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
                {l}{k === 'informes' && fin && fin.students.find((x) => x.id === id) && fin.informePendiente(fin.students.find((x) => x.id === id)!) ? <i className="dot" aria-label="pendiente" /> : null}
              </button>
            ))}
          </div>
          <Enter k={tab}>
            {tab === 'rutina' && (
              <>
                <NextCard next={profile.next_sessions[0]} you={false} />
                <div className="actions" style={{ marginTop: 12 }}>
                  <button className="btn primary wide" onClick={() => onPlan([s.id, ...partnerIds])}>
                    {Icon.add} Planificar próxima{partnerIds.length ? ` (con ${partnerIds.map((p) => firstName(names.get(p) ?? '')).join(' y ')})` : ''}
                  </button>
                </div>
                {planned.map((p) => (
                  <div key={p.id}>
                    <div className="card-h" style={{ marginTop: 20 }}>
                      <h2>Asignada · {shortDate(p.date)}</h2>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn sm" onClick={() => onPlan(p.participant_ids, p)}>{Icon.edit} Editar</button>
                        <button className="btn sm danger" aria-label="Borrar" onClick={() => remove(p)}>{Icon.trash}</button>
                      </div>
                    </div>
                    <p className="hint" style={{ marginTop: 2 }}>
                      {p.title ? `${p.title} · ` : ''}{p.completions.some((c) => c.checks.length) ? 'La está haciendo' : 'Todavía no la empezó'}
                    </p>
                    <RoutineBlocks routine={p.routine} viewer={undefined} completions={p.completions} names={names} defaultOpen={null} />
                  </div>
                ))}
                {last ? (
                  <>
                    <div className="card-h" style={{ marginTop: 20 }}>
                      <h2>Última sesión</h2>
                      <span className="mini">{relDays(last.date)}</span>
                    </div>
                    <p className="hint" style={{ marginTop: 2 }}>
                      {cap(longDate(last.date))}{last.title ? ` · ${last.title}` : ''}
                      {last.participant_ids.length > 1 ? ` · con ${last.participant_ids.filter((p) => p !== id).map((p) => firstName(names.get(p) ?? '')).join(' y ')}` : ''}
                    </p>
                    {last.completions.filter((c) => c.completed_at).map((c) => (
                      <div key={c.student_id} className="done-banner" style={{ marginTop: 8 }}>
                        {Icon.check} {firstName(names.get(c.student_id) ?? '')} la terminó {timeAgo(c.completed_at!)}
                        {c.feeling ? ` · ${c.feeling}/5` : ''}{c.comment ? ` · “${c.comment}”` : ''}
                      </div>
                    ))}
                    {last.date_note && <div className="phase warn"><span className="ph-tag">Fecha</span><div>{last.date_note}</div></div>}
                    <RoutineBlocks routine={last.routine} viewer={undefined} completions={last.completions} names={names} />
                  </>
                ) : !planned.length && <p className="empty">Todavía no tiene sesiones. Planificale la primera.</p>}
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
                <HistoryList sessions={profile.sessions} viewer={undefined} studentId={s.id} names={names}
                  onEdit={(x) => onPlan(x.participant_ids, x)} onDelete={remove} />
              </>
            )}
            {tab === 'informes' && (
              <ReportsPanel studentId={s.id} name={s.name} phone={s.billing?.telefono ?? null} toast={toast} onPublished={reloadFin} />
            )}
            {tab === 'pagos' && (
              <StudentPayments fin={fin} studentId={s.id} toast={toast} onAgenda={() => setTab('agenda')}
                reload={() => { reloadFin(); load(); }} />
            )}
            {tab === 'agenda' && (
              <AgendaEditor student={s} sessions={profile.sessions} toast={toast}
                onSaved={(st) => { setProfile({ ...profile, student: st }); load(); onChanged(); }} />
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
    </>
  );
}

// ── proceso ─────────────────────────────────────────────────────────────────

function ProcessEditor({ student, toast, onSaved }: { student: Student; toast: (m: string) => void; onSaved: (s: Student) => void }) {
  const [phases, setPhases] = useState<ProcessPhase[]>(student.process ?? []);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const edit = (fn: (p: ProcessPhase[]) => ProcessPhase[]) => { setPhases(fn); setDirty(true); };
  const set = (i: string, patch: Partial<ProcessPhase>) => edit((p) => p.map((x) => (x.id === i ? { ...x, ...patch } : x)));
  const moveBy = (i: number, d: number) => edit((p) => {
    const n = [...p];
    const [x] = n.splice(i, 1);
    n.splice(Math.max(0, Math.min(n.length, i + d)), 0, x!);
    return n;
  });
  const save = async () => {
    setBusy(true);
    try {
      const clean = phases.filter((p) => p.title.trim()).map((p) => ({ ...p, title: p.title.trim(), description: p.description?.trim() || null }));
      const r = await coachApi.updateStudent(student.id, { process: clean });
      setPhases(clean);
      setDirty(false);
      onSaved(r.student);
      toast('Proceso guardado');
    } catch (e) { toast((e as ApiError).message); } finally { setBusy(false); }
  };
  return (
    <section className="card">
      <div className="card-h">
        <h2>Proceso</h2>
        <button className="btn sm" onClick={() => edit((p) => [...p, { id: uid(), title: '', description: null, status: p.length ? 'next' : 'current' }])}>{Icon.plus} Etapa</button>
      </div>
      <div className="hint">Las etapas que ve el alumno en su perfil, con la actual marcada. Ej.: “Base de movilidad”, “Fuerza”, “Reactividad”.</div>
      {phases.length > 0 && (
        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          {phases.map((p, i) => (
            <div key={p.id} className="bgroup" style={{ padding: 10, gap: 8 }}>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <span className="lbl">{i + 1}</span>
                <input className="search" style={{ marginTop: 0, minHeight: 40, padding: '6px 10px' }} value={p.title} placeholder="Nombre de la etapa"
                  onChange={(e) => set(p.id, { title: e.target.value })} />
                <button className="xbtn" aria-label="Subir" disabled={i === 0} onClick={() => moveBy(i, -1)} style={{ transform: 'rotate(90deg)' }}>{Icon.back}</button>
                <button className="xbtn" aria-label="Bajar" disabled={i === phases.length - 1} onClick={() => moveBy(i, 1)} style={{ transform: 'rotate(-90deg)' }}>{Icon.back}</button>
                <button className="xbtn" aria-label="Quitar etapa" onClick={() => edit((x) => x.filter((y) => y.id !== p.id))}>{Icon.x}</button>
              </div>
              <div className="field"><textarea value={p.description ?? ''} placeholder="Qué se trabaja (opcional)" onChange={(e) => set(p.id, { description: e.target.value })} style={{ minHeight: 56 }} /></div>
              <Seg small value={p.status} onChange={(v) => set(p.id, { status: v })}
                options={[['done', 'Hecha'], ['current', 'Actual'], ['next', 'Próxima']]} />
            </div>
          ))}
        </div>
      )}
      {phases.length > 0 && !dirty && <ProcessTimeline phases={phases} />}
      {dirty && <div className="actions"><button className="btn primary wide" disabled={busy} onClick={save}>{busy ? 'Guardando…' : 'Guardar proceso'}</button></div>}
    </section>
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

      <ProcessEditor student={s} toast={toast} onSaved={onSaved} />

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
