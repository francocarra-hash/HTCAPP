import { req } from '../api';

// ── capacidades (mismo orden y colores en toda la app) ──────────────────────

export type CapacityId = 'fuerza' | 'reactividad' | 'movilidad' | 'estabilidad' | 'control_motor' | 'resistencia';
export const CAPACITIES: Array<{ id: CapacityId; label: string; short: string }> = [
  { id: 'fuerza', label: 'Fuerza', short: 'Fuerza' },
  { id: 'reactividad', label: 'Reactividad', short: 'Reactiv.' },
  { id: 'movilidad', label: 'Movilidad', short: 'Movilidad' },
  { id: 'estabilidad', label: 'Estabilidad', short: 'Estabil.' },
  { id: 'control_motor', label: 'Control motor', short: 'Control' },
  { id: 'resistencia', label: 'Resistencia', short: 'Resist.' },
];
export const CAP_LABEL = Object.fromEntries(CAPACITIES.map((c) => [c.id, c.label])) as Record<CapacityId, string>;
export const capColor = (c: CapacityId) => `var(--cap-${c})`;

/** Qué es cada capacidad: una definición corta y su fuente. */
export const CAP_INFO: Record<CapacityId, { def: string; ref: string }> = {
  fuerza: {
    def: 'Capacidad de los músculos de generar tensión para vencer, sostener o frenar una resistencia: el propio peso, una carga o el suelo.',
    ref: 'Suchomel, Nimphius y Stone, 2016 (Sports Medicine)',
  },
  reactividad: {
    def: 'Capacidad de producir fuerza rápido después de un estiramiento breve, aprovechando el ciclo estiramiento-acortamiento: rebotar, saltar, cambiar de dirección.',
    ref: 'Komi, 2000 (Journal of Biomechanics); Flanagan y Comyns, 2008',
  },
  movilidad: {
    def: 'Capacidad de mover activamente una articulación por su rango disponible, con control. A diferencia de la flexibilidad (el rango), implica poder usarlo.',
    ref: 'ACSM, Guidelines for Exercise Testing and Prescription, 2021; Behm et al., 2016',
  },
  estabilidad: {
    def: 'Capacidad de controlar la posición y el movimiento del tronco y la pelvis para producir, transferir y controlar la fuerza entre el centro del cuerpo y los brazos y piernas.',
    ref: 'Kibler, Press y Sciascia, 2006 (Sports Medicine)',
  },
  control_motor: {
    def: 'Cómo el sistema nervioso organiza los músculos y la información de los sentidos (propiocepción, vista, equilibrio) para moverse con precisión y adaptarse a cada situación.',
    ref: 'Shumway-Cook y Woollacott, Motor Control, 2016',
  },
  resistencia: {
    def: 'Capacidad de sostener un esfuerzo en el tiempo y recuperarse, retrasando la fatiga del corazón, los pulmones y los músculos.',
    ref: 'ACSM, Guidelines for Exercise Testing and Prescription, 2021',
  },
};

// ── calidad del movimiento ──────────────────────────────────────────────────

export type QualityAspect = 'organizacion' | 'transferencia' | 'sensibilidad' | 'control' | 'respiracion' | 'rom';
export const QUALITY_ASPECTS: Array<[QualityAspect, string]> = [
  ['organizacion', 'Organización del cuerpo en el espacio'],
  ['transferencia', 'Transferencia de peso'],
  ['sensibilidad', 'Sensibilidad y percepción'],
  ['control', 'Control y fluidez'],
  ['respiracion', 'Respiración'],
  ['rom', 'Rango de movimiento (ROM)'],
];
export const ASPECT_LABEL = Object.fromEntries(QUALITY_ASPECTS) as Record<QualityAspect, string>;
export const QUALITY_SCORE = ['', 'Le cuesta', 'En construcción', 'Lo resuelve', 'Con calidad', 'Dominado'];
export interface QualityEntry {
  id: string; student_id: string; exercise_key: string; exercise_name: string;
  day: string; score: number; aspects: QualityAspect[]; note: string | null; created_at: string;
}

// ── rutina en bloques (espejo de src/training/routine.ts) ───────────────────

export type BlockKind = 'list' | 'circuit' | 'superset' | 'notes';
export interface RoutineItem { id: string; name: string; dose: string; who?: string; capacity?: CapacityId | null; video?: string | null }
export interface RoutineGroup { id: string; items: RoutineItem[] }
export interface RoutineBlock { id: string; kind: BlockKind; title: string; rounds: number | null; groups: RoutineGroup[] }
export interface Routine { blocks: RoutineBlock[]; note?: string | null }

export const KIND_LABEL: Record<BlockKind, string> = {
  list: 'Lista', circuit: 'Circuito', superset: 'Superseries', notes: 'Notas',
};

export type Sex = 'MALE' | 'FEMALE';

export interface Schedule {
  weekly: Array<{ weekday: number; time: string | null }>;
  /** `from`: la clase se pasó de ese día a este. */
  once: Array<{ date: string; time: string | null; note?: string | null; from?: string | null }>;
  skip: string[];
}
export interface Occurrence { date: string; time: string | null; note?: string | null }
export interface ProcessPhase { id: string; title: string; description?: string | null; status: 'done' | 'current' | 'next' }

export interface Student {
  id: string;
  name: string;
  username: string;
  age: number | null;
  sex: Sex | null;
  goal: string | null;
  notes: string | null;
  schedule: Schedule | null;
  process: ProcessPhase[] | null;
  billing: Billing | null;
  about: string | null;
  created_at: string;
}

export interface StudentListItem extends Student {
  sessions_count: number;
  first_date: string | null;
  last_date: string | null;
  pending_count: number;
  last_completed_at: string | null;
  next_session: Occurrence | null;
  partners: string[];
}

export interface Completion {
  session_id: string;
  student_id: string;
  checks: string[];
  notes: Record<string, string>;
  completed_at: string | null;
  feeling: number | null;
  comment: string | null;
}

export interface Session {
  id: string;
  date: string;
  date_raw: string | null;
  date_note: string | null;
  title: string | null;
  body: string;
  seq: number;
  status: 'planned' | 'done';
  participant_ids: string[];
  routine: Routine;
  completions: Completion[];
}

export type Unit = 's' | 'reps' | 'kg';

export interface Highlight {
  key: string; name: string; capacity: CapacityId | null; unit: Unit;
  from: number; to: number; first_date: string; last_date: string;
  /** Subió el volumen total (series × vueltas) con la misma dosis por serie. */
  kind?: 'volumen';
}

export interface Progress {
  stats: {
    sessions: number;
    first_date: string | null;
    last_date: string | null;
    weeks_active: number;
    process_week: number;
    per_week: number | null;
    this_month: number;
    streak_weeks: number;
  };
  months: Array<{ month: string; count: number }>;
  exercises: Array<{
    key: string; name: string; capacity: CapacityId | null; unit: Unit;
    points: Array<{ date: string; value: number; text: string }>;
    first: number; last: number; best: number;
    /** Aclaración de comparabilidad. */
    note?: string;
  }>;
  highlights: Highlight[];
  /** Pasó a una variante más compleja del mismo movimiento. */
  variants?: Array<{ from: string; to: string; capacity: CapacityId | null; date: string; from_date: string; sessions: number }>;
  practice: Array<{
    key: string; name: string; capacity: CapacityId | null;
    sessions: number; weeks: number; first_date: string; last_date: string; recent: number;
  }>;
  capacities: Array<{
    id: CapacityId; label: string; sessions: number; tracked: number; improved: number;
    top: Highlight | null; recent_share: number;
  }>;
}

export interface Profile {
  student: Student;
  sessions: Session[];
  progress: Progress;
  partners: Array<{ id: string; name: string; shared: number }>;
  next_sessions: Occurrence[];
  assessment_ids?: string[];
  /** Sólo en la vista del alumno: sus informes publicados. */
  reports?: StoredReport[];
  quality?: QualityEntry[];
  /** Sólo en la vista del alumno: su WhatsApp (lo puede editar). */
  phone?: string | null;
}

// ── finanzas ────────────────────────────────────────────────────────────────

export type Estado = 'activo' | 'pausa' | 'baja';
export type Modalidad = 'presencial' | 'virtual_sinc' | 'virtual_asinc';
export interface Billing {
  estado: Estado | null;
  modalidad: Modalidad;
  clases_sem: number | null;
  ciclo_sem: number;
  pago_modo: 'clases' | 'mensual';
  cuota: number | null;
  historial_cuota: Array<{ desde: string; monto: number }>;
  cuenta_desde: string | null;
  saldo_inicial: number;
  vence: string | null;
  telefono: string | null;
  enfoque: string | null;
  rehab: boolean;
  prog_enviada: string | null;
  prog_pendiente: boolean;
  moneda?: Moneda;
  /** Link de pago de la próxima cuota (Mercado Pago). Abrirlo no la marca como pagada. */
  pago_link?: PayLink | null;
  /** El alumno avisó que pagó: queda a confirmar hasta que se registra el pago. */
  pago_avisado?: string | null;
}
export type Moneda = 'USD' | 'ARS';
export interface PayLink { url: string; monto: number; moneda: Moneda; detalle: string | null; creado: string }
export const emptyBilling = (): Billing => ({
  estado: null, modalidad: 'presencial', clases_sem: null, ciclo_sem: 4, pago_modo: 'clases', cuota: null,
  historial_cuota: [], cuenta_desde: null, saldo_inicial: 0, vence: null, telefono: null, enfoque: null,
  rehab: false, prog_enviada: null, prog_pendiente: false, moneda: 'USD', pago_link: null, pago_avisado: null,
});
/** Sólo links https de Mercado Pago (el servidor vuelve a validar). */
export function isMercadoPago(url: string): boolean {
  try {
    const u = new URL(url.trim());
    const h = u.hostname.toLowerCase();
    return u.protocol === 'https:' && ['mercadopago.com.ar', 'mercadopago.com', 'mpago.la', 'mpago.li'].some((d) => h === d || h.endsWith(`.${d}`));
  } catch { return false; }
}
/** paid_on = fecha efectiva (cuándo se recibió); created_at = fecha de registro (cuándo se cargó). */
export interface Payment {
  id: string; student_id: string; paid_on: string; amount: number;
  classes: number | null; period: string | null; charge_id: string | null; note: string | null; created_at: string;
}
export type ChargeKind = 'paquete' | 'mes' | 'programacion';
/** Período que se cobra (paquete de clases, mes o programación). Los pagos se asignan a uno y no cambian sus clases. */
export interface Charge {
  id: string; student_id: string; kind: ChargeKind; period_key: string; starts_on: string;
  sessions: number | null; amount: number; in_opening: boolean; migrated_from: string | null;
  reviewed_at: string | null; note: string | null; created_at: string;
}
export interface ChargeReviewItem {
  student_id: string; student_name: string; charge: Charge; payments: Payment[];
  restan_antes: number; esperado_max: number; reason: string;
  proposal: { action: 'merge'; into: Charge; into_label: string } | { action: 'opening' };
  proposal_text: string; restan_hoy: number; restan_corregido: number;
}
export type Mark = 'p' | 'a' | 'e';
export interface AttendanceRow { student_id: string; day: string; mark: Mark }
export interface FinanceStudent {
  id: string; name: string; username: string; billing: Billing | null; schedule: Schedule | null; created_at: string;
  first_date: string | null; last_date: string | null;
  session_days: string[]; planned_days: string[]; last_report_start: string | null;
}
export interface FinanceData { today: string; students: FinanceStudent[]; payments: Payment[]; charges?: Charge[]; attendance: AttendanceRow[] }

// ── informe de 4 semanas ────────────────────────────────────────────────────

export interface ReportData {
  student_name: string; cycle: number; start: string; end: string; week_from: number; week_to: number;
  sessions: { count: number; dates: string[]; per_week: number[]; previous: number; total_to_date: number };
  planned: number | null;
  attendance: { p: number; a: number; e: number };
  capacities: Array<{ id: CapacityId; label: string; share: number; previous_share: number }>;
  improvements: Array<{ name: string; capacity: CapacityId | null; unit: Unit; from: number; to: number; from_date: string; to_date: string; kind?: 'volumen' }>;
  variants?: Array<{ from: string; to: string; date: string; capacity: CapacityId | null }>;
  new_exercises: Array<{ name: string; capacity: CapacityId | null }>;
  feeling: { average: number; count: number } | null;
  comments: Array<{ date: string; text: string }>;
  quality?: Array<{ name: string; from: number | null; to: number; aspects: QualityAspect[]; note: string | null }>;
  practice?: Array<{ name: string; capacity: CapacityId | null; sessions: number; weeks: number }>;
}
export interface StoredReport {
  id: string; student_id: string; period_start: string; period_end: string; data: ReportData;
  message: string | null; next_goal: string | null; published_at: string; seen_at: string | null;
}
export interface Cycle { n: number; start: string; end: string }

export interface ExerciseEntry {
  key: string; name: string; capacity: CapacityId | null; capacity_source: 'coach' | 'auto' | null;
  description: string | null; video_url: string | null; easier_key?: string | null; custom: boolean; uses: number; students: string[];
  last_date: string | null; last_text: string | null;
}

export interface ActivityItem {
  session_id: string; student_id: string; student_name: string;
  session_date: string | null; session_title: string | null; completed_at: string;
  feeling: number | null; comment: string | null; checks: number; total: number;
  notes: Array<{ item: string; note: string }>; seen: boolean;
}

// ── lo realizado y monitoreo de carga ───────────────────────────────────────

export type Tracking = 'dinamica' | 'isometrica' | 'movilidad' | 'pliometria' | 'aerobica' | 'control_motor';
export const TRACKINGS: Array<[Tracking, string]> = [
  ['dinamica', 'Fuerza dinámica'], ['isometrica', 'Isométrico'], ['movilidad', 'Movilidad'],
  ['pliometria', 'Pliometría'], ['aerobica', 'Aeróbico'], ['control_motor', 'Control motor'],
];
export type LoadConfig = 'barra' | 'mancuerna' | 'dos_mancuernas' | 'kettlebell' | 'maquina' | 'polea' | 'banda' | 'lastre'
  | 'peso_corporal' | 'asistida' | 'otro';
export const LOAD_CONFIGS: Array<[LoadConfig, string]> = [
  ['peso_corporal', 'Peso corporal'], ['mancuerna', 'Una mancuerna'], ['dos_mancuernas', 'Dos mancuernas'], ['kettlebell', 'Kettlebell'],
  ['barra', 'Barra'], ['maquina', 'Máquina'], ['polea', 'Polea'], ['banda', 'Banda'], ['lastre', 'Lastre'], ['asistida', 'Con asistencia'], ['otro', 'Otro'],
];
export interface ExecSet {
  n: number; side: 'L' | 'R' | null; reps: number | null; load: number | null; unit: 'kg' | 'lb'; secs: number | null;
  dist_m: number | null; height_cm: number | null; velocity: number | null; power: number | null; hr: number | null;
  rpe: number | null; rir: number | null; rest_s: number | null; rom: string | null; tempo: string | null; pain: number | null;
  done: 'completa' | 'parcial' | 'no'; note: string | null;
}
export const emptySet = (n: number, side: 'L' | 'R' | null = null): ExecSet => ({
  n, side, reps: null, load: null, unit: 'kg', secs: null, dist_m: null, height_cm: null, velocity: null, power: null, hr: null,
  rpe: null, rir: null, rest_s: null, rom: null, tempo: null, pain: null, done: 'completa', note: null,
});
export interface ExecutionDraft {
  item_id: string; tracking: Tracking; variant: string | null; load_config: LoadConfig | null; assistance: string | null;
  body_mass_kg: number | null; sets: ExecSet[]; notes: string | null;
}
export interface Execution extends ExecutionDraft {
  id: string; session_id: string; student_id: string; day: string; exercise_key: string; exercise_name: string;
  prescribed: { text: string; name: string; dose: string; block: string; rounds: number | null; sets: number | null };
  source: 'coach' | 'client'; data_quality: 'completo' | 'incompleto'; version: number; created_at: string; updated_at: string;
}
export interface ResponseDraft {
  srpe: number | null; duration_min: number | null; status: 'completa' | 'parcial' | 'modificada' | null;
  fatigue: number | null; soreness: number | null; pain: number | null; pain_area: string | null; recovery: number | null; note: string | null;
}
export const emptyResponse = (): ResponseDraft => ({
  srpe: null, duration_min: null, status: null, fatigue: null, soreness: null, pain: null, pain_area: null, recovery: null, note: null,
});
export interface SessionResponse extends ResponseDraft { session_id: string; student_id: string; source: 'coach' | 'client'; version: number; updated_at: string }
export interface ChangeEntry {
  id: string; entity: 'execution' | 'response' | 'session'; action: 'create' | 'update' | 'delete'; actor: string;
  reason: string | null; at: string; before: unknown; after: unknown;
}
export interface RecordData { executions: Execution[]; response: SessionResponse | null; changes?: ChangeEntry[]; skipped?: string[] }
/** Escala CR-10 de esfuerzo percibido de la sesión (sRPE). */
export const SRPE_LABEL = ['Reposo', 'Muy, muy fácil', 'Fácil', 'Moderado', 'Algo duro', 'Duro', '', 'Muy duro', '', '', 'Máximo'];
export type ChangeCategory = 'progresar' | 'mantener' | 'reducir' | 'cambiar_ejercicios' | 'adaptar';
export const CHANGE_CATEGORIES: Array<[ChangeCategory, string]> = [
  ['progresar', 'Progresar'], ['mantener', 'Mantener'], ['reducir', 'Reducir'], ['cambiar_ejercicios', 'Cambiar ejercicios'], ['adaptar', 'Adaptar a síntomas o contexto'],
];

export type MetricId = 'load' | 'reps_set' | 'reps_total' | 'volume' | 'hold' | 'secs_total' | 'contacts' | 'height' | 'distance' | 'duration' | 'pace' | 'hr';
export interface MetricChange {
  id: MetricId; label: string; unit: string;
  baseline: { value: number; day: string } | null; current: { value: number; day: string } | null; abs: number | null; pct: number | null;
}
export interface GroupRecord {
  execution_id: string; session_id: string; day: string; source: 'coach' | 'client'; from_plan?: boolean; data_quality: 'completo' | 'incompleto';
  values: Partial<Record<MetricId, number | null>>; rpe: number | null; rir: number | null; pain: number | null; rom: string | null;
  sets: number; summary: string;
}
export interface CompareGroup {
  key: string; label: string; tracking: Tracking; conditions: string[]; records: GroupRecord[]; changes: MetricChange[];
  limited: boolean; reasons: string[]; interpretation: string[];
}
export interface ExerciseMonitoring {
  key: string; name: string; tracking: Tracking; capacity: CapacityId | null; records: number; last_day: string;
  groups: CompareGroup[]; transitions: Array<{ day: string; from: string; to: string }>;
}
export interface WindowSummary {
  key: '7d' | '28d' | 'todo'; from: string; to: string; realized: number; scheduled: number; present: number; absent: number; sent: number;
  partial: number; modified: number; assigned_not_done: number; prescription: { done: number; total: number; sessions: number };
  per_week: number | null; minutes: number | null; minutes_sessions: number; srpe_load: number | null; srpe_sessions: number; missing_srpe: number;
  exposure: Array<{ capacity: CapacityId; label: string; entries: number; sets: number }>; entries_total: number; unclassified: number;
  sets: { prescribed: number; performed: number; records: number };
  work: WorkTotals;
}
/** Trabajo hecho según la planificación: series, repeticiones, segundos de sostén y aeróbicos, y kilos × repeticiones. */
export interface WorkTotals { sets: number; reps: number; hold_s: number; aerobic_s: number; volume_kg: number }
export interface MonthRow { month: string; sessions: number; work: WorkTotals; sets_by_capacity: Partial<Record<CapacityId, number>>; srpe_load: number | null }
export interface WeekRow {
  week_start: string; sessions: number; days: string[]; minutes: number | null; srpe_load: number | null; srpe_sessions: number;
  missing_srpe: number; exposure: Partial<Record<CapacityId, number>>; sets_prescribed: number; sets_performed: number;
  work: WorkTotals;
}
export interface ReviewItem {
  kind: 'descenso' | 'esfuerzo' | 'sintomas' | 'datos' | 'parciales' | 'asistencia';
  title: string; detail: string; evidence: Array<{ day: string; text: string }>;
}
export interface Monitoring {
  today: string; windows: WindowSummary[]; weeks: WeekRow[]; months: MonthRow[];
  responses: Array<{ session_id: string; day: string; srpe: number | null; duration_min: number | null; load: number | null; status: string | null;
    fatigue: number | null; soreness: number | null; pain: number | null; pain_area: string | null; recovery: number | null; note: string | null; source: string }>;
  exercises: ExerciseMonitoring[]; review: ReviewItem[];
  changes: Array<{ at: string; session_id: string | null; session_day: string | null; category: ChangeCategory | null; reason: string | null; lines: string[]; context: string | null }>;
  coverage: { realized: number; with_srpe: number; with_duration: number; with_records: number; from_plan: number };
}

/** `existing`: ya estaba cargada (mismo texto y fecha); al importar no se repite. */
export type PreviewSession = Omit<Session, 'id' | 'completions'> & { existing: boolean };

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

export const coachApi = {
  students: () => req<{ students: StudentListItem[] }>('/training/students'),
  student: (id: string) => req<Profile>(`/training/students/${id}`),
  createStudent: (body: Partial<Student> & { name: string }) =>
    req<{ student: Student; password: string }>('/training/students', json('POST', body)),
  updateStudent: (id: string, body: Partial<Student>) =>
    req<{ student: Student; next_sessions: Occurrence[] }>(`/training/students/${id}`, json('PATCH', body)),
  resetPassword: (id: string) =>
    req<{ username: string; password: string }>(`/training/students/${id}/password`, json('POST', {})),
  deleteStudent: (id: string) => req<{ ok: true }>(`/training/students/${id}`, json('DELETE')),
  preview: (text: string, student_ids: string[], default_date: string) =>
    req<{ sessions: PreviewSession[]; warnings: string[] }>('/training/sessions/preview', json('POST', { text, student_ids, default_date })),
  saveSessions: (text: string, student_ids: string[], default_date: string) =>
    req<{ sessions: Session[]; skipped: number; warnings: string[] }>('/training/sessions', json('POST', { text, student_ids, default_date })),
  createRoutine: (body: { date: string; title: string | null; status: 'planned' | 'done'; participant_ids: string[]; routine: Routine }) =>
    req<{ session: Session }>('/training/sessions/routine', json('POST', body)),
  updateSession: (id: string, body: { date?: string; title?: string | null; status?: 'planned' | 'done'; participant_ids?: string[]; routine?: Routine; change_category?: ChangeCategory | null; change_reason?: string | null }) =>
    req<{ session: Session }>(`/training/sessions/${id}`, json('PATCH', body)),
  deleteSession: (id: string) => req<{ ok: true }>(`/training/sessions/${id}`, json('DELETE')),
  exercises: () => req<{ exercises: ExerciseEntry[] }>('/training/exercises'),
  createExercise: (body: { name: string; capacity: CapacityId | null; description?: string | null; video_url?: string | null; easier_key?: string | null }) =>
    req<{ exercise: unknown }>('/training/exercises', json('POST', body)),
  saveExercise: (key: string, body: { name: string; capacity: CapacityId | null; description?: string | null; video_url?: string | null; easier_key?: string | null }) =>
    req<{ exercise: unknown }>(`/training/exercises/${encodeURIComponent(key)}`, json('PUT', body)),
  activity: () => req<{ items: ActivityItem[]; unseen: number }>('/training/activity'),
  activitySeen: () => req<{ ok: true }>('/training/activity/seen', json('POST', {})),
  linkAssessment: (id: string, assessment_id: string) =>
    req<{ assessment_ids: string[] }>(`/training/students/${id}/assessments`, json('POST', { assessment_id })),
  unlinkAssessment: (id: string, assessment_id: string) =>
    req<{ assessment_ids: string[] }>(`/training/students/${id}/assessments/${assessment_id}`, json('DELETE')),
  finance: () => req<FinanceData>('/training/finance'),
  /** Registra un pago de un período: no crea ni cambia clases. */
  addPayment: (body: { student_id: string; charge_id: string; paid_on: string; amount: number; note?: string | null }) =>
    req<{ payment: Payment }>('/training/payments', json('POST', body)),
  deletePayment: (id: string) => req<{ ok: true }>(`/training/payments/${id}`, json('DELETE')),
  addCharge: (body: { student_id: string; kind: ChargeKind; starts_on: string; sessions?: number | null; amount: number; note?: string | null }) =>
    req<{ charge: Charge }>('/training/charges', json('POST', body)),
  updateCharge: (id: string, body: { sessions?: number; amount?: number; starts_on?: string; note?: string | null; reason?: string | null }) =>
    req<{ charge: Charge }>(`/training/charges/${id}`, json('PATCH', body)),
  deleteCharge: (id: string) => req<{ ok: true }>(`/training/charges/${id}`, json('DELETE')),
  chargeReview: () => req<{ items: ChargeReviewItem[] }>('/training/charges/review'),
  resolveCharge: (id: string, body: { action: 'merge'; into: string } | { action: 'opening' } | { action: 'keep' }) =>
    req<{ ok: true }>(`/training/charges/${id}/resolve`, json('POST', body)),
  setAttendance: (student_ids: string[], day: string, mark: Mark | null) =>
    req<{ ok: true }>('/training/attendance', json('PUT', { student_ids, day, mark })),
  reports: (id: string) =>
    req<{ first_date: string | null; current: Cycle | null; last_complete: Cycle | null; reports: StoredReport[] }>(`/training/students/${id}/reports`),
  reportPreview: (id: string, start: string) => req<{ report: ReportData }>(`/training/students/${id}/reports/preview?start=${start}`),
  publishReport: (id: string, body: { start: string; message: string | null; next_goal: string | null }) =>
    req<{ report: StoredReport }>(`/training/students/${id}/reports`, json('POST', body)),
  deleteReport: (id: string) => req<{ ok: true }>(`/training/reports/${id}`, json('DELETE')),
  addQuality: (id: string, body: { exercise_name: string; day: string; score: number; aspects: QualityAspect[]; note: string | null }) =>
    req<{ entry: QualityEntry }>(`/training/students/${id}/quality`, json('POST', body)),
  deleteQuality: (id: string) => req<{ ok: true }>(`/training/quality/${id}`, json('DELETE')),
  monitoring: (id: string) => req<{ monitoring: Monitoring }>(`/training/students/${id}/monitoring`),
  record: (sessionId: string, studentId: string) => req<RecordData>(`/training/sessions/${sessionId}/record/${studentId}`),
  saveRecord: (sessionId: string, studentId: string, body: { executions: ExecutionDraft[]; response?: ResponseDraft | null; reason?: string | null }) =>
    req<RecordData>(`/training/sessions/${sessionId}/record/${studentId}`, json('PUT', body)),
  planRecent: () => req<{ ids: string[] }>('/training/prefs/plan-recent'),
  pushPlanRecent: (id: string) => req<{ ids: string[] }>('/training/prefs/plan-recent', json('PUT', { id })),
};

// ── comunidad, fotos y perfiles ─────────────────────────────────────────────

export interface Person { id: string; name: string; coach: boolean; avatar: string | null }
export interface CommunityMessage { id: string; author: string; body: string; created_at: string; mine: boolean }
export const socialApi = {
  people: () => req<{ me: string; people: Person[] }>('/social/people'),
  setCoachName: (name: string) => req<{ name: string }>('/social/coach', json('PUT', { name })),
  setAvatar: (owner: string, data: string) => req<{ avatar: string }>(`/social/avatars/${owner}`, json('PUT', { data })),
  deleteAvatar: (owner: string) => req<{ ok: true }>(`/social/avatars/${owner}`, json('DELETE')),
  community: () => req<{ me: string; last_read: string | null; unread: number; messages: CommunityMessage[] }>('/social/community'),
  unread: () => req<{ unread: number }>('/social/community/unread'),
  post: (body: string) => req<{ message: CommunityMessage }>('/social/community', json('POST', { body })),
  read: (at: string) => req<{ ok: true }>('/social/community/read', json('POST', { at })),
  deleteMessage: (id: string) => req<{ ok: true }>(`/social/community/${id}`, json('DELETE')),
};

export const studentApi = {
  me: () => req<Profile>('/me'),
  progress: (sessionId: string, body: { checks?: string[]; notes?: Record<string, string> }) =>
    req<{ completion: Completion }>(`/me/sessions/${sessionId}/progress`, json('PUT', body)),
  complete: (sessionId: string, body: { checks?: string[]; notes?: Record<string, string>; feeling?: number | null; comment?: string | null }) =>
    req<{ completion: Completion }>(`/me/sessions/${sessionId}/complete`, json('POST', body)),
  changePassword: (current: string, next: string) => req<{ ok: true }>('/me/password', json('POST', { current, next })),
  reportSeen: (id: string) => req<{ ok: true }>(`/me/reports/${id}/seen`, json('POST', {})),
  updateMe: (body: { name?: string; age?: number | null; phone?: string | null; about?: string | null }) =>
    req<{ student: Student; phone: string | null }>('/me', json('PATCH', body)),
  record: (sessionId: string) => req<RecordData>(`/me/sessions/${sessionId}/record`),
  saveRecord: (sessionId: string, body: { executions: ExecutionDraft[]; response?: ResponseDraft | null; reason?: string | null }) =>
    req<RecordData>(`/me/sessions/${sessionId}/record`, json('PUT', body)),
  plan: () => req<FinanceData>('/me/plan'),
  payNotice: () => req<{ ok: true; pago_avisado: string }>('/me/plan/aviso', json('POST', {})),
};

// ── rutina: utilidades ──────────────────────────────────────────────────────

export const uid = (): string => Math.random().toString(36).slice(2, 10);

/** Ejercicios contables (sin notas ni variantes personales). */
export const exerciseItems = (r: Routine): RoutineItem[] =>
  r.blocks.filter((b) => b.kind !== 'notes').flatMap((b) => b.groups.flatMap((g) => g.items)).filter((i) => !i.who);

/** Ítems que el alumno marca: los propios, contando su variante en lugar de la base. */
export function checkableItems(r: Routine, viewer: string | undefined): RoutineItem[] {
  const out: RoutineItem[] = [];
  for (const b of r.blocks) {
    if (b.kind === 'notes') continue;
    for (const g of b.groups) {
      g.items.forEach((it, i) => {
        if (it.who) {
          if (viewer && fold(it.who) === fold(viewer)) out.push(it);
          return;
        }
        const next = g.items[i + 1];
        if (viewer && next?.who && fold(next.who) === fold(viewer)) return;
        out.push(it);
      });
    }
  }
  return out;
}

/** Cuántos ejercicios de cada capacidad tiene la rutina (orden fijo). */
export function capacityMix(r: Routine): Array<{ id: CapacityId; count: number }> {
  const m = new Map<CapacityId, number>();
  for (const it of exerciseItems(r)) if (it.capacity) m.set(it.capacity, (m.get(it.capacity) ?? 0) + 1);
  return CAPACITIES.filter((c) => m.has(c.id)).map((c) => ({ id: c.id, count: m.get(c.id)! }));
}

/** Etiqueta de cada grupo: 1, 2… en circuitos; A1, A2… (B1…) en superseries. */
export function groupLabels(r: Routine): Map<string, string> {
  const labels = new Map<string, string>();
  let letter = 0;
  for (const b of r.blocks) {
    if (b.kind === 'superset') {
      const L = String.fromCharCode(65 + letter++);
      b.groups.forEach((g, i) => labels.set(g.id, `${L}${i + 1}`));
    } else b.groups.forEach((g, i) => labels.set(g.id, String(i + 1)));
  }
  return labels;
}

export const itemText = (it: RoutineItem): string => `${it.name} ${it.dose}`.trim();

export function routineSummary(r: Routine): string {
  if (!r.blocks.length) return r.note ?? 'Sin bloques';
  return r.blocks
    .filter((b) => b.kind !== 'notes')
    .map((b) => `${b.title || KIND_LABEL[b.kind]}${b.rounds ? ` ×${b.rounds}` : ''}`)
    .join(' · ') || (r.note ?? '');
}

/** Copia profunda con ids nuevos (para usar una sesión como base de otra). */
export function cloneRoutine(r: Routine): Routine {
  return {
    note: r.note ?? null,
    blocks: r.blocks.map((b) => ({
      ...b, id: uid(),
      groups: b.groups.map((g) => ({ id: uid(), items: g.items.map(({ capacity: _c, ...it }) => ({ ...it, id: uid() })) })),
    })),
  };
}

export const completionOf = (s: Session, studentId: string): Completion | undefined =>
  s.completions.find((c) => c.student_id === studentId);

// ── agenda ──────────────────────────────────────────────────────────────────

export const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export const WEEKDAYS_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const addDays = (iso: string, n: number): string => {
  const [y, m, d] = iso.split('-').map(Number);
  const x = new Date(y!, m! - 1, d! + n);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
export { addDays };

export function occurrences(s: Schedule | null, from: string, to: string): Occurrence[] {
  if (!s) return [];
  const skip = new Set(s.skip);
  const out: Occurrence[] = [];
  for (let d = from, g = 0; d <= to && g < 800; d = addDays(d, 1), g++) {
    const wd = parse(d).getDay();
    if (!skip.has(d)) for (const w of s.weekly) if (w.weekday === wd) out.push({ date: d, time: w.time });
    for (const o of s.once) if (o.date === d) out.push({ date: d, time: o.time, note: o.note ?? null });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''));
}

export const emptySchedule = (): Schedule => ({ weekly: [], once: [], skip: [] });

// ── formato ─────────────────────────────────────────────────────────────────

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const MONTH_NAMES = MONTHS;

export const parse = (d: string): Date => {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, day ?? 1);
};

/** Fecha local (YYYY-MM-DD) de un instante; por defecto, ahora. */
export const localDateOf = (at: Date | string = new Date()): string => {
  const n = typeof at === 'string' ? new Date(at) : at;
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
};
export const todayIso = (): string => localDateOf();

/** "lunes 12 de octubre" (+ año si no es el actual). */
export function longDate(d: string): string {
  const x = parse(d);
  const y = x.getFullYear() !== new Date().getFullYear() ? ` de ${x.getFullYear()}` : '';
  return `${DAYS[x.getDay()]} ${x.getDate()} de ${MONTHS[x.getMonth()]}${y}`;
}
/** "12 oct" */
/** "vie 06/11/2026": siempre día/mes, sin depender del idioma de la computadora. */
export function dmy(d: string): string {
  const x = parse(d);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${DAYS[x.getDay()]!.slice(0, 3)} ${p(x.getDate())}/${p(x.getMonth() + 1)}/${x.getFullYear()}`;
}
/** "noviembre de 2026" */
export const monthLong = (m: string): string => `${MONTHS[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}`;
export const shortDate = (d: string): string => {
  const x = parse(d);
  return `${x.getDate()} ${MONTHS[x.getMonth()]!.slice(0, 3)}`;
};
/** "lun 12" */
export const dayLabel = (d: string): string => {
  const x = parse(d);
  return `${DAYS[x.getDay()]!.slice(0, 3)} ${x.getDate()}`;
};
export const monthShort = (ym: string): string => MONTHS[Number(ym.slice(5, 7)) - 1]!.slice(0, 3);

/** "Hoy 18:00", "Mañana", "jue 22 · 18:00". */
export function whenLabel(o: Occurrence | null | undefined): string {
  if (!o) return 'Sin agenda';
  const t = todayIso();
  const day = o.date === t ? 'Hoy' : o.date === addDays(t, 1) ? 'Mañana' : dayLabel(o.date);
  return o.time ? `${day} · ${o.time}` : day;
}

export function relDays(d: string | null): string {
  if (!d) return 'sin sesiones';
  const diff = Math.round((parse(todayIso()).getTime() - parse(d).getTime()) / 86400000);
  if (diff < 0) return diff === -1 ? 'mañana' : `en ${-diff} días`;
  if (diff === 0) return 'hoy';
  if (diff === 1) return 'ayer';
  if (diff < 14) return `hace ${diff} días`;
  if (diff < 60) return `hace ${Math.round(diff / 7)} semanas`;
  return `hace ${Math.round(diff / 30)} meses`;
}
export const daysSince = (d: string | null): number | null =>
  d ? Math.round((parse(todayIso()).getTime() - parse(d).getTime()) / 86400000) : null;

export function timeAgo(isoTs: string): string {
  const min = Math.round((Date.now() - new Date(isoTs).getTime()) / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return relDays(localDateOf(isoTs));
}

export function fmtValue(v: number, unit: Unit): string {
  if (unit === 's') {
    if (v >= 60) {
      const m = Math.floor(v / 60);
      const s = Math.round(v % 60);
      return s ? `${m}:${String(s).padStart(2, '0')} min` : `${m} min`;
    }
    return `${v} s`;
  }
  if (unit === 'kg') return `${v} kg`;
  return `${v}`;
}
export const unitLabel = (u: Unit): string => (u === 's' ? 'tiempo' : u === 'kg' ? 'kilos' : 'repeticiones');
export const pctGain = (from: number, to: number): number => (from > 0 ? Math.round(((to - from) / from) * 100) : 0);

export const initials = (name: string): string =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
export const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? name;
export const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export const SEX_LABEL: Record<Sex, string> = { MALE: 'Masculino', FEMALE: 'Femenino' };
export const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * La rutina escrita con el formato de siempre del profe (el mismo que entiende "Pegar texto"):
 *   Cat/Cow - Spinal Bridge             ← lista
 *   [Crawling 20s/ Tabletop - Plank] x2 ← circuito: estaciones con " - ", alternados con "/"
 *   A1 - Skater Sq 10r + CMJ 3          ← bloque principal, y "x3" abajo
 */
export function routineToText(r: Routine): string {
  const it = (x: RoutineItem) => (x.who ? `${x.who} ${itemText(x)}` : itemText(x));
  const out: string[] = [];
  let letter = 0;
  for (const b of r.blocks) {
    const groups = b.groups.map((g) => g.items.filter((x) => itemText(x)));
    const has = groups.some((g) => g.length);
    if (!has) continue;
    if (b.kind === 'list') {
      out.push(groups.flatMap((g) => g.map(it)).join(' - '));
    } else if (b.kind === 'circuit') {
      out.push(`[${groups.filter((g) => g.length).map((g) => g.map(it).join('/ ')).join(' - ')}]${b.rounds ? ` x${b.rounds}` : ''}`);
    } else if (b.kind === 'superset') {
      const L = String.fromCharCode(65 + letter++);
      groups.filter((g) => g.length).forEach((g, i) => out.push(`${L}${i + 1} - ${g.map(it).join(' + ')}`));
      if (b.rounds) out.push(`x${b.rounds}`);
    } else {
      for (const g of groups) for (const x of g) out.push(itemText(x));
    }
    out.push('');
  }
  if (r.note) out.push(r.note);
  return out.join('\n').trim();
}

/** Después de leer el texto: los ejercicios que ya estaban conservan su id (notas y checks del alumno). */
export function keepIds(prev: Routine, next: Routine): Routine {
  const pool = new Map<string, string[]>();
  for (const b of prev.blocks) for (const g of b.groups) for (const x of g.items) {
    const k = `${(x.who ?? '').toLowerCase()}|${x.name.trim().toLowerCase()}`;
    pool.set(k, [...(pool.get(k) ?? []), x.id]);
  }
  const used = new Set<string>();
  const blocks = next.blocks.map((b) => ({
    ...b,
    groups: b.groups.map((g) => ({
      ...g,
      items: g.items.map((x) => {
        const k = `${(x.who ?? '').toLowerCase()}|${x.name.trim().toLowerCase()}`;
        const id = (pool.get(k) ?? []).find((i) => !used.has(i));
        if (id) { used.add(id); return { ...x, id }; }
        return x;
      }),
    })),
  }));
  return { ...next, blocks };
}
