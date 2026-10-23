/**
 * Ficha de honorarios de un alumno (lo que antes vivía en el "Registro de
 * alumnos"): modalidad, forma de pago, honorarios con historial, saldo del
 * paquete y estado. Los cálculos de cuándo paga se hacen en el panel del profe
 * con los pagos y la asistencia; acá sólo se valida y se guarda.
 */
import { z } from 'zod';

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const BillingSchema = z.object({
  /** null = se deduce de la actividad (entrenó en los últimos 2 meses → activo). */
  estado: z.enum(['activo', 'pausa', 'baja']).nullable().default(null),
  modalidad: z.enum(['presencial', 'virtual_sinc', 'virtual_asinc']).default('presencial'),
  clases_sem: z.number().int().min(0).max(14).nullable().default(null),
  ciclo_sem: z.number().int().min(1).max(52).default(4),
  pago_modo: z.enum(['clases', 'mensual']).default('clases'),
  cuota: z.number().min(0).max(1_000_000).nullable().default(null),
  historial_cuota: z.array(z.object({ desde: DATE, monto: z.number().min(0).max(1_000_000) })).max(200).default([]),
  /** Desde cuándo se cuenta el saldo del paquete y con cuántas clases arrancó. */
  cuenta_desde: DATE.nullable().default(null),
  saldo_inicial: z.number().int().min(-500).max(500).default(0),
  /** Próximo vencimiento (mensual) mientras no haya pagos cargados. */
  vence: DATE.nullable().default(null),
  telefono: z.string().trim().max(30).nullable().default(null),
  enfoque: z.string().trim().max(200).nullable().default(null),
  rehab: z.boolean().default(false),
  /** Asincrónicos: última programación enviada y si ya pagó la próxima. */
  prog_enviada: DATE.nullable().default(null),
  prog_pendiente: z.boolean().default(false),
});
export type Billing = z.infer<typeof BillingSchema>;

export const PaymentInput = z.object({
  student_id: z.string().uuid(),
  paid_on: DATE,
  amount: z.number().min(0).max(1_000_000),
  classes: z.number().int().min(1).max(500).nullable().optional(),
  period: z.string().regex(/^\d{4}-\d{2}$/).nullable().optional(),
  note: z.string().trim().max(300).nullable().optional(),
});

export const AttendanceInput = z.object({
  student_ids: z.array(z.string().uuid()).min(1).max(100),
  day: DATE,
  /** null borra la marca. */
  mark: z.enum(['p', 'a', 'e']).nullable(),
});
