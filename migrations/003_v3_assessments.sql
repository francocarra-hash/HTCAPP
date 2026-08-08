-- HTC v3 (OS v3.0) — evaluaciones con snapshot inmutable.
--
-- El resultado completo vive en `result` (jsonb) exactamente como se calculó.
-- Las columnas normalizadas son sólo para listar/filtrar: NUNCA se recalcula
-- una evaluación a partir de ellas (Principio 6 / CLINICAL_SPEC §Immutability).

CREATE TABLE IF NOT EXISTS v3_assessments (
  assessment_id uuid PRIMARY KEY,
  client_name   text NOT NULL,
  client_age    int  NOT NULL,
  client_sex    text NOT NULL CHECK (client_sex IN ('MALE','FEMALE')),
  assessed_at   timestamptz NOT NULL,

  -- Resumen para listados
  health_status text NOT NULL CHECK (health_status IN ('PASS','FLAGGED','BLOCKED')),
  p1_domain     text,
  rule_applied  text,

  -- Versiones congeladas (Principio 6)
  os_version                text NOT NULL,
  thresholds_version        text NOT NULL,
  movement_standard_version text NOT NULL,
  decision_engine_version   text NOT NULL,
  report_template_version   text NOT NULL,
  frozen_at                 timestamptz NOT NULL,

  -- Resultado completo, inmutable
  result jsonb NOT NULL,

  -- Confirmación del coach (HTC es coach-led)
  coach_confirmed          boolean,
  override_reason          text,
  override_reason_category text,
  clinical_confidence      int CHECK (clinical_confidence BETWEEN 0 AND 100),
  confirmed_at             timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),

  -- Un override siempre debe traer razón y categoría (Platform Data §29).
  CONSTRAINT override_requires_reason CHECK (
    coach_confirmed IS DISTINCT FROM false
    OR (override_reason IS NOT NULL AND override_reason_category IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_v3_assessed_at ON v3_assessments(assessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_v3_client_name ON v3_assessments(client_name);
CREATE INDEX IF NOT EXISTS idx_v3_p1_domain   ON v3_assessments(p1_domain);
