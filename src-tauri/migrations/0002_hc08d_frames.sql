PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS hc08d_frames (
  record_id TEXT NOT NULL REFERENCES detection_records(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  received_at TEXT NOT NULL,
  elapsed_ms REAL NOT NULL CHECK (elapsed_ms >= 0),
  signal_480 INTEGER NOT NULL CHECK (signal_480 BETWEEN 0 AND 65535),
  signal_515 INTEGER NOT NULL CHECK (signal_515 BETWEEN 0 AND 65535),
  signal_555 INTEGER NOT NULL CHECK (signal_555 BETWEEN 0 AND 65535),
  clear_signal INTEGER NOT NULL CHECK (clear_signal BETWEEN 0 AND 65535),
  saturation_mask INTEGER NOT NULL CHECK (saturation_mask BETWEEN 0 AND 15),
  raw_line TEXT NOT NULL,
  PRIMARY KEY (record_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_hc08d_frames_record_elapsed
  ON hc08d_frames(record_id, elapsed_ms);
