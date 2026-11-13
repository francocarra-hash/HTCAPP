/**
 * Lo realizado, tomado de la planificación.
 *
 * Cuando el profe guarda una sesión como hecha es porque la acaba de hacer con
 * el alumno: lo que escribió en la rutina es lo que se hizo, y no hace falta
 * volver a confirmarlo ejercicio por ejercicio. Lo mismo vale para la rutina
 * asignada que el alumno terminó (con los ejercicios que marcó).
 *
 * De cada ejercicio se leen las series, repeticiones, tiempos y kilos tal como
 * están escritos ("10 - 10 - 12", "30s+10r", "3x8 20kg", "1:30m"). Si algo
 * salió distinto, el registro manual de ese ejercicio ("Corregir lo realizado")
 * reemplaza a lo que dice la planificación.
 */
import { dataQuality, ExecSet, Execution, inferTracking, prescribedOf, setsInDose, Tracking } from './execution';
import { firstName } from './parser';
import { ExerciseInfo, itemKey, ownItems } from './progress';
import { Routine, RoutineItem } from './routine';

export interface PlanSession {
  id: string;
  date: string;
  status: 'planned' | 'done';
  routine: Routine;
  checks: string[] | null;
  completed_at: string | null;
}

const num = (s: string): number => Number(s.replace(',', '.'));
const maxOf = (xs: number[]): number | null => (xs.length ? Math.max(...xs) : null);

const emptySet = (n: number): ExecSet => ({
  n, side: null, reps: null, load: null, unit: 'kg', secs: null, dist_m: null, height_cm: null, velocity: null, power: null, hr: null,
  rpe: null, rir: null, rest_s: null, rom: null, tempo: null, pain: null, done: 'completa', note: null,
});

/**
 * La parte del ítem donde está la dosis. Con dosis cargada aparte, es esa. Si
 * todo quedó en el nombre ("Swimmers 10 - 10 - 10", "25 jump squat"), se toma
 * desde el primer número; un nombre que empieza con "90/90" no es una dosis.
 */
export function doseText(it: RoutineItem): string {
  if (it.dose && it.dose.trim()) return it.dose;
  const t = it.name.replace(/\(.*?\)/g, ' ').split('→')[0]!.trim();
  const tail = /^\D*[A-Za-zÀ-ÿ]\D*?(\d.*)$/.exec(t);
  if (tail) return tail[1]!;
  const lead = /^(\d+(?:[.,]\d+)?\s*(?:kg|k|s|seg|min|m|r|reps?)?)\s+[A-Za-zÀ-ÿ]/i.exec(t);
  return lead && !/^\d+\s*\//.test(t) ? lead[1]! : '';
}

interface Segment { reps: number | null; secs: number | null; load: number | null; sets: number | null }

/** Una parte de la dosis: "3x8 20kg", "30s+10r", "1:30m", "12". */
function parseSegment(raw: string): Segment {
  let t = raw.replace(/(\d)([a-z]+)[x×](\d)/gi, '$1$2 x$3');
  const kg: number[] = [];
  const secs: number[] = [];
  t = t.replace(/(\d+(?:[.,]\d+)?)\s*(?:kg|k)\b/gi, (_m, a: string) => { kg.push(num(a)); return ' '; });
  t = t.replace(/(\d+)\s*:\s*(\d{2})\s*(?:min|mins|m)?\b/gi, (_m, a: string, b: string) => { secs.push(Number(a) * 60 + Number(b)); return ' '; });
  t = t.replace(/(\d+(?:[.,]\d+)?)\s*(?:min|mins|minutos|m)\b/gi, (_m, a: string) => { secs.push(Math.round(num(a) * 60)); return ' '; });
  t = t.replace(/(\d+(?:[.,]\d+)?)\s*(?:seg|segs|sec|s)\b/gi, (_m, a: string) => { secs.push(num(a)); return ' '; });
  const sets = setsInDose(t);
  // Lo que queda son repeticiones; el número de series ("3x") no es una repetición.
  const rest = sets != null ? t.replace(/(?:^|\s)\d{1,2}\s*[x×]\s*(?=\d)/, ' ').replace(/[x×]\s*\d{1,2}\b/, ' ') : t;
  const reps = [...rest.matchAll(/(\d+)\s*(?:reps?|repes|r)?\b/gi)].map((m) => Number(m[1])).filter((n) => n > 0 && n <= 1000);
  return { reps: maxOf(reps), secs: maxOf(secs), load: maxOf(kg), sets };
}

/**
 * Series que salen de una dosis escrita. "10 - 10 - 12" y "20/25/30" son una
 * serie por cada valor; "3x8" son 3 series; si no dice, una por vuelta del
 * bloque. Los kilos escritos una sola vez valen para todas las series.
 */
export function setsFromPlan(dose: string, rounds: number | null): ExecSet[] {
  const clean = dose.replace(/\(.*?\)/g, ' ').replace(/[–—]/g, '-').trim();
  const parts = clean.split(/\s+-+\s*|\s*-+\s+|\s*\/\s*(?=\+?\s*\d)/).map((p) => p.trim()).filter((p) => /\d/.test(p));
  const segs = (parts.length ? parts : [clean]).map(parseSegment);
  const withValue = segs.filter((s) => s.reps != null || s.secs != null);
  let list: Segment[];
  if (withValue.length > 1) {
    // "8/10" en un bloque de 3 vueltas: la última vuelta repite el último valor.
    list = [...withValue];
    while (list.length < Math.min(20, rounds ?? 0)) list.push(list[list.length - 1]!);
  } else {
    const one = withValue[0] ?? segs[0] ?? { reps: null, secs: null, load: null, sets: null };
    const n = Math.max(1, Math.min(20, one.sets ?? rounds ?? 1));
    list = Array.from({ length: n }, () => one);
  }
  // Los kilos escritos una vez siguen valiendo hasta que se escriben otros.
  let load = segs.find((s) => s.load != null)?.load ?? null;
  return list.slice(0, 20).map((s, i) => {
    if (s.load != null) load = s.load;
    return { ...emptySet(i + 1), reps: s.reps, secs: s.secs, load };
  });
}

/** Tipo de registro según la capacidad y lo que se pudo leer. */
function trackingOf(capacity: ReturnType<ExerciseInfo>['capacity'], dose: string, sets: ExecSet[]): Tracking {
  const t = inferTracking(capacity, dose);
  if (t !== 'dinamica') return t;
  return sets.some((s) => s.secs != null) && sets.every((s) => s.reps == null) ? 'isometrica' : 'dinamica';
}

/**
 * Registros de lo realizado que salen de la planificación, para los ejercicios
 * que no tienen un registro manual. Sesión hecha por el profe: toda la rutina.
 * Rutina asignada que el alumno terminó: los ejercicios que marcó (todos, si no
 * marcó ninguno).
 */
export function planExecutions(input: {
  sessions: PlanSession[]; studentId: string; studentName: string; info: ExerciseInfo; stored: Execution[];
}): Execution[] {
  const who = firstName(input.studentName);
  const has = new Set(input.stored.map((e) => `${e.session_id}|${e.item_id}`));
  const out: Execution[] = [];
  for (const s of input.sessions) {
    const byCoach = s.status === 'done';
    if (!byCoach && !s.completed_at) continue;
    const checks = !byCoach && s.checks?.length ? new Set(s.checks) : null;
    const blockOf = new Map<string, { title: string; rounds: number | null }>();
    for (const b of s.routine.blocks) for (const g of b.groups) for (const it of g.items) blockOf.set(it.id, { title: b.title, rounds: b.rounds });
    for (const it of ownItems(s.routine, who)) {
      if (has.has(`${s.id}|${it.id}`) || (checks && !checks.has(it.id))) continue;
      const key = itemKey(it);
      if (!key) continue;
      const block = blockOf.get(it.id) ?? { title: '', rounds: null };
      const meta = input.info(key, it.name);
      const dose = doseText(it);
      const sets = setsFromPlan(dose, block.rounds);
      const tracking = trackingOf(meta.capacity, dose, sets);
      const stamp = `${s.date}T12:00:00.000Z`;
      out.push({
        id: `plan:${s.id}:${it.id}`, session_id: s.id, student_id: input.studentId, item_id: it.id, day: s.date,
        exercise_key: key, exercise_name: meta.name ?? it.name, variant: null, tracking, load_config: null, assistance: null,
        body_mass_kg: null, prescribed: prescribedOf(it, block), sets, notes: null, source: byCoach ? 'coach' : 'client',
        // Sin carga escrita se toma como sin carga externa: es lo que dice la planificación.
        data_quality: dataQuality(tracking, sets.some((x) => x.load != null) ? null : 'peso_corporal', sets),
        version: 0, created_at: stamp, updated_at: stamp, origin: 'plan',
      });
    }
  }
  return out;
}
