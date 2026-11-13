/**
 * Cálculos de cobros y asistencia (los mismos del "Registro de alumnos"):
 * saldo del paquete de clases, cuándo paga cada alumno, quién entrena cada día,
 * puntualidad de los pagos y alertas. El horario sale de la agenda del alumno y
 * una sesión cargada cuenta como presente si ese día no tiene otra marca.
 */
import {
  addDays, AttendanceRow, Billing, Charge, ChargeKind, emptyBilling, Estado, FinanceData, FinanceStudent, Mark, Moneda, occurrences, parse, Payment,
  shortDate, longDate, MONTH_NAMES, firstName,
} from './data';

export const PROG_DIAS = 28;

export const money = (n: number, cur: Moneda = 'USD'): string =>
  `${cur === 'ARS' ? '$' : 'US$'} ${(Math.round((n || 0) * 100) / 100).toLocaleString('es-AR')}`;
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
export interface PayState { k: PayKind; t: string; cls: string; due: string | null; monto: number; moneda: Moneda; restan?: number }
export const urgente = (c: PayState): boolean => c.k === 'debe' || c.k === 'pagar';

export interface Fin {
  today: string;
  students: FinanceStudent[];
  payments: Payment[];
  charges: Charge[];
  /** Períodos del alumno, del más viejo al más nuevo. */
  cargosDe(id: string): Charge[];
  cargo(id: string | null): Charge | null;
  pagosDeCargo(c: Charge): Payment[];
  pagadoDe(c: Charge): number;
  /** Lo que falta pagar del período (negativo = pagado de más). */
  saldoDe(c: Charge): number;
  /** Períodos con saldo pendiente, el más viejo primero (el primero es el sugerido). */
  pendientes(s: FinanceStudent): Charge[];
  /** Las clases de este período se suman al saldo del paquete. */
  cuenta(s: FinanceStudent, c: Charge): boolean;
  cargoTxt(c: Charge): string;
  /** Mes del período, para confirmar la asignación. */
  cargoMes(c: Charge): string;
  /** Qué cubre un pago (el período al que se asignó). */
  queCubre(p: Payment): string;
  /** Datos sugeridos para crear el período que sigue. */
  sugerirPeriodo(s: FinanceStudent): { kind: ChargeKind; starts_on: string; sessions: number | null; amount: number };
  /** Ya existe un período igual (mismo mes, o paquete/programación que arranca ese día). */
  periodoExistente(s: FinanceStudent, kind: ChargeKind, startsOn: string): Charge | null;
  billing(s: FinanceStudent): Billing;
  moneda(s: FinanceStudent | string): Moneda;
  /** Total de pagos o montos, separado por moneda si hay más de una. */
  totalTxt(items: Array<{ student_id: string; amount: number }>): string;
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
  /** Fecha de pago del mes (mensuales): la primera clase de ese mes. */
  primeraDelMes(s: FinanceStudent, m: string): string;
  /** Alumnos a los que les queda una clase antes de empezar el ciclo nuevo. */
  avisosCiclo(): Array<{ s: FinanceStudent; key: string; t: string }>;
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
  const charges = d.charges ?? [];
  const chargeById = new Map(charges.map((c) => [c.id, c]));
  const cargosCache = new Map<string, Charge[]>();
  const cargosDe = (id: string): Charge[] => {
    if (!cargosCache.has(id)) {
      cargosCache.set(id, charges.filter((c) => c.student_id === id)
        .sort((x, y) => x.starts_on.localeCompare(y.starts_on) || x.created_at.localeCompare(y.created_at)));
    }
    return cargosCache.get(id)!;
  };
  const cargo = (id: string | null) => (id ? chargeById.get(id) ?? null : null);
  const pagosDeCargo = (c: Charge) => d.payments.filter((p) => p.charge_id === c.id)
    .sort((x, y) => x.paid_on.localeCompare(y.paid_on) || x.created_at.localeCompare(y.created_at));
  const round = (n: number) => Math.round(n * 100) / 100;
  const pagadoDe = (c: Charge) => round(pagosDeCargo(c).reduce((a, p) => a + p.amount, 0));
  const saldoDe = (c: Charge) => round(c.amount - pagadoDe(c));
  const pendientes = (s: FinanceStudent) => cargosDe(s.id).filter((c) => saldoDe(c) > 0);
  const cargoMes = (c: Charge) => {
    const m = c.kind === 'mes' ? c.period_key : ym(c.starts_on);
    return `${monthName(m)} ${m.slice(0, 4)}`;
  };
  const cargoTxt = (c: Charge) => (c.kind === 'mes'
    ? `Mes de ${cargoMes(c)}`
    : c.kind === 'programacion'
      ? `Programación del ${shortDate(c.starts_on)}`
      : `Paquete de ${c.sessions ?? '—'} clases · desde el ${shortDate(c.starts_on)}`);

  const billing = (s: FinanceStudent): Billing => ({ ...emptyBilling(), ...(s.billing ?? {}) });
  const moneda = (s: FinanceStudent | string): Moneda => {
    const st = typeof s === 'string' ? byId.get(s) : s;
    return (st && billing(st).moneda) || 'USD';
  };
  const totalTxt = (items: Array<{ student_id: string; amount: number }>): string => {
    const by = new Map<Moneda, number>();
    for (const x of items) by.set(moneda(x.student_id), (by.get(moneda(x.student_id)) ?? 0) + x.amount);
    if (!by.size) return money(0);
    return [...by.entries()].map(([c, n]) => money(n, c)).join(' + ');
  };
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

  const primeraDelMes = (s: FinanceStudent, m: string): string => {
    const ini = `${m}-01`;
    const fin = addDays(`${shiftYM(m, 1)}-01`, -1);
    const cands = [
      ...marcasDe(s.id).filter(([f, k]) => f >= ini && f <= fin && k === 'p').map(([f]) => f),
      ...occurrences(s.schedule, ini, fin).map((o) => o.date).filter((f) => f >= today || marca(s.id, f) === 'p'),
    ].sort();
    return cands[0] ?? ini;
  };

  /** Desde cuándo se cuenta el saldo del paquete. */
  const desdeDe = (s: FinanceStudent) => billing(s).cuenta_desde || cargosDe(s.id).find((c) => c.kind === 'paquete')?.starts_on || null;
  /** Las clases de un período se suman si es un paquete desde que se cuenta el saldo y no estaba ya en el saldo inicial. */
  const cuenta = (s: FinanceStudent, c: Charge) => {
    const desde = desdeDe(s);
    return Boolean(desde) && c.kind === 'paquete' && !c.in_opening && c.starts_on >= desde!;
  };
  const contados = (s: FinanceStudent) => cargosDe(s.id).filter((c) => cuenta(s, c));
  /** Saldo del paquete: saldo inicial + clases de los períodos − clases tomadas. Los pagos no suman clases. */
  const saldo = (s: FinanceStudent) => {
    if (modo(s) !== 'clases') return null;
    const b = billing(s);
    const desde = desdeDe(s);
    if (!desde) return null;
    const incluidas = contados(s).reduce((a, c) => a + (c.sessions ?? 0), 0);
    const tomadas = marcasDe(s.id).filter(([f]) => f >= desde && f <= today).length;
    return { restan: (b.saldo_inicial || 0) + incluidas - tomadas, tomadas, desde };
  };

  /** Período que se cobra cuando ya pasó su primera clase (o el 1° del mes, o la fecha de la programación). */
  const venceCargo = (s: FinanceStudent, c: Charge) => (c.kind === 'mes' ? primeraDelMes(s, c.period_key) : c.starts_on);

  const estadoPago = (s: FinanceStudent): PayState => {
    // Períodos ya empezados con saldo pendiente (incluye pagos parciales).
    const deuda = pendientes(s).filter((c) => venceCargo(s, c) <= today);
    if (deuda.length) {
      const c0 = deuda[0]!;
      const due = venceCargo(s, c0);
      const tot = round(deuda.reduce((a, c) => a + saldoDe(c), 0));
      const parcial = pagadoDe(c0) > 0;
      const txt = `${parcial ? 'Saldo pendiente' : 'Debe'} ${c0.kind === 'mes' ? `de ${cargoMes(c0)}` : `del ${cargoTxt(c0).charAt(0).toLowerCase()}${cargoTxt(c0).slice(1)}`}${deuda.length > 1 ? ` y ${deuda.length - 1} más` : ''}`;
      return { k: daysBetween(due, today) > 7 ? 'debe' : 'pagar', t: txt, cls: 'bad', due, monto: tot, moneda: moneda(s), restan: saldo(s)?.restan };
    }
    const prox = pendientes(s)[0];
    const monto = prox ? saldoDe(prox) : cuotaEn(s, today);
    const m = modo(s);
    if (m === 'clases') {
      const sd = saldo(s);
      if (!sd) return { k: 'sinfecha', t: 'Sin datos del paquete', cls: '', due: null, monto, moneda: moneda(s) };
      const N = clasesPaquete(s);
      // Se paga después de la primera clase del paquete nuevo.
      if (sd.restan < -1) {
        return { k: 'debe', t: `Debe ${-sd.restan} clases`, cls: 'bad', due: today, monto, moneda: moneda(s), restan: sd.restan };
      }
      if (sd.restan === -1) {
        return { k: 'pagar', t: 'Tiene que pagar: ya tomó la 1ª del paquete', cls: 'bad', due: today, monto, moneda: moneda(s), restan: -1 };
      }
      if (sd.restan === 0) {
        const nx = proximasClases(s, 1)[0] ?? null;
        return { k: 'pronto', t: nx ? `Paga después de la clase del ${shortDate(nx)}` : 'Paga después de la próxima clase', cls: 'low', due: nx, monto, moneda: moneda(s), restan: 0 };
      }
      const fechas = proximasClases(s, sd.restan + 1);
      const due = fechas.length === sd.restan + 1 ? fechas[sd.restan]! : null;
      const quedan = `${sd.restan === 1 ? 'Queda' : 'Quedan'} ${sd.restan}${N ? ` de ${N}` : ''}`;
      const t = due ? `${quedan} · paga después del ${shortDate(due)}` : quedan;
      if (sd.restan <= (clasesSem(s) || 1)) return { k: 'pronto', t, cls: 'low', due, monto, moneda: moneda(s), restan: sd.restan };
      return { k: 'aldia', t, cls: 'ok', due, monto, moneda: moneda(s), restan: sd.restan };
    }
    let due: string | null = null;
    if (m === 'mensual') {
      const ult = cargosDe(s.id).filter((c) => c.kind === 'mes' && saldoDe(c) <= 0).map((c) => c.period_key).sort().pop();
      const mes = ult ? shiftYM(ult, 1) : billing(s).vence ? ym(billing(s).vence!) : null;
      due = mes ? primeraDelMes(s, mes) : null;
      if (due) {
        const diff = daysBetween(today, due);
        if (diff < 0) return { k: 'debe', t: `Tenía que pagar el ${shortDate(due)}`, cls: 'bad', due, monto, moneda: moneda(s) };
        if (diff === 0) return { k: 'pagar', t: 'Paga después de la clase de hoy', cls: 'bad', due, monto, moneda: moneda(s) };
        if (diff <= 7) return { k: 'pronto', t: `Paga después de la clase del ${shortDate(due)}`, cls: 'low', due, monto, moneda: moneda(s) };
        return { k: 'aldia', t: `Al día · paga el ${shortDate(due)}`, cls: 'ok', due, monto, moneda: moneda(s) };
      }
    } else {
      const base = [pagosDe(s.id).map((p) => p.paid_on).pop(), billing(s).prog_enviada].filter((x): x is string => Boolean(x)).sort().pop();
      due = base ? addDays(base, PROG_DIAS) : null;
    }
    if (!due) return { k: 'sinfecha', t: 'Sin vencimiento', cls: '', due, monto, moneda: moneda(s) };
    const diff = daysBetween(today, due);
    if (diff < 0) return { k: 'debe', t: `Vencido hace ${-diff} d`, cls: 'bad', due, monto, moneda: moneda(s) };
    if (diff <= 7) return { k: 'pronto', t: diff === 0 ? 'Vence hoy' : `Vence el ${shortDate(due)}`, cls: 'low', due, monto, moneda: moneda(s) };
    return { k: 'aldia', t: `Al día hasta ${shortDate(due)}`, cls: 'ok', due, monto, moneda: moneda(s) };
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
    const cs = contados(s);
    const bounds = [b.saldo_inicial || 0];
    for (const c of cs) bounds.push(bounds[bounds.length - 1]! + (c.sessions ?? 0));
    const paq = clasesPaquete(s) || 4;
    while (bounds[bounds.length - 1]! < n) bounds.push(bounds[bounds.length - 1]! + paq);
    const k = bounds.findIndex((x) => x >= n);
    const ini = k > 0 ? bounds[k - 1]! : 0;
    const fin = bounds[k]!;
    if (k === 0) return { i: paq - (fin - n), N: paq, primera: false, ultima: n === fin, pagado: true };
    // Paquetes más allá de los períodos creados todavía no existen: no están pagados.
    const c = cs[k - 1];
    return { i: n - ini, N: fin - ini, primera: n === ini + 1, ultima: n === fin, pagado: Boolean(c && saldoDe(c) <= 0) };
  };
  const etiquetaPaquete = (s: FinanceStudent, f: string) => {
    const p = posPaquete(s, f);
    if (!p) return null;
    if (p.primera) return p.pagado ? { t: '1ª del paquete · pagado', cls: 'ok' } : { t: '1ª del paquete · paga después de esta clase', cls: 'bad' };
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
    mensual: 'Mensual, después de la 1ª clase del mes',
    prog: 'Por programación (4 semanas)',
  })[modo(s)];

  const recordatorio = (s: FinanceStudent) => {
    const c = estadoPago(s);
    const nombre = firstName(s.name);
    const m = modo(s);
    if (m === 'clases') {
      const r = c.restan ?? 0;
      return r <= 0
        ? (r < 0
          ? `Hola ${nombre}! Ya arrancaste el paquete nuevo de clases de HTC; cuando puedas, me pasás el pago (${money(c.monto, c.moneda)}). Gracias!`
          : `Hola ${nombre}! Te aviso que terminaste el paquete de clases de HTC. Después de la próxima clase${c.due ? ` (${shortDate(c.due)})` : ''} toca renovar: ${money(c.monto, c.moneda)}. Gracias!`)
        : `Hola ${nombre}! Te ${r === 1 ? 'queda 1 clase' : `quedan ${r} clases`} del paquete de HTC${c.due ? `; después de la clase del ${shortDate(c.due)} toca renovar` : ''} (${money(c.monto, c.moneda)}). Gracias!`;
    }
    if (m === 'mensual') {
      return c.k === 'debe'
        ? `Hola ${nombre}! Te escribo porque todavía no tengo registrado el pago de HTC del mes (era después de la clase del ${c.due ? shortDate(c.due) : '—'}, ${money(c.monto, c.moneda)}). Cuando puedas, avisame. Gracias!`
        : `Hola ${nombre}! Te recuerdo que después de la clase del ${c.due ? shortDate(c.due) : '—'} toca el pago mensual de HTC (${money(c.monto, c.moneda)}). Gracias!`;
    }
    return `Hola ${nombre}! Ya casi terminás tu programación de HTC. Para armarte la próxima son ${money(c.monto, c.moneda)}. Gracias!`;
  };

  const puntualidad = (s: FinanceStudent, ini: string) => {
    const out: Array<{ atraso: number }> = [];
    const b = billing(s);
    if (modo(s) === 'clases' && b.cuenta_desde) {
      const M = marcasDe(s.id).filter(([x]) => x >= b.cuenta_desde!).map(([x]) => x);
      let k = b.saldo_inicial || 0;
      for (const c of contados(s)) {
        const clase = M[Math.max(0, k)];
        k += c.sessions ?? 0;
        const first = pagosDeCargo(c)[0]?.paid_on;
        if (!first || first < ini) continue;
        out.push({ atraso: clase ? Math.max(0, daysBetween(clase, first)) : 0 });
      }
    } else if (modo(s) === 'mensual') {
      for (const c of cargosDe(s.id).filter((c) => c.kind === 'mes')) {
        const first = pagosDeCargo(c)[0]?.paid_on;
        if (!first || first < ini) continue;
        out.push({ atraso: Math.max(0, daysBetween(primeraDelMes(s, c.period_key), first)) });
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

  const avisosCiclo = () => activos().filter((s) => !isAsinc(s)).flatMap((s) => {
    const nombre = firstName(s.name);
    if (modo(s) === 'clases') {
      const sd = saldo(s);
      if (!sd || sd.restan !== 1) return [];
      const ult = proximasClases(s, 1)[0];
      return [{ s, key: `${s.id}:paq:${sd.tomadas}`, t: `A ${nombre} le queda 1 clase del paquete${ult ? ` (${shortDate(ult)})` : ''}. Después arranca el ciclo nuevo y paga después de esa primera clase.` }];
    }
    if (modo(s) === 'mensual') {
      const m = ym(today);
      const resto = occurrences(s.schedule, today, addDays(`${shiftYM(m, 1)}-01`, -1)).map((o) => o.date).filter((f) => !marca(s.id, f));
      if (resto.length !== 1) return [];
      return [{ s, key: `${s.id}:mes:${m}`, t: `A ${nombre} le queda 1 clase este mes (${shortDate(resto[0]!)}). Después arranca el mes nuevo y paga después de la primera clase.` }];
    }
    return [];
  });

  const queCubreP = (p: Payment) => {
    const c = cargo(p.charge_id);
    return c ? cargoTxt(c) : queCubre(p);
  };

  const periodoExistente = (s: FinanceStudent, kind: ChargeKind, startsOn: string) => {
    const key = kind === 'mes' ? startsOn.slice(0, 7) : null;
    return cargosDe(s.id).find((c) => c.kind === kind && (key ? c.period_key === key : c.starts_on === startsOn)) ?? null;
  };

  const sugerirPeriodo = (s: FinanceStudent) => {
    const m = modo(s);
    const amount = cuotaEn(s, today);
    if (m === 'mensual') {
      const last = cargosDe(s.id).filter((c) => c.kind === 'mes').map((c) => c.period_key).sort().pop();
      const mes = last ? shiftYM(last, 1) : ym(today);
      return { kind: 'mes' as const, starts_on: `${mes}-01`, sessions: null, amount };
    }
    if (m === 'prog') return { kind: 'programacion' as const, starts_on: today, sessions: null, amount };
    const N = clasesPaquete(s) || 4;
    const desde = desdeDe(s);
    let start = today;
    if (desde) {
      // El paquete nuevo arranca en la primera clase que no cubre ningún período.
      const total = (billing(s).saldo_inicial || 0) + contados(s).reduce((a, c) => a + (c.sessions ?? 0), 0);
      const M = marcasDe(s.id).filter(([f]) => f >= desde && f <= today).map(([f]) => f);
      if (total < M.length) start = M[Math.max(0, total)]!;
      else {
        const quedan = total - M.length;
        start = proximasClases(s, quedan + 1)[quedan] ?? today;
      }
    }
    return { kind: 'paquete' as const, starts_on: start, sessions: N, amount };
  };

  return {
    charges, cargosDe, cargo, pagosDeCargo, pagadoDe, saldoDe, pendientes, cuenta, cargoTxt, cargoMes, queCubre: queCubreP,
    sugerirPeriodo, periodoExistente,
    primeraDelMes, avisosCiclo, moneda, totalTxt,
    today, students: d.students, payments: d.payments, billing, estado, activos, isAsinc, modo, modoTxt, clasesSem, clasesPaquete,
    cuotaEn, pagosDe, marca, marcaExplicita, marcasDe, proximasClases, saldo, estadoPago, cobradoEn, proximos30, estadoProg, racha,
    programados, movidosDesde, posPaquete, etiquetaPaquete, paqueteTxt, recordatorio, reporte, informePendiente,
  };
}

/** Para pagos sin período (no debería quedar ninguno después de la migración 010). Usar fin.queCubre. */
export const queCubre = (p: Payment): string =>
  p.classes ? `${p.classes} clases` : p.period ? `Mes de ${monthName(p.period)}` : 'Programación';
export const fmtLong = (f: string | null): string => (f ? longDate(f) : '—');
