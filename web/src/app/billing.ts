/**
 * Cálculos de cobros y asistencia (los mismos del "Registro de alumnos"):
 * saldo del paquete de clases, cuándo paga cada alumno, quién entrena cada día,
 * puntualidad de los pagos y alertas. El horario sale de la agenda del alumno y
 * una sesión cargada cuenta como presente si ese día no tiene otra marca.
 */
import {
  addDays, AttendanceRow, Billing, emptyBilling, Estado, FinanceData, FinanceStudent, Mark, occurrences, parse, Payment,
  shortDate, longDate, MONTH_NAMES, firstName,
} from './data';

export const PROG_DIAS = 28;

export const money = (n: number): string =>
  `US$ ${(Math.round((n || 0) * 100) / 100).toLocaleString('es-AR')}`;
export const ym = (d: string): string => d.slice(0, 7);
export const shiftYM = (m: string, k: number): string => {
  const d = parse(`${m}-01`);
  d.setMonth(d.getMonth() + k);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
export const monthName = (m: string): string => MONTH_NAMES[Number(m.slice(5, 7)) - 1]!;
export const daysBetween = (a: string, b: string): number => Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);
export const weekOf = (f: string): string[] => {
  const wd = (parse(f).getDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => addDays(f, i - wd));
};

export const MARKS: Record<Mark, { label: string; short: string; cls: string }> = {
  p: { label: 'Presente', short: 'P', cls: 'ok' },
  a: { label: 'Ausente', short: 'A', cls: 'bad' },
  e: { label: 'Ejercicios', short: 'E', cls: 'info' },
};
export const MOD_LABEL: Record<Billing['modalidad'], string> = {
  presencial: 'Presencial', virtual_sinc: 'Virtual sincrónico', virtual_asinc: 'Virtual asincrónico',
};
export const ESTADO_LABEL: Record<Estado, string> = { activo: 'Activo', pausa: 'En pausa', baja: 'Baja' };

export type PayKind = 'debe' | 'pagar' | 'pronto' | 'aldia' | 'sinfecha';
export interface PayState { k: PayKind; t: string; cls: string; due: string | null; monto: number; restan?: number }
export const urgente = (c: PayState): boolean => c.k === 'debe' || c.k === 'pagar';

export interface Fin {
  today: string;
  students: FinanceStudent[];
  payments: Payment[];
  billing(s: FinanceStudent): Billing;
  estado(s: FinanceStudent): { estado: Estado; auto: boolean };
  activos(): FinanceStudent[];
  isAsinc(s: FinanceStudent): boolean;
  modo(s: FinanceStudent): 'clases' | 'mensual' | 'prog';
  modoTxt(s: FinanceStudent): string;
  clasesSem(s: FinanceStudent): number;
  clasesPaquete(s: FinanceStudent): number;
  cuotaEn(s: FinanceStudent, f: string): number;
  pagosDe(id: string): Payment[];
  marca(id: string, f: string): Mark | null;
  /** Marca explícita del día, sin contar las sesiones cargadas. */
  marcaExplicita(id: string, f: string): Mark | null;
  marcasDe(id: string): Array<[string, Mark]>;
  proximasClases(s: FinanceStudent, n: number): string[];
  saldo(s: FinanceStudent): { restan: number; tomadas: number; desde: string } | null;
  estadoPago(s: FinanceStudent): PayState;
  cobradoEn(m: string): number;
  proximos30(): Array<{ s: FinanceStudent; c: PayState }>;
  estadoProg(s: FinanceStudent): { k: 'atrasada' | 'pronto' | 'ok' | 'sinfecha'; t: string; cls: string; prox: string | null };
  racha(s: FinanceStudent): number;
  programados(f: string): Array<{ s: FinanceStudent; time: string; from: string | null; planned: boolean }>;
  movidosDesde(f: string): Array<{ s: FinanceStudent; to: string; time: string | null }>;
  posPaquete(s: FinanceStudent, f: string): { i: number; N: number; primera: boolean; ultima: boolean; pagado: boolean } | null;
  etiquetaPaquete(s: FinanceStudent, f: string): { t: string; cls: string } | null;
  paqueteTxt(s: FinanceStudent, f: string): string;
  recordatorio(s: FinanceStudent): string;
  reporte(s: FinanceStudent, ini: string): StudentReport;
  /** Ciclo de 4 semanas terminado que todavía no tiene informe. */
  informePendiente(s: FinanceStudent): { n: number; start: string; end: string } | null;
}

export interface StudentReport {
  s: FinanceStudent; k: Record<Mark, number>; clases: number; pct: number | null; mov: number;
  pagos: number; aTermino: number; tarde: number; prom: number; flags: Array<[string, string]>;
}

export function makeFin(d: FinanceData): Fin {
  const today = d.today;
  const byId = new Map(d.students.map((s) => [s.id, s]));
  const explicit = new Map<string, Map<string, Mark>>();
  for (const a of d.attendance as AttendanceRow[]) {
    if (!explicit.has(a.student_id)) explicit.set(a.student_id, new Map());
    explicit.get(a.student_id)!.set(a.day, a.mark);
  }
  const marksCache = new Map<string, Array<[string, Mark]>>();
  const payCache = new Map<string, Payment[]>();

  const billing = (s: FinanceStudent): Billing => ({ ...emptyBilling(), ...(s.billing ?? {}) });
  const isAsinc = (s: FinanceStudent) => billing(s).modalidad === 'virtual_asinc';
  const modo = (s: FinanceStudent) => (isAsinc(s) ? 'prog' : billing(s).pago_modo) as 'clases' | 'mensual' | 'prog';
  const clasesSem = (s: FinanceStudent) => billing(s).clases_sem ?? s.schedule?.weekly.length ?? 0;
  const clasesPaquete = (s: FinanceStudent) => clasesSem(s) * (billing(s).ciclo_sem || 4);

  const estado = (s: FinanceStudent): { estado: Estado; auto: boolean } => {
    const b = billing(s);
    if (b.estado) return { estado: b.estado, auto: false };
    // Sin estado cargado: activo si entrenó en los últimos 2 meses, tiene agenda o rutina asignada, o es nuevo.
    const recent = s.last_date && daysBetween(s.last_date, today) <= 60;
    const agenda = occurrences(s.schedule, today, addDays(today, 14)).length > 0;
    const planned = s.planned_days.some((x) => x >= today);
    const nuevo = daysBetween(s.created_at.slice(0, 10), today) <= 30 && !s.last_date;
    return { estado: recent || agenda || planned || nuevo ? 'activo' : 'pausa', auto: true };
  };
  const activos = () => d.students.filter((s) => estado(s).estado === 'activo');

  const cuotaEn = (s: FinanceStudent, f: string) => {
    const b = billing(s);
    const h = b.historial_cuota.filter((x) => x.desde <= f).sort((x, y) => x.desde.localeCompare(y.desde));
    return h.length ? h[h.length - 1]!.monto : b.cuota ?? 0;
  };
  const pagosDe = (id: string) => {
    if (!payCache.has(id)) {
      payCache.set(id, d.payments.filter((p) => p.student_id === id)
        .sort((x, y) => x.paid_on.localeCompare(y.paid_on) || x.created_at.localeCompare(y.created_at)));
    }
    return payCache.get(id)!;
  };
  const marcasDe = (id: string): Array<[string, Mark]> => {
    if (!marksCache.has(id)) {
      const m = new Map<string, Mark>();
      for (const day of byId.get(id)?.session_days ?? []) m.set(day, 'p');
      for (const [day, mk] of explicit.get(id) ?? []) m.set(day, mk);
      marksCache.set(id, [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])));
    }
    return marksCache.get(id)!;
  };
  const marcaExplicita = (id: string, f: string) => explicit.get(id)?.get(f) ?? null;
  const marca = (id: string, f: string) => marcaExplicita(id, f) ?? (byId.get(id)?.session_days.includes(f) ? 'p' : null);

  const proximasClases = (s: FinanceStudent, n: number): string[] => {
    if (n <= 0) return [];
    return occurrences(s.schedule, today, addDays(today, 200))
      .map((o) => o.date)
      .filter((f, i, arr) => arr.indexOf(f) === i && !(f === today && marca(s.id, f)))
      .slice(0, n);
  };

  const saldo = (s: FinanceStudent) => {
    if (modo(s) !== 'clases') return null;
    const b = billing(s);
    const desde = b.cuenta_desde || pagosDe(s.id)[0]?.paid_on;
    if (!desde) return null;
    const pagadas = pagosDe(s.id).filter((p) => p.paid_on >= desde).reduce((a, p) => a + (p.classes ?? 0), 0);
    const tomadas = marcasDe(s.id).filter(([f]) => f >= desde && f <= today).length;
    return { restan: (b.saldo_inicial || 0) + pagadas - tomadas, tomadas, desde };
  };

  const estadoPago = (s: FinanceStudent): PayState => {
    const monto = cuotaEn(s, today);
    const m = modo(s);
    if (m === 'clases') {
      const sd = saldo(s);
      if (!sd) return { k: 'sinfecha', t: 'Sin datos del paquete', cls: '', due: null, monto };
      const N = clasesPaquete(s);
      if (sd.restan < 0) {
        return { k: 'debe', t: `Debe ${-sd.restan} ${-sd.restan === 1 ? 'clase' : 'clases'}`, cls: 'bad', due: proximasClases(s, 1)[0] ?? today, monto, restan: sd.restan };
      }
      if (sd.restan === 0) {
        const nx = proximasClases(s, 1)[0] ?? null;
        return { k: 'pagar', t: nx ? `Paga el ${shortDate(nx)}` : 'Paga en la próxima clase', cls: 'bad', due: nx ?? today, monto, restan: 0 };
      }
      const fechas = proximasClases(s, sd.restan + 1);
      const due = fechas.length === sd.restan + 1 ? fechas[sd.restan]! : null;
      const quedan = `Quedan ${sd.restan}${N ? ` de ${N}` : ''}`;
      const t = due ? `${quedan} · paga el ${shortDate(due)}` : quedan;
      if (sd.restan <= (clasesSem(s) || 1)) return { k: 'pronto', t, cls: 'low', due, monto, restan: sd.restan };
      return { k: 'aldia', t, cls: 'ok', due, monto, restan: sd.restan };
    }
    let due: string | null = null;
    if (m === 'mensual') {
      const ult = pagosDe(s.id).map((p) => p.period ?? '').filter(Boolean).sort().pop();
      due = ult ? `${shiftYM(ult, 1)}-01` : billing(s).vence;
    } else {
      const base = [pagosDe(s.id).map((p) => p.paid_on).pop(), billing(s).prog_enviada].filter((x): x is string => Boolean(x)).sort().pop();
      due = base ? addDays(base, PROG_DIAS) : null;
    }
    if (!due) return { k: 'sinfecha', t: 'Sin vencimiento', cls: '', due, monto };
    const diff = daysBetween(today, due);
    if (diff < 0) return { k: 'debe', t: `Vencido hace ${-diff} d`, cls: 'bad', due, monto };
    if (diff <= 7) return { k: 'pronto', t: diff === 0 ? 'Vence hoy' : `Vence el ${shortDate(due)}`, cls: 'low', due, monto };
    return { k: 'aldia', t: `Al día hasta ${shortDate(due)}`, cls: 'ok', due, monto };
  };

  const cobradoEn = (m: string) => d.payments.filter((p) => p.paid_on.startsWith(m)).reduce((a, p) => a + p.amount, 0);
  const proximos30 = () => {
    const lim = addDays(today, 30);
    return activos().map((s) => ({ s, c: estadoPago(s) })).filter((x) => urgente(x.c) || (x.c.due && x.c.due <= lim));
  };

  const estadoProg = (s: FinanceStudent) => {
    const b = billing(s);
    if (b.prog_pendiente) return { k: 'atrasada' as const, t: 'Para mandar', cls: 'bad', prox: today };
    if (!b.prog_enviada) return { k: 'sinfecha' as const, t: 'Sin fecha de envío', cls: '', prox: null };
    const prox = addDays(b.prog_enviada, PROG_DIAS);
    const diff = daysBetween(today, prox);
    if (diff < 0) return { k: 'atrasada' as const, t: `Atrasada ${-diff} d`, cls: 'bad', prox };
    if (diff <= 3) return { k: 'pronto' as const, t: diff === 0 ? 'Mandar hoy' : `Mandar en ${diff} d`, cls: 'low', prox };
    return { k: 'ok' as const, t: `Próxima ${shortDate(prox)}`, cls: 'ok', prox };
  };

  const racha = (s: FinanceStudent) => {
    let n = 0;
    const ms = marcasDe(s.id).filter(([f]) => f <= today);
    for (let i = ms.length - 1; i >= 0; i--) {
      if (ms[i]![1] === 'a') n++;
      else break;
    }
    return n;
  };

  const programados = (f: string) => {
    const out: Array<{ s: FinanceStudent; time: string; from: string | null; planned: boolean }> = [];
    for (const s of d.students) {
      if (estado(s).estado !== 'activo' || isAsinc(s)) continue;
      const occ = occurrences(s.schedule, f, f);
      const moved = s.schedule?.once.find((o) => o.date === f && o.from) ?? null;
      const planned = s.planned_days.includes(f);
      if (!occ.length && !planned) continue;
      out.push({ s, time: moved?.time ?? occ[0]?.time ?? '', from: moved?.from ?? null, planned });
    }
    return out;
  };
  const movidosDesde = (f: string) => d.students.flatMap((s) => {
    const o = s.schedule?.once.find((x) => x.from === f);
    return o && estado(s).estado === 'activo' ? [{ s, to: o.date, time: o.time }] : [];
  });

  const posPaquete = (s: FinanceStudent, f: string) => {
    const b = billing(s);
    if (modo(s) !== 'clases' || !b.cuenta_desde || f < b.cuenta_desde) return null;
    const ms = marcasDe(s.id).filter(([x]) => x >= b.cuenta_desde!);
    let n: number;
    if (marca(s.id, f)) n = ms.filter(([x]) => x <= f).length;
    else if (f >= today) {
      const i = proximasClases(s, 80).indexOf(f);
      if (i < 0) return null;
      n = ms.filter(([x]) => x <= today).length + i + 1;
    } else return null;
    const bounds = [b.saldo_inicial || 0];
    for (const p of pagosDe(s.id).filter((p) => p.paid_on >= b.cuenta_desde!)) bounds.push(bounds[bounds.length - 1]! + (p.classes ?? 0));
    const pagado = bounds[bounds.length - 1]!;
    const paq = clasesPaquete(s) || 4;
    while (bounds[bounds.length - 1]! < n) bounds.push(bounds[bounds.length - 1]! + paq);
    const k = bounds.findIndex((x) => x >= n);
    const ini = k > 0 ? bounds[k - 1]! : 0;
    const fin = bounds[k]!;
    if (k === 0) return { i: paq - (fin - n), N: paq, primera: false, ultima: n === fin, pagado: true };
    return { i: n - ini, N: fin - ini, primera: n === ini + 1, ultima: n === fin, pagado: n <= pagado };
  };
  const etiquetaPaquete = (s: FinanceStudent, f: string) => {
    const p = posPaquete(s, f);
    if (!p) return null;
    if (p.primera) return p.pagado ? { t: '1ª del paquete · pagado', cls: 'ok' } : { t: '1ª del paquete · tiene que pagar', cls: 'bad' };
    if (p.ultima) return { t: 'Última del paquete', cls: 'low' };
    return null;
  };
  const paqueteTxt = (s: FinanceStudent, f: string) => {
    if (modo(s) === 'mensual') return 'Pago mensual';
    const p = posPaquete(s, f);
    return p ? `Clase ${p.i}/${p.N} del paquete` : 'Sin datos del paquete';
  };

  const modoTxt = (s: FinanceStudent) => ({
    clases: `Paquete de ${clasesPaquete(s) || '—'} clases (${billing(s).ciclo_sem || 4} semanas)`,
    mensual: 'Mensual, a principio de mes',
    prog: 'Por programación (4 semanas)',
  })[modo(s)];

  const recordatorio = (s: FinanceStudent) => {
    const c = estadoPago(s);
    const nombre = firstName(s.name);
    const m = modo(s);
    if (m === 'clases') {
      const r = c.restan ?? 0;
      return r <= 0
        ? `Hola ${nombre}! Te aviso que terminaste el paquete de clases de HTC. Para la próxima clase${c.due ? ` (${shortDate(c.due)})` : ''} toca renovar: ${money(c.monto)}. Gracias!`
        : `Hola ${nombre}! Te ${r === 1 ? 'queda 1 clase' : `quedan ${r} clases`} del paquete de HTC${c.due ? `; el ${shortDate(c.due)} toca renovar` : ''} (${money(c.monto)}). Gracias!`;
    }
    if (m === 'mensual') {
      return c.k === 'debe'
        ? `Hola ${nombre}! Te escribo porque todavía no tengo registrado el pago de HTC que vencía el ${c.due ? shortDate(c.due) : '—'} (${money(c.monto)}). Cuando puedas, avisame. Gracias!`
        : `Hola ${nombre}! Te recuerdo que el ${c.due ? shortDate(c.due) : '—'} vence el pago mensual de HTC (${money(c.monto)}). Gracias!`;
    }
    return `Hola ${nombre}! Ya casi terminás tu programación de HTC. Para armarte la próxima son ${money(c.monto)}. Gracias!`;
  };

  const puntualidad = (s: FinanceStudent, ini: string) => {
    const out: Array<{ atraso: number }> = [];
    const b = billing(s);
    if (modo(s) === 'clases' && b.cuenta_desde) {
      const M = marcasDe(s.id).filter(([x]) => x >= b.cuenta_desde!).map(([x]) => x);
      let k = b.saldo_inicial || 0;
      for (const p of pagosDe(s.id).filter((p) => p.paid_on >= b.cuenta_desde!)) {
        const clase = M[k];
        k += p.classes ?? 0;
        if (p.paid_on < ini) continue;
        out.push({ atraso: clase ? Math.max(0, daysBetween(clase, p.paid_on)) : 0 });
      }
    } else if (modo(s) === 'mensual') {
      for (const p of pagosDe(s.id).filter((p) => p.period && p.paid_on >= ini)) {
        out.push({ atraso: Math.max(0, daysBetween(`${p.period}-01`, p.paid_on) - 5) });
      }
    }
    return out;
  };

  const reporte = (s: FinanceStudent, ini: string): StudentReport => {
    const ms = marcasDe(s.id).filter(([x]) => x >= ini && x <= today);
    const k: Record<Mark, number> = { p: 0, a: 0, e: 0 };
    for (const [, v] of ms) k[v]++;
    const clases = ms.length;
    const pct = clases ? Math.round((k.p / clases) * 100) : null;
    const mov = (s.schedule?.once ?? []).filter((o) => o.from && o.from >= ini && o.from <= today).length;
    const pun = puntualidad(s, ini);
    const tarde = pun.filter((x) => x.atraso > 0);
    const prom = tarde.length ? Math.round(tarde.reduce((a, x) => a + x.atraso, 0) / tarde.length) : 0;
    const flags: Array<[string, string]> = [];
    if (clases >= 4 && pct !== null && pct < 75) flags.push(['Falta seguido', 'bad']);
    if (mov >= 2 && mov / Math.max(clases, 1) >= 0.25) flags.push(['Pasa muchas clases', 'low']);
    if (tarde.length >= 2 || prom > 3) flags.push(['Paga tarde', 'bad']);
    const st = estado(s).estado === 'activo' ? estadoPago(s) : null;
    if (st && st.k === 'debe') flags.push([st.t, 'bad']);
    return { s, k, clases, pct, mov, pagos: pun.length, aTermino: pun.length - tarde.length, tarde: tarde.length, prom, flags };
  };

  const informePendiente = (s: FinanceStudent) => {
    if (!s.first_date || estado(s).estado !== 'activo') return null;
    const n = Math.floor(daysBetween(s.first_date, today) / PROG_DIAS) + 1;
    if (n < 2) return null;
    const start = addDays(s.first_date, (n - 2) * PROG_DIAS);
    const end = addDays(start, PROG_DIAS - 1);
    if (s.last_report_start && s.last_report_start >= start) return null;
    if (!s.session_days.some((x) => x >= start && x <= end)) return null;
    return { n: n - 1, start, end };
  };

  return {
    today, students: d.students, payments: d.payments, billing, estado, activos, isAsinc, modo, modoTxt, clasesSem, clasesPaquete,
    cuotaEn, pagosDe, marca, marcaExplicita, marcasDe, proximasClases, saldo, estadoPago, cobradoEn, proximos30, estadoProg, racha,
    programados, movidosDesde, posPaquete, etiquetaPaquete, paqueteTxt, recordatorio, reporte, informePendiente,
  };
}

export const queCubre = (p: Payment): string =>
  p.classes ? `${p.classes} clases` : p.period ? `Mes de ${monthName(p.period)}` : 'Programación';
export const fmtLong = (f: string | null): string => (f ? longDate(f) : '—');
