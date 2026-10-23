-- 007 — Video por ejercicio, fotos de perfil, perfil del profe, comunidad
-- (mensajes para todos) y calidad del movimiento. Sólo agrega: no toca 001-006.

ALTER TABLE training_exercises ADD COLUMN IF NOT EXISTS video_url text;
-- "Algo que tu profe tenga que saber": lo escribe el alumno.
ALTER TABLE training_students ADD COLUMN IF NOT EXISTS about text;

-- Fotos de perfil, ya achicadas en el navegador (owner = 'coach' o el id del alumno).
CREATE TABLE IF NOT EXISTS training_avatars (
  owner       text PRIMARY KEY,
  mime        text NOT NULL,
  data        bytea NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS training_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Comunidad: un solo canal para todos. author_id null = el profe.
CREATE TABLE IF NOT EXISTS training_messages (
  id          uuid PRIMARY KEY,
  author_id   uuid REFERENCES training_students(id) ON DELETE CASCADE,
  body        text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX IF NOT EXISTS training_messages_created ON training_messages(created_at);

-- Hasta dónde leyó cada uno (reader = 'coach' o el id del alumno).
CREATE TABLE IF NOT EXISTS training_message_reads (
  reader        text PRIMARY KEY,
  last_read_at  timestamptz NOT NULL
);

-- Calidad del movimiento: cómo ejecuta un ejercicio, aunque los números no cambien.
CREATE TABLE IF NOT EXISTS training_quality (
  id            uuid PRIMARY KEY,
  student_id    uuid NOT NULL REFERENCES training_students(id) ON DELETE CASCADE,
  exercise_key  text NOT NULL,
  exercise_name text NOT NULL,
  day           date NOT NULL,
  score         smallint NOT NULL CHECK (score BETWEEN 1 AND 5),
  aspects       jsonb NOT NULL DEFAULT '[]',
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS training_quality_student ON training_quality(student_id, exercise_key, day);
