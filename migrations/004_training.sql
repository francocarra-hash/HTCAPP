-- 004 — Alumnos, sesiones de entrenamiento y su vínculo con las evaluaciones.
-- Sólo agrega tablas: no modifica nada del motor de evaluación (001-003).

CREATE TABLE IF NOT EXISTS training_students (
  id            uuid PRIMARY KEY,
  name          text NOT NULL,
  username      text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  age           integer,
  sex           text CHECK (sex IN ('MALE', 'FEMALE')),
  goal          text,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Una sesión puede ser compartida (alumnos que entrenan juntos).
CREATE TABLE IF NOT EXISTS training_sessions (
  id           uuid PRIMARY KEY,
  session_date date NOT NULL,
  date_raw     text,
  date_note    text,
  title        text,
  body         text NOT NULL,
  seq          integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS training_session_participants (
  session_id uuid NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES training_students(id) ON DELETE CASCADE,
  PRIMARY KEY (session_id, student_id)
);
CREATE INDEX IF NOT EXISTS training_participants_student ON training_session_participants(student_id);

-- Evaluaciones HTC (v3_assessments) asociadas a un alumno.
CREATE TABLE IF NOT EXISTS training_student_assessments (
  student_id    uuid NOT NULL REFERENCES training_students(id) ON DELETE CASCADE,
  assessment_id uuid NOT NULL,
  linked_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, assessment_id)
);
