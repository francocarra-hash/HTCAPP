-- 009 — Lo realizado separado de lo indicado: registro por serie, respuesta a la
-- sesión (esfuerzo, duración, síntomas) y registro de cambios auditable.
-- Sólo agrega: no modifica ni reinterpreta nada de 001-008.

-- Lo que el alumno hizo en un ejercicio de una sesión. Guarda una foto de lo
-- indicado al momento de registrar, así editar la rutina después no lo cambia.
CREATE TABLE IF NOT EXISTS training_executions (
  id             uuid PRIMARY KEY,
  session_id     uuid NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  student_id     uuid NOT NULL REFERENCES training_students(id) ON DELETE CASCADE,
  item_id        text NOT NULL,
  day            date NOT NULL,
  exercise_key   text NOT NULL,
  exercise_name  text NOT NULL,
  variant        text,
  tracking       text NOT NULL CHECK (tracking IN ('dinamica', 'isometrica', 'movilidad', 'pliometria', 'aerobica', 'control_motor')),
  load_config    text,
  assistance     text,
  body_mass_kg   numeric(5, 1),
  prescribed     jsonb NOT NULL,
  sets           jsonb NOT NULL DEFAULT '[]',
  notes          text,
  source         text NOT NULL CHECK (source IN ('coach', 'client')),
  data_quality   text NOT NULL CHECK (data_quality IN ('completo', 'incompleto')),
  version        integer NOT NULL DEFAULT 1,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- Un registro por ejercicio, alumno y sesión: evita duplicados.
  UNIQUE (session_id, student_id, item_id)
);
CREATE INDEX IF NOT EXISTS training_executions_student ON training_executions(student_id, exercise_key, day);

-- Respuesta a la sesión: esfuerzo percibido (sRPE, escala CR-10), duración y,
-- si se reportan, fatiga, dolor muscular, dolor o síntomas y recuperación.
CREATE TABLE IF NOT EXISTS training_session_responses (
  session_id    uuid NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES training_students(id) ON DELETE CASCADE,
  srpe          smallint CHECK (srpe BETWEEN 0 AND 10),
  duration_min  smallint CHECK (duration_min BETWEEN 1 AND 600),
  status        text CHECK (status IN ('completa', 'parcial', 'modificada')),
  fatigue       smallint CHECK (fatigue BETWEEN 0 AND 10),
  soreness      smallint CHECK (soreness BETWEEN 0 AND 10),
  pain          smallint CHECK (pain BETWEEN 0 AND 10),
  pain_area     text,
  recovery      smallint CHECK (recovery BETWEEN 0 AND 10),
  note          text,
  source        text NOT NULL CHECK (source IN ('coach', 'client')),
  version       integer NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, student_id)
);

-- Registro de cambios: correcciones de lo realizado y modificaciones de la
-- programación (qué había antes, qué quedó, quién, cuándo y por qué).
-- session_id sin FK: el registro sobrevive aunque se borre la sesión.
CREATE TABLE IF NOT EXISTS training_change_log (
  id          uuid PRIMARY KEY,
  entity      text NOT NULL CHECK (entity IN ('execution', 'response', 'session')),
  entity_id   text NOT NULL,
  student_id  uuid REFERENCES training_students(id) ON DELETE CASCADE,
  session_id  uuid,
  action      text NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  actor       text NOT NULL,
  category    text CHECK (category IN ('progresar', 'mantener', 'reducir', 'cambiar_ejercicios', 'adaptar')),
  reason      text,
  before      jsonb,
  after       jsonb,
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS training_change_log_student ON training_change_log(student_id, at);
CREATE INDEX IF NOT EXISTS training_change_log_session ON training_change_log(session_id, at);
