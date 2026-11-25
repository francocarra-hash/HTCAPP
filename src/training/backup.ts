/**
 * Copia de seguridad: todos los datos del profe en un archivo, y el envío
 * automático por mail todos los viernes.
 *
 * El envío se configura con variables de entorno (en Render):
 *   HTC_SMTP_USER   cuenta que manda el mail (por ejemplo una de Gmail)
 *   HTC_SMTP_PASS   su contraseña de aplicación (no la contraseña normal)
 *   HTC_SMTP_HOST   servidor SMTP (por defecto smtp.gmail.com, puerto 465)
 *   HTC_SMTP_PORT   puerto (por defecto 465)
 *   HTC_BACKUP_TO   a quién se manda (por defecto, a la misma cuenta)
 * Sin HTC_SMTP_USER y HTC_SMTP_PASS no se manda nada.
 */
import { gzipSync } from 'zlib';
import nodemailer from 'nodemailer';
import { parseBody } from './parser';
import { StoredSession, Student, TrainingRepository } from './repository';
import { itemText, Routine, routineFromParsed, RoutineItem } from './routine';
import { localNow } from './schedule';

function routineOf(s: StoredSession, students: Map<string, Student>): Routine {
  if (s.routine) return s.routine;
  const people = s.participant_ids.map((id) => students.get(id)).filter((x): x is Student => Boolean(x))
    .map((x) => ({ id: x.id, name: x.name, username: x.username }));
  return routineFromParsed(parseBody(s.body, people));
}

/** Todos los datos (sin contraseñas): alcanza para recuperar todo. */
export async function buildBackup(repo: TrainingRepository) {
  const [students, sessions, completions, attendance, payments, charges, reports, executions, responses, changes, exercises] = await Promise.all([
    repo.listStudents(), repo.listSessions(), repo.listCompletions({}), repo.listAttendance(), repo.listPayments(), repo.listCharges(),
    repo.listReports(), repo.listExecutions({}), repo.listResponses({}), repo.listChanges({}), repo.listExerciseMeta(),
  ]);
  const byId = new Map(students.map((x) => [x.id, x]));
  const quality = (await Promise.all(students.map((x) => repo.listQuality(x.id)))).flat();
  return {
    app: 'HTC', format: 1, exported_at: new Date().toISOString(),
    students, sessions: sessions.map((x) => ({ ...x, routine: routineOf(x, byId) })),
    completions, attendance, payments, charges, reports, executions, responses, quality, exercises, changes,
  };
}
export type Backup = Awaited<ReturnType<typeof buildBackup>>;

// ── las rutinas en texto, con el formato de siempre del profe ──

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const longDate = (iso: string): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
};

export function routineToText(r: Routine): string {
  const it = (x: RoutineItem) => (x.who ? `${x.who} ${itemText(x)}` : itemText(x));
  const out: string[] = [];
  let letter = 0;
  for (const b of r.blocks) {
    const groups = b.groups.map((g) => g.items.filter((x) => itemText(x)));
    if (!groups.some((g) => g.length)) continue;
    if (b.kind === 'list') out.push(groups.flatMap((g) => g.map(it)).join(' - '));
    else if (b.kind === 'circuit') out.push(`[${groups.filter((g) => g.length).map((g) => g.map(it).join('/ ')).join(' - ')}]${b.rounds ? ` x${b.rounds}` : ''}`);
    else if (b.kind === 'superset') {
      const L = String.fromCharCode(65 + letter++);
      groups.filter((g) => g.length).forEach((g, i) => out.push(`${L}${i + 1} - ${g.map(it).join(' + ')}`));
      if (b.rounds) out.push(`x${b.rounds}`);
    } else for (const g of groups) for (const x of g) out.push(itemText(x));
    out.push('');
  }
  if (r.note) out.push(r.note);
  return out.join('\n').trim();
}

/** Las rutinas de cada alumno, de la más nueva a la más vieja, para leerlas sin la app. */
export function readableBackup(b: Backup): string {
  const names = new Map(b.students.map((s) => [s.id, s.name]));
  const out = ['HTC · Rutinas de todos los alumnos', `Copia del ${longDate(localNow(new Date(b.exported_at)).date)}`, ''];
  for (const st of [...b.students].sort((x, y) => x.name.localeCompare(y.name, 'es'))) {
    const mine = b.sessions.filter((x) => x.participant_ids.includes(st.id)).sort((x, y) => y.date.localeCompare(x.date));
    out.push('='.repeat(48), st.name.toUpperCase(), `${mine.length} ${mine.length === 1 ? 'sesión' : 'sesiones'}`, '='.repeat(48), '');
    for (const x of mine) {
      const others = x.participant_ids.filter((p) => p !== st.id).map((p) => names.get(p) ?? '—');
      out.push(`${longDate(x.date)}${x.title ? ` · ${x.title}` : ''}${x.status === 'planned' ? ' (asignada)' : ''}${others.length ? ` · con ${others.join(', ')}` : ''}`);
      out.push(routineToText(x.routine) || '(sin rutina)', '');
    }
  }
  return out.join('\n');
}

// ── envío automático por mail ──

export interface MailConfig { host: string; port: number; user: string; pass: string; to: string }

export function mailConfig(env: NodeJS.ProcessEnv = process.env): MailConfig | null {
  const user = env.HTC_SMTP_USER?.trim();
  const pass = env.HTC_SMTP_PASS?.replace(/\s+/g, '');
  if (!user || !pass) return null;
  const port = Number(env.HTC_SMTP_PORT) || 465;
  return { host: env.HTC_SMTP_HOST?.trim() || 'smtp.gmail.com', port, user, pass, to: env.HTC_BACKUP_TO?.trim() || user };
}

export interface AutoStatus { at: string | null; ok: boolean | null; error: string | null; week: string | null }
const STATUS_KEY = 'backup_auto';
/** Desde qué hora del viernes se manda (hora del piloto). */
const SEND_FROM = '08:00';

/** Lunes de la semana de esa fecha (para mandar una sola copia por semana). */
export const weekOf = (date: string): string => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

/**
 * ¿Toca mandar la copia? Los viernes desde las 8; si el viernes no se pudo
 * (servidor apagado, error del mail), se manda el sábado o el domingo. Una por semana.
 */
export function isDue(now: { date: string; time: string }, last: AutoStatus | undefined): boolean {
  const wd = new Date(`${now.date}T12:00:00Z`).getUTCDay();
  const fromFriday = wd === 5 ? now.time >= SEND_FROM : wd === 6 || wd === 0;
  return fromFriday && !(last?.ok && last.week === weekOf(now.date));
}

type Send = (cfg: MailConfig, msg: { subject: string; text: string; attachments: Array<{ filename: string; content: Buffer }> }) => Promise<void>;

const smtpSend: Send = async (cfg, msg) => {
  const t = nodemailer.createTransport({ host: cfg.host, port: cfg.port, secure: cfg.port === 465, auth: { user: cfg.user, pass: cfg.pass } });
  await t.sendMail({ from: `HTC · Copia de seguridad <${cfg.user}>`, to: cfg.to, ...msg });
};

/** Arma la copia y la manda por mail. Guarda cómo salió para mostrarlo en la app. */
export async function sendBackup(repo: TrainingRepository, cfg: MailConfig, send: Send = smtpSend): Promise<AutoStatus> {
  const now = localNow();
  try {
    const b = await buildBackup(repo);
    const sessions = b.sessions.length;
    await send(cfg, {
      subject: `HTC · Copia de seguridad del ${now.date.split('-').reverse().join('/')}`,
      text: [
        'Copia automática de todos los datos de la app de HTC.',
        '',
        `Alumnos: ${b.students.length} · Sesiones: ${sessions} · Asistencias: ${b.attendance.length} · Pagos: ${b.payments.length}`,
        '',
        '- htc-copia-….json.gz: todos los datos. Es la que sirve para recuperar todo. No hace falta abrirla.',
        '- htc-rutinas-….txt: las rutinas de cada alumno, para leerlas sin la app.',
        '',
        'Este mail llega solo todos los viernes. Guardalo: no hace falta hacer nada más.',
      ].join('\n'),
      attachments: [
        { filename: `htc-copia-${now.date}.json.gz`, content: gzipSync(JSON.stringify(b)) },
        { filename: `htc-rutinas-${now.date}.txt`, content: Buffer.from(readableBackup(b), 'utf8') },
      ],
    });
    const st: AutoStatus = { at: new Date().toISOString(), ok: true, error: null, week: weekOf(now.date) };
    await repo.setSetting(STATUS_KEY, st);
    return st;
  } catch (e) {
    const st: AutoStatus = { at: new Date().toISOString(), ok: false, error: e instanceof Error ? e.message.slice(0, 300) : String(e), week: weekOf(now.date) };
    await repo.setSetting(STATUS_KEY, st);
    return st;
  }
}

export const autoStatus = async (repo: TrainingRepository): Promise<AutoStatus | null> =>
  (await repo.getSetting<AutoStatus>(STATUS_KEY)) ?? null;

/** Revisa cada media hora si toca mandar la copia de la semana. */
export function scheduleBackups(repo: TrainingRepository, everyMs = 30 * 60 * 1000): void {
  const cfg = mailConfig();
  if (!cfg) {
    console.log('[backup] envío semanal por mail apagado (faltan HTC_SMTP_USER y HTC_SMTP_PASS)');
    return;
  }
  console.log(`[backup] copia semanal por mail activada: los viernes a ${cfg.to.replace(/^(.).*(@.*)$/, '$1…$2')}`);
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      if (isDue(localNow(), (await autoStatus(repo)) ?? undefined)) {
        const st = await sendBackup(repo, cfg);
        console.log(st.ok ? '[backup] copia semanal enviada' : `[backup] no se pudo mandar la copia: ${st.error}`);
      }
    } catch (e) {
      console.error('[backup]', e);
    } finally {
      running = false;
    }
  };
  setTimeout(() => { void tick(); }, 60 * 1000);
  setInterval(() => { void tick(); }, everyMs).unref();
}
