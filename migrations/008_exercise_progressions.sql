-- Progresión entre ejercicios: "este ejercicio es la versión más difícil de X".
ALTER TABLE training_exercises ADD COLUMN IF NOT EXISTS easier_key text;
