PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS detection_records (
  id TEXT PRIMARY KEY NOT NULL,
  sample_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  origin TEXT NOT NULL,
  is_demo INTEGER NOT NULL CHECK (is_demo IN (0, 1)),
  result_status TEXT NOT NULL,
  quality_grade TEXT,
  sync_state TEXT NOT NULL,
  algorithm_version TEXT,
  protocol_version TEXT,
  calibration_version TEXT,
  result_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_detection_records_created_at
  ON detection_records(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_detection_records_sample_id
  ON detection_records(sample_id);

CREATE TABLE IF NOT EXISTS channel_samples (
  record_id TEXT NOT NULL REFERENCES detection_records(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  timestamp TEXT NOT NULL,
  elapsed_ms REAL NOT NULL,
  raw_signal REAL NOT NULL,
  background REAL NOT NULL,
  corrected_signal REAL NOT NULL,
  unit TEXT NOT NULL,
  PRIMARY KEY (record_id, channel_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_channel_samples_record_channel
  ON channel_samples(record_id, channel_id, elapsed_ms);

CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY NOT NULL,
  record_id TEXT NOT NULL REFERENCES detection_records(id) ON DELETE CASCADE,
  operation TEXT NOT NULL CHECK (operation IN ('upsert', 'delete')),
  state TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL,
  next_attempt_at TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (record_id, operation)
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_state
  ON sync_queue(state, next_attempt_at);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_cache (
  workspace_id TEXT PRIMARY KEY NOT NULL,
  role TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
