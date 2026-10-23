-- 006 — Finanzas (honorarios, pagos), asistencia tomada por el profe e
-- informes de 4 semanas para el alumno. Sólo agrega: no toca 001-005.

-- Ficha de honorarios: modalidad, forma de pago, honorarios con historial,
-- saldo del paquete, estado (activo/pausa/baja), WhatsApp, etc.
ALTER TABLE training_students ADD COLUMN IF NOT EXISTS billing jsonb;

CREATE TABLE IF NOT EXISTS training_payments (
  id          uuid PRIMARY KEY,
  student_id  uuid NOT NULL REFERENCES training_students(id) ON DELETE CASCADE,
  paid_on     date NOT NULL,
  amount      numeric(12, 2) NOT NULL CHECK (amount >= 0),
  classes     integer CHECK (classes > 0),
  period      text CHECK (period ~ '^\d{4}-\d{2}$'),
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS training_payments_student ON training_payments(student_id, paid_on);

-- p = presente, a = ausente, e = faltó y se le mandaron los ejercicios.
CREATE TABLE IF NOT EXISTS training_attendance (
  student_id  uuid NOT NULL REFERENCES training_students(id) ON DELETE CASCADE,
  day         date NOT NULL,
  mark        text NOT NULL CHECK (mark IN ('p', 'a', 'e')),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, day)
);

-- Informe publicado: se guarda la foto de los datos del período para que no cambie después.
CREATE TABLE IF NOT EXISTS training_reports (
  id            uuid PRIMARY KEY,
  student_id    uuid NOT NULL REFERENCES training_students(id) ON DELETE CASCADE,
  period_start  date NOT NULL,
  period_end    date NOT NULL,
  data          jsonb NOT NULL,
  message       text,
  next_goal     text,
  published_at  timestamptz NOT NULL DEFAULT now(),
  seen_at       timestamptz,
  UNIQUE (student_id, period_start)
);
