PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  expected_groups INTEGER NOT NULL,
  phase TEXT NOT NULL DEFAULT 'open' CHECK (phase IN ('open', 'locked', 'revealed', 'closed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  label TEXT NOT NULL,
  label_key TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  recovery_pin_hash TEXT,
  joined_at TEXT NOT NULL,
  UNIQUE (session_id, label_key)
);

CREATE TABLE IF NOT EXISTS responses (
  group_id TEXT PRIMARY KEY REFERENCES groups(id),
  session_id TEXT NOT NULL REFERENCES sessions(id),
  baseline_sve_t REAL NOT NULL,
  baseline_biopile_t REAL NOT NULL,
  provider_uuid TEXT NOT NULL,
  changed_sve_t REAL NOT NULL,
  changed_biopile_t REAL NOT NULL,
  gac_reason TEXT NOT NULL,
  cutoff_choice TEXT NOT NULL,
  explanation TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  method_uuid TEXT NOT NULL,
  electricity_flow_uuid TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  submitted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS responses_session_idx ON responses(session_id);
