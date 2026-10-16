-- 005 — Rutinas en bloques, biblioteca de ejercicios, agenda, proceso y
-- sesiones completadas por el alumno. Sólo agrega: no toca 001-004.

-- Rutina editable (null = se deriva del texto cargado) y estado de la sesión:
-- 'planned' = asignada para que el alumno la haga, 'done' = ya realizada.
ALTER TABLE training_sessions ADD COLUMN IF NOT EXISTS routine jsonb;
ALTER TABLE training_sessions ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'done'
  CHECK (status IN ('planned', 'done'));
ALTER TABLE training_sessions ALTER COLUMN body SET DEFAULT '';

-- Agenda (días fijos, fechas puntuales, días cancelados) y etapas del proceso.
ALTER TABLE training_students ADD COLUMN IF NOT EXISTS schedule jsonb;
ALTER TABLE training_students ADD COLUMN IF NOT EXISTS process jsonb;

-- Biblioteca: el nombre y la capacidad que fija el coach para cada ejercicio.
-- Los ejercicios usados en sesiones aparecen solos; acá sólo vive lo editado o creado a mano.
CREATE TABLE IF NOT EXISTS training_exercises (
  key         text PRIMARY KEY,
  name        text NOT NULL,
  capacity    text CHECK (capacity IN ('fuerza', 'reactividad', 'movilidad', 'estabilidad', 'control_motor', 'resistencia')),
  description text,
  custom      boolean NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Lo que hace el alumno con una sesión: checks y notas por ejercicio, y el cierre.
CREATE TABLE IF NOT EXISTS training_completions (
  session_id    uuid NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES training_students(id) ON DELETE CASCADE,
  checks        jsonb NOT NULL DEFAULT '[]',
  notes         jsonb NOT NULL DEFAULT '{}',
  completed_at  timestamptz,
  feeling       smallint CHECK (feeling BETWEEN 1 AND 5),
  comment       text,
  coach_seen_at timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, student_id)
);
CREATE INDEX IF NOT EXISTS training_completions_student ON training_completions(student_id);
CREATE INDEX IF NOT EXISTS training_completions_done ON training_completions(completed_at);
