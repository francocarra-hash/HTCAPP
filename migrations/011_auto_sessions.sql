-- 011 — Sesión guardada al marcar presente.
-- Si el profe marca presente a un alumno y ese día no tiene sesión cargada, la
-- app la guarda sola para no perder la clase: pasa a hecha la rutina asignada
-- para ese día o copia la de su sesión anterior. `auto_from` dice de dónde
-- salió (id de la sesión copiada, el id de la misma sesión si era una asignada,
-- o 'none' si no había ninguna anterior) mientras el profe no la toque; al
-- editarla vuelve a null. Si se saca el presente y nadie la tocó, se deshace.
ALTER TABLE training_sessions ADD COLUMN IF NOT EXISTS auto_from text;
