-- HTC Platform — PostgreSQL schema (MVP)
-- Canonical entities (domains/capacities/tests/standards/rules) are NOT stored
-- in the database: they live in versioned canonical/*.yaml and are referenced
-- by canonical ID + version (never duplicated — Master Instructions CANONICAL).

CREATE TABLE coaches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid REFERENCES coaches(id),
  name text NOT NULL,
  birth_date date,
  age int,
  sex text NOT NULL CHECK (sex IN ('MALE','FEMALE')),
  height_cm numeric,
  weight_kg numeric,
  occupation text,
  activity_level text,
  goals jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE health_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id),
  pain jsonb,
  medical_history jsonb,
  red_flags jsonb,
  lifestyle jsonb,
  medical_clearance_required boolean NOT NULL DEFAULT false,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id),
  coach_id uuid REFERENCES coaches(id),
  session_date date NOT NULL,
  type text NOT NULL DEFAULT 'INITIAL' CHECK (type IN ('INITIAL','REASSESSMENT','PARTIAL')),
  domains_assessed jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','COMPLETE','REVIEWED')),
  overall_confidence text CHECK (overall_confidence IN ('HIGH','MODERATE','LOW')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE raw_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES assessments(id),
  test_id text NOT NULL,                -- canonical ID
  side text CHECK (side IN ('LEFT','RIGHT','BILATERAL')),
  raw_value jsonb NOT NULL,
  unit text,
  pain_during_test int CHECK (pain_during_test BETWEEN 0 AND 10),
  valid boolean NOT NULL DEFAULT true,
  confidence text NOT NULL DEFAULT 'HIGH' CHECK (confidence IN ('HIGH','MODERATE','LOW')),
  notes text
);

CREATE TABLE classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_result_id uuid NOT NULL REFERENCES raw_results(id),
  classification text NOT NULL,
  normalized_score numeric,
  standard_id text NOT NULL,            -- canonical ID
  standard_version text NOT NULL,
  automated boolean NOT NULL DEFAULT true,
  coach_override text,
  override_reason text
);

CREATE TABLE decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid UNIQUE NOT NULL REFERENCES assessments(id),
  p1_capacity_id text,                  -- canonical ID (nullable when blocked)
  p1_status text NOT NULL CHECK (p1_status IN ('CONFIRMED','UNCONFIRMED','NONE','BLOCKED')),
  pathway text CHECK (pathway IN ('RESTORE','MOVE','BUILD','PERFORM','SUSTAIN')),
  strategy text NOT NULL,
  system_confidence int NOT NULL CHECK (system_confidence BETWEEN 0 AND 100),
  reasoning_ids jsonb NOT NULL DEFAULT '[]',
  audit_trail jsonb NOT NULL,
  coach_confirmed boolean,
  coach_override_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE priority_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id uuid NOT NULL REFERENCES decisions(id),
  capacity_id text NOT NULL,            -- canonical ID
  role text NOT NULL CHECK (role IN ('P1','P2','P3','SUPPORT','MAINTAIN','DEFER','MONITOR','UNCONFIRMED')),
  reason_id text NOT NULL,
  automated boolean NOT NULL DEFAULT true,
  coach_confirmed boolean,
  override_reason text
);

CREATE TABLE capacity_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES assessments(id),
  source_capacity_id text NOT NULL,
  target_capacity_id text NOT NULL,
  type text NOT NULL,
  confidence text CHECK (confidence IN ('HIGH','MODERATE','LOW')),
  suggested boolean NOT NULL DEFAULT true,
  coach_confirmed boolean NOT NULL DEFAULT false,
  notes text
);

CREATE TABLE success_criteria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id uuid NOT NULL REFERENCES decisions(id),
  capacity_id text NOT NULL,
  baseline jsonb,
  target jsonb,
  reassessment_weeks int,
  exit_rule text,
  failure_rule text
);

-- Append-only audit log: no UPDATE/DELETE granted in production role.
CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id uuid NOT NULL REFERENCES decisions(id),
  entry_type text NOT NULL,
  canonical_refs jsonb NOT NULL DEFAULT '[]',
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE canonical_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL,
  checksum text,
  loaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_decisions_created ON decisions(created_at);
CREATE INDEX idx_assessments_client ON assessments(client_id, session_date);
CREATE INDEX idx_audit_decision ON audit_log(decision_id);
CREATE INDEX idx_raw_results_assessment ON raw_results(assessment_id);
CREATE INDEX idx_priority_roles_decision ON priority_roles(decision_id);
