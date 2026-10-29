CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  pin_salt text NOT NULL,
  pin_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
  active boolean NOT NULL DEFAULT true,
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS login_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email text NOT NULL,
  ip_hash text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  succeeded boolean NOT NULL
);

CREATE INDEX IF NOT EXISTS login_attempts_email_time_idx ON login_attempts(email, attempted_at DESC);
CREATE INDEX IF NOT EXISTS login_attempts_ip_time_idx ON login_attempts(ip_hash, attempted_at DESC);

CREATE TABLE IF NOT EXISTS service_units (
  id text PRIMARY KEY,
  name text NOT NULL,
  district text NOT NULL,
  affiliation text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS monthly_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year integer NOT NULL CHECK (fiscal_year BETWEEN 2500 AND 2700),
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  unit_id text NOT NULL REFERENCES service_units(id) ON DELETE RESTRICT,
  dispensed numeric(14, 2) NOT NULL CHECK (dispensed >= 0),
  inventory numeric(14, 2) NOT NULL CHECK (inventory >= 0),
  late boolean NOT NULL DEFAULT false,
  note text CHECK (char_length(note) <= 200),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fiscal_year, month, unit_id)
);

CREATE INDEX IF NOT EXISTS monthly_transactions_unit_idx ON monthly_transactions(unit_id);
CREATE INDEX IF NOT EXISTS monthly_transactions_period_idx ON monthly_transactions(fiscal_year, month);
