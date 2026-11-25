/**
 * Sesión guardada al marcar presente.
 *
 * Si el profe marca presente a un alumno un día que ya pasó (o hoy) y ese día
 * no tiene sesión cargada, la clase no se pierde aunque se olvide de cargarla:
 *  - si tenía una rutina asignada para ese día, pasa a hecha;
 *  - si no, se guarda una copia de su sesión anterior, que después puede editar;
 *  - si nunca tuvo una sesión, se guarda una vacía para que la clase figure.
 * Los compañeros de una clase compartida (misma sesión anterior) quedan en la
 * misma sesión nueva.
 *
 * Si después le saca el presente y nadie tocó esa sesión (ni el profe la editó,
 * ni hay registros del alumno), se deshace. Lo que el profe edita es suyo y no
 * se toca.
 */
import { randomUUID } from 'crypto';
import { parseBody } from './parser';
import { AttendanceMark, StoredSession, Student, TrainingRepository } from './repository';
import { Routine, routineFromParsed } from './routine';

export interface AutoCreated {
  student_id: string;
  session_id: string;
  /** asignada: la rutina asignada pasó a hecha; copia: copia de la anterior; vacia: no había ninguna. */
  kind: 'asignada' | 'copia' | 'vacia';
  /** Fecha de la sesión copiada. */
  from_date: string | null;
}
export interface AutoResult { created: AutoCreated[]; removed: number }

const order = (a: StoredSession, b: StoredSession) =>
  a.date.localeCompare(b.date) || a.seq - b.seq || a.created_at.localeCompare(b.created_at);

function routineOf(s: StoredSession, students: Map<string, Student>): Routine {
  if (s.routine) return s.routine;
  const people = s.participant_ids.map((id) => students.get(id)).filter((x): x is Student => Boolean(x))
    .map((x) => ({ id: x.id, name: x.name, username: x.username }));
  return routineFromParsed(parseBody(s.body, people));
}

/** Copia con ids nuevos (los registros de lo realizado van por id de ejercicio). */
function copyRoutine(r: Routine): Routine {
  const id = () => randomUUID().slice(0, 8);
  return {
    note: r.note ?? null,
    blocks: r.blocks.map((b) => ({
      ...b, id: id(),
      groups: b.groups.map((g) => ({ id: id(), items: g.items.map(({ ...it }) => ({ ...it, id: id() })) })),
    })),
  };
}

/** La sesión no la tocó nadie: no tiene registros, respuestas ni la terminó el alumno. */
async function untouched(repo: TrainingRepository, s: StoredSession, studentId: string): Promise<boolean> {
  const [ex, resp, comp] = await Promise.all([
    repo.listExecutions({ sessionId: s.id }),
    repo.listResponses({ sessionId: s.id }),
    repo.listCompletions({ sessionIds: [s.id] }),
  ]);
  return !ex.some((e) => e.student_id === studentId)
    && !resp.some((r) => r.student_id === studentId)
    && !comp.some((c) => c.student_id === studentId);
}

/** Después de guardar una marca de asistencia: guarda o deshace la sesión automática de ese día. */
export async function syncAutoSessions(
  repo: TrainingRepository, studentIds: string[], day: string, mark: AttendanceMark | null, today: string,
): Promise<AutoResult> {
  const out: AutoResult = { created: [], removed: 0 };
  const students = new Map((await repo.listStudents()).map((s) => [s.id, s]));

  if (mark === 'p') {
    if (day > today) return out; // la clase todavía no pasó
    for (const sid of studentIds) {
      if (!students.has(sid)) continue;
      const mine = (await repo.listSessions(sid)).sort(order);
      const thatDay = mine.filter((s) => s.date === day);
      const done = new Set((await repo.listCompletions({ studentId: sid })).filter((c) => c.completed_at).map((c) => c.session_id));
      if (thatDay.some((s) => s.status === 'done' || done.has(s.id))) continue; // ya tiene su sesión

      const planned = thatDay.find((s) => s.status === 'planned');
      if (planned) {
        await repo.updateSession(planned.id, { status: 'done', auto_from: planned.id });
        out.created.push({ student_id: sid, session_id: planned.id, kind: 'asignada', from_date: null });
        continue;
      }

      const source = [...mine].reverse().find((s) => s.date < day) ?? null;
      // Clase compartida: si un compañero ya tiene la copia de la misma sesión, se suma a esa.
      const shared = source
        ? (await repo.listSessions()).find((s) => s.date === day && s.auto_from === source.id)
        : undefined;
      if (shared) {
        await repo.updateSession(shared.id, { participant_ids: [...shared.participant_ids, sid] });
        out.created.push({ student_id: sid, session_id: shared.id, kind: 'copia', from_date: source!.date });
        continue;
      }
      const [saved] = await repo.createSessions([{
        date: day, date_raw: null, date_note: null, title: source?.title ?? null, body: '', seq: 0, status: 'done',
        routine: source ? copyRoutine(routineOf(source, students)) : { blocks: [], note: null },
        participant_ids: [sid], auto_from: source?.id ?? 'none',
      }]);
      out.created.push({ student_id: sid, session_id: saved!.id, kind: source ? 'copia' : 'vacia', from_date: source?.date ?? null });
    }
    return out;
  }

  // Sin presente: se deshace lo que se guardó solo ese día, si nadie lo tocó.
  for (const sid of studentIds) {
    const autos = (await repo.listSessions(sid)).filter((s) => s.date === day && s.auto_from);
    for (const s of autos) {
      if (!(await untouched(repo, s, sid))) continue;
      if (s.auto_from === s.id) {
        // Era una rutina asignada: vuelve a asignada, salvo que otro compañero siga presente.
        const others = s.participant_ids.filter((p) => p !== sid);
        const stillPresent = (await Promise.all(others.map((p) => repo.listAttendance(p))))
          .some((list) => list.some((a) => a.day === day && a.mark === 'p'));
        if (!stillPresent) await repo.updateSession(s.id, { status: 'planned', auto_from: null });
        out.removed++;
        continue;
      }
      const rest = s.participant_ids.filter((p) => p !== sid);
      if (rest.length) await repo.updateSession(s.id, { participant_ids: rest });
      else await repo.deleteSession(s.id);
      out.removed++;
    }
  }
  return out;
}

/**
 * Antes de guardar una sesión hecha desde Planificar: saca a esos alumnos de la
 * copia automática de ese día (si nadie la tocó), para que no quede repetida.
 */
export async function replaceAutoCopies(repo: TrainingRepository, studentIds: string[], day: string): Promise<number> {
  let n = 0;
  for (const sid of studentIds) {
    const copies = (await repo.listSessions(sid)).filter((s) => s.date === day && s.auto_from && s.auto_from !== s.id);
    for (const s of copies) {
      if (!(await untouched(repo, s, sid))) continue;
      const rest = s.participant_ids.filter((p) => p !== sid);
      if (rest.length) await repo.updateSession(s.id, { participant_ids: rest });
      else await repo.deleteSession(s.id);
      n++;
    }
  }
  return n;
}
