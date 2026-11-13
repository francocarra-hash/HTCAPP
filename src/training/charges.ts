/**
 * Períodos (cargos) y pagos, separados.
 *
 * Un período es lo que se cobra: un paquete de clases, un mes o una
 * programación. Crearlo (o sumarle clases) es una operación aparte y
 * explícita. Un pago se asigna a un período y sólo cambia lo abonado y el
 * saldo de ese período: nunca las sesiones incluidas, realizadas o restantes.
 *
 * Antes de esta separación cada pago traía sus clases, así que pagar dos veces
 * el mismo paquete duplicaba las sesiones. `reviewLegacy` encuentra esos casos
 * en los registros viejos para que el profe los vea antes de corregir.
 */
import { z } from 'zod';
import { Billing, BillingSchema } from './billing';
import type { Charge, ChargeKind, Payment } from './repository';

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const ChargeInput = z.object({
  student_id: z.string().uuid(),
  kind: z.enum(['paquete', 'mes', 'programacion']),
  /** Paquete y programación: fecha de inicio. Mes: cualquier día del mes (se guarda el 1°). */
  starts_on: DATE,
  sessions: z.number().int().min(1).max(500).nullable().optional(),
  amount: z.number().min(0).max(100_000_000),
  note: z.string().trim().max(300).nullable().optional(),
});

/** Cambiar un período ya creado (por ejemplo, sumarle clases) es explícito y queda registrado con el motivo. */
export const ChargeUpdate = z.object({
  sessions: z.number().int().min(0).max(500).optional(),
  amount: z.number().min(0).max(100_000_000).optional(),
  starts_on: DATE.optional(),
  note: z.string().trim().max(300).nullable().optional(),
  reason: z.string().trim().max(300).nullable().optional(),
});

/** Un pago siempre va a un período. paid_on = cuándo se recibió la plata; la fecha de registro la pone el servidor. */
export const PaymentInput = z.object({
  student_id: z.string().uuid(),
  charge_id: z.string().uuid({ message: 'Elegí el período que se está pagando.' }),
  paid_on: DATE,
  amount: z.number().positive('El monto tiene que ser mayor a 0.').max(100_000_000),
  note: z.string().trim().max(300).nullable().optional(),
});

export const ResolveInput = z.discriminatedUnion('action', [
  /** Era el mismo período que otro: sus pagos pasan a ese y este se borra (no suma sesiones). */
  z.object({ action: z.literal('merge'), into: z.string().uuid() }),
  /** Era el paquete que ya estaba contado en el saldo inicial: queda, pero no suma sesiones. */
  z.object({ action: z.literal('opening') }),
  /** Está bien así (por ejemplo, un paquete pagado por adelantado). */
  z.object({ action: z.literal('keep') }),
]);

const seq = (key: string, prefix: string): number => (key.startsWith(prefix) ? Number(key.slice(prefix.length)) || 0 : 0);

/** Clave del período nuevo. Mes: YYYY-MM (si ya existe, no se crea otro). Paquete y programación: el siguiente número. */
export function periodKey(kind: ChargeKind, startsOn: string, existing: Charge[]): string {
  if (kind === 'mes') return startsOn.slice(0, 7);
  const prefix = kind === 'paquete' ? 'paq-' : 'prog-';
  const n = Math.max(0, ...existing.map((c) => seq(c.period_key, prefix)));
  return `${prefix}${n + 1}`;
}

/** Ya hay un período igual: mismo mes, o paquete/programación que arranca el mismo día. */
export function existingPeriod(kind: ChargeKind, startsOn: string, existing: Charge[]): Charge | null {
  const key = kind === 'mes' ? startsOn.slice(0, 7) : null;
  return existing.find((c) => c.kind === kind && (key ? c.period_key === key : c.starts_on === startsOn)) ?? null;
}

export interface ChargeBalance { paid: number; balance: number; payments: number }
export function chargeBalance(c: Charge, payments: Payment[]): ChargeBalance {
  const mine = payments.filter((p) => p.charge_id === c.id);
  const paid = Math.round(mine.reduce((a, p) => a + p.amount, 0) * 100) / 100;
  return { paid, balance: Math.round((c.amount - paid) * 100) / 100, payments: mine.length };
}

export function chargeLabel(c: Charge): string {
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const [y, m, d] = c.starts_on.split('-');
  const mes = `${MONTHS[Number(m) - 1]} ${y}`;
  if (c.kind === 'mes') return `Mes de ${mes}`;
  if (c.kind === 'programacion') return `Programación del ${Number(d)}/${Number(m)}`;
  return `Paquete de ${c.sessions ?? '—'} clases · ${Number(d)}/${Number(m)}`;
}

// ── revisión de los registros viejos ────────────────────────────────────────

export interface ReviewStudent {
  id: string;
  name: string;
  billing: unknown;
  /** Clases por semana de la agenda (si la ficha no lo dice). */
  weekly: number;
  /** Días con marca (sesión realizada o asistencia cargada), como los cuenta el saldo del paquete. */
  marks: string[];
}

export interface ReviewItem {
  student_id: string;
  student_name: string;
  charge: Charge;
  payments: Payment[];
  /** Clases que le quedaban del paquete cuando se registró el pago (sin contar este período). */
  restan_antes: number;
  /** Lo normal es pagar después de la primera clase del paquete nuevo: quedan 0 o -1. */
  esperado_max: number;
  reason: string;
  proposal: { action: 'merge'; into: Charge; into_label: string } | { action: 'opening' };
  proposal_text: string;
  restan_hoy: number;
  restan_corregido: number;
}

const billingOf = (raw: unknown): Billing => BillingSchema.parse(raw ?? {});
const countIn = (marks: string[], from: string, to: string): number => marks.filter((d) => d >= from && d <= to).length;

/**
 * Períodos viejos (creados junto con un pago, antes de separar) cuyas sesiones
 * parecen duplicadas: cuando se registró el pago todavía le quedaban más clases
 * que una semana de entrenamiento, o sea que ese pago era de un paquete que ya
 * estaba contado. No corrige nada: devuelve lo encontrado y la corrección
 * propuesta.
 */
export function reviewLegacy(input: { today: string; students: ReviewStudent[]; charges: Charge[]; payments: Payment[] }): ReviewItem[] {
  const out: ReviewItem[] = [];
  for (const st of input.students) {
    const b = billingOf(st.billing);
    if (b.modalidad === 'virtual_asinc' || b.pago_modo !== 'clases' || !b.cuenta_desde) continue;
    const desde = b.cuenta_desde;
    const counted = input.charges
      .filter((c) => c.student_id === st.id && c.kind === 'paquete' && !c.in_opening && c.starts_on >= desde)
      .sort((x, y) => x.starts_on.localeCompare(y.starts_on) || x.created_at.localeCompare(y.created_at));
    const perWeek = b.clases_sem ?? st.weekly;
    const limite = Math.max(2, perWeek + 1);
    const total = (b.saldo_inicial || 0) + counted.reduce((a, c) => a + (c.sessions ?? 0), 0);
    const restanHoy = total - countIn(st.marks, desde, input.today);
    // Se recorre como si las correcciones propuestas ya estuvieran hechas, para no arrastrar un duplicado al siguiente.
    let acc = b.saldo_inicial || 0;
    let prev: Charge | null = null;
    for (const c of counted) {
      const pays = input.payments.filter((p) => p.charge_id === c.id).sort((x, y) => x.paid_on.localeCompare(y.paid_on));
      const legacy = Boolean(c.migrated_from) && !c.reviewed_at && pays.length > 0;
      if (legacy) {
        const firstPay = pays[0]!.paid_on;
        const restan = acc - countIn(st.marks, desde, firstPay);
        if (restan >= limite) {
          const sesiones = c.sessions ?? 0;
          const reason = `Cuando se registró el pago del ${fmt(firstPay)} le ${restan === 1 ? 'quedaba 1 clase' : `quedaban ${restan} clases`} `
            + `${prev ? `del ${chargeLabel(prev).toLowerCase()}` : 'del saldo inicial'}; aun así el pago sumó ${sesiones} clases más.`;
          const proposal = prev
            ? { action: 'merge' as const, into: prev, into_label: chargeLabel(prev) }
            : { action: 'opening' as const };
          out.push({
            student_id: st.id, student_name: st.name, charge: c, payments: pays, restan_antes: restan, esperado_max: limite - 1, reason,
            proposal,
            proposal_text: prev
              ? `Asignar el pago al ${chargeLabel(prev).toLowerCase()} y quitar las ${sesiones} clases repetidas.`
              : `Asignar el pago al paquete que ya estaba contado en el saldo inicial (${b.saldo_inicial} clases al ${fmt(desde)}) sin sumar las ${sesiones} clases.`,
            restan_hoy: restanHoy,
            restan_corregido: restanHoy - sesiones,
          });
          continue;
        }
      }
      acc += c.sessions ?? 0;
      prev = c;
    }
  }
  return out;
}

const fmt = (d: string): string => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`;
