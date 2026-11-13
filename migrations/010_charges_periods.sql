-- 010 — Períodos (cargos) separados de los pagos.
-- Antes cada pago traía sus clases y sumaba sesiones al paquete: pagar dos
-- veces el mismo paquete duplicaba las sesiones. Ahora el período (paquete,
-- mes o programación) se crea aparte y los pagos se asignan a un período sin
-- tocar sus sesiones.
--
-- Los pagos viejos se copian 1 a 1 a un período cada uno, igual que como los
-- contaba la app: los saldos no cambian con esta migración. Los posibles
-- duplicados se muestran en Finanzas para que el profe los revise antes de
-- corregir nada.

CREATE TABLE IF NOT EXISTS training_charges (
  id            uuid PRIMARY KEY,
  student_id    uuid NOT NULL REFERENCES training_students(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('paquete', 'mes', 'programacion')),
  -- Identifica el período dentro del alumno: paq-N, YYYY-MM o prog-N. No se repite.
  period_key    text NOT NULL,
  starts_on     date NOT NULL,
  -- Sesiones incluidas (paquetes). null en meses y programaciones.
  sessions      integer CHECK (sessions BETWEEN 0 AND 500),
  amount        numeric(12, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  -- Sus sesiones ya estaban contadas en el saldo inicial del alumno: no se suman.
  in_opening    boolean NOT NULL DEFAULT false,
  -- Pago viejo del que salió este período (registro previo a la separación).
  migrated_from uuid,
  reviewed_at   timestamptz,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, period_key)
);
CREATE INDEX IF NOT EXISTS training_charges_student ON training_charges(student_id, starts_on);

-- paid_on = fecha efectiva (cuando se recibió la plata); created_at = fecha de registro.
ALTER TABLE training_payments ADD COLUMN IF NOT EXISTS charge_id uuid REFERENCES training_charges(id);
CREATE INDEX IF NOT EXISTS training_payments_charge ON training_payments(charge_id);

-- Paquetes: un período por cada pago viejo con clases, en el orden en que se pagaron.
INSERT INTO training_charges (id, student_id, kind, period_key, starts_on, sessions, amount, migrated_from, note)
SELECT gen_random_uuid(), p.student_id, 'paquete',
       'paq-' || row_number() OVER (PARTITION BY p.student_id ORDER BY p.paid_on, p.created_at),
       p.paid_on, p.classes, p.amount, p.id, 'Registrado junto con el pago (antes de separar pagos y períodos)'
  FROM training_payments p
 WHERE p.charge_id IS NULL AND p.classes IS NOT NULL;

-- Meses: un período por mes pagado (varios pagos del mismo mes van al mismo período).
INSERT INTO training_charges (id, student_id, kind, period_key, starts_on, amount, migrated_from, note)
SELECT gen_random_uuid(), p.student_id, 'mes', p.period, (p.period || '-01')::date, SUM(p.amount), MIN(p.id::text)::uuid,
       'Registrado junto con el pago (antes de separar pagos y períodos)'
  FROM training_payments p
 WHERE p.charge_id IS NULL AND p.classes IS NULL AND p.period IS NOT NULL
 GROUP BY p.student_id, p.period;

-- Programaciones (ni clases ni mes): un período por pago.
INSERT INTO training_charges (id, student_id, kind, period_key, starts_on, amount, migrated_from, note)
SELECT gen_random_uuid(), p.student_id, 'programacion',
       'prog-' || row_number() OVER (PARTITION BY p.student_id ORDER BY p.paid_on, p.created_at),
       p.paid_on, p.amount, p.id, 'Registrado junto con el pago (antes de separar pagos y períodos)'
  FROM training_payments p
 WHERE p.charge_id IS NULL AND p.classes IS NULL AND p.period IS NULL;

UPDATE training_payments p SET charge_id = c.id
  FROM training_charges c
 WHERE p.charge_id IS NULL AND c.migrated_from = p.id;
UPDATE training_payments p SET charge_id = c.id
  FROM training_charges c
 WHERE p.charge_id IS NULL AND p.classes IS NULL AND p.period IS NOT NULL
   AND c.student_id = p.student_id AND c.kind = 'mes' AND c.period_key = p.period;

-- El registro de cambios también guarda lo que se hace con períodos y pagos.
ALTER TABLE training_change_log DROP CONSTRAINT IF EXISTS training_change_log_entity_check;
ALTER TABLE training_change_log ADD CONSTRAINT training_change_log_entity_check
  CHECK (entity IN ('execution', 'response', 'session', 'charge', 'payment'));
